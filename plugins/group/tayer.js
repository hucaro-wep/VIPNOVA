export const NovaUltra = {
  command: ["طير"],
  description: "طرد عضو من المجموعة بالرد أو المنشن (حصري للنخبة).",
  usage: ".طير [منشن | رد]",
  elite: "on",
  group: true,
  prv: false,
  category: "admin",
};
export default {
  NovaUltra,
  async execute({ sock, msg, sender, BIDS }) {
    const chatId = msg.key.remoteJid;
    if (!chatId.endsWith("@g.us")) return;
    const isElite = await sock.isElite({ sock, id: sender.pn });
    const targetMembers =
      (await sock.replyedJid(msg)) ||
      (await sock.mentionnedJids(msg));
    if (!targetMembers || targetMembers.length === 0) return;
    if (sender.pn === BIDS.pn || isElite) {
      await sock.groupParticipantsUpdate(
        chatId,
        targetMembers,
        "remove"
      );
      for (const member of targetMembers) {
        await sock.sendMessage(chatId, {
          react: { text: "✅", key: msg.key },
        });
      }
    }
  },
};
