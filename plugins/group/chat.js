import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
const NovaUltra = {
    command: "شات",
    description: "إدارة إعدادات الجروب (فتح / قفل الشات)",
    usage: ".شات فتح | قفل",
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
    const text =
        msg.message?.extendedTextMessage?.text ||
        msg.message?.conversation ||
        "";
    let option = null;
    if (text.includes("فتح")) option = "فتح";
    else if (text.includes("قفل")) option = "قفل";
    if (!option) {
        return sock.sendMessage(chatId, {
            text: "❌ استخدم:\n.شات فتح\n.شات قفل"
        });
    }
    if (option === "فتح") {
        await sock.groupSettingUpdate(chatId, "not_announcement");
        return sock.sendMessage(chatId, { text: "✅ تم فتح الشات." });
    }
    if (option === "قفل") {
        await sock.groupSettingUpdate(chatId, "announcement");
        return sock.sendMessage(chatId, { text: "🔒 تم قفل الشات." });
    }
}
export default { NovaUltra, execute };
