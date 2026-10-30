
import fs from "fs";
import { join } from "path";

const NovaUltra = {
    command: "bot",
    description: "تشغيل أو إيقاف البوت مؤقتًا",
    elite: "on", // مهم: للنخبة فقط
    group: false,
    prv: true,
    lock: "off",
};

async function execute({sock, msg, args,sender}) {
    const chatId = msg.key.remoteJid;
    
    // تحديد المسار: nova/data/bot.txt
    const dataDir = join(process.cwd(), "nova", "data");
    const botPath = join(dataDir, "bot.txt");

    // التأكد من وجود المجلد
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // إذا لم يكتب المستخدم on أو off، نعرض الحالة الحالية
    if (!args[0]) {
        let current = '[on]'; // الحالة الافتراضية
        try {
            if (fs.existsSync(botPath)) {
                current = fs.readFileSync(botPath, 'utf8').trim();
            }
        } catch (err) {
            console.error('فشل قراءة حالة البوت:', err.message);
        }

        // تنظيف النص ليعرض on أو off بدون الأقواس
        const displayStatus = current.replace('[', '').replace(']', '').toUpperCase();
        
        return await sock.sendMessage(chatId, {
            text: `🤖 *حالة البوت الحالية:* ${displayStatus}\n\nللتحكم استخدم:\n.bot on\n.bot off`
        }, { quoted: msg });
    }

    const action = args[0].toLowerCase();
    
    if (!['on', 'off'].includes(action)) {
        return await sock.sendMessage(chatId, {
            text: '❗ استخدم: .bot on أو .bot off'
        }, { quoted: msg });
    }

    try {
        // الحفظ بصيغة [on] أو [off]
        fs.writeFileSync(botPath, `[${action}]`, 'utf8');
        
        await sock.sendMessage(chatId, {
            text: action === 'on' 
                ? '✅ *تم تشغيل البوت.*' 
                : '⛔ *تم إيقاف البوت.*'
        }, { quoted: msg });

    } catch (err) {
        console.error("خطأ في تغيير حالة البوت:", err);
        await sock.sendMessage(chatId, {
            text: 'حدث خطأ أثناء تحديث حالة البوت.'
        }, { quoted: msg });
    }
}

export default { NovaUltra, execute };