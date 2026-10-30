import { cancelSession } from "../../functions/sessionCreatorFunction.js";

async function execute({ sock, msg, args }) {
  const jid = msg.key.remoteJid;
  const sessionName = args[0];

  if (!sessionName) {
    return sock.sendMessage(jid, {
      text:
`╭─〔 ⛔ VIP CANCEL 〕
│
│ Usage :
│ .cancel <session_name>
│
╰──────────────`
    }, { quoted: msg });
  }

  const ok = cancelSession(sessionName);

  await sock.sendMessage(jid, {
    text: ok
      ? 
`╭─〔 ⛔ VIP SESSION 〕
│
│ Session : ${sessionName}
│ Status  : Cancelled
│ Result  : Stopped successfully
│
╰──────────────`
      :
`╭─〔 ❌ VIP SESSION 〕
│
│ Session : ${sessionName}
│ Status  : Not Found
│ Action  : No active session
│
╰──────────────`
  }, { quoted: msg });
}

export const NovaUltra = {
  command: "cancel",
  description: "⛔ Cancel pending VIP session",
  elite: "on",
  group: true,
  prv: false,
  category: "sessions",
  lock: "off"
};

export default { NovaUltra, execute };