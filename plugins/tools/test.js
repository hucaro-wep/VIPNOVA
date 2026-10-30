import fs from "fs";
import path from "path";
import { generateWAMessageFromContent, jidDecode } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
  command: "تست",
  description: "اختبار رد بسيط",
  usage: ".test",
  category: "tools",
  elite: "on",
  lock: "off",
  group: false,
  prv: false,
  nova: "on"
};
function decode(jid) {
  return (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
}
async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  const sender = decode(msg.key.participant || chatId);
  const nova = config.novaInfo;
  const hf = config.ui || ["", ""]; 
  let thumbnail = null;
  try {
    const imgPath = path.join(process.cwd(), "nova", "image.jpeg");
    if (fs.existsSync(imgPath)) {
      thumbnail = fs.readFileSync(imgPath);
    }
  } catch {}
  const bodyText =
    " *`ぃ 𝜜𝜨𝜜𝑺𝜯𝜜𝑺𝜤𝜜 𝑽𝜤𝜬 𝐼𝑆 𝑊𝑂𝑅𝐾𝐼𝑁𝐺 𝑁𝑂𝑊𔒩`* ";
  let finalText = NovaUltra.nova === "on"
    ? [hf[0], bodyText, hf[1]].filter(Boolean).join("\n\n")
    : bodyText;
  let quotedMsg = msg;
  if (nova.verification === true) {
    quotedMsg = {
      key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "0@s.whatsapp.net"
      },
      message: {
        conversation: nova.ceiling || ""
      }
    };
  }
  const message = generateWAMessageFromContent(
    chatId,
    {
      extendedTextMessage: {
        text: finalText,
        contextInfo: {
          mentionedJid: [sender],
          quotedMessage: quotedMsg.message,
          externalAdReply: {
            title: nova.name,
            body: nova.description,
            mediaType: 1,
            renderLargerThumbnail: true,
            showAdAttribution: true,
            ...(thumbnail ? { thumbnail } : {})
          }
        }
      }
    },
    { quoted: quotedMsg }
  );
  await sock.relayMessage(
    chatId,
    message.message,
    { messageId: message.key.id }
  );
}
export default {
  NovaUltra,
  execute
};
