import fs from "fs";
import path from "path";
import { downloadContentFromMessage, jidDecode } from "@whiskeysockets/baileys";
const NovaUltra = {
  command: "لصورة",
  description: "تحويل الملصق إلى صورة",
  usage: ".لصورة",
  category: "tools",
  group: true
};
const decode = jid =>
  (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
const TEMP_DIR = path.join(process.cwd(), "tmp");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  msg.reply = async text =>
    sock.sendMessage(chatId, { text }, { quoted: msg });
  try {
    const quoted =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted?.stickerMessage) {
      return msg.reply("❌ رد على ملصق لاستخدام الأمر.");
    }
    const stream = await downloadContentFromMessage(
      quoted.stickerMessage,
      "sticker"
    );
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    if (!buffer.length) {
      return msg.reply("❌ فشل تحميل الملصق.");
    }
    const outputPath = path.join(
      TEMP_DIR,
      `sticker_${Date.now()}.png`
    );
    fs.writeFileSync(outputPath, buffer);
    await sock.sendMessage(
      chatId,
      {
        image: fs.readFileSync(outputPath),
        caption: "🖼️ تم تحويل الملصق إلى صورة"
      },
      { quoted: msg }
    );
    fs.unlinkSync(outputPath);
  } catch (err) {
    console.error("STICKER TO IMAGE ERROR:", err);
    await msg.reply("❌ حدث خطأ أثناء تحويل الملصق.");
  }
}
export default {
  NovaUltra,
  execute
};
