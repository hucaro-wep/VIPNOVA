import { jidDecode } from "@whiskeysockets/baileys";

import { getPlugins } from "../../handlers/plugins.js";

const NovaUltra = {

  command: "djn",

  description: "DJN groups controller",

  usage: ".djn",

  category: "system",

  elite: "off",

  lock: "off",

  group: false,

  prv: false,

  nova: "on"

};

const normalize = jid =>

  (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const UI = (body = "") => `

╭────────────────────

│⌁  ${body.replace(/\n/g, "\n│⌁  ")}

╰────────────────────

رجوع

© 𝒁𝑯𝑬𝑵𝒀𝑨

`.trim();

async function execute({ sock, msg }) {

  const chatId = msg.key.remoteJid;

  const owner = normalize(msg.key.participant || chatId);

  let botMsgKey = null;

  let step = "menu";

  let groupsMap = {};   // index => gid

  let groupsArray = []; // مصفوفة الجروبات

  let storedCommand = "";

  const updateMessage = text =>

    sock.sendMessage(chatId, { text: UI(text), edit: botMsgKey });

  const showMenu = async () => {

    step = "menu";

    await updateMessage("s / show\np / exec");

  };

  const sent = await sock.sendMessage(

    chatId,

    { text: UI("⌛ تحميل DJN...") },

    { quoted: msg }

  );

  botMsgKey = sent.key;

  await showMenu();

  const listener = async ({ messages }) => {

    const m = messages[0];

    if (!m?.message) return;

    const sender = normalize(m.key.participant || m.key.remoteJid);

    if (sender !== owner) return;

    const text =

      m.message.conversation ||

      m.message.extendedTextMessage?.text;

    if (!text) return;

    const input = text.trim();

    if (input === "رجوع") return showMenu();

    /* ===== عرض الجروبات ===== */

    if (input === "s") {

      const allGroups = await sock.groupFetchAllParticipating();

      const list = Object.values(allGroups);

      // ترتيب من الأكبر عدد أعضاء للأقل

      list.sort((a, b) => (b.participants?.length || 0) - (a.participants?.length || 0));

      groupsMap = {};

      groupsArray = list;

      let out = "";

      let i = 1;

      for (const g of list) {

        out += `${i}. ${g.subject} (${g.participants.length || 0} عضو)\n`;

        groupsMap[i] = g.id;

        i++;

      }

      return updateMessage(out || "لا يوجد جروبات");

    }

    /* ===== تحضير التنفيذ ===== */

    if (input === "p") {

      if (!groupsArray.length)

        return updateMessage("اعرض الجروبات أولاً باستخدام s");

      let out = "";

      for (let i = 0; i < groupsArray.length; i++) {

        const g = groupsArray[i];

        out += `${i + 1}. ${g.subject} (${g.participants.length || 0} عضو)\n`;

      }

      out += "\n• أرسل أمر فقط = كل الجروبات\n• أمر + رقم = جروب معين";

      step = "p_wait";

      return updateMessage(out);

    }

    /* ===== انتظار الأمر ===== */

    if (step === "p_wait") {

      const [cmd, num] = input.split(" ");

      const plugins = getPlugins();

      const plugin = plugins[cmd];

      if (!plugin) return updateMessage("الأمر غير موجود");

      storedCommand = cmd;

      if (num) {

        const gid = groupsMap[num];

        if (!gid) return updateMessage("رقم جروب غير صحيح");

        try {

          // تنفيذ الأمر في الجروب المختار فقط

          const fake = JSON.parse(JSON.stringify(m));

          fake.key.remoteJid = gid;

          fake.message.conversation = cmd;

          await plugin.execute({ sock, msg: fake, target: gid, command: cmd });

          const meta = await sock.groupMetadata(gid);

          await updateMessage(`✅ تم تنفيذ الأمر: ${meta.subject}`);

        } catch {

          await updateMessage(`⚠️ فشل تنفيذ الأمر في الجروب المحدد`);

        }

        return showMenu();

      } else {

        step = "confirm_all";

        return updateMessage("سيتم التنفيذ في كل الجروبات\nأرسل: تأكيد");

      }

    }

    /* ===== تنفيذ الكل ===== */

    if (step === "confirm_all" && input === "تأكيد") {

      const plugins = getPlugins();

      const plugin = plugins[storedCommand];

      if (!plugin) return updateMessage("الأمر غير موجود");

      for (let i = 0; i < groupsArray.length; i++) {

        const gMeta = await sock.groupMetadata(groupsArray[i].id).catch(() => null);

        if (!gMeta) {

          await updateMessage(`⚠️ تم تخطي: جروب غير موجود`);

          continue;

        }

        try {

          const fake = JSON.parse(JSON.stringify(msg));

          fake.key.remoteJid = gMeta.id;

          fake.message.conversation = storedCommand;

          await updateMessage(`⏳ تنفيذ الأمر في: ${gMeta.subject}`);

          await plugin.execute({ sock, msg: fake, target: gMeta.id, command: storedCommand });

          await sleep(1500);

          await updateMessage(`✅ تم تنفيذ الأمر: ${gMeta.subject}`);

        } catch {

          await updateMessage(`⚠️ تم تخطي: ${gMeta.subject}`);

        }

      }

      await updateMessage("🐊 اكتمل التنفيذ على كل الجروبات");

      return showMenu();

    }

  };

  sock.ev.on("messages.upsert", listener);

  setTimeout(() => sock.ev.off("messages.upsert", listener), 5 * 60 * 1000);

}

export default { NovaUltra, execute };