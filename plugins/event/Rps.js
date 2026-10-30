// /////////////////////////////////////////

// ملف rps.js (لعبة البطاقات المقيدة - Kaiji Style A1 - مع نظام المهلة والإقصاء)

// /////////////////////////////////////////

import fs from 'fs';

import path from 'path';

import { jidDecode } from '@whiskeysockets/baileys';

// --- المسارات والإعدادات ---

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

const REQUIRED_LEVEL = "A1";

const GAME_DURATION_MINUTES = 30;

const REQUEST_TIMEOUT_SECONDS = 120; // دقيقتين للموافقة على الطلب

const MATCH_TIMEOUT_SECONDS = 180;   // 3 دقائق مدة الحلبة

// --- إعدادات اللعبة ---

const INITIAL_STARS = 3;

const INITIAL_CARDS = { rock: 4, paper: 4, scissors: 4 }; // 12 بطاقة إجمالاً

// الكائنات الحية

const games = {};           

const playerCache = {};     

const arenaManager = {};    

// -------------------------

// دوال مساعدة

// -------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const normalizeId = (jid) => jid ? jid.split(':')[0] : null;

// قراءة اللاعبين المؤهلين (A1 + True)

const getEligiblePlayers = () => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        return data.filter(p => p.status === true && p.lvl === REQUIRED_LEVEL);

    } catch (e) { return []; }

};

// تحديث ملف JSON

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const index = data.findIndex(p => p.id === playerId);

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) { console.error("Error updating JSON:", e); }

};

const sendText = async (sock, jid, text, mentions = []) => {

    return await sock.sendMessage(jid, { text, mentions });

};

const getCardEmoji = (type) => {

    if (type === 'rock') return '🪨';

    if (type === 'paper') return '📄';

    if (type === 'scissors') return '✂️';

    return type;

};

// دالة الطرد والإقصاء المشتركة

const killPlayer = async (sock, groupJid, player, reason) => {

    player.state = 'ELIMINATED';

    updatePlayerStatus(player.jid, { status: false });

    await sendText(sock, groupJid, `🚫 *تم إقصاء @${player.jid.split('@')[0]} (${reason}).*`, [player.jid]);

    try { await sock.groupParticipantsUpdate(groupJid, [player.jid], 'remove'); } catch {}

};

// توليد ID عشوائي فريد

const generateUniqueId = (usedIds) => {

    let id;

    do { id = Math.floor(Math.random() * 900) + 100; } while (usedIds.has(id.toString()));

    return id.toString();

};

// -------------------------

// إدارة اللعبة

// -------------------------

const startGame = async (sock, groupJid) => {

    const eligible = getEligiblePlayers();

    

    if (eligible.length < 2) {

        return await sendText(sock, groupJid, `⚠️ لا يوجد عدد كافٍ من اللاعبين (A1) للبدء.`);

    }

    const usedIds = new Set();

    const playersMap = {}; 

    const tempIdMap = {};

    eligible.forEach(p => {

        const tempId = generateUniqueId(usedIds);

        usedIds.add(tempId);

        

        playersMap[p.id] = {

            jid: p.id,

            lid: p.lid,

            tempId: tempId,

            nickname: p.nickname,

            stars: INITIAL_STARS,

            cards: { ...INITIAL_CARDS },

            state: 'IDLE', 

            currentMatchId: null,

            pendingRequest: null

        };

        tempIdMap[tempId] = p.id;

        playerCache[p.id] = { groupJid, tempId };

        if (p.lid) playerCache[p.lid] = { groupJid, tempId };

    });

    games[groupJid] = {

        state: 'RUNNING',

        players: playersMap,

        tempIdMap: tempIdMap,

        startTime: Date.now(),

        timerId: null

    };

    let msg = `🔥 *بدأت مرحلة البطاقات المقيدة!* 🔥\n⏳ المدة: ${GAME_DURATION_MINUTES} دقيقة.\n\n*📋 قائمة المشاركين (ID الخاص):*\n`;

    Object.values(playersMap).forEach(p => {

        msg += `🆔 *${p.tempId}* : @${p.jid.split('@')[0]}\n`;

    });

    msg += `\n💡 *طريقة اللعب:* ارسل ID الشخص في الخاص.\n⚠️ *شروط الفوز:* إنهاء البطاقات مع بقاء نجمة واحدة.\n⏱️ *تنبيه:* مدة كل حلبة 3 دقائق فقط!`;

    await sendText(sock, groupJid, msg, Object.keys(playersMap));

    games[groupJid].timerId = setTimeout(() => endGlobalGame(sock, groupJid), GAME_DURATION_MINUTES * 60 * 1000);

    activateListener(sock);

};

// -------------------------

// منطق الحلبات (Arena Logic)

// -------------------------

const createMatch = async (sock, groupJid, p1Jid, p2Jid) => {

    const game = games[groupJid];

    const p1 = game.players[p1Jid];

    const p2 = game.players[p2Jid];

    p1.state = 'IN_MATCH';

    p2.state = 'IN_MATCH';

    

    const matchId = `MATCH_${Date.now()}_${p1.tempId}_${p2.tempId}`;

    p1.currentMatchId = matchId;

    p2.currentMatchId = matchId;

    arenaManager[matchId] = {

        groupJid,

        p1: p1Jid,

        p2: p2Jid,

        p1Choice: null,

        p2Choice: null,

        // إعداد مؤقت الحلبة (3 دقائق)

        timer: setTimeout(() => handleMatchTimeout(sock, matchId), MATCH_TIMEOUT_SECONDS * 1000)

    };

    await sendCardMenu(sock, p1);

    await sendCardMenu(sock, p2);

};

// معالجة انتهاء وقت الحلبة (3 دقائق)

const handleMatchTimeout = async (sock, matchId) => {

    const match = arenaManager[matchId];

    if (!match) return;

    const game = games[match.groupJid];

    const p1 = game.players[match.p1];

    const p2 = game.players[match.p2];

    // حذف الحلبة من الذاكرة

    delete arenaManager[matchId];

    p1.currentMatchId = null; p2.currentMatchId = null;

    // الحالة 1: كلاهما لم يلعب

    if (!match.p1Choice && !match.p2Choice) {

        await killPlayer(sock, match.groupJid, p1, "خمول في الحلبة");

        await killPlayer(sock, match.groupJid, p2, "خمول في الحلبة");

        return;

    }

    // الحالة 2: الأول لعب والثاني لا

    if (match.p1Choice && !match.p2Choice) {

        await killPlayer(sock, match.groupJid, p2, "تأخر في اللعب");

        await handleSinglePlayerSuccess(sock, match.groupJid, p1, match.p1Choice);

        return;

    }

    // الحالة 3: الثاني لعب والأول لا

    if (!match.p1Choice && match.p2Choice) {

        await killPlayer(sock, match.groupJid, p1, "تأخر في اللعب");

        await handleSinglePlayerSuccess(sock, match.groupJid, p2, match.p2Choice);

        return;

    }

};

// معالجة اللاعب الذي التزم بالوقت بينما خصمه انسحب

const handleSinglePlayerSuccess = async (sock, groupJid, player, cardUsed) => {

    // خصم البطاقة كتعويض

    player.cards[cardUsed]--;

    await sendText(sock, player.jid, `✅ تم إقصاء خصمك لتأخره.\nتم اعتماد بطاقتك (${getCardEmoji(cardUsed)}) وخصمها من رصيدك.`);

    

    // التحقق هل أنهى البطاقات بذلك؟

    const totalCards = player.cards.rock + player.cards.paper + player.cards.scissors;

    if (totalCards === 0) {

        player.state = 'FINISHED';

        await sendText(sock, player.jid, "🎉🏆 *أحسنت! تخلصت من جميع بطاقاتك!*");

        await sendText(sock, groupJid, `✨ *اللاعب @${player.jid.split('@')[0]} أنهى بطاقاته بنجاح (بسبب إقصاء الخصم)!*`, [player.jid]);

    } else {

        player.state = 'IDLE';

        await sendText(sock, player.jid, "🔄 عدت لقائمة الانتظار. ابحث عن خصم جديد.");

    }

};

const sendCardMenu = async (sock, player) => {

    const msg = `

⚔️ *أنت في حلبة القتال!*

⏰ *لديك 3 دقائق فقط!*

⭐ نجومك: ${'⭐'.repeat(player.stars)}

🃏 بطاقاتك المتبقية:

1️⃣ 🪨 حجر: ${player.cards.rock}

2️⃣ 📄 ورق: ${player.cards.paper}

3️⃣ ✂️ مقص: ${player.cards.scissors}

*اختر بطاقتك (1, 2, 3)*

`;

    await sendText(sock, player.jid, msg);

};

const resolveRound = async (sock, matchId) => {

    const match = arenaManager[matchId];

    if (!match) return;

    // إلغاء مؤقت الطرد لأن كلاهما لعب

    clearTimeout(match.timer);

    const game = games[match.groupJid];

    const p1 = game.players[match.p1];

    const p2 = game.players[match.p2];

    const c1 = match.p1Choice;

    const c2 = match.p2Choice;

    p1.cards[c1]--;

    p2.cards[c2]--;

    let res1 = `أنت: ${getCardEmoji(c1)} | الخصم: ${getCardEmoji(c2)}\n`;

    let res2 = `أنت: ${getCardEmoji(c2)} | الخصم: ${getCardEmoji(c1)}\n`;

    let winnerId = null; 

    if (c1 === c2) {

        res1 += "🤝 *تعادل!*";

        res2 += "🤝 *تعادل!*";

    } else if (

        (c1 === 'rock' && c2 === 'scissors') ||

        (c1 === 'scissors' && c2 === 'paper') ||

        (c1 === 'paper' && c2 === 'rock')

    ) {

        p1.stars++;

        p2.stars--;

        res1 += "🎉 *فزت بالجولة!* (+⭐)";

        res2 += "❌ *خسرت الجولة!* (-⭐)";

        winnerId = p1.jid;

    } else {

        p2.stars++;

        p1.stars--;

        res1 += "❌ *خسرت الجولة!* (-⭐)";

        res2 += "🎉 *فزت بالجولة!* (+⭐)";

        winnerId = p2.jid;

    }

    await sendText(sock, p1.jid, res1);

    await sendText(sock, p2.jid, res2);

    // تقرير المجموعة

    let groupReport = `⚔️ *نتيجة جولة الحلبة* ⚔️\n`;

    groupReport += `بين: @${p1.jid.split('@')[0]} 🆚 @${p2.jid.split('@')[0]}\n\n`;

    if (c1 === c2) {

        groupReport += `🤝 *تعادل!*\nكلاهما استخدم بطاقة: ${getCardEmoji(c1)}`;

    } else {

        const winner = winnerId === p1.jid ? p1 : p2;

        const loser = winnerId === p1.jid ? p2 : p1;

        const winCard = winnerId === p1.jid ? c1 : c2;

        const loseCard = winnerId === p1.jid ? c2 : c1;

        groupReport += `🏆 *الفائز:* @${winner.jid.split('@')[0]} (${getCardEmoji(winCard)})\n`;

        groupReport += `❌ *الخاسر:* @${loser.jid.split('@')[0]} (${getCardEmoji(loseCard)})`;

    }

    

    await sendText(sock, match.groupJid, groupReport, [p1.jid, p2.jid]);

    // التحقق من الحالة

    const checkPlayerStatus = async (p) => {

        const totalCards = p.cards.rock + p.cards.paper + p.cards.scissors;

        

        if (p.stars <= 0) {

            await killPlayer(sock, match.groupJid, p, "نفاد النجوم");

            return 'dead';

        }

        

        if (totalCards === 0) {

            p.state = 'FINISHED';

            await sendText(sock, p.jid, "🎉🏆 *أحسنت! تخلصت من جميع بطاقاتك!*");

            await sendText(sock, match.groupJid, `✨ *اللاعب @${p.jid.split('@')[0]} أنهى بطاقاته بنجاح!*`, [p.jid]);

            return 'win';

        }

        return 'continue';

    };

    const s1 = await checkPlayerStatus(p1);

    const s2 = await checkPlayerStatus(p2);

    delete arenaManager[matchId];

    p1.currentMatchId = null; p2.currentMatchId = null;

    match.p1Choice = null; match.p2Choice = null;

    if (s1 === 'continue') {

        p1.state = 'IDLE';

        await sendText(sock, p1.jid, "🔄 انتهت الحلبة. ابحث عن خصم آخر.");

    }

    if (s2 === 'continue') {

        p2.state = 'IDLE';

        await sendText(sock, p2.jid, "🔄 انتهت الحلبة. ابحث عن خصم آخر.");

    }

};

// -------------------------

// المستمع (Event Listener)

// -------------------------

let listenerAttached = false;

const activateListener = (sock) => {

    if (listenerAttached) return;

    listenerAttached = true;

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const m = messages[0];

        if (!m.message || m.key.fromMe) return;

        const senderRaw = m.key.participant || m.key.remoteJid;

        const senderJid = normalizeId(senderRaw) + '@s.whatsapp.net';

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();

        const cachedData = playerCache[senderRaw] || playerCache[senderJid];

        if (!cachedData) return;

        const groupJid = cachedData.groupJid;

        const game = games[groupJid];

        if (!game || game.state !== 'RUNNING') return;

        const pKey = Object.keys(game.players).find(k => k === senderJid || game.players[k].lid === senderRaw);

        if (!pKey) return;

        const player = game.players[pKey];

        // 1. داخل الحلبة (IN_MATCH)

        if (player.state === 'IN_MATCH') {

            const match = arenaManager[player.currentMatchId];

            if (!match) return;

            if (['1', '2', '3'].includes(text)) {

                let choice = text === '1' ? 'rock' : text === '2' ? 'paper' : 'scissors';

                

                if (player.cards[choice] <= 0) {

                    return await sendText(sock, player.jid, `❌ نفذت بطاقات ${getCardEmoji(choice)}! اختر غيرها.`);

                }

                if (match.p1 === player.jid) match.p1Choice = choice;

                else match.p2Choice = choice;

                await sendText(sock, player.jid, `✅ اخترت ${getCardEmoji(choice)}. بانتظار الخصم...`);

                if (match.p1Choice && match.p2Choice) {

                    await resolveRound(sock, player.currentMatchId);

                }

            }

            return;

        }

        // 2. استقبال الطلب (REQUESTING)

        if (player.pendingRequest) {

            if (text === 'وافق') {

                const requesterId = player.pendingRequest.from;

                const requester = game.players[requesterId];

                clearTimeout(player.pendingRequest.timer);

                player.pendingRequest = null;

                requester.state = 'IDLE'; 

                if (requester.state !== 'IDLE') {

                    return await sendText(sock, player.jid, "⚠️ الخصم لم يعد متاحاً.");

                }

                await sendText(sock, requester.jid, `✅ *وافق ${player.nickname} على التحدي!*`);

                await createMatch(sock, groupJid, requesterId, player.jid);

            } else if (text === 'رفض') {

                const requesterId = player.pendingRequest.from;

                const requester = game.players[requesterId];

                

                clearTimeout(player.pendingRequest.timer);

                player.pendingRequest = null;

                requester.state = 'IDLE'; 

                

                await sock.sendMessage(player.jid, { react: { text: "👍", key: m.key } });

                await sendText(sock, requester.jid, `❌ *لقد رفض @${player.jid.split('@')[0]} طلبك!*`, [player.jid]);

            }

            return;

        }

        // 3. الانتظار (IDLE)

        if (player.state === 'IDLE') {

            if (!/^\d{3}$/.test(text)) return; 

            const targetId = text;

            const targetJid = game.tempIdMap[targetId];

            if (!targetJid) return; 

            if (targetJid === player.jid) return await sendText(sock, player.jid, "❌ لا يمكنك تحدي نفسك.");

            const target = game.players[targetJid];

            if (target.state !== 'IDLE' || target.pendingRequest) {

                return await sendText(sock, player.jid, "⚠️ هذا اللاعب مشغول حالياً.");

            }

            player.state = 'REQUESTING'; 

            target.pendingRequest = {

                from: player.jid,

                timer: setTimeout(async () => {

                    // إلغاء الطلب بعد دقيقتين دون إقصاء

                    if (target.pendingRequest && target.pendingRequest.from === player.jid) {

                        target.pendingRequest = null;

                        player.state = 'IDLE';

                        await sendText(sock, player.jid, "⏰ انتهى وقت انتظار الموافقة (تم الإلغاء).");

                        await sendText(sock, target.jid, "⏰ انتهى وقت طلب التحدي (تم الإلغاء).");

                    }

                }, REQUEST_TIMEOUT_SECONDS * 1000)

            };

            await sendText(sock, player.jid, "📨 تم إرسال الطلب. بانتظار الموافقة...");

            const reqMsg = `🔔 *طلب حلبة جديد!* \nاللاعب @${player.jid.split('@')[0]} (ID: ${player.tempId}) يتحداك.\nاكتب *وافق* أو *رفض*.\n⏳ الصلاحية: دقيقتين.`;

            await sendText(sock, target.jid, reqMsg, [player.jid]);

        }

    });

};

// -------------------------

// إنهاء اللعبة العالمية

// -------------------------

const endGlobalGame = async (sock, groupJid) => {

    const game = games[groupJid];

    if (!game) return;

    if (game.timerId) clearTimeout(game.timerId);

    const survivors = []; 

    const eliminated = []; 

    for (const pid in game.players) {

        const p = game.players[pid];

        

        if (p.state === 'FINISHED' || p.state === 'win') { 

            survivors.push(p);

            updatePlayerStatus(p.jid, { lvl: "A2" }); 

        } else if (p.state !== 'ELIMINATED' && p.state !== 'dead') {

            eliminated.push(p);

            updatePlayerStatus(p.jid, { status: false });

            try { await sock.groupParticipantsUpdate(groupJid, [p.jid], 'remove'); } catch {}

        }

    }

    let report = `🏁 *انتهى وقت لعبة البطاقات المقيدة!*\n\n`;

    if (survivors.length > 0) {

        report += `🎉 *الناجون (تمت الترقية لـ A2):*\n`;

        survivors.forEach(p => report += `- @${p.jid.split('@')[0]}\n`);

    } else {

        report += `💀 *لا يوجد ناجون!*\n`;

    }

    if (eliminated.length > 0) {

        report += `\n🐢 *تم الإقصاء (بطاقات متبقية):*\n`;

        eliminated.forEach(p => report += `- @${p.jid.split('@')[0]}\n`);

    }

    await sendText(sock, groupJid, report, Object.keys(game.players));

    Object.keys(game.players).forEach(pid => {

        delete playerCache[pid];

        if (game.players[pid].lid) delete playerCache[game.players[pid].lid];

    });

    delete games[groupJid];

};

async function execute({ sock, msg }) {

    const groupJid = msg.key.remoteJid;

    if (!groupJid.endsWith('@g.us')) return;

    if (games[groupJid]) {

        return await sendText(sock, groupJid, "⚠️ اللعبة جارية بالفعل.");

    }

    await startGame(sock, groupJid);

}

export const NovaUltra = {

    command: 'حجر',

    description: 'لعبة البطاقات المقيدة (A1) بنظام الحلبات والمؤقت.',

    elite: "on",

    group: true,

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

