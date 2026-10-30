import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import {
  jidDecode,
  downloadContentFromMessage
} from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
  command: "جروب",
  description: "إدارة بيانات الجروب",
  usage: ".جروب",
  category: "group",
  group: true,
  admin: true
};
const decode = jid =>
  (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
function applyHF(text) {
  const hf = config.ui || ["", ""];
  return [hf[0], text, hf[1]].filter(Boolean).join("\n\n");
}
async function sendHF(sock, chatId, text, withImage = false, image = null) {
  const finalText = applyHF(text);
  if (withImage && image) {
    await sock.sendMessage(chatId, {
      image: { url: image },
      caption: finalText
    });
  } else {
    await sock.sendMessage(chatId, { text: finalText });
  }
}
let activeSessions = {}; 
async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  if (!chatId.endsWith("@g.us")) return;
  const sender = decode(msg.key.participant || chatId);
  const sessionId = `${chatId}_${sender}`;
  if (activeSessions[sessionId]) return;
  activeSessions[sessionId] = { state: "MAIN" };
  let timeout;
  const context = {
    jid: chatId,
    metadata: await sock.groupMetadata(chatId),
    picture: null,
    link: null
  };
  try { context.picture = await sock.profilePictureUrl(chatId, "image"); } catch {}
  try { context.link = await sock.groupInviteCode(chatId); } catch {}
  const mainMenu = () => `
❀⤾ *⌌ الجروب ⌏*
᠀ الاسم⤾◞ ${context.metadata.subject} ◜
᠀ الوصف⤾◞ ${context.metadata.desc || "لا يوجد"} ◜
᠀ الرابط 𔒩
https://chat.whatsapp.com/${context.link}
✧↵ *اسم*
✧↵ *وصف*
✧↵ *صورة*
✧↵ *اعدادات ᠀*
✧↵ *رابط ᠀*
`;
  const renderSettings = () => `
❀⤾ *⌌ الاعدادات ⌏*
🔐 *تعديل ⤾*◞ ${context.metadata.restrict ? "مقفل" : "مفتوح"} ◜
ارسل *بيانات* لتغيير الحالة
📢 *شات ⤾*◞ ${context.metadata.announce ? "مغلق" : "مفتوح"} ◜
ارسل *شات* لتغيير الحالة
👥 *إضافة ⤾*◞ ${context.metadata.memberAddMode ? "الكل" : "الادمن"} ◜
ارسل *إضافة* لتغيير الحالة
↩️ رجوع
`;
  const resetTimeout = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      sock.ev.off("messages.upsert", listener);
      delete activeSessions[sessionId];
      sendHF(sock, chatId, "🔒 انتهت الجلسة.\nاكتب .جروب للبدء مجددًا.");
    }, 5 * 60 * 1000);
  };
  const listener = async ({ messages }) => {
    const m = messages[0];
    if (!m?.message) return;
    if (m.key.remoteJid !== chatId) return;
    const participant = m.key.participant;
    if (!participant || decode(participant) !== sender) return;
    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      "";
    const input = text.trim();
    resetTimeout();
    const session = activeSessions[sessionId];
    let state = session.state;
    if (input === "رجوع") {
      session.state = "MAIN";
      return sendHF(sock, chatId, mainMenu(), true, context.picture);
    }
    if (state === "MAIN") {
      if (input === "اسم") {
        session.state = "SET_NAME";
        return sendHF(sock, chatId, "✏️ ارسل الاسم الجديد");
      }
      if (input === "وصف") {
        session.state = "SET_DESC";
        return sendHF(sock, chatId, "📝 ارسل الوصف الجديد");
      }
      if (input === "صورة") {
        session.state = "SET_PIC";
        return sendHF(sock, chatId, "🖼️ ارسل صورة أو رد على صورة واكتب *عدل*");
      }
      if (input === "اعدادات") {
        session.state = "SETTINGS";
        return sendHF(sock, chatId, renderSettings());
      }
      if (input === "رابط") {
        session.state = "LINK";
        return sendHF(
          sock,
          chatId,
          `🔗 الرابط الحالي:\nhttps://chat.whatsapp.com/${context.link}\n\nاكتب *تغيير*`
        );
      }
      return;
    }
    if (state === "SETTINGS") {
      if (input === "بيانات") {
        const v = !context.metadata.restrict;
        await sock.groupSettingUpdate(chatId, v ? "locked" : "unlocked");
        context.metadata.restrict = v;
      }
      if (input === "شات") {
        const v = !context.metadata.announce;
        await sock.groupSettingUpdate(chatId, v ? "announcement" : "not_announcement");
        context.metadata.announce = v;
      }
      if (input === "إضافة") {
        const v = !context.metadata.memberAddMode;
        await sock.groupMemberAddMode(chatId, v ? "all_member_add" : "admin_add");
        context.metadata.memberAddMode = v;
      }
      return sendHF(sock, chatId, renderSettings());
    }
    if (state === "LINK" && input === "تغيير") {
      await sock.groupRevokeInvite(chatId);
      context.link = await sock.groupInviteCode(chatId);
      session.state = "MAIN";
      return sendHF(
        sock,
        chatId,
        `✅ تم إنشاء رابط جديد:\nhttps://chat.whatsapp.com/${context.link}`
      );
    }
    if (state === "SET_NAME") {
      if (!input) return;
      await sock.groupUpdateSubject(chatId, input);
      context.metadata.subject = input;
      session.state = "MAIN";
      return sendHF(sock, chatId, `✅ تم تغيير الاسم إلى: ${input}`, true, context.picture);
    }
    if (state === "SET_DESC") {
      await sock.groupUpdateDescription(chatId, input);
      context.metadata.desc = input;
      session.state = "MAIN";
      return sendHF(sock, chatId, `✅ تم تحديث الوصف.`, true, context.picture);
    }
    if (state === "SET_PIC") {
      try {
        const buffer = m.message.imageMessage
          ? await (await downloadContentFromMessage(m.message.imageMessage, "image")).reduce(
              (acc, chunk) => Buffer.concat([acc, chunk]),
              Buffer.alloc(0)
            )
          : null;
        if (!buffer) return sendHF(sock, chatId, "❌ لم يتم التعرف على الصورة. حاول مجددًا.");
        await sock.updateProfilePicture(chatId, buffer);
        context.picture = await sock.profilePictureUrl(chatId, "image");
        session.state = "MAIN";
        return sendHF(sock, chatId, `✅ تم تحديث صورة الجروب.`, true, context.picture);
      } catch (err) {
        return sendHF(sock, chatId, `❌ حدث خطأ أثناء تغيير الصورة.`);
      }
    }
  };
  sock.ev.on("messages.upsert", listener);
  resetTimeout();
  await sendHF(sock, chatId, mainMenu(), true, context.picture);
}
export default {
  NovaUltra,
  execute
};
