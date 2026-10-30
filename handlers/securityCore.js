import fs from "fs-extra";
import path from "path";
import { jidDecode } from "@whiskeysockets/baileys";
import chalk from "chalk"; 
import config from "../nova/config.js"; // تأكد أن المسار صحيح (./config.js إذا كانوا في نفس المجلد)

const NOVA_DIR = path.join(process.cwd(), "nova");
const DATA_DIR = path.join(NOVA_DIR, "data");
const LOG_PATH = path.join(DATA_DIR, "security_log.json");

fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(LOG_PATH)) fs.writeJsonSync(LOG_PATH, []);

const spamMap = new Map();

// --- دوال المساعدة ---
const decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid);
        return (decode?.user && decode?.server && decode.user + '@' + decode.server) || jid;
    }
    return jid;
};

const isSafeLink = (text, whitelist) => {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const matches = text.match(urlRegex);
    if (!matches) return true; 
    return matches.every(link => {
        const domain = link.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
        return whitelist.some(wl => domain.includes(wl));
    });
};

// 🔥 دالة استخراج النص القوية (تحل مشكلة عدم قراءة الرسالة)
const getBody = (msg) => {
    if (!msg.message) return null;
    
    // فك تغليف الرسائل المؤقتة أو المشاهدة لمرة واحدة
    let m = msg.message;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    
    const type = Object.keys(m)[0];
    const content = m[type];

    // استخراج النص حسب النوع
    if (type === 'conversation') return content;
    if (type === 'extendedTextMessage') return content.text;
    if (type === 'imageMessage' || type === 'videoMessage') return content.caption;
    if (type === 'protocolMessage') return null; // تجاهل رسائل الحذف
    
    return content?.text || content?.caption || ""; // محاولة أخيرة
};

// --- الوظيفة الرئيسية ---
export const handleSecurity = async (sock, msg) => {
    const { 
        antilink = "off", 
        antispam = "off", 
        antivirus = "off",
        spamLimit = 5,
        maxChar = 4000,
        whitelist = ["whatsapp.com", "youtube.com", "google.com"]
    } = config.anti || {};

    // 1. التحقق العام
    if (antilink !== "on" && antispam !== "on" && antivirus !== "on") return false;
    if (!msg.message || msg.key.fromMe) return false;

    // 2. خاص فقط
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup) return false; 

    // 3. استخراج النص باستخدام الدالة الجديدة
    const body = getBody(msg);

    // إذا لم يكن هناك نص، أو النص فارغ
    if (!body || typeof body !== 'string') return false;

    // 🕵️‍♂️ Debug Log: لتعرف ماذا يقرأ البوت
    console.log(chalk.yellow(`[SECURITY] Length: ${body.length}`));

    // ====================================================
    // 🛡️ الاستثناءات (Smart Exceptions)
    // ====================================================

    // استثناء الأوامر
    const prefixes = [".", "#", "/", "!", "$"]; 
    const isCmd = prefixes.some(p => body.trim().startsWith(p));
    if (isCmd) {
        console.log(chalk.gray(`[SECURITY] Skipped (Command)`));
        return false; 
    }

    // استثناء الأكواد
    const codeKeywords = ["import ", "export ", "const ", "let ", "function", "return", "=>", "class ", "console.log"];
    const isCode = codeKeywords.some(word => body.includes(word));
    // نسمح بالكود إذا كان أقل من 20 ألف حرف، إذا أكثر يعتبر سبام
    if (isCode && body.length < 20000) {
        console.log(chalk.gray(`[SECURITY] Skipped (Code snippet)`));
        return false; 
    }

    // ====================================================

    const senderPn = decodeJid(chatId); 
    const botId = decodeJid(sock.user.id);
    let violationType = null;
    let violationReason = null;

    // 1. فحص الفيروسات
    if (antivirus === "on") {
        if (body.length > maxChar) {
            violationType = "Virus";
            violationReason = `رسالة فيروس/تعليق (${body.length} حرف)`;
            console.log(chalk.red(`[VIOLATION] Virus Detected: Length ${body.length}`));
        }
    }

    // 2. فحص الروابط
    if (antilink === "on" && !violationType) {
        if (!isSafeLink(body, whitelist)) {
            violationType = "Link";
            violationReason = `إرسال روابط ممنوعة`;
        }
    }

    // 3. فحص السبام
    if (antispam === "on" && !violationType) {
        const now = Date.now();
        const userData = spamMap.get(senderPn) || { count: 0, lastMsg: 0 };
        const spamWindow = 5000; 

        if (now - userData.lastMsg < spamWindow) {
            userData.count++;
        } else {
            userData.count = 1;
        }
        userData.lastMsg = now;
        spamMap.set(senderPn, userData);

        if (userData.count >= spamLimit) {
            violationType = "Spam";
            violationReason = `إزعاج البوت (Spam): ${userData.count} رسائل متتالية`;
            spamMap.delete(senderPn);
        }
    }

    // تنفيذ العقوبات
    if (violationType) {
        if (violationType === "Virus") {
            try {
                // حذف الرسالة
                await sock.sendMessage(chatId, { delete: msg.key });
                
                // حذف الشات (طريقة Baileys الحديثة)
                await sock.chatModify(
                    { delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] },
                    chatId
                );
            } catch (e) {
                console.error("Clear Chat Error:", e);
            }
        }

        try { await sock.updateBlockStatus(chatId, "block"); } catch (e) {}

        const hf = config.ui || ["", ""];
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        let reportBody = `❀⤾ *⌌ 🛡️ حماية الخاص (${violationType}) ⌏* 𔒩\n\n`;
        reportBody += `⌌👤⌏ ⤾ *◞المخالف◜* : @${senderPn.split('@')[0]}\n\n`;
        reportBody += `⌌📅⌏ ⤾ *◞التوقيت◜* : ${timeStr}\n\n`;
        reportBody += `❀⤾ *⌌ 📝 السبب ⌏* 👇\n`;
        reportBody += `\`\`\`${violationReason}\`\`\``;

        let actionText = "🚫 *الإجراء:* تم الحظر (Blocked)";
        if (violationType === "Virus") actionText += " + 🗑️ حذف الشات";

        const finalMessage = [hf[0], reportBody, actionText, hf[1]].filter(Boolean).join("\n\n");

        await sock.sendMessage(botId, { text: finalMessage, mentions: [senderPn] });
        
        // تسجيل
        try {
            const logData = await fs.readJson(LOG_PATH);
            logData.push({
                timestamp: Date.now(),
                type: violationType,
                chat: "Private Chat",
                sender: senderPn,
                details: violationReason,
                action: violationType === "Virus" ? "Blocked + Chat Cleared" : "Blocked"
            });
            if (logData.length > 100) logData.shift();
            await fs.writeJson(LOG_PATH, logData, { spaces: 2 });
        } catch (e) {}
        
        return true;
    }
    
    return false; 
};