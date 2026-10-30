import { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import pino from 'pino';
import crypto from 'crypto';
import os from 'os';

// === إعدادات التشفير ===
const SECRET_KEY = crypto.createHash('sha256').update('jnd_secure_session_v1').digest();

function encryptText(text) {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return iv.toString('base64') + ':' + encrypted;
    } catch (e) { return null; }
}

function getSystemFingerprint() {
    return crypto.createHash('md5').update(`${os.hostname()}_${process.cwd()}`).digest('hex');
}

// === إعدادات الأمر ===
const NovaUltra = {
    command: "نقل",
    description: "نقل البوت لرقم جديد (استبدال الجلسة)",
    category: "owner",
    elite: "on",
    lock: "on",
    group: false,
    prv: false,
};

async function execute({ sock, msg, args }) {
    const chatId = msg.key.remoteJid;
    const sender = msg.key.participant || chatId;
    // استخراج رقم البوت الحالي لتجنب الرد على نفسه
    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    await sock.sendMessage(chatId, { text: "🔄 *نقل البوت لرقم جديد*\n\n📱 *أدخل رقم الهاتف الجديد:*\n(مثال: 966500000000)" }, { quoted: msg });

    let step = 1;
    let transferData = { phone: "", password: "" };

    const listener = async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.remoteJid !== chatId) return;
        
        // --- التعديل الجوهري هنا ---
        // تجاهل أي رسالة صادرة من البوت نفسه (fromMe: true)
        if (m.key.fromMe) return;

        const incomingSender = m.key.participant || m.key.remoteJid;
        if (incomingSender !== sender) return;

        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (!text) return;

        // تجاهل الأوامر التي تبدأ بنقطة أو علامة أمر (اختياري لزيادة الأمان)
        if (text.startsWith('.') || text.startsWith('!')) return;

        if (text.toLowerCase() === "الغاء") {
            sock.ev.off("messages.upsert", listener);
            if (sock.activeListeners) sock.activeListeners.delete(chatId);
            return await sock.sendMessage(chatId, { text: "❌ تم إلغاء العملية." });
        }

        try {
            // الخطوة 1: الرقم
            if (step === 1) {
                const cleanPhone = text.replace(/[^0-9]/g, '');
                if (cleanPhone.length < 10) {
                    return await sock.sendMessage(chatId, { text: "❌ الرقم قصير جداً. حاول مرة أخرى." });
                }
                transferData.phone = cleanPhone;
                step = 2;
                await sock.sendMessage(chatId, { text: "🔑 *أدخل كلمة السر (ستكون هي كود الربط):*\n(8 خانات بالضبط - أحرف وأرقام)" });
                return;
            }

            // الخطوة 2: كلمة السر
            if (step === 2) {
                const pass = text.trim();
                const allowedRegex = /^[a-zA-Z0-9\u0600-\u06FF\u0400-\u04FF]+$/; 

                if (pass.length !== 8) {
                     return await sock.sendMessage(chatId, { text: "❌ خطأ: كلمة السر يجب أن تكون 8 خانات بالضبط." });
                }

                if (!allowedRegex.test(pass)) {
                    return await sock.sendMessage(chatId, { text: "❌ خطأ: الأحرف المدخلة غير مسموحة." });
                }

                transferData.password = pass.toUpperCase();
                
                // تنظيف المستمع قبل الانتقال للمرحلة التالية
                sock.ev.off("messages.upsert", listener);
                if (sock.activeListeners) sock.activeListeners.delete(chatId);
                
                await startTransferProcess(sock, chatId, transferData);
            }
        } catch (err) { console.error(err); }
    };

    sock.ev.on("messages.upsert", listener);
    if (sock.activeListeners) sock.activeListeners.set(chatId, () => sock.ev.off("messages.upsert", listener));
}

async function startTransferProcess(mainSock, chatId, data) {
    const baseDir = process.cwd();
    const mainSessionDir = path.join(baseDir, 'ملف_الاتصال');
    const tempSessionDir = path.join(baseDir, `temp_transfer_${Date.now()}`);

    await mainSock.sendMessage(chatId, { text: `⚙️ *جاري تحضير الجلسة للرقم (${data.phone})...*` });
    await fs.ensureDir(tempSessionDir);

    const connectTempSession = async (isRetry = false) => {
        const { state, saveCreds } = await useMultiFileAuthState(tempSessionDir);

        const tempSock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '110.0.0'],
            markOnlineOnConnect: true,
        });

        tempSock.ev.on('creds.update', saveCreds);

        if (!tempSock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const code = await tempSock.requestPairingCode(data.phone, data.password);
                    if (!isRetry) {
                        await mainSock.sendMessage(chatId, { text: `✅ *كود الربط:* ${code}` });
                        await mainSock.sendMessage(chatId, { 
                            text: `⏳ *سيتم تحديث الحالة تلقائياً بعد 15 ثانية...*\n⚠️ *ادخل الكود الآن!*` 
                        });
                    }
                } catch (err) {
                    if(!isRetry) await mainSock.sendMessage(chatId, { text: `❌ فشل طلب الكود: ${err.message}` });
                }
            }, 3000);

            setTimeout(async () => {
                if (!tempSock.authState.creds.registered) {
                    try { tempSock.end(undefined); } catch(e) {}
                    connectTempSession(true); 
                }
            }, 18000);
        }

        tempSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                await mainSock.sendMessage(chatId, { text: `✅ *تم الاتصال! جاري نقل الملفات...*` });

                const securityData = JSON.stringify({ 
                    password: data.password, 
                    fingerprint: getSystemFingerprint() 
                });
                const passwordFilePath = path.join(tempSessionDir, 'Password.txt');
                await fs.writeFile(passwordFilePath, encryptText(securityData));

                await delay(5000);

                try {
                    tempSock.end(undefined);
                    await fs.remove(mainSessionDir);
                    await fs.move(tempSessionDir, mainSessionDir);
                    await mainSock.sendMessage(chatId, { text: `🔄 *تم النقل بنجاح. يتم الآن إعادة تشغيل البوت على الرقم الجديد...*` });
                    process.exit(0); 
                } catch (e) {
                    await mainSock.sendMessage(chatId, { text: `❌ حدث خطأ أثناء نقل الملفات.` });
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    try { await fs.remove(tempSessionDir); } catch (e) {}
                }
            }
        });
    };

    connectTempSession(false);
}

export default { NovaUltra, execute };