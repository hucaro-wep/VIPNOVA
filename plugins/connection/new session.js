import { sessionCreator } from "../../functions/sessionCreatorFunction.js";

async function execute({ sock, msg, args }) {
  const jid = msg.key.remoteJid;

  const sessionName = args[0];
  const phoneNumber = args[1];

  if (!sessionName || !phoneNumber) {
    return sock.sendMessage(jid, {
      text: "❌ Usage: .new <session_name> <phone>"
    }, { quoted: msg });
  }

  // 📨 رسالة واحدة
  const sent = await sock.sendMessage(jid, {
    text:
`╭─〔 🚀 VIP SESSION 〕
│ Name   : ${sessionName}
│ Status : Initializing...
╰──────────────`
  }, { quoted: msg });

  const messageKey = sent.key;

  // ✏️ تعديل الرسالة
  const updateMessage = async (text) => {
    await sock.sendMessage(
      jid,
      { text },
      { edit: messageKey }
    );
  };

  await sessionCreator(
    sessionName,
    phoneNumber,
    sock,
    msg,
    updateMessage
  );
}

export const NovaUltra = {
  command: "new",
  description: "✨ Create VIP session (live)",
  elite: "on",
  group: true,
  prv: false,
  category: "sessions",
  lock: "off"
};

export default { NovaUltra, execute };