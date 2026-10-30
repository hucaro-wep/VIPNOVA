import fs from "fs-extra";
import path from "path";

async function execute({ sock, msg }) {
  const jid = msg.key.remoteJid;
  const sessionsPath = path.join(process.cwd(), "sessions");

  // لو فولدر sessions مش موجود
  if (!fs.existsSync(sessionsPath)) {
    return sock.sendMessage(jid, {
      text:
`╭───────〔 📂 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦 〕───────╮
│
│  📭 𝗡𝗢 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦 𝗗𝗜𝗥𝗘𝗖𝗧𝗢𝗥𝗬
│
╰────────────────────────────╯`
    }, { quoted: msg });
  }

  // جلب أسماء الجلسات
  const sessions = fs.readdirSync(sessionsPath)
    .filter(name =>
      fs.statSync(path.join(sessionsPath, name)).isDirectory()
    );

  if (!sessions.length) {
    return sock.sendMessage(jid, {
      text:
`╭───────〔 📂 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦 〕───────╮
│
│  📭 𝗡𝗢 𝗦𝗔𝗩𝗘𝗗 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦
│
╰────────────────────────────╯`
    }, { quoted: msg });
  }

  const list = sessions
    .map((name, i) => `│  ${i + 1}. 📁 ${name}`)
    .join("\n");

  await sock.sendMessage(jid, {
    text:
`╭───────〔 📂 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦 〕───────╮
│
│  ✅ 𝗔𝗖𝗧𝗜𝗩𝗘 𝗦𝗘𝗦𝗦𝗜𝗢𝗡𝗦
│
${list}
│
│  🔢 Total : ${sessions.length}
│
╰────────────────────────────╯`
  }, { quoted: msg });
}

export const NovaUltra = {
  command: "sessions",
  description: "عرض الجلسات",
  elite: "on",
  group: true,
  prv: false,
  category: "sessions",
  lock: "off"
};

export default { NovaUltra, execute };