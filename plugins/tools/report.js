import { jidDecode } from "@whiskeysockets/baileys";
const NovaUltra = {
  command: "تقرير",
  category: "أدوات",
  description: "تقرير JID للبوت والمرسل (يدعم الخاص والمجموعات).",
};
async function execute({sock, msg, args, BIDS,sender}) {
  const chatId = msg.key.remoteJid;
  await sock.sendMessage(
    chatId,
    {
      text: `📡 *تقرير الاتصال*
(تم التصحيح عبر الهاندلر)
🤖 *البوت:*
• LID (رقم): ${BIDS.lid}
• JID (مصحح): \`${BIDS.pn}\`
👤 *المرسل:*
• LID (رقم): ${sender.lid}
• JID (مصحح): \`${sender.pn}\`
📍 *الوضع:* ${msg.isGroup ? "مجموعة" : "خاص"}
`,
    },
    { quoted: msg }
  );
  return;
}
export default { NovaUltra, execute };
