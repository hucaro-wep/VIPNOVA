import fs from "fs";
import { join } from "path";
import { jidDecode } from "@whiskeysockets/baileys";
const imagePath = join(process.cwd(), "nova", "image.jpeg");
const audioPath = join(process.cwd(), "nova", "sounds", "AUDIO.mp3");
const dataDir = join(process.cwd(), "nova", "data");
const videoPath = join(dataDir, "zarf.mp4"); 
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
export let zarfConfig = {
  reaction: {
    status: `off`,
    emoji: `🪽`
  },
  group: {
    status: `on`,
    descStatus: `on`,
    newSubject: `مــزروف #هيكارو`,
    newDescription: `DJN owns your area..\n\nمابقول لك مين دجن، قرب وبتعرفه كويس..\n\nتبي تعرف كيف انزرفت..؟\nاجابتك بتنزل هنا قريب :\n\n𖠇 𝐃𝐉𝐍 - 𝐀𝐍𝐀𝐒𝐓𝐀𝐒𝐈𝐀\n↬ t.me/anastasiadjn\n\n---\n\nكل شي يخص دجن تلقوه هنا :\n\n𖠇 قناة 𝐃𝐉𝐍\n↬ https://whatsapp.com/channel/0029Vb3iTR59WtC2r1e3mL2Q\n\n\n𖠇 𝑫𝑱𝑵'𝑺 𝑺𝑯𝑶𝑾\n↬ chat.whatsapp.com/CEsy1h0Ng0pCEHyxJd1QGu\n\n𖠇 𝐃𝐉𝐍 - 𝐂𝐇𝐀𝐓\n↬ chat.whatsapp.com/BgqfjEjsmaMDiDyDNlzFl0\n\n𖠇 𝗗𝗝𝗡 𝗖𝗢𝗥𝗘\n↬ https://chat.whatsapp.com/Ji90ht63ELJIdpDVeSI7DG\n\n𖠇 𝐷𝐽𝑁 𝐶𝐴𝐺𝐸\n↬ https://chat.whatsapp.com/CzKEuwFWclWGiYosfvSjNm\n\n______`
  },
  mention: {
    status: `on`,
    text: `𝐀𝐧𝐚𝐬𝐭𝐚𝐬𝐢𝐚`
  },
  finalMessage: {
    status: `on`,
    text: `DJN owns your area..\n\nمابقول لك مين دجن، قرب وبتعرفه كويس..\n\nتبي تعرف كيف انزرفت..؟\nاجابتك بتنزل هنا قريب :\n\n𖠇 𝐃𝐉𝐍 - 𝐀𝐍𝐀𝐒𝐓𝐀𝐒𝐈𝐀\n↬ t.me/anastasiadjn\n\n𖠇 قناة 𝐃𝐉𝐍\n↬ https://whatsapp.com/channel/0029Vb3iTR59WtC2r1e3mL2Q`
  },
  media: {
    status: `on`,
    image: `image.jpeg`
  },
  audio: {
    status: `on`,
    file: `nova/sounds/AUDIO.mp3`
  },
  video: {
    status: `on`,
    file: `nova/data/zarf.mp4`
  },
  kick: {
    status: `off`
  }
};
async function safeSendMessage(sock, jid, message, options = {}) {
  try { 
      await sock.sendMessage(jid, message, options); 
  } catch (err) { 
      if (err?.data === 429) await sock.sendMessage(jid, message, options); 
  }
}
async function execute({ sock, msg, sender }) {
  const jid = msg.key.remoteJid;
  const botJid = (jidDecode(sock.user.id)?.user || sock.user.id.split("@")[0]) + "@s.whatsapp.net";
  try {
    if (zarfConfig.reaction.status === "on") {
      await safeSendMessage(sock, jid, { react: { text: zarfConfig.reaction.emoji, key: msg.key } });
    }
    const meta = await sock.groupMetadata(jid);
    const members = meta.participants;
    let demoteList = [], promoteList = [];
    for (const m of members) {
      const isElite = await sock.isElite({ sock, id: m.id });
      if (m.admin && m.id !== botJid && !isElite) demoteList.push(m.id);
      if (!m.admin && isElite) promoteList.push(m.id);
    }
    if (demoteList.length) await sock.groupParticipantsUpdate(jid, demoteList, "demote").catch(() => {});
    if (promoteList.length) await sock.groupParticipantsUpdate(jid, promoteList, "promote").catch(() => {});
    if (!meta.announce) await sock.groupSettingUpdate(jid, "announcement").catch(() => {});
    if (zarfConfig.group.status === "on" && zarfConfig.group.newSubject) {
      await sock.groupUpdateSubject(jid, zarfConfig.group.newSubject).catch(() => {});
    }
    if (zarfConfig.group.descStatus === "on" && zarfConfig.group.newDescription) {
      await sock.groupUpdateDescription(jid, zarfConfig.group.newDescription).catch(() => {});
    }
    if (zarfConfig.media.status === "on" && fs.existsSync(imagePath)) {
      await sock.updateProfilePicture(jid, fs.readFileSync(imagePath)).catch(() => {});
    }
    if (zarfConfig.mention.status === "on") {
      await safeSendMessage(sock, jid, { text: zarfConfig.mention.text, mentions: members.map(p => p.id) });
    }
    if (zarfConfig.finalMessage.status === "on") {
      await safeSendMessage(sock, jid, { text: zarfConfig.finalMessage.text });
    }
    if (zarfConfig.audio.status === "on" && fs.existsSync(audioPath)) {
      await safeSendMessage(sock, jid, { audio: fs.readFileSync(audioPath), mimetype: "audio/mpeg" });
    }
    if (zarfConfig.video.status === "on" && fs.existsSync(videoPath)) {
       await sock.sendMessage(jid, {
            video: { url: videoPath }, 
            mimetype: 'video/mp4',
            ptv: true 
       });
    }
    if (zarfConfig.kick.status === "on") {
        const toRemove = [];
        for (const p of members) {
             if (p.id === botJid) continue;
             const elite = await sock.isElite({ sock, id: p.id });
             if (!elite) {
                 toRemove.push(p.id);
             }
        }
        if (toRemove.length > 0) {
            await sock.groupParticipantsUpdate(jid, toRemove, "remove").catch(err => {
                console.error("خطأ أثناء الطرد الجماعي:", err);
            });
        }
    }
  } catch (err) { console.error(err); }
}
export const NovaUltra = {
  command: "زرف",
  description: "بيزرف القروب بسرعة فائقة وأمان",
  elite: "on", 
  group: true, 
  prv: false, 
  lock: "off"
};
export default { NovaUltra, execute };
