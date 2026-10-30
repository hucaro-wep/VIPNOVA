
import fs from "fs";
import { join } from "path";

const NovaUltra = {
    command: "مود", // أو "mode" حسب رغبتك
    description: "تفعيل أو إيقاف وضع النخبة (Mode)",
    elite: "on", // مهم: للنخبة فقط
    group: true,
    prv:  false,
    lock: "off",
};

async function execute({sock, msg,args, BIDS,sender}) {
    const chatId = msg.key.remoteJid;


    // تحديد المسار: nova/data/mode.txt
    const dataDir = join(process.cwd(), "nova", "data");
    const modePath = join(dataDir, "mode.txt");

    console.log(modePath)
    // التأكد من وجود المجلد
    if (!fs.existsSync(dataDir)) {
    
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // إذا لم يكتب المستخدم on أو off
    if (!args[0]) {
        let currentMode = '[off]'; // الافتراضي off (يعمل للجميع)
        try {
            if (fs.existsSync(modePath)) {
                currentMode = fs.readFileSync(modePath, 'utf8').trim();
            }
        } catch (err) {
            console.error('فشل قراءة وضع النخبة:', err.message);
        }
        
        const displayMode = currentMode.includes('on') ? "\n🔒 خاص بالنخبة" : "\n🔓 عام للجميع";

        return await sock.sendMessage(chatId, {
            text: `🛡️ *وضع النخبة الحالي:* ${displayMode}\n\nللتحكم استخدم:\n.مود on (للنخبة فقط)\n.مود off (للجميع)`
        }, { quoted: msg });
    }

    const newMode = args[0].toLowerCase();
    if (!['on', 'off'].includes(newMode)) {
        return await sock.sendMessage(chatId, {
            text: '❗ الرجاء استخدام: .مود on أو .مود off'
        }, { quoted: msg });
    }

    try {
        fs.writeFileSync(modePath, `[${newMode}]`, 'utf8');
        
        const msgText = newMode === 'on' 
            ? '🔒 *تم تفعيل وضع النخبة.*\n (البوت سيرد على النخبة فقط)'
            : '🔓 *تم تعطيل وضع النخبة.*\n (البوت متاح للجميع)';

        await sock.sendMessage(chatId, {
            text: msgText
        }, { quoted: msg });

    } catch (error) {
        console.error('❌ خطأ في أمر مود:', error);
        await sock.sendMessage(chatId, {
            text: `❌ حدث خطأ أثناء تنفيذ الأمر.`
        }, { quoted: msg });
    }
}

export default { NovaUltra, execute };