// المسار: handlers/handler.js

import { getPlugins, loadPlugins, getPluginIssues } from "./plugins.js";

import { storeMessage, handleAntiDelete } from "./antiDeleteCore.js";

import { handleSecurity } from "./securityCore.js"; 

import configImport from "../nova/config.js"; 

import { playError, playOK } from "../utils/sound.js";

import elitePro from "./elite-pro.js";

import waUtils from "./waUtils.js";

import fs from "fs";

import path from "path";

import chalk from "chalk";

import crypto from "crypto"; 

// --- متغيرات النظام ---

let plugins = null;

const messageBuffer = [];

let sockGlobal;

// مسارات الملفات

const passwordPath = path.join(process.cwd(), "ملف_الاتصال", "Password.txt"); 

const configPath = path.join(process.cwd(), "nova", "config.js");

// 🔥 إعدادات ملف التاريخ (History)

const dataDir = path.join(process.cwd(), "nova", "data");

const historyPath = path.join(dataDir, "History.txt");

// التأكد من وجود مجلد البيانات

if (!fs.existsSync(dataDir)) {

    fs.mkdirSync(dataDir, { recursive: true });

}

// --- دالة تسجيل التاريخ (خفيفة وسريعة) ---

function logToHistory(logData) {

    try {

        const timestamp = new Date().toLocaleString('en-US', { hour12: false });

        const entry = `\n[${timestamp}]\n${logData}\n`;

        // استخدام appendFileSync للمعالجة السريعة

        fs.appendFileSync(historyPath, entry, "utf8");

    } catch (e) {

        // تجاهل الأخطاء لعدم إيقاف البوت

    }

}

// --- إعدادات فك التشفير ---

const SECRET_KEY = crypto.createHash('sha256').update('jnd_secure_session_v1').digest();

function decryptTextSafe(text) {

    try {

        const index = text.indexOf(':');

        if (index === -1) return null;

        const ivBase64 = text.slice(0, index);

        const data = text.slice(index + 1);

        const iv = Buffer.from(ivBase64, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);

        let decrypted = decipher.update(data, 'base64', 'utf8');

        decrypted += decipher.final('utf8');

        return decrypted;

    } catch (err) {

        return null;

    }

}

function getSystemPassword() {

    if (!fs.existsSync(passwordPath)) return null;

    try {

        const encryptedContent = fs.readFileSync(passwordPath, "utf8");

        const decryptedJson = decryptTextSafe(encryptedContent);

        if (decryptedJson) {

            const data = JSON.parse(decryptedJson);

            return data.password; 

        }

    } catch (e) {

        return null;

    }

    return null;

}

// دالة توحيد الأرقام

const normalizeJid = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';

// --- وظائف استخراج الحالة الحية ---

function getLiveSystemConfig() {

    try {

        const content = fs.readFileSync(configPath, "utf8");

        const prefixMatch = content.match(/let\s+prefix\s*=\s*['"](.*?)['"];/);

        const currentPrefix = prefixMatch ? prefixMatch[1] : configImport.prefix;

        const botMatch = content.match(/bot:\s*['"](on|off)['"]/);

        const modeMatch = content.match(/mode:\s*['"](on|off)['"]/);

        return {

            prefix: currentPrefix,

            botState: botMatch ? botMatch[1] : "on",

            modeState: modeMatch ? modeMatch[1] : "off"

        };

    } catch (e) {

        return { prefix: configImport.prefix, botState: "on", modeState: "off" };

    }

}

async function safeSendMessage(sock, jid, msg, options = {}) {

    try {

        return await sock.sendMessage(jid, msg, options);

    } catch (err) {

        if (err?.data === 429) {

            await new Promise(r => setTimeout(r, 2000));

            return await sock.sendMessage(jid, msg, options);

        }

        throw err;

    }

}

// --- وظائف التهيئة والمعالجة ---

export async function initializePlugins() {

    try {

        plugins = await loadPlugins();

        console.log(chalk.green.bold("🔌 PLUGINS LOADED & READY."));

    } catch (err) {

        console.error("Error loading plugins:", err);

        logToHistory(`[SYSTEM ERROR] Plugin Loading Failed: ${err.message}`); 

    }

}

export async function handleMessages(sock, { messages }) {

    sockGlobal = { ...sock, ...elitePro, ...waUtils };

    if (!sockGlobal.ev && sock.ev) sockGlobal.ev = sock.ev;

    

    if (!sockGlobal.activeListeners) {

        sockGlobal.activeListeners = new Map();

    }

    messageBuffer.push(...messages);

}

setInterval(async () => {

    if (messageBuffer.length === 0) return;

    const messagesToProcess = [...messageBuffer];

    messageBuffer.length = 0;

    

    for (const msg of messagesToProcess) {

        try {

            if (sockGlobal) await handleSingleMessage(sockGlobal, msg);

        } catch (err) { }

    }

}, 100);

// --- المعالج الرئيسي ---

async function handleSingleMessage(sock, msg) {

    if (!msg.message || !msg.key) return;

   
    try {
        // 1. إذا كانت رسالة بروتوكول (حذف)، نعالجها فوراً
        if (msg.message.protocolMessage && msg.message.protocolMessage.type === 0) {
            await handleAntiDelete(sock, msg);
            return; 
        }

        // 2. إذا كانت رسالة عادية، نخزنها في الكاش للمستقبل
        await storeMessage(msg);
    } catch (err) {
        console.error("Anti-Delete Error:", err);
    }


    const chatId = msg.key.remoteJid;
 
      
    // 3. نظام الحماية الأمنية ي الخاص
   
    try {
      
        const handledBySecurity = await handleSecurity(sock, msg);
        
        if (handledBySecurity) return;

    } catch (err) {
        console.error("Security System Error:", err);
    }

 
    // 1. حاجز الأمان

    if (sock.activeListeners && sock.activeListeners.has(chatId)) {

        return; 

    }

    const isGroup = chatId.endsWith("@g.us");

    const messageText = msg.message?.conversation || 

                        msg.message?.extendedTextMessage?.text || 

                        msg.message?.imageMessage?.caption || 

                        msg.message?.videoMessage?.caption || "";

    const { prefix, botState, modeState } = getLiveSystemConfig();

    if (!messageText.startsWith(prefix)) return;

    const BIDS = {

        pn: sock.user.id.split(":")[0] + "@s.whatsapp.net",

        lid: sock.user.lid?.split(":")[0] + "@lid",

    };

    // استخراج الهوية

    const sender = {

        name: msg.pushName || "Unknown",

        pn: msg.key.participantAlt || 

            (msg.key.remoteJidAlt?.endsWith("s.whatsapp.net") && msg.key.fromMe ? BIDS.pn : msg.key.remoteJidAlt) || 

            (msg.key.fromMe ? BIDS.pn : (isGroup ? msg.key.participant : chatId)),

        lid: msg.key.participant || 

             (msg.key.remoteJid?.endsWith("lid") && msg.key.fromMe ? BIDS.lid : msg.key.remoteJid) || 

             null,

    };

    if (sender.pn) sender.pn = normalizeJid(sender.pn) + "@s.whatsapp.net";

    const args = messageText.slice(prefix.length).trim().split(/\s+/);

    const command = args.shift()?.toLowerCase();

    

    if (!command) return;

    let senderIsElite = false;

    try { senderIsElite = await sock.isElite({ sock, id: sender.pn }); } catch (e) {}

    const senderRole = msg.key.fromMe ? "BOT" : "USER";

    const eliteStatus = senderIsElite ? "YES" : "NO";

    const locationType = isGroup ? "GROUP" : "PRIVATE"; 

    // --- [تعديل هام] تحديد سبب التجاهل قبل التسجيل ---

    let ignoreReason = null;

    if (botState === "off" && command !== "اعدادات" && command !== "bot") {

        ignoreReason = "BOT : OFF = IGNORED";

    } 

    // 🔥 هنا تم التعديل: استثناء أمر "تسجيل" من وضع المود

    else if (modeState === "on" && !senderIsElite && !msg.key.fromMe && command !== "تسجيل") {

        ignoreReason = "MODE : ON = IGNORED";

    }

    // إعداد نص السجل (ديناميكي)

    let logDetails = `__________________

SENDER : ${senderRole}

CMD    : ${command}

JID    : ${sender.pn}

LID    : ${sender.lid}

LOC    : ${locationType}

ELITE  : ${eliteStatus}`;

    if (ignoreReason) {

        logDetails += `\n${ignoreReason}`;

    }

    

    logDetails += `\n__________________`;

    // 1. طباعة ملونة للكونسول

    console.log(chalk.cyan(`__________________`));

    console.log(chalk.green(`SENDER : ${senderRole}`));

    console.log(chalk.bold.white(`CMD    : ${command}`));

    console.log(chalk.yellow(`JID    : ${sender.pn}`));

    console.log(chalk.magenta(`LID    : ${sender.lid}`));

    console.log(chalk.blue(`LOC    : ${locationType}`));

    console.log(chalk.red(`ELITE  : ${eliteStatus}`));

    if (ignoreReason) {

        console.log(chalk.bgRed.white.bold(ignoreReason));

    }

    console.log(chalk.cyan(`__________________`));

    // 2. حفظ في الملف (مع سبب التجاهل إن وجد)

    logToHistory(logDetails);

    // 🔥 إذا كان هناك سبب للتجاهل، نوقف التنفيذ هنا

    if (ignoreReason) return;

    plugins = getPlugins();

    const handler = plugins[command];

    // تسجيل الأوامر غير المعروفة

    if (!handler && !["حدث", "مشاكل"].includes(command)) {

        console.log(chalk.hex('#FFA500')(`COMMAND UNKNOWN: ${command}`));

        logToHistory(`[WARNING] UNKNOWN COMMAND: ${command}\nSENDER: ${sender.pn}`);

        return;

    }

    if (command === "حدث") {

        if (!senderIsElite && !msg.key.fromMe) return;

        try {

            await loadPlugins();

            console.log(chalk.green(`SYSTEM: Reloaded`));

            return await safeSendMessage(sock, chatId, { react: { text: "✅", key: msg.key } });

        } catch (err) { 

            playError(); 

            logToHistory(`[ERROR] RELOAD FAILED: ${err.message}`); 

            return; 

        }

    }

    if (command === "مشاكل") {

        if (!senderIsElite && !msg.key.fromMe) return;

        const issues = getPluginIssues();

        const text = issues.length ? `⚠ مشاكل البلوجينات:\n\n${issues.join("\n")}` : "✨ لا توجد مشاكل برمجية.";

        return await safeSendMessage(sock, chatId, { text }, { quoted: msg });

    }

    if (!handler) return;

    msg.chat = chatId;

    msg.args = args;

    msg.sender = sender;

    if (handler.group === true && !isGroup) {

        return await safeSendMessage(sock, chatId, { text: "❗ هذا الأمر يعمل في المجموعات فقط." }, { quoted: msg });

    }

    if (handler.prv === true && isGroup) {

        return await safeSendMessage(sock, chatId, { text: "❗ هذا الأمر يعمل في الخاص فقط." }, { quoted: msg });

    }

    const executeWithPermissions = async () => {

        if (handler.elite === "on" && !senderIsElite && !msg.key.fromMe) {

            return await safeSendMessage(sock, chatId, { text: "📛 عذرًا! هذا الأمر للنخبة فقط." }, { quoted: msg });

        }

        try {

            await handler.execute({ sock, msg, args, BIDS, sender });

            playOK();

        } catch (err) {

            console.error(`❌ Error in ${command}:`, err);

            logToHistory(`[ERROR] EXECUTION FAILED: ${command}\nERROR MSG: ${err.message}\nSTACK: ${err.stack}`); 

            playError();

            await safeSendMessage(sock, chatId, { text: `❌ خطأ برمجي:\n${err.message}` }, { quoted: msg });

        }

    };

    if (handler.lock === "on" && !msg.key.fromMe) {

        const storedPassword = getSystemPassword();

        

        if (!storedPassword) {

            await executeWithPermissions();

            return;

        }

        const password = storedPassword.trim().toUpperCase();

        await safeSendMessage(sock, chatId, { react: { text: "🔐", key: msg.key } });

        console.log(chalk.cyan(`[LOCK] Password Required for ${command}`));

        logToHistory(`[LOCK] Password Required for ${command}`); 

        let attempts = 0;

        

        const cleanupLock = () => {

            clearTimeout(timeoutId);

            sock.ev.off("messages.upsert", lockListener);

            sock.activeListeners.delete(chatId);

        };

        sock.activeListeners.set(chatId, cleanupLock);

        const timeoutId = setTimeout(async () => {

            cleanupLock();

            console.log(chalk.red(`[LOCK] TIMEOUT`));

            logToHistory(`[LOCK] TIMEOUT for ${command}`);

            await safeSendMessage(sock, chatId, { react: { text: "🔒", key: msg.key } });

        }, 30000);

        const lockListener = async ({ messages }) => {

            const m = messages[0];

            if (!m.message) return;

            const input = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

            if (!input) return;

            const incomingIsGroup = m.key.remoteJid.endsWith("@g.us");

            const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

            // استخراج الهوية الذكي

            const rawSenderPn = m.key.participantAlt || 

                               (m.key.remoteJidAlt?.endsWith("s.whatsapp.net") && m.key.fromMe ? botJid : m.key.remoteJidAlt) || 

                               (m.key.fromMe ? botJid : (incomingIsGroup ? m.key.participant : m.key.remoteJid));

            if (!rawSenderPn) return;

            // توحيد الأرقام

            const incomingJidPure = normalizeJid(rawSenderPn);

            const originalSenderPure = normalizeJid(sender.pn);

            const originalChatPure = normalizeJid(chatId);

            const currentChatPure = normalizeJid(m.key.remoteJid);

            const listenerRole = m.key.fromMe ? "BOT" : "USER";

            const listenerLoc = incomingIsGroup ? "GROUP" : "PRIVATE";

            // 🔥 منطق التحقق الذكي (الإصلاح الجذري)

            // 1. هل المستخدم هو نفسه؟

            const isSameUser = incomingJidPure === originalSenderPure;

            // 2. هل المكان مقبول؟

            // مقبول في حالتين:

            // أ) نفس الشات الأصلي (نفس الجروب أو نفس الخاص)

            const isSameChat = currentChatPure === originalChatPure;

            // ب) خاص (لأن الخاص يعتبر آمناً وهو ملك للمستخدم دائماً)

            const isPrivate = !incomingIsGroup;

            const isPasswordCorrect = input.toUpperCase() === password;

            const passStatus = isPasswordCorrect ? "TRUE" : "FALSE";

            

            // نص السجل للمستمع

            const listenerLog = `[LOCK LISTENER]

SENDER : ${listenerRole}

INPUT  : ${input}

JID    : ${incomingJidPure}@s.whatsapp.net

LOC    : ${listenerLoc}

MATCH  : ${passStatus}`;

            // طباعة ملونة

            console.log(chalk.bgBlue.white(` [LOCK LISTENER] `));

            console.log(chalk.cyan(`SENDER : ${listenerRole}`));

            console.log(chalk.white(`INPUT  : ${input}`));

            console.log(chalk.yellow(`JID    : ${incomingJidPure}@s.whatsapp.net`));

            console.log(chalk.blue(`LOC    : ${listenerLoc}`));

            

            // التحقق والرفض

            if (!isSameUser) {

                console.log(chalk.gray(`IGNORED: Wrong user`));

                // لا نسجل التجاهل في الهيستوري لتجنب الامتلاء (اختياري)

                return;

            }

            // 🔥 الشرط الذكي: اقبل إذا كان نفس الشات OR إذا كان خاص (من نفس المستخدم)

            if (!isSameChat && !isPrivate) {

                console.log(chalk.gray(`IGNORED: Wrong chat (Must be same group or private)`));

                return;

            }

            // إذا وصلنا هنا، فالشخص والمكان صحيحان -> نسجل المحاولة في الهيستوري

            logToHistory(listenerLog);

            console.log(chalk.bold(isPasswordCorrect ? chalk.green(`PASS MATCH : TRUE`) : chalk.red(`PASS MATCH : FALSE`)));

            console.log(chalk.cyan(`__________________`));

            if (isPasswordCorrect) {

                cleanupLock();

                await safeSendMessage(sock, m.key.remoteJid, { react: { text: "✅", key: m.key } });

                await safeSendMessage(sock, chatId, { react: { text: "🔓", key: msg.key } });

                await executeWithPermissions();

            } else {

                attempts++;

                logToHistory(`[AUTH FAILED] Wrong Password (${attempts}/3) by ${incomingJidPure}`); 

                

                playError();

                await safeSendMessage(sock, m.key.remoteJid, { react: { text: "❌", key: m.key } });

                if (attempts >= 3) {

                    cleanupLock();

                    await safeSendMessage(sock, chatId, { react: { text: "🔒", key: msg.key } });

                }

            }

        };

        sock.ev.on("messages.upsert", lockListener);

        

    } else {

        await executeWithPermissions();

    }

}

