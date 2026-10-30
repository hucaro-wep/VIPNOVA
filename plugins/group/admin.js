export const NovaUltra = {
  command: ["ادمن"],
  description: "ترقية المرسل أو عضو محدد إلى مشرف في المجموعة (حصري للنخبة).",
  usage: ".ادمن [منشن | رد | رقم]",
  elite: "on",
  group: true,
  prv: false,
  category: "admin",
};
export default {
  NovaUltra,
  async execute({ sock, msg, args, BIDS, sender }) {
    const isElite = await sock.isElite({ sock, id: sender.pn });
    const targetMembers = (await sock.replyedJid(msg)) ||
      (await sock.mentionnedJids(msg)) || [sender.pn];
    if (sender.pn === BIDS.pn || isElite) {
      await sock.groupParticipantsUpdate(
        msg.key.remoteJid,
        targetMembers,
        "promote"
      );
      let text = "ترقية أعضاء إلى مشرفين\n\n";
      let mentions = [];
      mentions.push(sender.pn);
      for (const member of targetMembers) {
        text += `• العضو: @${member.split("@")[0]}\n`;
        mentions.push(member);
      }
      text += `\n• بواسطة: @${sender.pn.split("@")[0]}`;
      return sock.sendMessage(msg.key.remoteJid, {
        text: text.trim(),
        mentions,
      });
    }
  },
};
