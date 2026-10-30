import { downloadContentFromMessage } from '@whiskeysockets/baileys';
async function execute({sock, msg, args, BIDS,sender}) {
    try {
        const chatId = msg.key.remoteJid;
        const body =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";
        const fullArgs = body.trim().split(/\s+/);
        const textFromCommand = fullArgs.slice(1).join(' '); 
        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, { text: 'هذا الأمر يعمل فقط في القروبات.' }, { quoted: msg });
        }
        const groupMetadata = await sock.groupMetadata(chatId);
        const allParticipants = groupMetadata.participants.map(p => p.id);
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let messageContent = {
            text: textFromCommand || '*وَمَا تَوْفِيقِي إِلَّا بِاللهِ عَلَيْهِ تَوَكَّلْتُ وَإِلَيْهِ أُنِيبُ.*', 
            mentions: allParticipants
        };
        if (quoted) {
            if (quoted.conversation || quoted.extendedTextMessage?.text) {
                const text = quoted.conversation || quoted.extendedTextMessage.text;
                messageContent.text = text;
            } 
            else if (quoted.stickerMessage) {
                const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                messageContent = {
                    sticker: buffer,
                    mentions: allParticipants
                };
            }
        }
        await sock.sendMessage(chatId, messageContent);
    } catch (err) {
        console.error('❌ خطأ في أمر منشن:', err);
        return sock.sendMessage(msg.key.remoteJid, {
            text: `❌ حدث خطأ:\n${err.message || err.toString()}`
        }, { quoted: msg });
    }
}
export const NovaUltra = {
    command: 'منشن',
    description: 'إرسال رسالة أو ملصق مع عمل منشن لجميع أعضاء المجموعة.',
    elite: "on", 
    group: true, 
    prv: false,
    lock: "off"
};
export default { NovaUltra, execute };
