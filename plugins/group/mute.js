import { jidNormalizedUser } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";

/* ==========================================
   ⚙️ إعدادات الأمر
   ========================================== */
const NovaUltra = {
    command: "كتم",
    description: "نظام كتم الأعضاء وحذف رسائلهم تلقائياً",
    usage: ".كتم | .كتم الغاء | .كتم تحرير",
    category: "group",
    elite: "on",      // مسموح للنخبة فقط (أدمن/مطور)
    lock: "on",
    group: true,      // يعمل في المجموعات فقط
    prv: false,
    nova: "off"
};

/* ==========================================
   💾 تخزين البيانات (في الذاكرة المؤقتة)
   ========================================== */
// التنسيق: { "groupJid": ["userJid1", "userJid2"] }
let mutedData = {};
let isListenerActive = false; // لمنع تكرار تشغيل المراقب

/* ==========================================
   🛠️ أدوات ودوال مساعدة
   ========================================== */

// دالة لاستخراج JID الشخص المستهدف
const getTarget = (sock, msg, input) => {
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        return msg.message.extendedTextMessage.contextInfo.participant;
    }
    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        return msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    return null;
};

// التحقق هل الشخص مشرف أم لا
const isUserAdmin = async (sock, chatId, participant) => {
    try {
        const groupMetadata = await sock.groupMetadata(chatId);
        const admins = groupMetadata.participants
            .filter(p => p.admin !== null)
            .map(p => p.id);
        return admins.includes(participant);
    } catch {
        return false;
    }
};

// تفعيل مراقب الرسائل (يعمل مرة واحدة)
const startMessageMonitor = (sock) => {
    if (isListenerActive) return;
    isListenerActive = true;

    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const chatId = m.key.remoteJid;
            const sender = jidNormalizedUser(m.key.participant || m.key.remoteJid);

            // التحقق إذا كانت المجموعة في القائمة والشخص مكتوم
            if (mutedData[chatId] && mutedData[chatId].includes(sender)) {
                
                // 1. حذف الرسالة فوراً
                await sock.sendMessage(chatId, { delete: m.key });
                
                // (اختياري) تنبيه بسيط في الكونسول
                // console.log(`Deleted message from muted user: ${sender} in ${chatId}`);
            }
        } catch (e) {
            console.error("Error in Mute Monitor:", e);
        }
    });
};

/* ==========================================
   🚀 تنفيذ الأمر
   ========================================== */
async function execute({ sock, msg, args }) {
    const chatId = msg.key.remoteJid;
    const sender = jidNormalizedUser(msg.key.participant || msg.key.remoteJid);
    
    // تشغيل المراقب في الخلفية (لضمان عمل الحذف)
    startMessageMonitor(sock);

    // التأكد من أن الأمر في مجموعة (رغم إعداد group: true)
    if (!chatId.endsWith("@g.us")) return;

    // التأكد من تهيئة القائمة للمجموعة
    if (!mutedData[chatId]) mutedData[chatId] = [];

    const text = args.join(" ");
    const commandType = args[0] || ""; // الكلمة الأولى بعد .كتم

    /* 1️⃣ الحالة: كتم تحرير (إلغاء الكتم عن الجميع)
    */
    if (commandType === "تحرير") {
        mutedData[chatId] = [];
        return await sock.sendMessage(chatId, { text: "🔓 *تم تحرير جميع المكتومين في هذه المجموعة.*" }, { quoted: msg });
    }

    /* 2️⃣ الحالة: كتم الغاء (إلغاء كتم شخص محدد)
    */
    if (commandType === "الغاء") {
        const target = getTarget(sock, msg);
        if (!target) {
            return await sock.sendMessage(chatId, { text: "⚠️ *منشن الشخص أو رد على رسالته لإلغاء كتمه.*" }, { quoted: msg });
        }
        
        const targetId = jidNormalizedUser(target);
        
        if (mutedData[chatId].includes(targetId)) {
            mutedData[chatId] = mutedData[chatId].filter(id => id !== targetId);
            return await sock.sendMessage(chatId, { text: `✅ *تم إلغاء كتم العضو:* @${targetId.split('@')[0]}`, mentions: [targetId] }, { quoted: msg });
        } else {
            return await sock.sendMessage(chatId, { text: "⚠️ *هذا العضو ليس مكتوماً بالفعل.*" }, { quoted: msg });
        }
    }

    /* 3️⃣ الحالة: كتم (إضافة شخص للقائمة)
    */
    const target = getTarget(sock, msg);

    // إذا لم يكن هناك منشن أو رد -> عرض القائمة والشرح
    if (!target) {
        const list = mutedData[chatId];
        const count = list.length;
        
        let menuText = `🔇 *نظام التحكم في الكتم*\n\n`;
        menuText += `📌 *الأوامر:*\n`;
        menuText += `• *.كتم* (بالرد/المنشن): لكتم العضو.\n`;
        menuText += `• *.كتم الغاء* (بالرد/المنشن): لفك الكتم.\n`;
        menuText += `• *.كتم تحرير*: لفك الكتم عن الجميع.\n\n`;
        menuText += `📉 *عدد المكتومين حالياً:* ${count}\n`;
        
        if (count > 0) {
            menuText += `\n📋 *القائمة:*\n`;
            menuText += list.map((id, i) => `${i + 1}- @${id.split('@')[0]}`).join("\n");
        } else {
            menuText += `\n✅ لا يوجد أعضاء مكتومين.`;
        }

        return await sock.sendMessage(chatId, { text: menuText, mentions: list }, { quoted: msg });
    }

    // إذا تم تحديد شخص للكتم
    const targetId = jidNormalizedUser(target);

    // التحقق: هل الشخص مشرف؟ (النخبة لا يُكتمون)
    const isAdmin = await isUserAdmin(sock, chatId, targetId);
    if (isAdmin) {
        return await sock.sendMessage(chatId, { text: "🛡️ *لا يمكن كتم المشرفين (النخبة).* " }, { quoted: msg });
    }

    // التحقق: هل هو مكتوم مسبقاً؟
    if (mutedData[chatId].includes(targetId)) {
        return await sock.sendMessage(chatId, { text: "⚠️ *هذا العضو مكتوم بالفعل.*" }, { quoted: msg });
    }

    // التنفيذ: إضافة للقائمة
    mutedData[chatId].push(targetId);
    
    return await sock.sendMessage(chatId, { 
        text: `🚫 *تم كتم العضو بنجاح.*\n👤 العضو: @${targetId.split('@')[0]}\n🗑️ *سيتم حذف أي رسالة يرسلها فوراً.*`, 
        mentions: [targetId] 
    }, { quoted: msg });
}

export default { NovaUltra, execute };