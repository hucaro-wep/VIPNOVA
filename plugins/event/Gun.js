// /////////////////////////////////////////

// ملف roulette.js (المسدس الروسي - بطولة A3 -> A4)

// تحديث جذري: إصلاح مشكلة عدم الاستجابة (JID/LID Fix)

// /////////////////////////////////////////

import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";

// تعريف المسارات

const __filename = fileURLToPath(import.meta.url);

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

// إعدادات البطولة

const REQUIRED_LEVEL = "A3";

const NEXT_LEVEL = "A4";

const MIN_PLAYERS = 2;

const TURN_TIME_SECONDS = 60; // 60 ثانية

// تخزين الألعاب (Map لمعالجة أفضل)

const games = new Map();

let isListenerAttached = false;

// -------------------------

// دوال مساعدة (Utils)

// -------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// دالة توحيد المعرف (JID/LID) - أهم دالة للإصلاح

const normalizeId = (id) => {

    if (!id) return "";

    // إزالة الامتدادات والشوائب ليبقى الرقم الصافي

    return id.split(':')[0].split('@')[0];

};

const sendText = async (sock, jid, text, quoted = null, mentions = []) => {

    return await sock.sendMessage(jid, { text: text, mentions }, { quoted });

};

const sendDM = async (sock, jid, text) => {

    try { await sock.sendMessage(jid, { text: text }); } catch (e) {}

};

const kickMember = async (sock, groupJid, participantId) => {

    try { await sock.groupParticipantsUpdate(groupJid, [participantId], 'remove'); } catch (e) {}

};

// جلب اللاعبين المؤهلين

const getEligiblePlayers = () => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        return data.filter(p => p.status === true && p.lvl === REQUIRED_LEVEL);

    } catch (e) { return []; }

};

// تحديث الحالة (JSON)

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const index = data.findIndex(p => normalizeId(p.id) === normalizeId(playerId));

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) {}

};

// خلط المصفوفة

const shuffleArray = (array) => {

    for (let i = array.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [array[i], array[j]] = [array[j], array[i]];

    }

    return array;

};

// تنسيق القلوب

const formatHearts = (count) => {

    return count > 0 ? '♡'.repeat(count) : '💀';

};

// إنشاء المخزن (الرصاص)

const createMagazine = () => {

    const liveBulletsCount = Math.random() < 0.5 ? 2 : 3;	

    const blankBulletsCount = 6 - liveBulletsCount;

    let magazine = [];

    for (let i = 0; i < liveBulletsCount; i++) magazine.push(true); // حية

    for (let i = 0; i < blankBulletsCount; i++) magazine.push(false); // فارغة

    return shuffleArray(magazine);

};

// -------------------------

// المستمع الذكي (Smart Listener) - تم الإصلاح هنا

// -------------------------

function attachListener(sock) {

    if (isListenerAttached) return;

    

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const msg = messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;

        const game = games.get(chatId);

        

        // 1. هل اللعبة قائمة؟

        if (!game || !game.state.roundActive) return;

        // 2. استخراج هوية المرسل (JID أو LID) وتنظيفها

        const senderRaw = msg.key.participant || msg.key.remoteJid;

        const senderClean = normalizeId(senderRaw);

        // 3. البحث الذكي عن اللاعب

        // هذه الخطوة هي التي تحل المشكلة: نبحث في الخريطة التي تحتوي المفتاحين

        const playerObj = game.playersMap.get(senderClean);

        // إذا لم نجد اللاعب، أو وجدناه لكنه ليس صاحب الدور الحالي

        if (!playerObj) return; 

        

        // مقارنة معرف اللاعب الحالي (المحفوظ في الحالة) مع معرف المرسل (الذي جلبناه من الخريطة)

        // نستخدم normalizeId للطرفين لضمان التطابق التام

        if (normalizeId(playerObj.id) !== normalizeId(game.state.currentPlayerJid)) return;

        // 4. هل تم الاستجابة بالفعل؟

        if (game.state.responseReceived) return;

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();

        const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // --- المعالجة ---

        // المرحلة أ: اختيار 1 أو 2

        if (game.stage === 'russian_roulette_quiz') {

            if (text === '1') {

                game.state.responseReceived = true; 

                game.state.timerActive = false; // إيقاف التايمر

                // ✅ رياكت فوري

                try { await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } }); } catch {}

                game.stage = 'awaiting_target';

                game.state.responseReceived = false; // فتح الباب للمنشن

                

                await sendText(sock, chatId, "🎯 *اخترت الهجوم!* منشن الضحية الآن...", msg);

            } 

            else if (text === '2') {

                game.state.responseReceived = true;

                game.state.timerActive = false; // إيقاف التايمر

                // ✅ رياكت فوري

                try { await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } }); } catch {}

                await handleRiskAction(sock, chatId, game, playerObj.id);

            }

        } 

        // المرحلة ب: المنشن

        else if (game.stage === 'awaiting_target') {

            if (mentions.length > 0) {

                const targetJid = mentions[0];

                const targetClean = normalizeId(targetJid);

                

                // التأكد من أن الهدف يلعب وحي

                const targetPlayer = game.playersMap.get(targetClean);

                const isTargetAlive = targetPlayer && game.state.playerHealth[targetPlayer.id] > 0;

                

                if (isTargetAlive && targetClean !== senderClean) {

                    game.state.responseReceived = true; // قفل

                    // ✅ رياكت فوري

                    try { await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } }); } catch {}

                    const currentBulletIsLive = game.state.magazine[game.state.currentShotIndex];

                    game.state.currentShotIndex++; 

                    

                    const shotResult = currentBulletIsLive ? "*طلقة 💥*" : "_طلقة فارغة_";

                    const message = `*أطلقت على @${targetJid.split('@')[0]}!* النتيجة: ${shotResult}`;

                    

                    await sendText(sock, chatId, message, null, [targetJid]);

                    if (currentBulletIsLive) {

                        await handleHit(sock, chatId, game, targetJid);

                    }

                    

                    game.stage = 'russian_roulette_quiz'; 

                    await sleep(2000); 

                    await advanceTurn(sock, chatId, game, true); 

                } else if (targetClean === senderClean) {

                    await sendText(sock, chatId, "🚫 لا يمكنك الإطلاق على نفسك بالخيار 1.", msg);

                } else {

                    await sendText(sock, chatId, "⚠️ الهدف غير صحيح أو ميت.", msg);

                }

            }

        }

    });

    isListenerAttached = true;

}

// -------------------------

// منطق اللعبة (Game Logic)

// -------------------------

const startTurnTimer = async (sock, jid, game, playerJid) => {

    game.state.timerActive = true;

    game.state.roundActive = true;

    game.state.responseReceived = false;

    

    // إرسال رسالة التايمر الأولية

    let timerMsg = await sendText(sock, jid, `⏳ *المتبقي: ${TURN_TIME_SECONDS}*`);

    

    for (let i = TURN_TIME_SECONDS - 1; i >= 0; i--) {

        await sleep(1000);

        

        // شروط الخروج: توقف التايمر أو تغير اللاعب

        if (!game.state.timerActive || normalizeId(game.state.currentPlayerJid) !== normalizeId(playerJid)) {

            try { await sock.sendMessage(jid, { delete: timerMsg.key }); } catch {}

            return; 

        }

        // تحديث كل 5 ثواني

        if (i % 5 === 0 || i <= 10) { 

             try {

                await sock.sendMessage(jid, { text: `⏳ *المتبقي: ${i}*`, edit: timerMsg.key });

            } catch {}

        }

    }

    // انتهاء الوقت

    if (game.state.timerActive && normalizeId(game.state.currentPlayerJid) === normalizeId(playerJid)) {

        game.state.timerActive = false;

        game.state.responseReceived = true; // منع الإجابة

        

        await sendText(sock, jid, `⌛ *انتهى الوقت!* تم اختيار "المخاطرة" تلقائياً.`);

        await handleRiskAction(sock, jid, game, playerJid);

    }

};

const handleRiskAction = async (sock, jid, game, playerJid) => {

    const currentBulletIsLive = game.state.magazine[game.state.currentShotIndex];

    game.state.currentShotIndex++; 

    const shotResult = currentBulletIsLive ? "*طلقة 💥*" : "_طلقة فارغة_";

    const message = `*أطلق على نفسه!* النتيجة: ${shotResult}`;

    

    await sendText(sock, jid, message, null, [playerJid]);

    if (currentBulletIsLive) {

        await handleHit(sock, jid, game, playerJid);

        await sleep(2000); 

        await advanceTurn(sock, jid, game, true); 

    } else {

        await sendText(sock, jid, "✅ *نجا!* لديه دور إضافي.", null, [playerJid]);

        await sleep(2000); 

        await advanceTurn(sock, jid, game, false); 

    }

};

const getHealthStatusMessage = (game) => {

    let statusMessage = "*❤️ القلوب الحالية:*\n";

    game.state.activePlayersList.forEach(p => {

        if (game.state.playerHealth[p.id] > 0) {

            statusMessage += `👤 @${p.id.split('@')[0]} ${formatHearts(game.state.playerHealth[p.id])}\n`;

        }

    });

    return statusMessage;

};

const sendTurnMessage = async (sock, jid, game, playerJid) => {

    const playerName = playerJid.split('@')[0];

    const magazine = game.state.magazine;

    const bulletsRemaining = magazine.length - game.state.currentShotIndex;

    const healthStatus = getHealthStatusMessage(game);

    

    const message = `

*--- جولة المسدس الروسي ---*

${healthStatus}

*🔫 الدور على @${playerName} !*

الرصاص المتبقي: *${bulletsRemaining}*

*اختر:*

1 = إطلاق (تطلق على مشارك آخر)

2 = المخاطرة (تطلق على نفسك، إذا نجوت لك دور إضافي)

    `;

    

    const mentions = game.state.activePlayersList

        .filter(p => game.state.playerHealth[p.id] > 0)

        .map(p => p.id);

    game.stage = 'russian_roulette_quiz';

    await sendText(sock, jid, message, null, mentions);

    startTurnTimer(sock, jid, game, playerJid);

};

const handleHit = async (sock, jid, game, targetJid) => {

    game.state.playerHealth[targetJid]--;

    const newHealth = game.state.playerHealth[targetJid];

    if (newHealth <= 0) {

        await sendText(sock, jid, `🚫 *تم إقصاء @${targetJid.split('@')[0]} (انتهت القلوب)!* 💀`, false, [targetJid]);

        

        updatePlayerStatus(targetJid, { status: false });

        await sendDM(sock, targetJid, `❌ خسرت في المسدس الروسي وتم إقصاؤك.`);

        await kickMember(sock, jid, targetJid);

    }

    return newHealth;

};

const checkGameEnd = async (sock, jid, game) => {

    const survivors = game.state.activePlayersList.filter(p => game.state.playerHealth[p.id] > 0);

    

    if (survivors.length <= 1) {

        game.state.timerActive = false;

        game.state.roundActive = false;

        

        const winner = survivors.length === 1 ? survivors[0] : null;

        game.stage = 'ended'; 

        

        if (winner) {

            updatePlayerStatus(winner.id, { lvl: NEXT_LEVEL });

            const finalMessage = `🎉 *انتهت اللعبة!* 🎉\n🏆 *الفائز هو @${winner.id.split('@')[0]}!* 🏆\n✅ تمت ترقيته للمستوى *${NEXT_LEVEL}*.`;

            await sendText(sock, jid, finalMessage, null, [winner.id]);

            await sendDM(sock, winner.id, `🎉 مبروك! لقد نجوت في المسدس الروسي.\n✅ تمت ترقيتك للمستوى *${NEXT_LEVEL}*.`);

        } else {

            await sendText(sock, jid, "🏳️ انتهت اللعبة بلا ناجين!");

        }

        

        games.delete(jid);

        return true;

    }

    return false;

};

const advanceTurn = async (sock, jid, game, forceNextPlayer = true) => {

    if (await checkGameEnd(sock, jid, game)) return;

    

    if (game.state.currentShotIndex >= game.state.magazine.length) {

        await sendText(sock, jid, "🔄 الماسورة فارغة! جولة جديدة...");

        await sleep(2000); 

        

        const survivors = game.state.activePlayersList.filter(p => game.state.playerHealth[p.id] > 0);

        if (survivors.length > 1) {

            await startNewRound(sock, jid, game, false);	

        } else {

            checkGameEnd(sock, jid, game);

        }

        return;

    }

    if (forceNextPlayer) {

         const survivors = game.state.activePlayersList.filter(p => game.state.playerHealth[p.id] > 0);

         if (survivors.length === 0) return; 

         

         let currentObj = survivors.find(p => p.id === game.state.currentPlayerJid);

         let currentIndex = survivors.indexOf(currentObj);

         

         if (currentIndex === -1) currentIndex = 0; 

         

         const nextIndex = (currentIndex + 1) % survivors.length;

         game.state.currentPlayerJid = survivors[nextIndex].id;

    }

    

    await sendTurnMessage(sock, jid, game, game.state.currentPlayerJid);

};

const startNewRound = async (sock, jid, game, isFirstRound = false) => {

    game.stage = 'russian_roulette_quiz';

    game.state.magazine = createMagazine();

    game.state.currentShotIndex = 0;

    

    if (isFirstRound) {

        game.state.playerHealth = {};

        game.state.activePlayersList.forEach(p => {

            game.state.playerHealth[p.id] = 2; 

        });

        

        const randomPlayer = game.state.activePlayersList[Math.floor(Math.random() * game.state.activePlayersList.length)];

        game.state.currentPlayerJid = randomPlayer.id;

    }

    

    const totalBullets = game.state.magazine.length;

    const liveBullets = game.state.magazine.filter(b => b).length;

    

    const initialMessage = `*--- ماسورة جديدة! ---*\nيوجد *${totalBullets}* محاولة، منها *${liveBullets}* حية.\n🏹 ${formatHearts(liveBullets)} | 💨 ${formatHearts(totalBullets - liveBullets)}\n...`;

    

    await sendText(sock, jid, initialMessage);

    await sleep(2000);

    await sendTurnMessage(sock, jid, game, game.state.currentPlayerJid);

};

// -------------------------

// التنفيذ (Execute)

// -------------------------

async function execute({sock, msg, args}) {

    attachListener(sock);

    const groupJid = msg.key.remoteJid;

    if (!groupJid.endsWith('@g.us')) return;

    if (games.has(groupJid)) {

        return await sendText(sock, groupJid, "⚠️ اللعبة جارية بالفعل.");

    }

    // 1. قراءة البيانات

    const eligiblePlayers = getEligiblePlayers();

    if (eligiblePlayers.length < MIN_PLAYERS) {

        return await sendText(sock, groupJid, `⚠️ العدد غير كافٍ.\nالمتاح (A3): ${eligiblePlayers.length}\nالمطلوب: ${MIN_PLAYERS}`);

    }

    // 2. إعداد اللعبة وتعبئة الخريطة (Dual Map)

    const newGame = {

        stage: 'russian_roulette_quiz', 

        msg,

        state: {

            activePlayersList: eligiblePlayers, 

            playerHealth: {},

            magazine: [],

            currentShotIndex: 0,

            currentPlayerJid: null,

            timerActive: false,

            roundActive: false,

            responseReceived: false,

        },

        playersMap: new Map(), // الخريطة التي تحل المشكلة

        time: Date.now()

    };

    

    // ربط كل من JID و LID بنفس كائن اللاعب

    eligiblePlayers.forEach(p => {

        newGame.playersMap.set(normalizeId(p.id), p);

        if (p.lid) newGame.playersMap.set(normalizeId(p.lid), p);

    });

    games.set(groupJid, newGame);

    

    const introText = `*🔫 المسدس الروسي (تصفيات A3 -> A4)!*

👥 المشاركون: ${eligiblePlayers.length}

🎯 المطلوب: البقاء حياً بقلبين (♡♡).

ℹ️ الخسارة = طرد فوري.

⏱️ الوقت: 60 ثانية.

*ستبدأ اللعبة فوراً...*`;

    

    await sendText(sock, groupJid, introText);

    await sleep(3000);

    // 3. البدء

    await startNewRound(sock, groupJid, newGame, true);

}

export const NovaUltra = {

    command: 'مسدس',

    description: 'المسدس الروسي (بطولة A3 -> A4).',

    elite: "on",

    group: true, 

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

