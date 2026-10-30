const NovaUltra = {
    command: "jtl",
    category: "أدوات",
    description: "تحويل JID إلى LID داخل نفس المجموعة.",
};
async function execute({sock, msg, args, BIDS,sender}) {
    const chatId = msg.key.remoteJid;
    const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
    const parts = text.trim().split(/\s+/);
    if (!parts[1]) {
        return sock.sendMessage(
            chatId,
            {
                text: "❗ استخدم:\n`.jtl 20123456789` أو `.jtl 20123456789@s.whatsapp.net`",
            },
            { quoted: msg }
        );
    }
    let input = parts[1].trim();
    try {
        input = input.replace(/[^0-9]/g, "");
        if (!input) {
            return sock.sendMessage(
                chatId,
                { text: "❌ لم يتم التعرف على الرقم." },
                { quoted: msg }
            );
        }
        const jid = `${input}@s.whatsapp.net`;
        const infoArr = await sock.onWhatsApp(jid);
        const info = infoArr?.[0];
        if (!info || !info.jid || !info.lid) {
            return sock.sendMessage(
                chatId,
                { text: "❌ لم يتم العثور على LID لهذا الرقم." },
                { quoted: msg }
            );
        }
        const lidNumber = info.lid.replace(/[^0-9]/g, "");
        await sock.sendMessage(
            chatId,
            {
                text: `🔄 *تم التحويل (JID → LID)*
📥 *المدخل:* ${jid}
📤 *LID:* \`${info.lid}\`
🔢 *LID Number:* \`${lidNumber}\`
🤖 بواسطة: 𝐀𝐧𝐚𝐬𝐭𝐚𝐬𝐢𝐚`,
            },
            { quoted: msg }
        );
    } catch (err) {
        console.error("خطأ في jtl:", err);
        return sock.sendMessage(
            chatId,
            {
                text: "❌ حدث خطأ أثناء التحويل.",
            },
            { quoted: msg }
        );
    }
}
export default { NovaUltra, execute };
