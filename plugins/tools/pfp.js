import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
  command: "pfp",
  description: "عرض صورة ومعلومات حساب واتساب",
  usage: ".pfp [رقم | رد]",
  category: "tools"
};
function normalizeNumber(input = "") {
  return input.replace(/[^0-9]/g, "");
}
function formatBusinessHours(bh) {
  const cfg =
    bh?.business_config ||
    bh?.config ||
    bh?.businessHours ||
    [];
  if (!Array.isArray(cfg) || !cfg.length) return "غير متوفرة";
  const daysMap = {
    1: "السبت",
    2: "sunday",
    3: " monday",
    4: "الثلاثاء",
    5: "الأربعاء",
    6: "الخميس",
    7: "الجمعة"
  };
  let text = "";
  for (const day of cfg) {
    const dayName = daysMap[day.day_of_week] || "غير معروف";
    if (day.closed) {
      text += `• ${dayName}: ❌ مغلق\n`;
    } else {
      text += `• ${dayName}: ${day.opening_time} - ${day.closing_time}\n`;
    }
  }
  return text.trim();
}
async function sendUI(sock, chatId, text, msg) {
  const message = generateWAMessageFromContent(
    chatId,
    { extendedTextMessage: { text} },
    { quoted: msg }
  );
  await sock.relayMessage(chatId, message.message, {
    messageId: message.key.id
  });
}
function getPN({ msg, args, sender }) {
  const participant =
    msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (participant) {
    return participant.includes("@")
      ? participant
      : participant + "@s.whatsapp.net";
  }
  if (args[0]) {
    const num = normalizeNumber(args[0]);
    if (num.length > 5) {
      return num + "@s.whatsapp.net";
    }
  }
  if (sender?.pn) {
    return sender.pn;
  }
  return null;
}
async function execute({ sock, msg, args, sender }) {
  const chatId = msg.key.remoteJid;
  const pnJid = getPN({ msg, args, sender });
  if (!pnJid) {
    return sendUI(
      sock,
      chatId,
      "❌ استخدم الأمر:\n.pfp\nأو .pfp رقم\nأو بالرد على شخص",
      msg
    );
  }
  const number = pnJid.split("@")[0];
  let pfp = null;
  try {
    pfp = await sock.profilePictureUrl(pnJid, "image");
  } catch {}
  let about = "غير متوفر";
  try {
    const status = await sock.fetchStatus(pnJid);
    about = status?.status || about;
  } catch {}
  let business = null;
  try {
    business = await sock.getBusinessProfile(pnJid);
  } catch {}
  const cover =
    business?.coverPhoto?.url ||
    business?.profileOptions?.coverPhotoUrl ||
    null;
  let catalog = null;
  try {
    catalog = await sock.getCatalog(pnJid);
  } catch {}
  let info =
`╭─˚‧₊⊹ 𝑢𝑙𝑡𝑟𝑎 𝑛𝜊𝜈𝑎 𝛎𝜄𝜌 ᠀⊹˚‧₊──
❀⤾ *⌌ معلومات الحساب ⌏*
📞 *الرقم⤾*◞+${number}  ◜
📝 *الوصف⤾*◞ ${about} ◜
`;
  if (business) {
    info += `🏢 *نوع الحساب:* أعمال\n\n`;
    if (business.description)
      info += `🧾 *وصف النشاط⤾* ◞ ${business.description} ◜\n\n`;
    if (business.address)
      info += `📍 *العنوان⤾* ◞ ${business.address} ◜\n\n`;
    if (business.email)
      info += `📧 *البريد⤾* ◞ ${business.email} ◜\n\n`;
    if (business.website?.length)
      info += `🌐 *الموقع⤾* ◞ ${business.website.join(", ")} ◜\n\n`;
    if (business.category)
      info += `🏷️ *التصنيف⤾* ◞ ${business.category} ◜\n\n`;
    if (business.business_hours || business.businessHours) {
      info += `⏰ *⌝ساعات العمل 𔒩⌞*\n`;
      info += formatBusinessHours(
        business.business_hours || business.businessHours
      ) + "\n\n";
    }
    if (catalog?.products?.length) {
      info += `🛒 *⌝الكاتالوج⌞ ⤾* ${catalog.products.length} منتج\n\n`;
    }
  } else {
    info += `👤 *نوع الحساب:* شخصي\n\n`;
  }
  info += `╰──˚‧₊⊹ 𝜜𝜨𝜜𝑺𝜯𝜜𝑺𝜤𝜜🐊⊹˚‧₊──\n> © 𝐃𝐉𝐍`;
  if (cover) {
    await sock.sendMessage(
      chatId,
      { image: { url: cover }, caption: "*❀⤾ خلفيه الحساب*" },
      { quoted: msg }
    );
  }
  if (pfp) {
    await sock.sendMessage(
      chatId,
      { image: { url: pfp }, caption: info },
      { quoted: msg }
    );
  } else {
    await sendUI(sock, chatId, info, msg);
  }
}
export default {
  NovaUltra,
  execute
};
