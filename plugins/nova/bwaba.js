import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
export const NovaUltra = {
    command: "بوابة",
    description: "البحث عن رابط مجموعة واتساب نشط من قائمة 100 موقع (Scraping) مُركّز، مع تقرير شامل لسنة التأسيس.",
    elite: "off",
    group: true,
    prv: false,
    lock: "off"
};
const TARGET_URLS = [
  "https://whatlinkshub.info/", 
  "https://pkwhatsgrouplinks.com" 
];
const DB_DIR = path.join(process.cwd(), 'nova', 'data');
const LINKS_FILE = path.join(DB_DIR, 'portal.json');
async function reply(sock, chatId, content, quoted) {
    try {
        await sock.sendMessage(chatId, typeof content === 'string' ? { text: content } : content, { quoted });
    } catch (err) {
        console.error("Error in reply:", err);
    }
}
const loadStoredLinks = async () => {
    try {
        if (!fs.existsSync(DB_DIR)) {
            await fs.promises.mkdir(DB_DIR, { recursive: true });
        }
        const data = await fs.promises.readFile(LINKS_FILE, { encoding: 'utf8' });
        return JSON.parse(data || '[]');
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        console.error("Error loading stored links:", error);
        return [];
    }
};
const saveLinks = async (linksArray) => {
    try {
        if (!fs.existsSync(DB_DIR)) {
            await fs.promises.mkdir(DB_DIR, { recursive: true });
        }
        const data = JSON.stringify(linksArray, null, 2);
        await fs.promises.writeFile(LINKS_FILE, data, 'utf8');
    } catch (error) {
        console.error("Error saving links:", error);
    }
};
function cleanWhatsappLink(link) {
    if (!link) return null;
    link = link.trim()
        .replace(/&amp;/g, "&")
        .replace(/#.*/g, "")
        .replace(/\\\//g, "/")
        .replace(/\\n|\\t/g, "")
        .replace(/"/g, "");
    if (link.startsWith("chat.whatsapp.com")) {
        link = "https://" + link;
    }
    const regex = /(https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9\-_]{15,}/;
    const match = link.match(regex);
    return match ? match[0] : null;
}
async function fetchAndExtractLinks(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
            },
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const links = new Set();
        const regex = /(https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9\-_]{15,}/g;
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (href && href.includes("chat.whatsapp.com")) {
                links.add(cleanWhatsappLink(href));
            }
        });
        const fullText = $('body').text();
        const textMatches = fullText.match(regex);
        if (textMatches) {
            textMatches.forEach(x => links.add(cleanWhatsappLink(x)));
        }
        $('script').each((i, el) => {
            const scriptText = $(el).html();
            if (!scriptText) return;
            const found = scriptText.match(regex);
            if (found) found.forEach(x => links.add(cleanWhatsappLink(x)));
        });
        const attributes = ['data-url', 'data-href', 'onclick', 'onmouseover', 'onload'];
        $('*').each((i, el) => {
            attributes.forEach(attr => {
                let val = $(el).attr(attr);
                if (val && val.includes('chat.whatsapp.com')) {
                    const found = val.match(regex);
                    if (found) found.forEach(x => links.add(cleanWhatsappLink(x)));
                }
            });
        });
        return Array.from(links).filter(x => x);
    } catch {
        return [];
    }
}
function extractPureNumber(jid) {
    return jid.split('@')[0];
}
export async function execute({sock, msg, args, BIDS,sender}) {
    const chatId = msg.key.remoteJid;
    let targetYear = null;
    let filterMessage = "";
    if (msg.args && msg.args.length > 0) {
        const yearInt = parseInt(msg.args[0]);
        if (!isNaN(yearInt) && yearInt >= 2010 && yearInt <= 2099) {
            targetYear = yearInt;
            filterMessage = ` (سنة التأسيس: *${targetYear}*)`;
        } else {
            return reply(sock, chatId, "⚠️ أدخل سنة بين 2010 و 2099.", msg);
        }
    }
    await reply(sock, chatId, `🌀 *جاري تحليل ${TARGET_URLS.length} مصدر...*${filterMessage}`, msg);
    const storedLinks = await loadStoredLinks();
    const storedLinksSet = new Set(storedLinks);
    const allNewLinks = [];
    const uniqueLinksFound = new Set();
    const sourceReport = [];
    for (const url of TARGET_URLS) {
        const start = Date.now();
        const siteLinks = await fetchAndExtractLinks(url);
        const domain = url.replace("https://", "").split("/")[0];
        let newCount = 0;
        siteLinks.forEach(link => {
            if (!storedLinksSet.has(link) && !uniqueLinksFound.has(link)) {
                uniqueLinksFound.add(link);
                allNewLinks.push(link);
                newCount++;
            }
        });
        sourceReport.push({
            domain,
            fetched: siteLinks.length,
            new: newCount,
            time: ((Date.now() - start) / 1000).toFixed(1)
        });
    }
    let report = `📑 *تقرير البوابة:* (${TARGET_URLS.length} موقع)\n`;
    let totalFetched = 0, totalNew = 0;
    sourceReport.forEach(s => {
        report += `\n*${s.domain}:*\n`;
        report += `  - رُصد: ${s.fetched}\n`;
        report += `  - جديد: ${s.new}\n`;
        totalFetched += s.fetched;
        totalNew += s.new;
    });
    report += `\n---\n`;
    report += `🔍 الروابط المستخرجة: *${totalFetched}*\n`;
    report += `✨ الروابط الجديدة: *${allNewLinks.length}*\n`;
    await reply(sock, chatId, report, msg);
    if (allNewLinks.length === 0) {
        return reply(sock, chatId, "لا توجد روابط جديدة.", msg);
    }
    await reply(sock, chatId, `🔍 جاري التحقق من *${allNewLinks.length}* رابط...`, msg);
    let successfulLink = null;
    let successfulInfo = null;
    for (const link of allNewLinks) {
        const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9\-_]{15,})/);
        if (!match) continue;
        const code = match[1];
        try {
            const info = await sock.groupGetInviteInfo(code);
            if (info && info.subject) {
                const creationDate = new Date(info.creation * 1000);
                const actualYear = creationDate.getFullYear();
                if (targetYear && actualYear !== targetYear) continue;
                successfulLink = link;
                successfulInfo = info;
                storedLinksSet.add(link);
                await saveLinks(Array.from(storedLinksSet));
                break;
            }
        } catch {}
    }
    if (successfulLink) {
        const info = successfulInfo;
        const creationDate = new Date(info.creation * 1000).toLocaleString('ar-EG', {
            year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
        const owner = info.owner ? extractPureNumber(info.owner) : "غير متوفر";
        let text = `🎉 *تم العثور على بوابة نشطة!* 🎉\n\n`;
        text += `🌐 *المصدر:* ${successfulLink.split("/")[2]}\n`;
        text += `📌 *الاسم:* ${info.subject}\n`;
        text += `📆 *تاريخ التأسيس:* ${creationDate}\n`;
        text += `👤 *المؤسس:* ${owner}\n`;
        text += `👥 *العدد:* ${info.size}\n`;
        text += `🔗 *الرابط:* ${successfulLink}\n`;
        return reply(sock, chatId, text, msg);
    }
    return reply(sock, chatId, `❌ لم يتم العثور على رابط نشط.`, msg);
}
export default { NovaUltra, execute };
