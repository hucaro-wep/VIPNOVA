import fs from "fs";
import os from "os";
import ytSearch from "yt-search";

const HEADER = `᭥✦ ᖗ ⊹ ✦  𝑨𝑵𝑨𝑺𝑻𝑨𝑺𝑰𝑨 °˖ ✧ ១ 𔘓᠀﹅`;
const FOOTER = `᭥⊹ ✦  𝑨𝑵𝑨𝑺𝑻𝑨𝑺𝑰𝑨 𝑽.𝑰.𝑷 💤°˖ ✧᠀﹅`;
const SEPARATOR = `᭥───────────────᭥`;

export default {
    command: ["بحث", "yt"],
    description: "بحث في يوتيوب وعرض النتائج",
    usage: ".بحث كلمة",
    category: "tools",
    elite: "on",
    group: true,
    prv: false,
    lock: "off",
    async execute({ sock, msg, args }) {
        const jid = msg.chat || msg.key.remoteJid; // تأمين الحصول على الـ JID

        const query = args.join(" ");
        if (!query) {
            return sock.sendMessage(jid, { text: "⚠️ يرجى كتابة كلمة للبحث عنها." }, { quoted: msg });
        }

        try {
            const yt = await ytSearch(query);
            if (!yt || yt.videos.length === 0) {
                return sock.sendMessage(jid, { text: "⚠️ لا توجد نتائج لهذا البحث." }, { quoted: msg });
            }

            let text = `${HEADER}\n\n`;
            let count = 0;

            // عرض أول 10 نتائج فقط
            yt.videos.slice(0, 10).forEach((v) => {
                count++;
                text += `🎬 ${count}. ${v.title}\n`;
                text += `👤 القناة : ${v.author.name}\n`;
                text += `👁️ المشاهدات : ${v.views.toLocaleString()}\n`;
                text += `🔗 الرابط : ${v.url}\n`;
                text += `${SEPARATOR}\n`;
            });

            text += `\n${FOOTER}`;
            await sock.sendMessage(jid, { text }, { quoted: msg });

        } catch (error) {
            console.error("YouTube Search Error:", error);
            await sock.sendMessage(jid, { text: "❌ حدث خطأ أثناء البحث في يوتيوب." }, { quoted: msg });
        }
    }
};
