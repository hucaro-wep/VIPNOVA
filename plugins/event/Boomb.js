// /////////////////////////////////////////

// ملف bomb.js (لعبة القنبلة - Smart JID/LID Listener - Updated)

// /////////////////////////////////////////

import fs from 'fs';

import path from 'path';

import { delay } from "@whiskeysockets/baileys";

import chalk from "chalk";

// --- المسارات والإعدادات ---

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

const REQUIRED_LEVEL = "A0";

const NEXT_LEVEL = "A1";

// إعدادات اللعبة

const MIN_PLAYERS = 2; 

const MIN_OPEN_SECONDS = 10;

const MAX_OPEN_SECONDS = 30;

// شرط الـ 128 لاعباً

const SPECIAL_COUNT_TRIGGER = 128;

const TARGET_SURVIVORS = 50; 

// تخزين الألعاب النشطة

const activeGames = new Map();

let isListenerAttached = false;

// -------------------------

// دوال مساعدة ذكية (Smart Utils)

// -------------------------

const getIdType = (id) => {

    if (!id) return "Unknown";

    if (id.includes("@lid")) return "LID (Hash)";

    if (id.includes("@s.whatsapp.net")) return "JID (Phone)";

    return "Unknown";

};

const normalizeJID = (jid) => {

    if (!jid) return "";

    let clean = jid.split(':')[0];

    if (clean.includes('@lid')) return clean;

    return clean.includes('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;

};

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// دالة التتبع والطباعة في الكونسول

function logBombAction(chatId, senderRaw, isHolder, targetRaw, status, reason = "") {

    console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    console.log(chalk.red.bold(`💣 BOMB GAME ACTION [${chatId.split('@')[0]}]`));

    console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    

    console.log(chalk.cyan(`📥 Sender:     `) + senderRaw);

    console.log(chalk.cyan(`🔍 ID Type:    `) + getIdType(senderRaw));

    

    if (isHolder) {

        console.log(chalk.green(`👤 Role:       `) + "🔥 BOMB HOLDER");

    } else {

        console.log(chalk.yellow(`👤 Role:       `) + "Passive Player / Spectator");

    }

    if (targetRaw) {

        console.log(chalk.blue(`🎯 Target:     `) + targetRaw);

    }

    if (status === "PASSED") {

        console.log(chalk.bgGreen.black(` ✅ STATUS: BOMB PASSED `));

    } else if (status === "FAILED") {

        console.log(chalk.bgRed.white(` ❌ STATUS: REJECTED `) + ` (${reason})`);

    } else {

        console.log(chalk.gray(` ℹ️ STATUS: IGNORED `));

    }

    console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

}

// تحديث ملف JSON

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        // استخدام Normalization للمقارنة

        const targetNum = normalizeJID(playerId).split('@')[0];

        const index = data.findIndex(p => normalizeJID(p.id).split('@')[0] === targetNum);

        

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) { console.error("Error updating JSON:", e); }

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

// -------------------------

// المستمع الذكي (Smart Bomb Listener)

// -------------------------

function attachGameListener(sock) {

    if (isListenerAttached) return;

    

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const msg = messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;

        const game = activeGames.get(chatId);

        // 1. هل اللعبة موجودة والجولة مفتوحة؟

        if (!game || !game.isRoundOpen) return;

        // 2. تحديد المرسل (Normalize)

        const senderRaw = msg.key.participant || msg.key.remoteJid;

        const senderNorm = normalizeJID(senderRaw);

        // 3. التحقق: هل المرسل هو حامل القنبلة؟

        // المقارنة تتم مع JID الحامل ومع LID الحامل (إذا وجد)

        const holderId = normalizeJID(game.activeHolder.id);

        const holderLid = game.activeHolder.lid ? normalizeJID(game.activeHolder.lid) : null;

        const isHolder = (senderNorm === holderId) || (holderLid && senderNorm === holderLid);

        // إذا لم يكن الحامل، نكتفي بالتجاهل (أو التسجيل إذا أردت debug)

        if (!isHolder) return; 

        // 4. هل اللعبة في وضع يسمح بالتمرير؟ (تجميد مؤقت)

        if (!game.canPass) {

            logBombAction(chatId, senderRaw, true, null, "FAILED", "Game Frozen (Passing...)");

            return;

        }

        // 5. استخراج المنشنات (Target Detection)

        let potentialTargets = [];

        

        // أ) من مصفوفة mentionedJid

        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        potentialTargets.push(...mentions);

        // ب) من النص (Regex للأرقام إذا لم يكن هناك منشن صريح)

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        // إذا لم يكتب أي شيء، تجاهل

        if (!text) return;

        // إذا لم يذكر أحداً، تجاهل

        if (potentialTargets.length === 0) {

            logBombAction(chatId, senderRaw, true, "None", "IGNORED", "No Mention Found");

            return;

        }

        // 6. التحقق من الهدف (Validation Loop)

        let validTargetPlayer = null;

        let rejectReason = "";

        for (const targetRaw of potentialTargets) {

            const targetNorm = normalizeJID(targetRaw);

            // أ) منع التمرير للنفس

            if (targetNorm === senderNorm) {

                rejectReason = "Self Pass Attempt";

                continue;

            }

            // ب) البحث في قائمة اللاعبين (الأحياء)

            // نتأكد أن الهدف هو لاعب في اللعبة (PN أو LID) وهو حي

            const foundPlayer = game.players.find(p => {

                const pId = normalizeJID(p.id);

                const pLid = p.lid ? normalizeJID(p.lid) : null;

                return p.isAlive && (pId === targetNorm || pLid === targetNorm);

            });

            if (foundPlayer) {

                validTargetPlayer = foundPlayer;

                break; // وجدنا هدفاً صالحاً

            } else {

                rejectReason = "Target Not Participant";

            }

        }

        // 7. اتخاذ القرار بناءً على النتيجة

        if (validTargetPlayer) {

            // ✅ نجاح النقل

            game.activeHolder = validTargetPlayer; // نقل القنبلة

            game.canPass = false; // تجميد مؤقت

            logBombAction(chatId, senderRaw, true, validTargetPlayer.id, "PASSED");

            // فك التجميد بعد نصف ثانية

            setTimeout(() => { 

                if(activeGames.has(chatId)) activeGames.get(chatId).canPass = true; 

            }, 500);

            // إعلان النقل

            try {

                await sock.sendMessage(chatId, { react: { text: "💣", key: msg.key } });

                await sock.sendMessage(chatId, {

                    text: `💣 *انتقلت القنبلة إلى @${validTargetPlayer.id.split('@')[0]}!*`,

                    mentions: [validTargetPlayer.id]

                });

            } catch (e) {}

        } else {

            // ❌ فشل النقل (تم عمل منشن لكن الشخص غير موجود أو ميت)

            logBombAction(chatId, senderRaw, true, potentialTargets[0], "FAILED", rejectReason);

            

            if (rejectReason === "Target Not Participant") {

                await sock.sendMessage(chatId, { 

                    text: '*ليس مشارك! حاول مجددا 🚫*',

                }, { quoted: msg });

            } else if (rejectReason === "Self Pass Attempt") {

                 await sock.sendMessage(chatId, { 

                    text: '*لا يمكنك تمرير القنبلة لنفسك! 🤪*',

                }, { quoted: msg });

            }

        }

    });

    isListenerAttached = true;

    console.log(chalk.magenta.bold("✅ Bomb Smart Listener Attached"));

}

// -------------------------

// حلقة اللعبة (Game Loop)

// -------------------------

async function startBombLoop(sock, game) {

    const groupJid = game.groupJid;

    const isSpecialMode = game.initialCount === SPECIAL_COUNT_TRIGGER;

    const stopAtCount = isSpecialMode ? TARGET_SURVIVORS : 1;

    if (game.round === 1) {

        let instructions = `*💣 تعليمات القنبلة (المستوى ${REQUIRED_LEVEL}):*\n`;

        instructions += `- سيتم فتح الشات لوقت عشوائي.\n`;

        instructions += `- تخلص من القنبلة بعمل *منشن* لشخص مشارك.\n`;

        if (isSpecialMode) instructions += `🔥 *وضع خاص:* تصفية حتى ${TARGET_SURVIVORS} ناجياً.\n`;

        else instructions += `- البقاء للأقوى (ناجٍ وحيد)!\n`;

        

        await sock.sendMessage(groupJid, { text: instructions });

        await delay(2000);

    }

    while (true) {

        // تحديث القائمة للأحياء فقط

        const alivePlayers = game.players.filter(p => p.isAlive);

        

        // شرط الفوز

        if (alivePlayers.length <= stopAtCount) {

            let winMsg = "";

            if (alivePlayers.length === 0) {

                winMsg = '🏳️ انتهت اللعبة — لا يوجد ناجين.';

            } else {

                for (const p of alivePlayers) {

                    updatePlayerStatus(p.id, { lvl: NEXT_LEVEL });

                }

                if (isSpecialMode) {

                    winMsg = `🎉 *انتهت التصفيات الكبرى!*\nتبقي ${alivePlayers.length} ناجياً.\n✅ تم ترقيتهم لـ *${NEXT_LEVEL}*.`;

                } else {

                    winMsg = `🏆 *انتهت اللعبة!*\nالفائز: @${alivePlayers[0].id.split('@')[0]}\n✅ تم ترقيته لـ *${NEXT_LEVEL}*.`;

                }

            }

            await sock.sendMessage(groupJid, { 

                text: winMsg, 

                mentions: alivePlayers.map(p => p.id) 

            });

            

            activeGames.delete(groupJid);

            return;

        }

        // اختيار حامل القنبلة عشوائياً لبدء الجولة

        const holder = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

        

        game.activeHolder = holder;

        game.canPass = false; 

        

        setTimeout(() => { if(activeGames.has(groupJid)) game.canPass = true; }, 1000);

        try {

            await sock.groupSettingUpdate(groupJid, 'not_announcement'); // فتح الشات

            await sock.sendMessage(groupJid, {

                text: `*🔄 الجولة ${game.round} (المتبقون: ${alivePlayers.length})*\n💣 القنبلة مع: @${holder.id.split('@')[0]}`,

                mentions: [holder.id]

            });

        } catch (e) { }

        const openSeconds = randInt(MIN_OPEN_SECONDS, MAX_OPEN_SECONDS);

        

        game.isRoundOpen = true; // تفعيل استقبال الرسائل في المستمع

        // الانتظار (مدة الجولة)

        await delay(openSeconds * 1000);

        // إغلاق الجولة

        game.isRoundOpen = false;

        try { await sock.groupSettingUpdate(groupJid, 'announcement'); // إغلاق الشات

        } catch (e) { }

        // تحديد الضحية (من هو ActiveHolder لحظة انتهاء الوقت)

        const victim = game.activeHolder;

        // التحقق الأمني

        if (!victim || !game.players.find(p => p.id === victim.id && p.isAlive)) {

            await sock.sendMessage(groupJid, { text: '⚠️ خطأ تقني: لم يتم العثور على الحامل. إعادة الجولة.' });

            game.activeHolder = null;

            continue;

        }

        // الانفجار

        await delay(500);

        await sock.sendMessage(groupJid, { 

            text: `*💣💥 BOOOOM!*\nانفجرت القنبلة في @${victim.id.split('@')[0]}`, 

            mentions: [victim.id] 

        });

        await delay(1000);

        // الإقصاء

        victim.isAlive = false; // في الذاكرة

        updatePlayerStatus(victim.id, { status: false }); // في الملف

        

        await sock.sendMessage(groupJid, { 

            text: `🚫 *تم إقصاء وطرد @${victim.id.split('@')[0]}!*`, 

            mentions: [victim.id] 

        });

        // الطرد الفعلي

        await kickMember(sock, groupJid, victim.id);

        game.activeHolder = null;

        game.round++;

        const aliveNow = game.players.filter(p => p.isAlive);

        if (aliveNow.length <= stopAtCount) continue; 

        await sock.sendMessage(groupJid, { text: `⏳ الاستعداد للجولة ${game.round}...` });

        await delay(2000);

    }

}

// -------------------------

// التنفيذ (Execute)

// -------------------------

async function execute({sock, msg, args, sender}) {

    // تفعيل المستمع مرة واحدة

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

    // تجهيز كائن اللعبة

    // نقوم بتجهيز اللاعبين ونتأكد من وجود ID (وربما LID إذا تم تخزينه سابقاً)

    const gamePlayers = eligiblePlayers.map(p => ({

        ...p, 

        isAlive: true

        // ملاحظة: p.id يجب أن يكون JID

    }));

    const newGame = {

        groupJid,

        round: 1,

        players: gamePlayers,

        initialCount: gamePlayers.length,

        activeHolder: null, 

        isRoundOpen: false, 

        canPass: true 

    };

    activeGames.set(groupJid, newGame);

    console.log(chalk.green(`🎮 Bomb Game Started in ${groupJid}`));

    let welcomeMsg = `*💣💥 لعبة القنبلة (المستوى ${REQUIRED_LEVEL})!*

✅ المشاركون: ${newGame.players.length}

`;

    if (newGame.initialCount === SPECIAL_COUNT_TRIGGER) {

        welcomeMsg += `🔥 *وضع التصفيات الكبرى!* (128 لاعب)\n🎯 الهدف: 50 ناجياً.`;

    } else {

        welcomeMsg += `🎯 الهدف: ناجٍ وحيد.`;

    }

    welcomeMsg += `\nℹ️ الخسارة = طرد وإقصاء.`;

    await sock.sendMessage(groupJid, { text: welcomeMsg }, { quoted: msg });

    // بدء الحلقة

    startBombLoop(sock, newGame);

}

export const NovaUltra = {

    command: ["قنبلة"], 

    description: 'لعبة القنبلة (Smart LID/JID Match - A0).',

    elite: "on", 

    group: true, 

    prv: false, 

    lock: "off" 

};

export default { NovaUltra, execute };

