// /////////////////////////////////////////

// ملف zombie.js (لعبة الزومبي - Arena Style B1 -> B2)

// /////////////////////////////////////////

import fs from 'fs';

import path from 'path';

import { jidDecode } from '@whiskeysockets/baileys';

// --- المسارات والإعدادات ---

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

const REQUIRED_LEVEL = "B1";

const NEXT_LEVEL = "B2";

const GAME_DURATION_MINUTES = 30;

const READY_TIMEOUT_SECONDS = 60; // دقيقة واحدة لكتابة جاهز

const MATCH_COOLDOWN_SECONDS = 30; // استراحة بعد الحلبة

// الكائنات الحية (التخزين المؤقت أثناء التشغيل)

const games = {};           

const playerCache = {};     

const arenaManager = {};    

// -------------------------

// دوال مساعدة

// -------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const normalizeId = (jid) => jid ? jid.split(':')[0] : null;

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const sendText = async (sock, jid, text, mentions = []) => {

    return await sock.sendMessage(jid, { text, mentions });

};

// قراءة اللاعبين

const getEligiblePlayers = () => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        return data.filter(p => p.status === true && p.lvl === REQUIRED_LEVEL);

    } catch (e) { return []; }

};

// تحديث JSON

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

const generateUniqueId = (usedIds) => {

    let id;

    do { id = Math.floor(Math.random() * 900) + 100; } while (usedIds.has(id.toString()));

    return id.toString();

};

// توليد البطاقات حسب الدور

const generateDeck = (role) => {

    let deck = [];

    // دالة مساعدة لإنشاء بطاقة مع ID فريد لكل بطاقة

    const addCard = (type, val = 0) => deck.push({ type, value: val, id: Date.now() + Math.random() });

    if (role === 'human') {

        // 6 مواطن + 1 مسدس

        for(let i=0; i<6; i++) addCard('citizen', getRandomInt(1, 10));

        addCard('gun');

    } else if (role === 'medic') {

        // 5 مواطن + 1 مسدس + 1 ترياق

        for(let i=0; i<5; i++) addCard('citizen', getRandomInt(1, 10));

        addCard('gun');

        addCard('antidote');

    } else if (role === 'zombie') {

        // 6 مواطن + عدوى لانهائية (تضاف كبطاقة واحدة دائمة)

        for(let i=0; i<6; i++) addCard('citizen', getRandomInt(1, 10));

        addCard('infection');

    }

    return deck;

};

// تنسيق قائمة البطاقات للرسائل الخاصة

const formatDeckList = (deck) => {

    let msg = "";

    // ترتيب العرض: المواطنين أولاً ثم الخاص

    const citizens = deck.filter(c => c.type === 'citizen').sort((a, b) => a.value - b.value);

    const others = deck.filter(c => c.type !== 'citizen');

    citizens.forEach(card => msg += `🃏${card.value}\n`);

    others.forEach(card => {

        if (card.type === 'gun') msg += `🃏🔫 (اكتب *مسدس*)\n`;

        else if (card.type === 'antidote') msg += `🃏💊 (اكتب *ترياق*)\n`;

        else if (card.type === 'infection') msg += `🃏🧟‍♂️ (اكتب *زومبي*)\n`;

    });

    return msg;

};

// -------------------------

// إدارة اللعبة

// -------------------------

const startGame = async (sock, groupJid) => {

    const eligible = getEligiblePlayers();

    

    if (eligible.length < 2) {

        return await sendText(sock, groupJid, `⚠️ لا يوجد عدد كافٍ من اللاعبين (B1) للبدء.`);

    }

    const usedIds = new Set();

    const playersMap = {}; 

    const tempIdMap = {};

    // خلط وتوزيع الأدوار

    const shuffled = eligible.sort(() => 0.5 - Math.random());

    const zombieCount = Math.max(1, Math.floor(shuffled.length * 0.2)); 

    const medicCount = Math.max(1, Math.floor(shuffled.length * 0.1));

    shuffled.forEach((p, idx) => {

        const tempId = generateUniqueId(usedIds);

        usedIds.add(tempId);

        

        let role = 'human';

        if (idx < zombieCount) role = 'zombie';

        else if (idx < zombieCount + medicCount) role = 'medic';

        const deck = generateDeck(role);

        playersMap[p.id] = {

            jid: p.id,

            lid: p.lid,

            tempId: tempId,

            nickname: p.nickname,

            role: role,

            deck: deck,

            state: 'IDLE', 

            currentMatchId: null,

            pendingRequest: null,

            cooldownUntil: 0,

            slotsNeeded: 0, 

            selectedCards: [] 

        };

        tempIdMap[tempId] = p.id;

        playerCache[p.id] = { groupJid, tempId };

        if (p.lid) playerCache[p.lid] = { groupJid, tempId };

        // إرسال الدور

        const roleMsg = `

🧟‍♂️ *بدأت اللعبة!*

👤 دورك: *${role === 'zombie' ? 'زومبي 🧟‍♂️' : (role === 'medic' ? 'مسعف 👨‍⚕️' : 'بشري 👮‍♂️')}*

🆔 كودك الخاص: *${tempId}*

🃏 *بطاقاتك:*

${formatDeckList(deck)}

تستطيع اللعب بعدد محدد من البطاقات (2 أو 3 حسب المبادرة).

اكتب رقم البطاقة أو اسمها لاختيارها، وانتظر الرد ✅ لاختيار التالية.

        `;

        sendText(sock, p.id, roleMsg);

    });

    games[groupJid] = {

        state: 'RUNNING',

        players: playersMap,

        tempIdMap: tempIdMap,

        startTime: Date.now(),

        timerId: null

    };

    let msg = `🧟‍♂️ *تفشي فيروس الزومبي!* 🧟‍♂️\n⏳ المدة: ${GAME_DURATION_MINUTES} دقيقة.\n\n*📋 قائمة المشاركين (الأكواد):*\n`;

    Object.values(playersMap).forEach(p => {

        msg += `🆔 *${p.tempId}* : @${p.jid.split('@')[0]}\n`;

    });

    msg += `\n💡 *طريقة اللعب:* ارسل ID الشخص في الخاص.\n🛡️ *البشر:* البقاء للأكثر عدداً.\n🧟‍♂️ *الزومبي:* حولوا الجميع.`;

    await sendText(sock, groupJid, msg, Object.keys(playersMap));

    games[groupJid].timerId = setTimeout(() => endGlobalGame(sock, groupJid, true), GAME_DURATION_MINUTES * 60 * 1000);

    activateListener(sock);

};

// -------------------------

// نظام الحلبات (Arena)

// -------------------------

// بدء الحلبة فعلياً بعد كتابة "جاهز"

const startArenaMatch = async (sock, groupJid, initiatorJid, targetJid) => {

    const game = games[groupJid];

    const p1 = game.players[initiatorJid]; // المبادر (يلعب 3)

    const p2 = game.players[targetJid];    // المستهدف (يلعب 2)

    p1.state = 'IN_MATCH';

    p2.state = 'IN_MATCH';

    p1.selectedCards = [];

    p2.selectedCards = [];

    // تحديد عدد البطاقات المطلوب (حسب المتوفر)

    p1.slotsNeeded = Math.min(3, p1.deck.length); 

    p2.slotsNeeded = Math.min(2, p2.deck.length);

    const matchId = `M_${Date.now()}_${p1.tempId}`;

    p1.currentMatchId = matchId;

    p2.currentMatchId = matchId;

    arenaManager[matchId] = {

        groupJid,

        p1: initiatorJid,

        p2: targetJid,

        p1Ready: false,

        p2Ready: false

    };

    await sendText(sock, p1.jid, `⚔️ *أنت المبادر!* مطلوب منك اختيار *${p1.slotsNeeded}* بطاقات.\nاكتب رقم البطاقة أو اسمها.`);

    await sendText(sock, p2.jid, `⚔️ *بدأ القتال!* مطلوب منك اختيار *${p2.slotsNeeded}* بطاقات.\nاكتب رقم البطاقة أو اسمها.`);

};

// معالجة اختيار البطاقة

const handleCardSelection = async (sock, player, input, msgKey) => {

    const match = arenaManager[player.currentMatchId];

    if (!match) return;

    if (player.selectedCards.length >= player.slotsNeeded) {

        return await sendText(sock, player.jid, "✅ لقد اخترت كامل بطاقاتك، انتظر الخصم.");

    }

    // البحث عن البطاقة في يد اللاعب

    let cardType = null;

    let cardValue = null;

    if (input === 'مسدس') cardType = 'gun';

    else if (input === 'ترياق') cardType = 'antidote';

    else if (input === 'زومبي') cardType = 'infection';

    else if (!isNaN(input)) {

        cardType = 'citizen';

        cardValue = parseInt(input);

    } else {

        return; // مدخل غير صالح

    }

    // البحث عن بطاقة متاحة في اليد ولم يتم اختيارها مسبقاً في هذه الجولة

    // (يجب أن نتأكد من عدم اختيار نفس كائن البطاقة مرتين)

    const availableCard = player.deck.find(c => {

        if (c.type !== cardType) return false;

        if (cardType === 'citizen' && c.value !== cardValue) return false;

        // التأكد أنها ليست ضمن البطاقات المختارة حالياً

        const alreadySelected = player.selectedCards.some(sc => sc.id === c.id);

        return !alreadySelected;

    });

    if (!availableCard) {

        return await sendText(sock, player.jid, `❌ لا تملك بطاقة "${input}" (أو قمت باختيارها بالفعل).`);

    }

    // إضافة نسخة منها للمختارة (بدون حذفها من اليد الآن)

    player.selectedCards.push(availableCard);

    await sock.sendMessage(player.jid, { react: { text: "✅", key: msgKey } });

    // التحقق هل اكتمل الاختيار

    if (player.selectedCards.length >= player.slotsNeeded) {

        if (player.jid === match.p1) match.p1Ready = true;

        else match.p2Ready = true;

        if (match.p1Ready && match.p2Ready) {

            await resolveEncounter(sock, match.groupJid, match.p1, match.p2, player.currentMatchId);

        } else {

            await sendText(sock, player.jid, "👍 تم استلام بطاقاتك. بانتظار الخصم...");

        }

    }

};

const resolveEncounter = async (sock, groupJid, p1Jid, p2Jid, matchId) => {

    const game = games[groupJid];

    const p1 = game.players[p1Jid];

    const p2 = game.players[p2Jid];

    

    // 1. استهلاك البطاقات المستهلكة (مسدس / ترياق)

    // المواطن والعدوى لا يحذفون

    const consumeCards = (player) => {

        player.selectedCards.forEach(selected => {

            if (selected.type === 'gun' || selected.type === 'antidote') {

                // حذفها من اليد الرئيسية

                const idx = player.deck.findIndex(c => c.id === selected.id);

                if (idx !== -1) player.deck.splice(idx, 1);

            }

        });

    };

    consumeCards(p1);

    consumeCards(p2);

    const p1HasGun = p1.selectedCards.some(c => c.type === 'gun');

    const p2HasGun = p2.selectedCards.some(c => c.type === 'gun');

    let publicMsg = "";

    let p1Msg = "", p2Msg = "";

    let winner = null, loser = null;

    // منطق القتال

    if (p1HasGun && p2HasGun) {

        p1.state = 'DEAD'; p2.state = 'DEAD';

        publicMsg = `🔫 اشتباك دموي! قام @${p1.jid.split('@')[0]} و @${p2.jid.split('@')[0]} بقتل بعضهما بالمسدسات!`;

        p1Msg = p2Msg = "☠️ متما معاً.";

    } else if (p1HasGun) {

        p2.state = 'DEAD';

        publicMsg = `🔫 قام @${p1.jid.split('@')[0]} بتصفية @${p2.jid.split('@')[0]}!`;

        p1Msg = "🔫 قتلت الخصم!"; p2Msg = "☠️ تم قتلك.";

        winner = p1; loser = p2; // هنا القتل لا يوجب سرقة بطاقة، لأن الخاسر مات

    } else if (p2HasGun) {

        p1.state = 'DEAD';

        publicMsg = `🔫 قام @${p2.jid.split('@')[0]} بتصفية @${p1.jid.split('@')[0]}!`;

        p2Msg = "🔫 قتلت الخصم!"; p1Msg = "☠️ تم قتلك.";

        winner = p2; loser = p1;

    } else {

        // منطق العدوى / الترياق / الأرقام

        const p1Infection = p1.selectedCards.find(c => c.type === 'infection');

        const p1Antidote = p1.selectedCards.find(c => c.type === 'antidote');

        const p2Infection = p2.selectedCards.find(c => c.type === 'infection');

        const p2Antidote = p2.selectedCards.find(c => c.type === 'antidote');

        // حالة تحول (لا يوجد فائز بالمعنى التقليدي للسرقة، بل تغيير أدوار)

        if (p1Infection) {

            if (p2Antidote) {

                p1.role = 'human';

                p1.deck = p1.deck.filter(c => c.type !== 'infection'); 

                p1Msg = "💉 أصابك الترياق! عدت بشرياً.";

                p2Msg = "🧪 عالجت الزومبي!";

            } else {

                p2.role = 'zombie';

                // تصفية يد الضحية من الترياق والمسدسات (لأن الزومبي لا يملكها)

                p2.deck = p2.deck.filter(c => c.type === 'citizen');

                p2.deck.push({ type: 'infection', value: 0, id: Date.now() });

                p1Msg = "🧟‍♂️ تم نقل العدوى!";

                p2Msg = "🧟‍♂️ لقد أصبحت زومبي!";

            }

        } 

        else if (p2Infection) {

            if (p1Antidote) {

                p2.role = 'human';

                p2.deck = p2.deck.filter(c => c.type !== 'infection');

                p2Msg = "💉 أصابك الترياق! عدت بشرياً.";

                p1Msg = "🧪 عالجت الزومبي!";

            } else {

                p1.role = 'zombie';

                p1.deck = p1.deck.filter(c => c.type === 'citizen');

                p1.deck.push({ type: 'infection', value: 0, id: Date.now() });

                p2Msg = "🧟‍♂️ تم نقل العدوى!";

                p1Msg = "🧟‍♂️ لقد أصبحت زومبي!";

            }

        } else {

            // معركة الأرقام (Sum Battle)

            const sumCards = (cards) => cards.reduce((acc, c) => acc + (c.type === 'citizen' ? c.value : 0), 0);

            

            // تجميع القيم للعرض

            const vals1 = p1.selectedCards.filter(c => c.type === 'citizen').map(c => c.value).join('+');

            const vals2 = p2.selectedCards.filter(c => c.type === 'citizen').map(c => c.value).join('+');

            const score1 = sumCards(p1.selectedCards);

            const score2 = sumCards(p2.selectedCards);

            

            const debugMsg = `\n📊 نتيجتك: ${vals1}=${score1} | الخصم: ${vals2}=${score2}`;

            p1Msg += debugMsg; p2Msg += debugMsg;

            if (score1 > score2) {

                winner = p1; loser = p2;

            } else if (score2 > score1) {

                winner = p2; loser = p1;

            } else {

                p1Msg = "🤝 تعادل!"; p2Msg = "🤝 تعادل!";

            }

            // سرقة البطاقة (فقط في معارك الأرقام)

            if (winner && loser && loser.state !== 'DEAD') {

                const citizenCards = loser.deck.filter(c => c.type === 'citizen');

                if (citizenCards.length > 0) {

                    const stolenIndex = getRandomInt(0, citizenCards.length - 1);

                    const cardToSteal = citizenCards[stolenIndex];

                    

                    // حذفها من الخاسر

                    const actualIndex = loser.deck.findIndex(c => c.id === cardToSteal.id);

                    if (actualIndex !== -1) {

                        const stolenCard = loser.deck.splice(actualIndex, 1)[0];

                        // إضافتها للفائز

                        winner.deck.push(stolenCard);

                        

                        publicMsg = `🃏 فاز @${winner.jid.split('@')[0]} على @${loser.jid.split('@')[0]} وسرق منه بطاقة!`;

                        p1Msg += winner === p1 ? `\nسرقت بطاقة [${stolenCard.value}] 🃏` : `\nسُرقت منك بطاقة [${stolenCard.value}] 🃏`;

                        p2Msg += winner === p2 ? `\nسرقت بطاقة [${stolenCard.value}] 🃏` : `\nسُرقت منك بطاقة [${stolenCard.value}] 🃏`;

                    }

                }

            }

        }

    }

    // إرسال النتائج الخاصة

    await sendText(sock, p1.jid, `🏁 انتهت الجولة.\n${p1Msg}\n\nبطاقاتك الحالية:\n${formatDeckList(p1.deck)}`);

    await sendText(sock, p2.jid, `🏁 انتهت الجولة.\n${p2Msg}\n\nبطاقاتك الحالية:\n${formatDeckList(p2.deck)}`);

    

    // الإعلان العام

    if (publicMsg) await sendText(sock, groupJid, publicMsg, [p1.jid, p2.jid]);

    // تنظيف

    delete arenaManager[matchId];

    p1.currentMatchId = null; p2.currentMatchId = null;

    

    // وضع التبريد (Cooldown)

    const cooldownTime = Date.now() + (MATCH_COOLDOWN_SECONDS * 1000);

    if (p1.state !== 'DEAD') { p1.state = 'COOLDOWN'; p1.cooldownUntil = cooldownTime; }

    if (p2.state !== 'DEAD') { p2.state = 'COOLDOWN'; p2.cooldownUntil = cooldownTime; }

    setTimeout(() => {

        if (p1.state === 'COOLDOWN') p1.state = 'IDLE';

        if (p2.state === 'COOLDOWN') p2.state = 'IDLE';

    }, MATCH_COOLDOWN_SECONDS * 1000);

    // معالجة الموتى والإقصاءات (نفاذ البطاقات)

    [p1, p2].forEach(async p => {

        if (p.state === 'DEAD') {

            await killPlayer(sock, groupJid, p);

        } else {

            // تحقق من الحد الأدنى للبطاقات (أقل من 2)

            // الزومبي مستثنى لأن لديه بطاقة لانهائية

            if (p.role !== 'zombie' && p.deck.length < 2) {

                p.state = 'DEAD';

                await sendText(sock, p.jid, "🚫 تم إقصاؤك لعدم توفر بطاقات كافية للعب.");

                await killPlayer(sock, groupJid, p, "نفاد البطاقات");

            } 

            // مكافأة الـ 15 مواطن

            else {

                const cCount = p.deck.filter(c => c.type === 'citizen').length;

                if (cCount >= 15) {

                    const guns = p.deck.filter(c => c.type === 'gun').length;

                    if (guns < 2) { 

                        p.deck.push({ type: 'gun', value: 0, id: Date.now() });

                        await sendText(sock, p.jid, "🎁 *مكافأة!* وصلت لـ 15 مواطن وحصلت على مسدس إضافي 🔫.");

                    }

                }

            }

        }

    });

    checkWinCondition(sock, groupJid);

};

const killPlayer = async (sock, groupJid, player, reason = "") => {

    updatePlayerStatus(player.jid, { status: false });

    if (reason) await sendText(sock, groupJid, `🚫 *تم إقصاء @${player.jid.split('@')[0]} (${reason}).*`, [player.jid]);

    try { await sock.groupParticipantsUpdate(groupJid, [player.jid], 'remove'); } catch {}

};

const checkWinCondition = async (sock, groupJid) => {

    const game = games[groupJid];

    if (!game) return;

    const alive = Object.values(game.players).filter(p => p.state !== 'DEAD');

    const zombies = alive.filter(p => p.role === 'zombie');

    const humans = alive.filter(p => p.role === 'human' || p.role === 'medic');

    if (zombies.length === 0) {

        await endGlobalGame(sock, groupJid, false, 'humans', humans);

    } else if (humans.length === 0) {

        await endGlobalGame(sock, groupJid, false, 'zombies', zombies);

    }

};

// -------------------------

// المستمع

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

        const cached = playerCache[senderRaw] || playerCache[senderJid];

        if (!cached) return;

        const groupJid = cached.groupJid;

        const game = games[groupJid];

        if (!game || game.state !== 'RUNNING') return;

        const pKey = Object.keys(game.players).find(k => k === senderJid || game.players[k].lid === senderRaw);

        if (!pKey) return;

        const player = game.players[pKey];

        // 1. داخل الحلبة (اختيار البطاقات)

        if (player.state === 'IN_MATCH') {

            await handleCardSelection(sock, player, text, m.key);

            return;

        }

        // 2. حالة انتظار "جاهز"

        if (player.state === 'WAITING_FOR_READY') {

            if (text === 'جاهز') {

                const req = player.pendingRequest;

                if (!req) return;

                clearTimeout(req.timer); 

                

                const initiator = game.players[req.from];

                initiator.state = 'IDLE'; 

                initiator.pendingRequest = null;

                player.state = 'IDLE';

                player.pendingRequest = null;

                await startArenaMatch(sock, groupJid, initiator.jid, player.jid);

            }

            return;

        }

        // 3. طلب مبارزة

        if (player.state === 'IDLE') {

            if (player.cooldownUntil > Date.now()) return; // في استراحة

            if (!/^\d{3}$/.test(text)) return;

            const targetId = text;

            const targetJid = game.tempIdMap[targetId];

            if (!targetJid) return;

            if (targetJid === player.jid) return await sendText(sock, player.jid, "❌ لا يمكنك استهداف نفسك.");

            const target = game.players[targetJid];

            

            if (target.state !== 'IDLE' || target.cooldownUntil > Date.now()) return await sendText(sock, player.jid, "⚠️ اللاعب مشغول أو في استراحة.");

            player.state = 'REQUESTING';

            target.state = 'WAITING_FOR_READY';

            player.pendingRequest = { to: target.jid };

            

            target.pendingRequest = {

                from: player.jid,

                timer: setTimeout(async () => {

                    if (target.state === 'WAITING_FOR_READY') {

                        target.state = 'DEAD';

                        await sendText(sock, target.jid, "⏰ *انتهى الوقت!* تم إقصاؤك لعدم كتابة 'جاهز'.");

                        await killPlayer(sock, groupJid, target, "تأخر في الاستجابة");

                        

                        player.state = 'IDLE';

                        player.pendingRequest = null;

                        await sendText(sock, player.jid, "☠️ تم إقصاء الخصم لعدم الاستجابة.");

                        checkWinCondition(sock, groupJid);

                    }

                }, READY_TIMEOUT_SECONDS * 1000)

            };

            await sendText(sock, player.jid, "⏳ بانتظار استجابة الخصم...");

            await sendText(sock, target.jid, `🔔 *تحدي!* \nاللاعب @${player.jid.split('@')[0]} يريد قتالك.\nاكتب *جاهز* خلال دقيقة وإلا سيتم إقصاؤك! ☠️`, [player.jid]);

        }

    });

};

// -------------------------

// إنهاء اللعبة

// -------------------------

const endGlobalGame = async (sock, groupJid, isTimeOut = false, winTeam = null, winners = []) => {

    const game = games[groupJid];

    if (!game) return;

    if (game.timerId) clearTimeout(game.timerId);

    let report = `🏁 *انتهت لعبة الزومبي!* `;

    

    const alive = Object.values(game.players).filter(p => p.state !== 'DEAD');

    const zombies = alive.filter(p => p.role === 'zombie');

    const humans = alive.filter(p => p.role === 'human' || p.role === 'medic');

    if (isTimeOut && !winTeam) {

        if (humans.length > zombies.length) {

            winTeam = 'humans';

            winners = humans;

            report += `(انتهى الوقت: الغلبة للمواطنين 👮‍♂️)\n`;

        } else if (zombies.length > humans.length) {

            winTeam = 'zombies';

            winners = zombies;

            report += `(انتهى الوقت: الغلبة للزومبي 🧟‍♂️)\n`;

        } else {

            report += `(تعادل في العدد! لا فائز)\n`;

            await sendText(sock, groupJid, report);

            delete games[groupJid];

            return;

        }

    } else {

        report += winTeam === 'humans' ? `(تم القضاء على الزومبي)\n` : `(تم تحويل/قتل الجميع)\n`;

    }

    report += `🏆 *الفريق الفائز: ${winTeam === 'humans' ? 'البشر 👮‍♂️' : 'الزومبي 🧟‍♂️'}*\n`;

    report += `🆙 *الناجون (تمت الترقية لـ ${NEXT_LEVEL}):*\n`;

    winners.forEach(p => {

        updatePlayerStatus(p.jid, { lvl: NEXT_LEVEL });

        report += `- @${p.jid.split('@')[0]} (${p.role})\n`;

    });

    const losers = Object.values(game.players).filter(p => p.state !== 'DEAD' && !winners.includes(p));

    if (losers.length > 0) {

        report += `\n☠️ *تم إقصاء الخاسرين:*\n`;

        losers.forEach(async p => {

            updatePlayerStatus(p.jid, { status: false });

            report += `- @${p.jid.split('@')[0]}\n`;

            try { await sock.groupParticipantsUpdate(groupJid, [p.jid], 'remove'); } catch {}

        });

    }

    await sendText(sock, groupJid, report, Object.keys(game.players));

    

    // تنظيف

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

    command: 'زومبي',

    description: 'لعبة الزومبي بنظام الحلبات (B1 Update).',

    elite: "on",

    group: true,

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

