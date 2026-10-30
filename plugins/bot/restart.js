
import { jidDecode } from '@whiskeysockets/baileys';
import chalk from 'chalk';

const NovaUltra = {
  command: 'ريستارت',
  description: 'إعادة تشغيل البوت فورًا',
  elite: 'on',
  group: true,
  prv: false,
  lock: "off"
};

const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

async function execute({sock, msg, args, BIDS,sender}) {
  try {
    const chatId = msg.key.remoteJid;
    const sender = decode(msg.key.participant || msg.participant || chatId);


    await sock.sendMessage(chatId, {
      text: '🔄 جاري إعادة تشغيل البوت...'
    }, { quoted: msg });

    console.log(
      '\n' + chalk.bgYellow.black.bold('[ System ]'),
      '🔄',
      chalk.bgHex('#FFD700').black(`Bot restart initiated by ${sender}`)
    );


    process.send?.('reset');
    process.exit();

  } catch (error) {
    console.error('❌ خطأ أثناء تنفيذ أمر الريستارت:', error);
    await sock.sendMessage(msg.key.remoteJid, {
      text: `❌ حدث خطأ أثناء تنفيذ الأمر:\n${error.message || error}`
    }, { quoted: msg });
  }
}

export default { NovaUltra, execute };