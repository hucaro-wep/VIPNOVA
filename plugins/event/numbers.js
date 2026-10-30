// /////////////////////////////////////////

// ملف numbers.js (لعبة الأرقام - بطولة B3 -> B4) - Fixed ID/LID Logic

// /////////////////////////////////////////

import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";

// تعريف المسارات

const __filename = fileURLToPath(import.meta.url);

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

// إعدادات البطولة

const REQUIRED_LEVEL = "B3";

const NEXT_LEVEL = "B4";

const MIN_PLAYERS = 2;

// الكائنات الحية (تخزين بيانات اللعبة)

const games = new Map(); 

let isListenerAttached = false;

// -------------------------

// دوال مساعدة (Utils)

// -------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// دالة تنظيف المعرف (تزيل الامتدادات ليبقى الرقم فقط)

const normalizeId = (id) => {

    if (!id) return "";

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

// تحديث ملف JSON

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        // نستخدم normalizeId للبحث لضمان التطابق سواء كان LID أو JID في الملف

        const targetNum = normalizeId(playerId);

        const index = data.findIndex(p => normalizeId(p.id) === targetNum);

        

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) { console.error("Error updating JSON:", e); }

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

// المستمع الذكي (Smart Listener)

// -------------------------

function attachListener(sock) {

    if (isListenerAttached) return;

    

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const msg = messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;

        const game = games.get(chatId);

        

        // 1. هل اللعبة قائمة والجولة مفتوحة؟

        if (!game || !game.roundActive) return;

        // 2. استخراج هوية المرسل (JID أو LID) وتنظيفها

        const senderRaw = msg.key.participant || msg.key.remoteJid;

        const senderClean = normalizeId(senderRaw);

        // 3. البحث عن اللاعب في الـ Map (التي تحتوي الآن على JID و LID)

        const player = game.alivePlayersMap.get(senderClean);

        if (!player) return; // ليس لاعباً في هذه الجولة

        // 4. هل أجاب مسبقاً؟ (تجاهل التكرار)

        if (game.roundResponsesSet.has(player.id)) return;

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // 5. التحقق من أن النص رقم صحيح

        if (!/^\d+$/.test(text)) {

             // تجاهل الرسائل الفارغة أو الميديا بدون نص (كالصور والملصقات)

             if (!text && (msg.message.stickerMessage || msg.message.reactionMessage)) return; 

            

             // إذا كتب نصاً (حروف) بدلاً من أرقام، يتم طرده

             await sendText(sock, chatId, `🚫 *تم طرد @${player.id.split('@')[0]} (رسالة غير رقمية)!*`, null, [player.id]);

             

             // معالجة الطرد

             updatePlayerStatus(player.id, { status: false });

             await kickMember(sock, chatId, player.id);

             

             // إزالته فوراً من اللعبة الحالية

             game.players = game.players.filter(p => p.id !== player.id);

             // تنظيف الـ Map لمنع استجابات أخرى منه

             game.alivePlayersMap.delete(normalizeId(player.id));

             if (player.lid) game.alivePlayersMap.delete(normalizeId(player.lid));

             

             return;

        }

        const num = parseInt(text);

        

        // 6. تسجيل الإجابة والاعتماد

        player.choice = num;

        game.roundResponsesSet.add(player.id); // قفل الإجابة لهذا اللاعب

        // ✅ التفاعل فوراً ليعرف أنه تم الرصد

        try {

            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

        } catch (e) {}

    });

    isListenerAttached = true;

}

// -------------------------

// حلقة اللعبة (Game Loop)

// -------------------------

const startGameLoop = async (sock, groupJid) => {

    const game = games.get(groupJid);

    let round = 1;

    while (game.players.length > 1) {

        // --- تحديث خريطة اللاعبين (هنا يكمن الذكاء: ربط JID و LID) ---

        game.alivePlayersMap = new Map();

        game.players.forEach(p => {

            // ربط رقم الهاتف

            game.alivePlayersMap.set(normalizeId(p.id), p);

            // ربط الـ LID إذا وجد (مهم جداً للرياكت)

            if (p.lid) game.alivePlayersMap.set(normalizeId(p.lid), p);

        });

        // فتح المجموعة

        try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); } catch(e) {}

        await sleep(1000);

        await sendText(sock, groupJid, `*[الجولة ${round} :]*\nاختر رقمًا بين 0 و 100..\n❗ أي رسالة غير رقمية تؤدي إلى الطرد فورًا..\n⏳ لديك 30 ثانية للاختيار..`);

        // تصفير خيارات اللاعبين للجولة الجديدة

        game.players.forEach(p => p.choice = null);

        game.roundResponsesSet = new Set(); // تفريغ سجل المستجيبين

        game.roundActive = true; // السماح للمستمع بالعمل

        // العد التنازلي

        let countdownMsg = await sock.sendMessage(groupJid, { text: '*⏰:30*' });

        for (let i = 29; i >= 0; i--) {

            await sleep(1000);

            if (game.players.length < 2) break; // توقف إذا بقي لاعب واحد أو أقل

            try {

                await sock.sendMessage(groupJid, { text: `*⏰:${i < 10 ? '0' : ''}${i}*`, edit: countdownMsg.key });

            } catch {}

        }

        game.roundActive = false; // إيقاف المستمع

        

        // إغلاق المجموعة

        try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch(e) {}

        await sleep(1000);

        await sendText(sock, groupJid, '*⏳ انتهى الوقت!*');

        // معالجة من لم يختر (يعتبر 0 افتراضياً)

        game.players.forEach(p => {

            if (p.choice === null) p.choice = 0;

        });

        // عرض الأرقام المختارة

        let numbersMsg = '*📊 الأرقام المختارة:*\n\n';

        for (const p of game.players) {

            numbersMsg += `@${p.id.split('@')[0]} : ${p.choice}\n`;

        }

        await sendText(sock, groupJid, numbersMsg, null, game.players.map(p => p.id));

        await sleep(3000);

        

        // اختيار رقم البوت العشوائي

        let botNumber = Math.floor(Math.random() * 101);

        await sendText(sock, groupJid, `🤖 *الرقم العشوائي: ${botNumber}*`);

        await sleep(2000);

        // --- منطق احتساب النقاط والتعادل ---

        

        // 1. حساب الفرق المطلق لكل لاعب

        game.players.forEach(p => {

            p.diff = Math.abs(p.choice - botNumber);

        });

        // 2. التحقق من حالة "التطابق الجماعي" (All Same Result)

        // إذا كان الجميع لديهم نفس الفرق (سواء كلهم صح أو كلهم خطأ بنفس الدرجة)

        const firstDiff = game.players[0].diff;

        const allSame = game.players.every(p => p.diff === firstDiff);

        if (allSame) {

            // الحالة الخاصة: الجميع ينقصهم درجة واحدة

            game.players.forEach(p => p.points -= 1);

            await sendText(sock, groupJid, `⚠️ *تعادل جماعي!* (نفس النتيجة للجميع)\n📉 تم خصم نقطة واحدة من كل المشاركين.`);

        } else {

            // الحساب الطبيعي

            // هل يوجد أحد جاب الرقم بالضبط؟ (Diff = 0)

            const exactWinners = game.players.filter(p => p.diff === 0);

            

            if (exactWinners.length > 0) {

                // يوجد فائزون بالتطابق التام

                const winnersMentions = exactWinners.map(p => p.id);

                let msg = `🎯 *تطابق تام (Exact Match)!* 🎉\n`;

                msg += exactWinners.map(p => `@${p.id.split('@')[0]}`).join(' و ');

                msg += `\nحافظوا على نقاطهم، وتم خصم *2 نقطة* من البقية.`;

                

                await sendText(sock, groupJid, msg, null, winnersMentions);

                // خصم نقطتين من الخاسرين

                game.players.forEach(p => {

                    if (p.diff !== 0) p.points -= 2;

                });

            } else {

                // لا يوجد تطابق تام، نبحث عن الأقرب (أقل فرق)

                const minDiff = Math.min(...game.players.map(p => p.diff));

                const closestWinners = game.players.filter(p => p.diff === minDiff);

                

                const winnersMentions = closestWinners.map(p => p.id);

                let msg = `🔍 *الأقرب للرقم!* (الفرق: ${minDiff})\n`;

                msg += closestWinners.map(p => `@${p.id.split('@')[0]} (رقم ${p.choice})`).join(' و ');

                msg += `\nحافظوا على نقاطهم، وتم خصم *1 نقطة* من البقية.`;

                await sendText(sock, groupJid, msg, null, winnersMentions);

                // خصم نقطة واحدة من الخاسرين

                game.players.forEach(p => {

                    if (p.diff !== minDiff) p.points -= 1;

                });

            }

        }

        await sleep(2000);

        

        // عرض جدول النقاط

        let pointsMsg = `*نقاط الأعضاء:*\n\n`;

        game.players.forEach(p => pointsMsg += `@${p.id.split('@')[0]} : ${p.points}\n`);

        await sendText(sock, groupJid, pointsMsg, null, game.players.map(p => p.id));

        // --- مرحلة الإقصاء ---

        const eliminated = [];

        const survivors = [];

        

        for (const p of game.players) {

            if (p.points <= 0) {

                eliminated.push(p);

            } else {

                survivors.push(p);

            }

        }

        game.players = survivors; // البقاء للأقوياء

        if (eliminated.length > 0) {

            let kickMsg = `🚫 *تم إقصاء (نقاط 0):*\n`;

            for (const p of eliminated) {

                kickMsg += `- @${p.id.split('@')[0]}\n`;

                

                // تحديث قاعدة البيانات

                updatePlayerStatus(p.id, { status: false });

                

                // إرسال رسالة خاصة

                await sendDM(sock, p.id, `❌ خسرت في لعبة الأرقام.\n🚫 تم إقصاؤك.`);

                

                // الطرد

                await kickMember(sock, groupJid, p.id);

            }

            await sendText(sock, groupJid, kickMsg, null, eliminated.map(p => p.id));

        }

        await sleep(2000);

        round++;

    }

    // --- نهاية اللعبة ---

    if (game.players.length === 1) {

        const winner = game.players[0];

        updatePlayerStatus(winner.id, { lvl: NEXT_LEVEL });

        

        await sendText(sock, groupJid, `🏆 *🎉 مبروك! الفائز هو @${winner.id.split('@')[0]}!* 🏆\n✅ تمت الترقية لـ ${NEXT_LEVEL}.`, null, [winner.id]);

        await sendDM(sock, winner.id, `🎉 مبروك الفوز في لعبة الأرقام!\n✅ تمت ترقيتك للمستوى *${NEXT_LEVEL}*.`);

    } else if (game.players.length === 0) {

        await sendText(sock, groupJid, "🏳️ انتهت اللعبة بلا فائز.");

    }

    // تنظيف ذاكرة اللعبة

    games.delete(groupJid);

};

// -------------------------

// دالة التنفيذ (Execute)

// -------------------------

async function execute({ sock, msg, args }) {

    // تفعيل المستمع مرة واحدة عند تشغيل البوت

    attachListener(sock);

    const groupJid = msg.key.remoteJid;

    if (!groupJid.endsWith('@g.us')) return;

    if (games.has(groupJid)) {

        return await sendText(sock, groupJid, "⚠️ اللعبة جارية بالفعل.");

    }

    // جلب اللاعبين المؤهلين (B3)

    const eligiblePlayers = getEligiblePlayers();

    if (eligiblePlayers.length < MIN_PLAYERS) {

        return await sendText(sock, groupJid, `⚠️ العدد غير كافٍ.\nالمتاح (B3): ${eligiblePlayers.length}\nالمطلوب: ${MIN_PLAYERS}`);

    }

    // إعداد كائن اللعبة

    // نقوم بنسخ البيانات المهمة (id, lid) لاستخدامها في الـ Map

    const newGame = {

        players: eligiblePlayers.map(p => ({

            id: p.id,

            lid: p.lid || null, // حفظ الـ LID

            points: 10,

            choice: null,

            diff: 0

        })),

        alivePlayersMap: new Map(), // سيتم تعبئتها في بداية الحلقة

        roundResponsesSet: new Set(),

        roundActive: false

    };

    games.set(groupJid, newGame);

    await sendText(sock, groupJid, `*🔢 لعبة الأرقام (تصفيات B3 -> B4)!*\n👥 المشاركون: ${eligiblePlayers.length}\n💰 النقاط: 10 لكل لاعب.\n\nستبدأ الجولة الأولى خلال لحظات...`);

    

    await sleep(3000);

    startGameLoop(sock, groupJid);

}

export const NovaUltra = {

    command: 'ارقام',

    description: 'لعبة الأرقام (بطولة B3).',

    elite: "on",

    group: true,

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

