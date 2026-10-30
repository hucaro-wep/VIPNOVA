import fs from "fs";
import path from "path";

const SESSIONS_DIR = "sessions";

async function execute({ sock, msg, args }) {
  const jid = msg.key.remoteJid;
  const name = args[0];

  if (!name) {
    return sock.sendMessage(jid, {
      text: "❌ Usage: .remove <session_name>"
    }, { quoted: msg });
  }

  const folder = path.join(SESSIONS_DIR, name);

  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });

    await sock.sendMessage(jid, {
      text:
`╭───────〔 🗑️ 𝗦𝗘𝗦𝗦𝗜𝗢𝗡 〕───────╮
│
│  ✅ 𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗥𝗘𝗠𝗢𝗩𝗘𝗗
│
│  📂 Session : ${name}
│  🧹 Status  : Deleted
│  ⚙️ Action  : Cleaned
│
╰────────────────────────────╯`
    }, { quoted: msg });

  } else {
    await sock.sendMessage(jid, {
      text:
`╭───────〔 ⚠️ 𝗦𝗘𝗦𝗦𝗜𝗢𝗡 〕───────╮
│
│  ❌ 𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗
│
│  📂 Session : ${name}
│  🔍 Status  : Missing
│
╰────────────────────────────╯`
    }, { quoted: msg });
  }
}

export const NovaUltra = {
  command: "remove",
  description: "حذف جلسة من جلسات البوتات الفرعية",
  elite: "on",
  group: true,
  prv: false,
  category: "sessions",
  lock: "off"
};

export default { NovaUltra, execute };