import fs from 'fs';
import path from 'path';
export const NovaUltra = {
    command: "بوابه",
    description: "البحث عن رابط واتساب من datalinks.json + عرض الإحصائيات.",
    elite: "off",
    group: false,
    prv: false
};
const DB_DIR = path.join(process.cwd(), 'nova', 'data');
const DATA_FILE = path.join(DB_DIR, 'datalinks.json');
const storedFile = path.join(DB_DIR, 'PORTAL.mp4');
async function reply(sock, jid, content, quoted) {
    try {
        await sock.sendMessage(jid, typeof content === 'string' ? { text: content } : content, { quoted });
    } catch {}
}
const loadData = async () => {
    try {
        if (!fs.existsSync(DATA_FILE)) return null;
        const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
        return JSON.parse(raw || '{}');
    } catch {
        return null;
    }
};
export async function execute({sock, msg, args, BIDS,sender}) {
    const chatId = msg.key.remoteJid;
    const arg = msg.args?.[0]?.trim() || null;
    const data = await loadData();
    if (!data || !data.allLinksMap) {
        return reply(sock, chatId, "❌ لم أجد قاعدة بيانات datalinks.json، قم بتشغيل أمر fix أولاً.", msg);
    }
    const allRecords = Object.values(data.allLinksMap);
    if (allRecords.length === 0) {
        return reply(sock, chatId, "❌ قاعدة البيانات فارغة. شغّل أمر fix أولاً.", msg);
    }
    if (arg && arg === "وريني") {
        const stats = {};
        for (const r of allRecords) {
            const year = r.year || "غير معروف";
            stats[year] = (stats[year] || 0) + 1;
        }
        let out = `📊 *إحصائيات بوابات واتساب 💎*\n\n`;
        const sortedYears = Object.keys(stats).sort();
        for (const y of sortedYears) {
            out += `• ${y}: ${stats[y]} مجموعة\n`;
        }
        return reply(sock, chatId, out, msg);
    }
    let targetYear = null;
    if (arg && !isNaN(parseInt(arg))) {
        const year = parseInt(arg);
        if (year < 2010 || year > 2099) {
            return reply(sock, chatId, "⚠️ الرجاء إدخال سنة صحيحة بين 2010 و 2099.", msg);
        }
        targetYear = year;
    }
    await reply(sock, chatId, `🌀 *جاري فتح بوابة جديدة..*`, msg);
    if (fs.existsSync(storedFile)) {
        await sock.sendMessage(chatId, {
            video: { url: storedFile },
            mimetype: 'video/mp4',
            ptv: true
        });
    }
    await new Promise(r => setTimeout(r, 10000));
    const filtered = targetYear
        ? allRecords.filter(r => r.year == targetYear)
        : allRecords;
    if (filtered.length === 0) {
        return reply(sock, chatId, `❌ بوابات ${targetYear} مغلقة حاليا..`, msg);
    }
    const picked = filtered[Math.floor(Math.random() * filtered.length)];
    const name = picked.subject || "غير متوفر";
    const owner = picked.ownerNumber || "غير معروف";
    const createdISO = picked.creationISO || null;
    const members = picked.size || "*مجتمع وليس مجموعة*";
    const created = createdISO
        ? new Date(createdISO).toLocaleString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
        : "غير معروف";
    let txt = `🔮 *تم فتح بوابة جديدة!* 🔮\n\n`;
    txt += `*الاسم:* ${name}\n`;
    txt += `*تاريخ التأسيس:* ${created}\n`;
    txt += `*المؤسس:* ${owner}\n`;
    txt += `*الرابط:* ${picked.link}\n`;
    txt += `*عدد الأعضاء:* ${members}\n`;
    if (targetYear) txt += `\n⏳ *فلترة بحسب سنة:* ${targetYear}`;
    return reply(sock, chatId, txt, msg);
}
export default { NovaUltra, execute };
