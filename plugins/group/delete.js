import config from "../../nova/config.js";

/* ==========================================
   ⚙️ إعدادات الأمر
   ========================================== */
const NovaUltra = {
    command: "حذف",
    description: "حذف الرسالة المردود عليها ورسالة الأمر نفسها",
    usage: ".حذف (بالرد على رسالة)",
    category: "group",
    elite: "on",       // يفضل جعله للنخبة/المشرفين فقط
    lock: "off",
    group: true,       // يعمل في المجموعات
    prv: false,
    nova: "on"
};

/* ==========================================
   🚀 تنفيذ الأمر
   ========================================== */
async function execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;

    // 1. التحقق: هل هناك رسالة تم الرد عليها؟
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedId = contextInfo?.stanzaId; // معرف الرسالة المردود عليها
    const quotedParticipant = contextInfo?.participant; // مرسل الرسالة المردود عليها

    if (!quotedId) {
        return await sock.sendMessage(chatId, { text: "⚠️ *يجب الرد على الرسالة التي تريد حذفها.*" }, { quoted: msg });
    }

    try {
        // 2. تكوين مفتاح الرسالة المراد حذفها (التي تم الرد عليها)
        const keyToDelete = {
            remoteJid: chatId,
            id: quotedId,
            participant: quotedParticipant // ضروري جداً في المجموعات
        };

        // 3. حذف الرسالة المردود عليها
        await sock.sendMessage(chatId, { delete: keyToDelete });

        // 4. حذف رسالة الأمر نفسها (.حذف)
        await sock.sendMessage(chatId, { delete: msg.key });

    } catch (e) {
        console.error("Error deleting message:", e);
        // في حال فشل الحذف (غالباً لأن البوت ليس مشرفاً)
        await sock.sendMessage(chatId, { text: "❌ *فشل الحذف. تأكد أن البوت مشرف (Admin) في المجموعة.*" }, { quoted: msg });
    }
}

export default { NovaUltra, execute };