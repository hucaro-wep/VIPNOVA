import { jidDecode } from "@whiskeysockets/baileys";
export default {
    command: ["خش", "join"],
    description: "دخول جروبات واتساب من روابط الدعوة",
    usage: ".خش + رابط الجروب أو الرد على رسالة",
    category: "group",
    elite: "on",
    group: false,
    prv: false,
    lock: "off",
    async execute({ sock, msg, args }) {
        const jid = msg.chat;
        try {
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                "";
            const quoted =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText =
                quoted?.conversation ||
                quoted?.extendedTextMessage?.text ||
                quoted?.imageMessage?.caption ||
                quoted?.videoMessage?.caption ||
                "";
            const content = quotedText || text;
            const links = content.match(
                /https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/gi
            ) || [];
            if (links.length === 0) {
                return sock.sendMessage(
                    jid,
                    { text: "❌ لم يتم العثور على روابط جروبات واتساب." },
                    { quoted: msg }
                );
            }
            let joined = 0;
            let failed = 0;
            for (const link of links) {
                try {
                    const code = link.split("chat.whatsapp.com/")[1];
                    await sock.groupAcceptInvite(code);
                    joined++;
                } catch {
                    failed++;
                }
            }
            return sock.sendMessage(
                jid,
                {
                    text:
                        `✅ تم الدخول إلى *${joined}* جروب\n` +
                        (failed ? `❌ فشل الدخول إلى *${failed}*` : "")
                },
                { quoted: msg }
            );
        } catch {
            return sock.sendMessage(
                jid,
                { text: "❌ حدث خطأ غير متوقع أثناء الدخول." },
                { quoted: msg }
            );
        }
    }
};
