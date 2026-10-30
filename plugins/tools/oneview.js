import { downloadMediaMessage, jidDecode } from "@whiskeysockets/baileys";
const NovaUltra = {
  command: "ع",
  description: "عرض الصور والفيديوهات والصوتيات من رسالة مقتبسة",
  usage: ".ع (قم بالرد على رسالة الوسائط)",
  category: "عام",
  elite: "off",
  lock: "off",
  group: true,
  prv: false,
  nova: "on"
};
function decode(jid) {
  return (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
}
async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  const sender = decode(msg.key.participant || chatId);
  try {
    if (!msg.message) throw new Error("❌ لا يمكن العثور على محتوى الرسالة");
    const messageType = Object.keys(msg.message)[0];
    const quotedMessage = msg.message[messageType]?.contextInfo?.quotedMessage || msg.message;
    let targetMessage = quotedMessage.viewOnceMessage?.message || quotedMessage;
    const mediaType = Object.keys(targetMessage)[0];
    if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(mediaType)) {
      throw new Error("❌ هذه الرسالة ليست صورة أو فيديو أو صوت");
    }
    const buffer = await downloadMediaMessage(
      { message: { [mediaType]: targetMessage[mediaType] } },
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );
    const bodyText = "تم تحميل الوسائط بنجاح ✅";
    let messageOptions = { quoted: msg, caption: bodyText };
    if (mediaType === 'imageMessage') messageOptions.image = buffer;
    if (mediaType === 'videoMessage') messageOptions.video = buffer;
    if (mediaType === 'audioMessage') {
      messageOptions.audio = buffer;
      messageOptions.mimetype = 'audio/mp4';
    }
    await sock.sendMessage(chatId, messageOptions);
  } catch (error) {
    console.error(error);
    await sock.sendMessage(chatId, { text: error.message || "❌ حدث خطأ أثناء معالجة الوسائط" }, { quoted: msg });
  }
}
export default {
  NovaUltra,
  execute
};
