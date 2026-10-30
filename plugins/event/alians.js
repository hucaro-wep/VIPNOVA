// /////////////////////////////////////////

// ملف invasion.js (غزو فضائي - Fixed Timing & Kicking - B0 to B1)

// /////////////////////////////////////////

import fs from 'fs';

import path from 'path';

import { delay } from "@whiskeysockets/baileys";

// --- المسارات والإعدادات ---

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

const REQUIRED_LEVEL = "B0";

const NEXT_LEVEL = "B1";

// إعدادات اللعبة

const MIN_PLAYERS = 2;

const KIDNAP_DELAY_MS = 2000; // تأخير بسيط بين كل طرد لتجنب الباند

const SPECIAL_COUNT_TRIGGER = 128;

const TARGET_SURVIVORS = 50; 

// تخزين الألعاب النشطة

const activeGames = new Map();

let isListenerAttached = false;

// -------------------------

// دوال مساعدة (Utils)

// -------------------------

// تنظيف المعرف (JID/LID) ليتبقى الرقم فقط

const normalizeId = (id) => {

    if (!id) return "";

    return id.split(':')[0].split('@')[0];

};

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// تحديث ملف JSON

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const targetNum = normalizeId(playerId);

        const index = data.findIndex(p => normalizeId(p.id) === targetNum);

        

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) { console.error("Error updating JSON:", e); }

};

// طرد عضو

const kickMember = async (sock, groupJid, participantId) => {

    try {

        // محاولة طرد العضو باستخدام JID الأصلي المحفوظ

        await sock.groupParticipantsUpdate(groupJid, [participantId], 'remove');

    } catch (e) {

        // قد يفشل الطرد إذا كان العضو مشرفاً أو خرج بنفسه

    }

};

// جلب اللاعبين المؤهلين

const getEligiblePlayers = () => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        return data.filter(p => p.status === true && p.lvl === REQUIRED_LEVEL);

    } catch (e) { return []; }

};

// -------------------------

// المستمع (يسجل فقط ولا ينهي الجولة)

// -------------------------

function attachGameListener(sock) {

    if (isListenerAttached) return;

    

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const msg = messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;

        const game = activeGames.get(chatId);

        

        // شرط 1: هل الجولة مفتوحة للاستقبال؟

        if (!game || !game.roundInProgress) return;

        // استخراج هوية المرسل

        const senderRaw = msg.key.participant || msg.key.remoteJid;

        const senderClean = normalizeId(senderRaw);

        // شرط 2: هل المرسل لاعب حي في هذه اللعبة؟

        // نستخدم Map للوصول السريع للاعب باستخدام رقمه النظيف

        const player = game.alivePlayersMap.get(senderClean);

        if (!player) return; // ليس لاعباً حياً

        // شرط 3: هل أجاب مسبقاً؟

        if (game.roundResponsesSet.has(player.id)) return;

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // شرط 4: التحقق من صحة التردد

        if (text === game.expectedResponse) {

            // ✅ إجابة صحيحة

            

            // تسجيل الاستجابة مع التوقيت

            game.roundResponses.push({

                playerObj: player, // نحفظ كائن اللاعب كاملاً

                time: Date.now()

            });

            

            // إضافة للـ Set لمنع التكرار

            game.roundResponsesSet.add(player.id);

            // تفاعل (React) ليعرف أنه تم رصده

            try {

                await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

            } catch (e) {}

        } 

        // ❌ إجابة خاطئة: تجاهل تام

    });

    isListenerAttached = true;

}

// -------------------------

// حلقة اللعبة (Main Game Loop)

// -------------------------

async function startInvasionLoop(sock, game) {

    const groupJid = game.groupJid;

    const isSpecialMode = game.initialCount === SPECIAL_COUNT_TRIGGER;

    const stopAtCount = isSpecialMode ? TARGET_SURVIVORS : 1;

    // إغلاق الشات للتحضير

    try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch (e) { }

    let introText = `*👽 الغزو الفضائي (B0 -> B1)*\n`;

    introText += `⏱ الجولات 1-10: 30 ثانية.\n`;

    introText += `⏱ الجولات 11+: 10 ثوانٍ.\n`;

    introText += `⚔️ الخاسر يُخطف ويُطرد فوراً.\n`;

    introText += `✅ انتظر رياكت للتأكد من رصدك.\n`;

    

    if (isSpecialMode) introText += `🔥 *وضع التصفيات:* حتى بقاء ${TARGET_SURVIVORS} ناجياً.`;

    else introText += `🏆 *الهدف:* ناجٍ وحيد.`;

    await sock.sendMessage(groupJid, { text: introText });

    await delay(3000);

    let round = 1;

    while (true) {

        // 1. تحديث قائمة الأحياء

        const alivePlayers = game.players.filter(p => p.isAlive);

        

        // تحديث الـ Map للبحث السريع في المستمع

        game.alivePlayersMap = new Map();

        alivePlayers.forEach(p => {

            game.alivePlayersMap.set(normalizeId(p.id), p);

            if (p.lid) game.alivePlayersMap.set(normalizeId(p.lid), p);

        });

        // 2. شرط الفوز / التوقف

        if (alivePlayers.length <= stopAtCount) {

            let winMsg = "";

            if (alivePlayers.length === 0) {

                winMsg = '🏳️ انتهت اللعبة — الجميع خسر!';

            } else {

                // ترقية الناجين

                for (const p of alivePlayers) {

                    updatePlayerStatus(p.id, { lvl: NEXT_LEVEL });

                }

                if (isSpecialMode) {

                    winMsg = `🎉 *انتهت التصفيات!*\nتبقى ${alivePlayers.length} ناجياً.\n✅ تم الترقية لـ ${NEXT_LEVEL}.`;

                } else {

                    winMsg = `🎉 *الغزو انتهى!* الفائز: @${alivePlayers[0].id.split('@')[0]}\n✅ تم الترقية لـ ${NEXT_LEVEL}.`;

                }

            }

            await sock.sendMessage(groupJid, { 

                text: winMsg, 

                mentions: alivePlayers.map(p => p.id) 

            });

            

            activeGames.delete(groupJid);

            try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); } catch (e) { }

            return;

        }

        // 3. إعداد الجولة

        const frequency = randInt(100, 999).toString();

        const roundDurationSeconds = round <= 10 ? 30 : 10;

        

        // تصفير الاستجابات

        game.expectedResponse = frequency;

        game.roundResponses = []; // لتحديد الأبطأ

        game.roundResponsesSet = new Set(); // لمنع التكرار

        game.roundInProgress = true; // فتح الباب للمستمع

        await sock.sendMessage(groupJid, {

            text: `*📡 الجولة ${round}* (المتبقون: ${alivePlayers.length})\nالتردد: *${frequency}*\n⏳ الوقت: ${roundDurationSeconds} ثانية (للجميع).`

        });

        // فتح الشات

        try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); } catch (e) {}

        // 4. الانتظار الكامل (هنا التعديل المهم: لا نتوقف عند أول إجابة)

        await delay(roundDurationSeconds * 1000);

        // 5. إغلاق الجولة

        game.roundInProgress = false; // قفل الباب أمام المستمع

        try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch (e) { }

        

        await sock.sendMessage(groupJid, { text: '🛑 انتهى الوقت! جاري الفرز...' });

        await delay(1000);

        // -------------------------

        // منطق الفرز والخطف (Elimination)

        // -------------------------

        let losers = [];

        // الحالة أ: المتخاذلون (من لم يرسلوا الرقم الصحيح نهائياً)

        // نقارن قائمة الأحياء مع قائمة من استجابوا

        const nonResponders = alivePlayers.filter(p => !game.roundResponsesSet.has(p.id));

        if (nonResponders.length > 0) {

            // نخطف فقط الذين لم يجاوبوا، ونترك من جاوب (حتى لو كان بطيئاً، لأنه نجا بفضل فشل الآخرين)

            losers = nonResponders;

            await sock.sendMessage(groupJid, { text: `💔 تم رصد ${losers.length} لاعبين لم يكتبوا التردد.` });

        } 

        // الحالة ب: الجميع كتب الرقم الصحيح؟

        // إذن يجب أن نخطف شخصاً واحداً وهو الأبطأ

        else {

            // المصفوفة roundResponses مرتبة زمنياً لأننا نستخدم push وقت الوصول

            // آخر عنصر = الأبطأ

            const lastResponse = game.roundResponses[game.roundResponses.length - 1];

            const slowestPlayer = lastResponse.playerObj;

            

            losers.push(slowestPlayer);

            await sock.sendMessage(groupJid, { 

                text: `⚠️ الجميع نجح، ولكن @${slowestPlayer.id.split('@')[0]} كان الأبطأ!`,

                mentions: [slowestPlayer.id]

            });

        }

        // 6. تنفيذ العقوبة (الخطف والطرد)

        if (losers.length > 0) {

            for (const loser of losers) {

                // إقصاء من اللعبة

                loser.isAlive = false; 

                

                // تحديث JSON

                updatePlayerStatus(loser.id, { status: false }); 

                

                // رسالة الخطف

                await sock.sendMessage(groupJid, { 

                    text: `🛸 *تم اختطاف وطرد @${loser.id.split('@')[0]}!*`, 

                    mentions: [loser.id] 

                });

                // طرد فعلي من الجروب

                await kickMember(sock, groupJid, loser.id);

                // تأخير بسيط لتجنب الباند

                await delay(KIDNAP_DELAY_MS);

            }

        }

        // الانتقال للجولة التالية

        await delay(1000);

        round++;

    }

}

// -------------------------

// التنفيذ

// -------------------------

async function execute({sock, msg, args}) {

    // تشغيل المستمع مرة واحدة

    attachGameListener(sock); 

    const groupJid = msg.key.remoteJid;

    if (!groupJid.endsWith('@g.us')) return;

    if (activeGames.has(groupJid)) {

        return await sock.sendMessage(groupJid, { text: '⚠️ اللعبة جارية بالفعل.' }, { quoted: msg });

    }

    // جلب اللاعبين

    const eligiblePlayers = getEligiblePlayers();

    

    if (eligiblePlayers.length < MIN_PLAYERS) {

        return await sock.sendMessage(groupJid, {

            text: `⚠️ العدد غير كافٍ.\nالمطلوب: ${REQUIRED_LEVEL} + True.\nالمتاح: ${eligiblePlayers.length}`

        }, { quoted: msg });

    }

    // إنشاء كائن اللعبة

    const gamePlayers = eligiblePlayers.map(p => ({

        ...p, // نسخ كل البيانات (id, lid, nickname...)

        isAlive: true

    }));

    const newGame = {

        groupJid,

        players: gamePlayers,

        alivePlayersMap: new Map(), // للبحث السريع (ID & LID)

        initialCount: gamePlayers.length,

        roundInProgress: false,

        expectedResponse: null,

        roundResponses: [], // لحفظ الترتيب

        roundResponsesSet: new Set() // لمنع التكرار

    };

    activeGames.set(groupJid, newGame);

    let welcome = `*👾 الغزو الفضائي (المستوى ${REQUIRED_LEVEL})!*

✅ المشاركون: ${gamePlayers.length}

`;

    if (newGame.initialCount === SPECIAL_COUNT_TRIGGER) {

        welcome += `🔥 *وضع التصفيات الكبرى!* (128 لاعب)\n🎯 الهدف: 50 ناجياً.`;

    } else {

        welcome += `🎯 الهدف: ناجٍ وحيد.`;

    }

    

    await sock.sendMessage(groupJid, { text: welcome }, { quoted: msg });

    // بدء المحرك

    startInvasionLoop(sock, newGame);

}

export const NovaUltra = {

    command: ["غزو"], 

    description: 'لعبة الغزو الفضائي (Fixed Waiting Time - B0).',

    elite: "on", 

    group: true, 

    prv: false, 

    lock: "off" 

};

export default { NovaUltra, execute };

