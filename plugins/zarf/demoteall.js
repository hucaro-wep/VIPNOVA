export const NovaUltra = {
  command: "سحب",
  description: "سحب الإشراف من الجميع وترقية النخبة فقط (حصري للنخبة).",
  usage: ".سحب",
  elite: "on",
  group: true,
  prv: false,
  category: "admin",
};

export default {
  NovaUltra,
  async execute({ sock, msg, BIDS, sender }) {
    const jid = msg.key.remoteJid;
    const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

    // 1. التحقق من صلاحية المنفذ (هل هو نخبة؟)
    const isExecutorElite = await sock.isElite({ sock, id: sender.pn });
    if (!isExecutorElite && sender.pn !== BIDS.pn) {
      return sock.sendMessage(jid, { text: "⚠️ عذراً، هذا الأمر مخصص للنخبة فقط." });
    }

    try {
      // 2. جلب بيانات المجموعة والمشاركين
      const meta = await sock.groupMetadata(jid);
      const members = meta.participants;
      
      let demoteList = [];
      let promoteList = [];
      let eliteMentions = [];

      // 3. تحليل القائمة بناءً على حالة النخبة و الـ LID/ID
      for (const m of members) {
        // نتحقق من قاعدة البيانات عبر الـ API الخاص بك
        const isElite = await sock.isElite({ sock, id: m.id });

        // إذا كان مشرفاً وليس من النخبة وليس البوت -> إضافة لقائمة السحب
        if (m.admin && m.id !== botJid && !isElite) {
          demoteList.push(m.id);
        }
        
        // إذا كان عضواً عادياً وهو من النخبة -> إضافة لقائمة الترقية
        if (!m.admin && isElite) {
          promoteList.push(m.id);
          eliteMentions.push(m.id);
        }
      }

      // 4. تنفيذ العمليات على السيرفر (Bulk Operations)
      if (demoteList.length > 0) {
        await sock.groupParticipantsUpdate(jid, demoteList, "demote");
      }

      if (promoteList.length > 0) {
        await sock.groupParticipantsUpdate(jid, promoteList, "promote");
      }

      // 5. إغلاق المجموعة (اختياري كما في كودك الأصلي) لضبط النظام
      if (!meta.announce) {
        await sock.groupSettingUpdate(jid, "announcement");
      }

      // 6. صياغة التقرير النهائي
      let report = `✅ *تمت عملية إعادة ضبط الرتب بنجاح*\n\n`;
      report += `📉 تم خفض: ${demoteList.length} عضو\n`;
      report += `📈 تم ترقية: ${promoteList.length} من النخبة\n`;
      report += `🔒 الحالة: المجموعة مغلقة للمشرفين فقط`;

      return sock.sendMessage(jid, { 
        text: report,
        mentions: [sender.pn, ...eliteMentions] 
      });

    } catch (error) {
      console.error("Error in Elite Sync:", error);
      return sock.sendMessage(jid, { text: "❌ حدث خطأ أثناء محاولة تحديث الرتب." });
    }
  },
};