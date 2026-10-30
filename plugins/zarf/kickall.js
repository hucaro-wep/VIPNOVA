import { jidDecode } from "@whiskeysockets/baileys";
export let zarfConfig = {
  reaction: {
    status: `on`,
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
    text: `𝐀𝐧𝐚𝐬𝐭𝐚𝐬𝐭𝐢𝐚`
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
    status: `off`,
    file: `nova/sounds/AUDIO.mp3`
  },
  video: {
    status: `on`,
    file: `nova/data/zarf.mp4`
  }
};
export const NovaUltra = {
    command: "طرد",
    description: "طرد جميع الأعضاء (عدا النخبة) فوراً",
    elite: "on",      
    group: true,      
    prv: false,
    lock: "off"
};
export async function execute({ sock, msg }) {
    const jid = msg.key.remoteJid;
    const botJid = (jidDecode(sock.user.id)?.user || sock.user.id.split("@")[0]) + "@s.whatsapp.net";
    try {
        await sock.sendMessage(jid, { react: { text: zarfConfig.reaction.emoji, key: msg.key } });
        const metadata = await sock.groupMetadata(jid);
        const members = metadata.participants;
        const membersToRemove = [];
        for (const member of members) {
            if (member.id === botJid) continue;
            const isElite = await sock.isElite({ sock, id: member.id });
            if (!isElite) {
                membersToRemove.push(member.id);
            }
        }
        if (membersToRemove.length > 0) {
            await sock.groupParticipantsUpdate(jid, membersToRemove, "remove").catch(err => {
                console.error("Failed to remove participants:", err);
            });
        }
    } catch (err) {
        console.error("Error in kick command:", err);
        await sock.sendMessage(jid, { text: "❌ حدث خطأ أثناء محاولة الطرد." }, { quoted: msg });
    }
}
export default { NovaUltra, execute };
