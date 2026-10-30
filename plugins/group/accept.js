import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
const NovaUltra = {
    command: "قبول",
    description: "قبول جميع طلبات الانضمام المعلقة",
    usage: ".قبول",
    category: "group",
    elite: "on",
    lock: "off",
    group: true,
    prv: false,
    nova: "on"
};
async function execute({ sock, msg }) {
    const _origSend = sock.sendMessage;
    sock.sendMessage = async (jid, content, options = {}) => {
        if (NovaUltra.nova === "on") {
            const body = content.text || content.caption;
            if (typeof body === "string") {
                const m = generateWAMessageFromContent(
                    jid,
                    { extendedTextMessage: { text: body } },
                    { userJid: sock.user?.id, quoted: options.quoted || msg }
                );
                return sock.relayMessage(jid, m.message, { messageId: m.key.id });
            }
        }
        return _origSend.call(sock, jid, content, options);
    };
    const chatId = msg.key.remoteJid;
    const pending = await sock.groupRequestParticipantsList(chatId);
    if (!pending || pending.length === 0) {
        return sock.sendMessage(chatId, { text: "✅ لا يوجد طلبات معلقة للقبول." });
    }
    const jids = pending.map(u => u.jid);
    for (let i = 0; i < jids.length; i += 10) {
        const chunk = jids.slice(i, i + 10);
        await sock.groupRequestParticipantsUpdate(chatId, chunk, "approve");
        await new Promise(r => setTimeout(r, 1000));
    }
    await sock.sendMessage(chatId, {
        text: `✅ تم قبول جميع الطلبات (${pending.length}) بنجاح.`
    });
}
export default { NovaUltra, execute };
