import fs from 'fs';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
const NovaUltra = {
    command: 'test',
    description: 'امر تست بس محنك اكثر',
    elite: 'on',
    group: false,
    prv: false,
    lock: 'off',
};
const dataDir = path.join(process.cwd(), 'nova', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const storedFile = path.join(dataDir, 'VIDEO.mp4');
async function downloadQuotedVideo(quoted) {
    const type = quoted.videoMessage ? 'videoMessage' : quoted.documentMessage ? 'documentMessage' : null;
    if (!type) throw new Error('الرد لا يحتوي فيديو');
    const stream = await downloadContentFromMessage(quoted[type], 'video');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}
async function execute({sock, msg, args, BIDS,sender}) {
    try {
        const jid = msg.key.remoteJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted && (quoted.videoMessage || quoted.documentMessage)) {
            await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
            const buffer = await downloadQuotedVideo(quoted);
            fs.writeFileSync(storedFile, buffer);
            await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
            return;
        }
        if (!fs.existsSync(storedFile)) {
            return sock.sendMessage(jid, { text: '❗ اكتب الامر رد ع اي فيديو تبيه بعدين استخدمه.' }, { quoted: msg });
        }
        await sock.sendMessage(jid, {
            video: { url: storedFile },
            mimetype: 'video/mp4',
            ptv: true 
        }, { quoted: msg });
    } catch (err) {
        console.error('❌ خطأ في أمر test:', err);
        await sock.sendMessage(msg.key.remoteJid, { react: { text: "❌", key: msg.key } });
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ حدث خطأ أثناء تنفيذ الأمر:\n${err.message || String(err)}` }, { quoted: msg });
    }
}
export default { NovaUltra, execute };
