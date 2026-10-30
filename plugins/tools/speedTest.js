import cp from "child_process";
import { promisify } from "util";
let exec = promisify(cp.exec).bind(cp);
export const NovaUltra = {
  command: "حالة",
  category: "tools",
  elite: "on",
  lock: "off",
  group: true,
  prv: false,
  nova: "on",
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hideIPs = text => {
  if (!text) return text;
  return text
    .replace(/\((\d{1,3}\.){3}\d{1,3}\)/g, "(IP مخفي)")
    .replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, "IP مخفي")
    .replace(/DeprecationWarning:[\s\S]*/g, "")
    .trim();
};
export default {
  NovaUltra,
  async execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;
    let botMsgKey;
    const updateMessage = async text => {
      if (!botMsgKey) return;
      await sock.sendMessage(chatId, { text, edit: botMsgKey });
    };
    const sent = await sock.sendMessage(
      chatId,
      { text: "⌛ جاري فحص حالة البوت..." },
      { quoted: msg }
    );
    botMsgKey = sent.key;
    try {
      const start = Date.now();
      const uptimeSeconds = process.uptime();
      const uptimeFormatted = new Date(uptimeSeconds * 1000)
        .toISOString()
        .substr(11, 8);
      const ping = Date.now() - start;
      await updateMessage("⌛ جاري اختبار سرعة الإنترنت...");
      await sleep(800);
      let o;
      try {
        o = await exec("python3 speed.py --share");
      } catch (e) {
        o = e;
      }
      let stdout = hideIPs(o?.stdout || "");
      let stderr = hideIPs(o?.stderr || "");
      let text = `
🟢 *حالة البوت:*
⏳ *السرعة Ping:* ${ping}ms
⏱️ *مدة التشغيل:* ${uptimeFormatted}
📊 *اختبار السرعة عبر :*
*• SPEEDTEST.NET*`;
      if (stdout) text += `\n\n${stdout}`;
      if (stderr) text += `\n\n⚠️ ملاحظات:\n${stderr}`;
      await updateMessage(text.trim());
    } catch {
      await updateMessage("❌ حدث خطأ أثناء فحص الحالة.");
    }
  },
};
