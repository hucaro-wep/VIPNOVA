import fs from "fs";
import path from "path";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";

const NovaUltra = {
command: "تنظيف",
  description: "حذف الملفات المتكررة في مجلد الجلسة دون فقدان الاتصال",
  usage: ".تنظيف",
  category: "system",
  elite: "off",
  lock: "off",
  group: false,
  prv: false
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const UI = (body = "") => `
─˚‧₊⊹ 𝑢𝑙𝑡𝑟𝑎 𝑛𝜊𝜈𝑎 𝛎𝜄𝜌 ᠀⊹˚‧₊──

${body.replace(/\n/g, "\n⤾  ")}

> © 𝐃𝐉𝐍
`.trim();

async function execute({ sock, msg }) {

  const _origSend = sock.sendMessage;
  sock.sendMessage = async (jid, content, options = {}) => {
    if (NovaUltra.nova === "on") {
      const body = content.text || content.caption;
      if (typeof body === "string") {
        const m = generateWAMessageFromContent(
          jid,
          { extendedTextMessage: { text: body } },
          { userJid: sock.user?.id, quoted: options.quoted || msg }
        );
        return sock.relayMessage(jid, m.message, { messageId: m.key.id });
      }
    }
    return _origSend.call(sock, jid, content, options);
  };

  const chatId = msg.key.remoteJid;
  let botMsgKey = null;

  const updateMessage = text =>
    sock.sendMessage(chatId, { text: UI(text), edit: botMsgKey });

  const sent = await sock.sendMessage(
    chatId,
    { text: UI("⌛ جاري الفحص...") },
    { quoted: msg }
  );
  botMsgKey = sent.key;

  try {
    const sessionFolder = path.join(process.cwd(), "ملف_الاتصال");
    const maxFiles = 50;

    if (!fs.existsSync(sessionFolder)) {
      return updateMessage("⚠️ مجلد الجلسة غير موجود");
    }

    const files = fs.readdirSync(sessionFolder)
      .map(name => ({
        name,
        time: fs.statSync(path.join(sessionFolder, name)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length <= maxFiles) {
      return updateMessage(`✅ لا حاجة للتنظيف\nعدد الملفات: ${files.length}`);
    }

    const toDelete = files.slice(maxFiles);

    await updateMessage(`*🧹 حذف ${toDelete.length} ملف...*`);
    await sleep(800);

    for (const f of toDelete) {
      fs.unlinkSync(path.join(sessionFolder, f.name));
    }

    await updateMessage(`✅ تم حذف ${toDelete.length} ملف`);

  } catch {
    await updateMessage("❌ حدث خطأ");
  }
}

export default { NovaUltra, execute };