import { jidDecode } from "@whiskeysockets/baileys";



const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

async function safeSendMessage(sock, jid, message, options = {}) {
  try { 
      await sock.sendMessage(jid, message, options); 
  } catch (err) { 
      if (err?.data === 429) await sock.sendMessage(jid, message, options); 
  }
}



async function execute({ sock, msg, sender }) {
  const jid = msg.key.remoteJid;
  const botJid = decode(sock.user.id);

  try {
    // جلب بيانات المجموعة
    const meta = await sock.groupMetadata(jid);
    const participants = meta.participants;

    // قائمة الأعضاء القابلين للطرد
    const kickable = [];

    // تصفية الأعضاء (استثناء: البوت، المشرفين، النخبة)
    for (const p of participants) {
      const pJid = decode(p.id);

      // 1. استثناء البوت
      if (pJid === botJid) continue;

      // 2. استثناء المشرفين
      if (p.admin) continue;

      // 3. استثناء النخبة (باستخدام دالة النظام)
      const isElite = await sock.isElite({ sock, id: pJid });
      if (isElite) continue;

      // إذا نجا من الشروط السابقة، فهو قابل للطرد
      kickable.push(pJid);
    }

    // التحقق من العدد
    if (kickable.length < 5) {
      return await safeSendMessage(sock, jid, { 
        text: '❗ لا يوجد عدد كافٍ من الأعضاء العاديين (أقل من 5) للطرد.' 
      }, { quoted: msg });
    }

    // خلط القائمة واختيار 5 ضحايا عشوائياً
    const shuffled = kickable.sort(() => 0.5 - Math.random());
    const victims = shuffled.slice(0, 5);

    // بدء الهجوم
    await safeSendMessage(sock, jid, { text: '𝑶𝑹𝑨!' });
    await sleep(500);

    // تنفيذ الطرد
    for (const victim of victims) {
      try {
        await sock.groupParticipantsUpdate(jid, [victim], "remove");
        await sleep(400); // تأخير بسيط لتجنب الحظر وتنسيق العرض
      } catch (err) {
        console.error(`❌ فشل طرد ${victim}:`, err.message);
      }
    }

    // رسالة النهاية
    await safeSendMessage(sock, jid, { text: '𝑶𝑹𝑨𝑨𝑨𝑨!!!!' });

  } catch (err) {
    console.error('❌ خطأ في أمر اورا:', err);
    await safeSendMessage(sock, jid, { text: `❌ حدث خطأ: ${err.message}` });
  }
}


export const NovaUltra = {
  command: "اورا",
  description: "يطرد 5 أعضاء عشوائيًا (باستثناء النخبة والمشرفين)",
  elite: "on", // تفعيل الحماية للنخبة فقط
  group: true,
  prv: false,
  lock: "off"
};

export default { NovaUltra, execute };