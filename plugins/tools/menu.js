import fs from "fs";
import path from "path";
import { generateWAMessageFromContent, jidDecode } from "@whiskeysockets/baileys";
import { getPlugins } from "../../handlers/plugins.js";
import config from "../../nova/config.js";

// خريطة لتخزين الجلسات النشطة ومنع التداخل
const activeMenuSessions = new Map();

const NovaUltra = {
  command: "اوامر",
  description: "قائمة الأوامر التفاعلية — Ultra Nova",
  usage: ".اوامر",
  category: "main",
  nova: "on"
};

function decode(jid) {
  return (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
}

function getCommandStatusSuffix(plugin) {
  let suffix = "";
  const isElite = plugin.elite === "on";
  const isLocked = plugin.lock === "on";
  const adminKeywords = [
    "طرد", "حظر", "رفع", "خفض", "تغيير", "قفل", "فتح",
    "kick", "ban", "promote", "demote", "admin", "group", "tagall", "hidetag"
  ];
  const cmdArray = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
  const textToCheck = ((plugin.description || "") + " " + cmdArray.join(" ")).toLowerCase();
  const isAdminRelated =
    adminKeywords.some(k => textToCheck.includes(k)) ||
    plugin.admin === true ||
    plugin.group === true;

  if (isLocked) suffix += " 🔒";
  if (isElite) suffix += " 🎫";
  if (!isLocked && !isElite && isAdminRelated) suffix += " 🐊";
  return suffix;
}

async function sendNova(sock, chatId, text, msg, sender, thumbnail) {
  const nova = config.novaInfo || { name: "Nova", description: "Menu", verification: false };
  const hf = config.ui || ["", ""];
  
  const finalText = NovaUltra.nova === "on"
      ? [hf[0], text, hf[1]].filter(Boolean).join("\n\n")
      : text;

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

  await sock.relayMessage(chatId, message.message, {
    messageId: message.key.id
  });
}

async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  const sender = decode(msg.key.participant || chatId);
  
  // 1. تنظيف الجلسة القديمة لمنع التداخل (الفكرة الإضافية)
  if (activeMenuSessions.has(chatId)) {
      const oldSession = activeMenuSessions.get(chatId);
      sock.ev.off("messages.upsert", oldSession.listener);
      clearTimeout(oldSession.timer);
      activeMenuSessions.delete(chatId);
  }

  let thumbnail = null;
  try {
    const imgPath = path.join(process.cwd(), "nova", "image.jpeg");
    if (fs.existsSync(imgPath)) {
      thumbnail = fs.readFileSync(imgPath);
    }
  } catch {}

  const pluginsRoot = path.join(process.cwd(), "plugins");
  const categories = fs
    .readdirSync(pluginsRoot)
    .filter(d => fs.statSync(path.join(pluginsRoot, d)).isDirectory());

  // دالة توليد النص مع الإحصائيات المطلوبة
  const getMainMenuText = () => {
    // --- حساب الإحصائيات ---
    const allPlugins = getPlugins();
    let totalCmds = 0;
    let eliteCmds = 0;
    let lockedCmds = 0;
    let unsafeCmds = 0;

    const adminKeywords = [
      "طرد", "حظر", "رفع", "خفض", "تغيير", "قفل", "فتح", 
      "kick", "ban", "promote", "demote", "admin", "group", "tagall", "hidetag"
    ];

    for (const plugin of Object.values(allPlugins)) {
      if (!plugin || plugin.hidden) continue;
      
      totalCmds++;

      const isElite = plugin.elite === "on";
      const isLocked = plugin.lock === "on";

      if (isElite) eliteCmds++;
      if (isLocked) lockedCmds++;

      // منطق الأوامر غير الآمنة
      const cmdArray = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
      const textToCheck = ((plugin.description || "") + " " + cmdArray.join(" ")).toLowerCase();
      const isAdminRelated = adminKeywords.some(k => textToCheck.includes(k)) || plugin.admin === true || plugin.group === true;

      if (!isLocked && !isElite && isAdminRelated) {
          unsafeCmds++;
      }
    }

    // --- بناء النص ---
    let body = `᠀ الفئات الموجوده 𔒩`;
    for (const c of categories) {
      body += `\n ✧⤳🪐 *◜${c}◞*`;
    }

    // إضافة الإحصائيات كما طلبت
    body += `\n
*✅️ اجمالي عدد الاوامر الحالية:* ${totalCmds}
*🛡عدد اوامر النخبة :* ${eliteCmds}
*🔐 عدد الاوامر المقفلة :* ${lockedCmds}
*⚠️عدد اوامر الغير آمنة :* ${unsafeCmds}

✍️ *اكتب اسم الفئة لعرض أوامرها.*
⚠️ \`لم تجد أمر؟ افحص الكونسل أو اكتب .مشاكل\``;

    return body;
  };

  await sendNova(sock, chatId, getMainMenuText(), msg, sender, thumbnail);

  let state = "MAIN";
  let timer;

  const updateMessage = async (text) => {
    await sendNova(sock, chatId, text, msg, sender, thumbnail);
  };

  const listener = async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.remoteJid !== chatId) return;

    const from = decode(m.key.participant || m.key.remoteJid);
    if (from !== sender) return;

    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      "";

    if (!text) return;
    const input = text.trim();

    // زر الرجوع
    if (input === "رجوع" && state === "CATEGORY_VIEW") {
      await updateMessage(getMainMenuText());
      state = "MAIN";
      resetTimer();
      return;
    }

    // اختيار الفئة
    if (state === "MAIN") {
      const selected = categories.find(
        c => c.toLowerCase() === input.toLowerCase()
      );

      if (!selected) return;

      const plugins = getPlugins();
      const list = [];

      for (const p of Object.values(plugins)) {
        if (!p || p.hidden) continue;
        // التأكد من المسار الصحيح (ويندوز/لينكس)
        const pPath = p.filePath || "";
        // نستخدم includes للتأكد أن الملف داخل مجلد الفئة
        // تم توحيد السلاش لضمان العمل على كل الأنظمة
        const normalizedPath = pPath.replace(/\\/g, '/');
        if (!normalizedPath.includes(`/plugins/${selected}/`)) continue;

        const cmds = Array.isArray(p.command) ? p.command : [p.command];
        const suffix = getCommandStatusSuffix(p);
        
        list.push(
          `✧⤾ \`${cmds[0]}\`${suffix}` +
          (p.description ? `\n  ↵ ⌟ ${p.description} ⌜` : "")
        );
      }

      const body = `
📂⤾ *الفئة:* ${selected}

${list.length ? list.join("\n\n") : "❗ لا توجد أوامر."}

↩️ *اكتب "رجوع" للعودة.*
`;
      await updateMessage(body);
      state = "CATEGORY_VIEW";
      resetTimer();
    }
  };

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      // إزالة الجلسة عند انتهاء الوقت
      activeMenuSessions.delete(chatId);
      await updateMessage("🔒 انتهت الجلسة تلقائياً.\nاكتب `.اوامر` لإعادة الفتح.");
      sock.ev.off("messages.upsert", listener);
    }, 5 * 60 * 1000);
    
    // تحديث المؤقت في الخريطة
    if(activeMenuSessions.has(chatId)) {
        activeMenuSessions.get(chatId).timer = timer;
    }
  };

  // تسجيل الجلسة الجديدة
  activeMenuSessions.set(chatId, { listener, timer });
  sock.ev.on("messages.upsert", listener);
}

export default {
  NovaUltra,
  execute
};