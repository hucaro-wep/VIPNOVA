import fs from "fs-extra";
import path from "path";
import config from "../../nova/config.js";
import chalk from "chalk";


const CONFIG_PATH = path.join(process.cwd(), "nova", "config.js");
const activeControlSessions = new Map();


const NovaUltra = {
  command: "مضاد",
  description: "لوحة التحكم في أنظمة الحماية",
  category: "settings",
  elite: "on", 
  lock: "on",
  group: false,
  prv: false,
  nova: "off"
};

 
const updateConfigFile = async (key, newValue) => {
  try {
    let content = fs.readFileSync(CONFIG_PATH, "utf8");
    const regex = new RegExp(`(${key}\\s*:\\s*['"])(on|off)(['"])`, "g");

    if (regex.test(content)) {
      content = content.replace(regex, `$1${newValue}$3`);
      fs.writeFileSync(CONFIG_PATH, content, "utf8");
    
      if (config.anti) config.anti[key] = newValue;
      return true;
    }
    return false;
  } catch (e) {
    console.error("Config Update Error:", e);
    return false;
  }
};


async function execute({ sock, msg, sender, args }) {
  const chatId = msg.key.remoteJid;
  const hf = config.ui || ["", ""];


  const generateMenuText = () => {
    const anti = config.anti || {};
    const stateIcon = (state) => (state === "on" ? "🟢 ON" : "🔴 OFF");

    let text = `❀⤾ *⌏ ⚙️𝚨𝚴𝚻𝚰 𝐒𝐘𝐒𝚻𝚬𝚳 ⌌* 𔒩\n\n`;
    text += `🗑️ *محذوفات* : ${stateIcon(anti.antidelete)}\n\n`;
    text += `🔗 *روابط* : ${stateIcon(anti.antilink)}\n\n`;
    text += `🌪️ *سبام* : ${stateIcon(anti.antispam)}\n\n`;
    text += `🦠 *فيروسات* : ${stateIcon(anti.antivirus)}\n\n`;
    text += `📞 *مكالمات* : ${stateIcon(anti.anticall)}\n\n`;
    text += `✍️ *رد باسم المضاد لتبديل الحالة.*`;
    text += `\n❌ *اكتب "انهاء" للخروج.*`;

    return [hf[0], text, hf[1]].filter(Boolean).join("\n\n");
  };


  const sentMsg = await sock.sendMessage(chatId, { text: generateMenuText() }, { quoted: msg });
  const botMsgKey = sentMsg.key;

  //  المستمع (Listener)
  const listener = async ({ messages }) => {
    const newMsg = messages[0];
    if (!newMsg.message || newMsg.key.remoteJid !== chatId) return;

    const newSender = newMsg.key.participant || newMsg.key.remoteJid;

    if (newSender !== sender && newSender !== (msg.key.participant || msg.key.remoteJid)) return;

    const text = newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "";
    const input = text.trim();

    if (!input) return;

 
    if (input === "انهاء" || input === "cancel") {
      cleanup();
      await sock.sendMessage(chatId, { text: "🔒 تم إغلاق لوحة التحكم.", edit: botMsgKey });
      return;
    }

    let keyToToggle = null;
    let nameAr = "";

  
    if (input.includes("محذوفات")) { keyToToggle = "antidelete"; nameAr = "مضاد المحذوفات"; }
    else if (input.includes("روابط")) { keyToToggle = "antilink"; nameAr = "مضاد الروابط"; }
    else if (input.includes("سبام")) { keyToToggle = "antispam"; nameAr = "مضاد السبام"; }
    else if (input.includes("فيروسات")) { keyToToggle = "antivirus"; nameAr = "مضاد الفيروسات"; }
    else if (input.includes("مكالمات")) { keyToToggle = "anticall"; nameAr = "مضاد المكالمات"; }
    else {
      return; 
    }

    if (keyToToggle) {
      const currentState = config.anti[keyToToggle] || "off";
      const newState = currentState === "on" ? "off" : "on";

      const success = await updateConfigFile(keyToToggle, newState);

      if (success) {

        await sock.sendMessage(chatId, { react: { text: "✅", key: newMsg.key } });


        const icon = newState === "on" ? "🟢" : "🔴";
        const statusText = `✅ تم تغيير *${nameAr}* بنجاح.\n\nالحالة الجديدة: *${newState.toUpperCase()} ${icon}*\n\n⏳ جاري العودة للقائمة...`;

        await sock.sendMessage(chatId, {
          text: [hf[0], statusText, hf[1]].join("\n\n"),
          edit: botMsgKey
        });


        setTimeout(async () => {
          await sock.sendMessage(chatId, {
            text: generateMenuText(),
            edit: botMsgKey
          });
        }, 5000);

      } else {
        await sock.sendMessage(chatId, { react: { text: "❌", key: newMsg.key } });
      }
    }
  };

  const cleanup = () => {
    if (activeControlSessions.has(chatId)) {
      clearTimeout(activeControlSessions.get(chatId).timer);
      sock.ev.off("messages.upsert", activeControlSessions.get(chatId).listener);
      activeControlSessions.delete(chatId);
    }
  };

 
  const timer = setTimeout(() => {
    cleanup();
    sock.sendMessage(chatId, { text: "⏱️ انتهى وقت الجلسة.", edit: botMsgKey });
  }, 180000);


  if (activeControlSessions.has(chatId)) cleanup();

  sock.ev.on("messages.upsert", listener);
  activeControlSessions.set(chatId, { listener, timer });
}


export default {
  NovaUltra,
  execute
};