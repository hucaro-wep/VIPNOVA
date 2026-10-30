import fs from "fs-extra";
import path from "path";
import { downloadContentFromMessage, jidDecode, getContentType } from "@whiskeysockets/baileys";
import chalk from "chalk";
import config from "../nova/config.js";

// ---  إعدادات المسارات ---
const NOVA_DIR = path.join(process.cwd(), "nova");
const DATA_DIR = path.join(NOVA_DIR, "data");
const MEDIA_DIR = path.join(DATA_DIR, "antidelete_media");
const DB_PATH = path.join(DATA_DIR, "antidelete_db.json");
const CONFIG_FILE_PATH = path.join(NOVA_DIR, "config.js");

// تأكد من وجود المجلدات والملفات
fs.ensureDirSync(MEDIA_DIR);
if (!fs.existsSync(DB_PATH)) fs.writeJsonSync(DB_PATH, {});

// ---  الذاكرة لقاعدة البيانات ---
let messagesDB = {};
try {
    messagesDB = fs.readJsonSync(DB_PATH);
} catch (e) {
    messagesDB = {};
}

// دالة حفظ قاعدة البيانات
let saveTimeout = null;
const saveDB = async () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await fs.writeJson(DB_PATH, messagesDB, { spaces: 2 });
        } catch (err) {}
    }, 1000);
};

// ---  دوال المساعدة ---
const decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid);
        return (decode?.user && decode?.server && decode.user + '@' + decode.server) || jid;
    }
    return jid;
};

const isEnabled = () => config.anti?.antidelete === "on";

// --- الوظيفة 1: تخزين الرسالة ---
export const storeMessage = async (msg) => {
    if (!isEnabled() || !msg.message) return;
    if (msg.key.fromMe) return;

    const msgId = msg.key.id;
    
    let msgType = getContentType(msg.message);
    if (!msgType) return;
    
    let content = msg.message[msgType];

    if (msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
        if (content.message) {
            msgType = getContentType(content.message);
            content = content.message[msgType];
        }
    }

    if (!content) return;

    const isMedia = (
        msgType === 'imageMessage' ||
        msgType === 'videoMessage' ||
        msgType === 'stickerMessage' ||
        msgType === 'audioMessage' ||
        msgType === 'documentMessage'
    );

    let mediaFilename = null;
    let safeMimetype = "application/octet-stream";
    let safeFileName = "file";
    let safePtt = false;

    if (typeof content === 'object') {
        safeMimetype = content.mimetype || "application/octet-stream";
        safeFileName = content.fileName || "file";
        safePtt = content.ptt || false;
    }

    if (isMedia) {
        try {
            const stream = await downloadContentFromMessage(content, msgType.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            if (buffer.length === 0) throw new Error("Empty buffer");

            let ext = '.bin';
            if (msgType === 'imageMessage') ext = '.jpg';
            else if (msgType === 'videoMessage') ext = '.mp4';
            else if (msgType === 'audioMessage') ext = '.mp4';
            else if (msgType === 'stickerMessage') ext = '.webp';
            else if (msgType === 'documentMessage') ext = path.extname(safeFileName) || '.bin';

            mediaFilename = `${msgId}${ext}`;
            const mediaPath = path.join(MEDIA_DIR, mediaFilename);
            await fs.writeFile(mediaPath, buffer);

        } catch (e) {
            mediaFilename = null;
        }
    }

    let textBody = "";
    if (msgType === 'conversation') {
        textBody = typeof content === 'string' ? content : String(content);
    } else if (msgType === 'extendedTextMessage') {
        textBody = content.text || "";
    } else {
        textBody = content.caption || "";
    }

    messagesDB[msgId] = {
        key: msg.key, 
        pushName: msg.pushName || "Unknown",
        messageTimestamp: msg.messageTimestamp,
        type: msgType,
        text: textBody || "",
        media: mediaFilename,
        mimetype: safeMimetype, 
        ptt: safePtt,
        fileName: safeFileName
    };

    await saveDB();
};
    
   // --- الوظيفة 2: معالجة الحذف  ---
export const handleAntiDelete = async (sock, msg) => {
    if (!isEnabled()) return;

    const protocolMsg = msg.message?.protocolMessage;
    if (!protocolMsg || protocolMsg.type !== 0) return;

    const deletedKey = protocolMsg.key;
    const deletedId = deletedKey.id;

    const savedMsg = messagesDB[deletedId];
    if (!savedMsg) return;

    // تنظيف السجلات التالفة
    if (!savedMsg.key || !savedMsg.key.remoteJid) {
        delete messagesDB[deletedId];
        return;
    }

    try {
        const chatId = savedMsg.key.remoteJid; 
        const botJid = sock.user.id.split(':')[0] + "@s.whatsapp.net"; 
        const rawSender = savedMsg.key.participantAlt || savedMsg.key.participant || savedMsg.key.remoteJid;
        const senderPn = decodeJid(rawSender);
        
        const senderLid = (savedMsg.key.participant && savedMsg.key.participant.includes('lid')) 
            ? savedMsg.key.participant 
            : (savedMsg.key.participantAlt ? "LID Hidden" : "Not Available");

        const timeStr = new Date(savedMsg.messageTimestamp * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const chatSource = chatId.endsWith('@g.us') ? 'مجموعة' : 'خاص';

        const hf = config.ui || ["", ""];

        // 1. تجهيز المعلومات الأساسية (Body)
        let body = `❀⤾ *⌌ 🕵️‍♂️ كشف المحذوفات ⌏* 𔒩\n\n`;
        body += `⌌📍⌏ ⤾ *◞المصدر◜* : ${chatSource}\n\n`;
        body += `⌌💬⌏ ⤾ *◞الشات◜* : ${chatId}\n\n`;
        body += `⌌👤⌏ ⤾ *◞المرسل◜* : @${senderPn.split('@')[0]}\n\n`;
        body += `⌏🆔⌌ ⤳ *◜LID◞* : ${senderLid}\n\n`;
        body += `⌌📅⌏ ⤾ *◞التوقيت◜* : ${timeStr}\n\n`;
        body += `❀⤾ *⌌ 🗑️ المحتوى ⌏* 👇`;

        const mentions = [senderPn];

        // --- معالجة الرسائل النصية ---
        if (!savedMsg.media) {
            const safeText = savedMsg.text || "⚠️ محتوى فارغ";
            const deletedContent = `\`\`\`${safeText}\`\`\``;

            
            const finalMessage = [
                hf[0],          
                body,           
                deletedContent, 
                hf[1]           
            ].filter(Boolean).join("\n\n");

            await sock.sendMessage(botJid, { 
                text: finalMessage,
                mentions: mentions
            }); 
        } 
        // --- معالجة الوسائط ---
        else {
            const mediaPath = path.join(MEDIA_DIR, savedMsg.media);

           
            const textReport = [hf[0], body, hf[1]].filter(Boolean).join("\n\n");

            if (!fs.existsSync(mediaPath)) {
                return await sock.sendMessage(botJid, {
                    text: `${textReport}\n⚠️ *ملف الوسائط محذوف.*`,
                    mentions: mentions
                });
            }

            
            await sock.sendMessage(botJid, { text: textReport, mentions: mentions });

            const mediaBuffer = await fs.readFile(mediaPath);
            const captionText = savedMsg.text ? `⌌📝⌏ ⤾ *◜الوصف◞* : ${savedMsg.text}` : '';
            
            try {
                let mediaContent = {};
                if (savedMsg.type === 'imageMessage') mediaContent = { image: mediaBuffer, caption: captionText };
                else if (savedMsg.type === 'videoMessage') mediaContent = { video: mediaBuffer, caption: captionText };
                else if (savedMsg.type === 'stickerMessage') mediaContent = { sticker: mediaBuffer };
                else if (savedMsg.type === 'audioMessage') mediaContent = { audio: mediaBuffer, mimetype: 'audio/mp4', ptt: !!savedMsg.ptt };
                else mediaContent = { document: mediaBuffer, mimetype: savedMsg.mimetype || 'application/octet-stream', caption: captionText, fileName: savedMsg.fileName || 'file.bin' };
                
                await sock.sendMessage(botJid, mediaContent);
            } catch (e) {
                console.error("Send Error:", e.message);
            }
        }

    } catch (err) {
        console.error(chalk.red("❌ Error in Anti-Delete:"), err.message);
    }
};

           

export const setAntiDeleteStatus = (status) => {
    const newState = status ? "on" : "off";
    if (config.anti) config.anti.antidelete = newState;
    try {
        let fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
        const regex = /(antidelete\s*:\s*['"])(on|off)(['"])/g;
        if (regex.test(fileContent)) {
            fileContent = fileContent.replace(regex, `$1${newState}$3`);
            fs.writeFileSync(CONFIG_FILE_PATH, fileContent, 'utf8');
        }
    } catch (err) {}
    return status;
};

export const getAntiDeleteStatus = () => isEnabled();

setInterval(async () => {
    const NOW = Date.now();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    let deletedCount = 0;
    for (const msgId in messagesDB) {
        if (!messagesDB[msgId].messageTimestamp) continue;
        const msgTime = messagesDB[msgId].messageTimestamp * 1000;
        if (NOW - msgTime > TWELVE_HOURS) {
            if (messagesDB[msgId].media) {
                const mediaPath = path.join(MEDIA_DIR, messagesDB[msgId].media);
                if (fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
            }
            delete messagesDB[msgId];
            deletedCount++;
        }
    }
    if (deletedCount > 0) await saveDB();
}, 12 * 60 * 60 * 1000);