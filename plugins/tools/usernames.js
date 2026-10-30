
const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateUsername() {
  let username = "";

  for (let i = 0; i < 3; i++) {
    username += CHARS[Math.floor(Math.random() * CHARS.length)];
  }

  return username;
}

export default {
  command: ["يوزرات"],
  description: "توليد 20 يوزر واتساب عشوائي",
  category: "tools",
  elite: "on",
  group: false,
  prv: false,
  lock: "on",

  async execute({ sock, msg }) {
    const jid = msg.key.participant || msg.key.remoteJid;

    if (!jid) return;

    const usernames = new Set();

    while (usernames.size < 20) {
      usernames.add(generateUsername());
    }

    const list = [...usernames];

    const text =
      "🎲 *اقتراحات يوزرات ثلاثية*\n\n" +
      list.map((u, i) => `${i + 1}. \`${u}\``).join("\n") +
      "\n\n━━━━━━━━━━━━━━\n" +
      "العدد: 20 اقتراح\n" +
      "الحالة: اقتراحات غير مفحوصة\n" +
      "لم يتم تغيير أو حجز أي يوزر.";

    return sock.sendMessage(jid, { text });
  },
};
