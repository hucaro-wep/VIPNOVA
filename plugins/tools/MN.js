import { downloadContentFromMessage } from '@whiskeysockets/baileys';

async function execute({ sock, msg, args, BIDS, sender }) {
  try {
    const chatId = msg.key.remoteJid;

    if (!chatId.endsWith('@g.us')) {
      return sock.sendMessage(chatId, {
        text: '❌ هذا الأمر يعمل فقط في القروبات.'
      }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(chatId);
    const allParticipants = metadata.participants.map(p => p.id);

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    const fullArgs = body.trim().split(/\s+/);
    const textFromCommand = fullArgs.slice(1).join(' ') || '𝐚𝐧𝐚𝐬𝐭𝐚𝐬𝐢𝐚';

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedMsgKey = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    // ✅ لو في رد → فوروارد بنفسه + منشن
    if (quoted && quotedMsgKey) {
      const forwardMsg = {
        key: {
          remoteJid: chatId,
          fromMe: false,
          id: quotedMsgKey,
          participant: quotedParticipant
        },
        message: quoted
      };

      return sock.sendMessage(chatId, {
        forward: forwardMsg,
        mentions: allParticipants
      });
    }

    // ✅ الحالة العادية
    let messageContent = {
      text: textFromCommand,
      mentions: allParticipants
    };

    // ✅ لو الرد ملصق
    if (quoted?.stickerMessage) {
      const stream = await downloadContentFromMessage(
        quoted.stickerMessage,
        'sticker'
      );

      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      messageContent = {
        sticker: buffer,
        mentions: allParticipants
      };
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
  command: 'م',
  description: 'إرسال رسالة أو ملصق أو إعادة توجيه مع منشن لجميع أعضاء المجموعة.',
  elite: 'on',
  group: true,
  prv: false,
  lock: 'off'
};

export default { NovaUltra, execute };