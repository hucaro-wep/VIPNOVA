import fs from "fs-extra";
import path from "path";
import config from "../../nova/config.js";

// تخزين الجلسات النشطة لتجنب التداخل
const activeFakeSessions = new Map();

const NovaUltra = {
  command: "بلاغ",
  description: "إنشاء بلاغ وهمي وإرساله لخاص البوت مع نظام تحكم",
  category: "security",
  elite: "off", 
  lock: "off",
  group: false,
  prv: false,
  nova: "off"
};

async function execute({ sock, msg, sender, args }) {
  const chatId = msg.key.remoteJid;
  const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const hf = config.ui || ["", ""];

  // 1. التحقق من الرقم المدخل
  if (!args || args.length === 0) {
    return await sock.sendMessage(chatId, { text: "⚠️ يرجى كتابة الرقم.\nمثال: .بلاغ 2010xxxx" }, { quoted: msg });
  }

  const targetNumber = args.join("").replace(/[^0-9]/g, "");
  const targetJid = `${targetNumber}@s.whatsapp.net`;

  // 2. دالة توليد نص الواجهة (UI)
  const generateReportText = (status = "بلاغات") => {
    let text = `❀⤾ *⌏ 🛡️ كاشف البلاغات والحظر ⌌* 𔒩\n\n`;
    text += `⌌👤⌏ ⤾ *◞الفاعل◜* : @${targetNumber}\n\n`;
    text += `⌌📡⌏ ⤾ *◞الحالة◜* : ${status}\n\n`;
    text += `⌌📅⌏ ⤾ *◞التوقيت◜* : ${new Date().toLocaleTimeString('ar-EG')}\n\n`;
    text += `⚠️ إذا تم تكرار البلاغات سيتم الحظر تلقائياً.\n\n`;
    
    return [hf[0], text, hf[1]].filter(Boolean).join("\n\n");
  };

  try {
    // 3. إرسال الرسالة الأولية (إلى الخاص)
    const sentMsg = await sock.sendMessage(botId, { 
      text: generateReportText(), 
      mentions: [targetJid] 
    });
    
    const botMsgKey = sentMsg.key;
    await sock.sendMessage(chatId, { text: "🚀 تم إرسال البلاغ المشفر إلى خاص البوت بنجاح." }, { quoted: msg });

    // 4. المستمع (Listener) لتفاعلات الجلسة
    const listener = async ({ messages }) => {
      const newMsg = messages[0];
      if (!newMsg.message || newMsg.key.remoteJid !== botId) return;

      const input = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").trim();

      if (input === "انهاء" || input === "cancel") {
        cleanup();
        await sock.sendMessage(botId, { text: "🔒 تم إغلاق جلسة التقرير.", edit: botMsgKey });
        return;
      }

      if (input === "تحديث") {
          await sock.sendMessage(botId, { 
            text: generateReportText("تم الحظر بنجاح ✅"), 
            edit: botMsgKey, 
            mentions: [targetJid] 
          });
          await sock.sendMessage(botId, { react: { text: "🔄", key: newMsg.key } });
      }
    };

    // 5. وظيفة التنظيف (Cleanup)
    const cleanup = () => {
      if (activeFakeSessions.has(botId)) {
        clearTimeout(activeFakeSessions.get(botId).timer);
        sock.ev.off("messages.upsert", activeFakeSessions.get(botId).listener);
        activeFakeSessions.delete(botId);
      }
    };

    const timer = setTimeout(() => {
      cleanup();
    }, 300000);

    if (activeFakeSessions.has(botId)) cleanup();

    sock.ev.on("messages.upsert", listener);
    activeFakeSessions.set(botId, { listener, timer });

  } catch (error) {
    console.error("Error in fake report plugin:", error);
  }
}

export default {
  NovaUltra,
  execute
};