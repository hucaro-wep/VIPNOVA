import axios from 'axios';
import * as cheerio  from 'cheerio';
import fs from 'fs'
import path from 'path'
export const NovaUltra = {
    command: "استدعاء",
    description: "البحث عن رابط مجموعة واتساب نشط من المواقع المعتمدة (المدمجة)، مع إمكانية فلترة حسب سنة التأسيس.",
    elite: "off",
    group: false,
    prv: false
};
const TARGET_URLS = [
    "https://whatsgrouplink.com/",
    "https://groupsjoin.com/",
    "https://whatsappgroupslink.net/", 
   "https://whatslinkhub.com", 
   "https://whtsgrouplink.com", 
   "https://activewalinks.com", 
   "https://whatsgrouplinks.org", 
   "https://groupinvitelink.com",
   "https://whatalinks.com",
   "https://whtspgrouplink.com", 
   "https://77links.com", 
   "https://whatspgrouplinks.com", 
   "https://pak24tv.net", 
   "https://whatzgrouplink.com", 
   "https://whatlinko.com", 
   "https://findgroups.net", 
   "https://wsgrouplinks.com", 
   "https://wpgroup.in",
   "https://wagroups.org", 
   "https://activegrouplinks.org", 
   "https://activewagroup.com", 
   "https://whatzapgrouplinks.com",
   "https://whatsgroulinks.com", 
   "https://wgrouplink.com", 
   "https://whatsgroupslink.com", 
   "https://societieslink.com", 
   "https://pkwhatsgrouplinks.com", 
   "https://whtsagrouplinks.com", 
   "https://whtsalinks.com", 
   "https://whtgrouplinks.com", 
   "https://thewhatsappgrouplink.com", 
   "https://whgrouplinks.com", 
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
        if (error.code === 'ENOENT') {
            return []; 
        }
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
async function fetchAndExtractLinks(urls) {
    const allLinks = new Set();
    for (const url of urls) {
        try {
            const { data } = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
                },
                timeout: 15000 
            });
            const $ = cheerio.load(data);
            $('a[href*="chat.whatsapp.com/"]').each((i, element) => {
                let link = $(element).attr('href');
                if (link && link.match(/https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9\-_]{15,}/)) {
                    allLinks.add(link);
                }
            });
        } catch (error) {
            const siteName = url.replace('https://', '').split('/')[0];
            console.error(`❌ Scraping failed for ${siteName}: ${error.message}`);
        }
    }
    return Array.from(allLinks); 
}
function extractPureNumber(jid) {
    return jid.split('@')[0];
}

export async function execute({sock, msg, args, BIDS,sender}) {
    const chatId = msg.key.remoteJid;
    let targetYear = null;
    let filterMessage = "";
    if (msg.args && msg.args.length > 0) {
        const yearInput = msg.args[0];
        const yearInt = parseInt(yearInput);
        if (!isNaN(yearInt) && yearInt >= 2010 && yearInt <= 2099) {
            targetYear = yearInt;
            filterMessage = ` _العودة بالزمن لسنة ${targetYear}⏳_`;
        } else {
            return reply(sock, chatId, "⚠️ *الرجاء إدخال سنة صحيحة بين 2010 و 2099 للفلترة.*", msg);
        }
    }
    const sitesNames = TARGET_URLS.map(url => url.replace('https://', '').split('/')[0]).join(', ');
    await reply(sock, chatId, `*جاري انشاء بوابة جديدة..🌀*`, msg);
    const storedLinks = await loadStoredLinks();
    const storedLinksSet = new Set(storedLinks);
    const allFetchedLinks = await fetchAndExtractLinks(TARGET_URLS); 
    const totalFetchedLinks = allFetchedLinks.length;
    if (!allFetchedLinks || totalFetchedLinks === 0) {
        return reply(sock, chatId, "❌ *لم نتمكن من العثور على أي روابط جديدة في الموقع المعتمد.*", msg);
    }
    const linksToProcess = allFetchedLinks.filter(link => !storedLinksSet.has(link));
    if (linksToProcess.length === 0) {
        return reply(sock, chatId, "✅ *تم جلب روابط جديدة، ولكنها جميعاً تم تسجيلها كبوابات نشطة سابقاً. لا يوجد شيء للتحقق منه الآن.*", msg);
    }
    await reply(sock, chatId, `_🔮 تم ايجاد  ${linksToProcess.length} بوابة! ستفتح الآن بوابة عشوائية بينهم.._`, msg);
    let foundActiveLink = false;
    let successfulLink = null;
    let successfulInfo = null;
    for (const targetLink of linksToProcess) {
        const regexLink = /(https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9\-_]{15,})/;
        const linkMatch = targetLink.match(regexLink);
        const code = linkMatch ? linkMatch[2] : null;
        if (!code) continue; 
        try {
            const inviteInfo = await sock.groupGetInviteInfo(code);
            if (inviteInfo && inviteInfo.subject) {
                const creationTimestamp = inviteInfo.creation * 1000;
                const createdDate = new Date(creationTimestamp);
                const actualYear = createdDate.getFullYear();
                if (targetYear && actualYear !== targetYear) {
                    continue; 
                }
                successfulLink = targetLink;
                successfulInfo = inviteInfo;
                foundActiveLink = true;
                storedLinksSet.add(successfulLink);
                await saveLinks(Array.from(storedLinksSet));
                break; 
            }
        } catch (err) {
            continue; 
        }
    }
    if (foundActiveLink) {
        const groupName = successfulInfo.subject || "غير متوفر";
        const creationTimestamp = successfulInfo.creation * 1000;
        const creationDate = new Date(creationTimestamp).toLocaleString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const ownerJid = successfulInfo.owner || "غير متوفر";
        const ownerNumber = ownerJid ? extractPureNumber(ownerJid) : "غير متوفر";
        const membersCount = successfulInfo.size ? successfulInfo.size : '*مجتمع وليس مجموعة*';
        let responseText = `\n🔮 *تم العثور على بوابة نشطة!*🔮\n\n`;
        responseText += `*الاسم:* ${groupName}\n`;
        responseText += `*تاريخ التأسيس:* ${creationDate}\n`;
        responseText += `*المؤسس:* ${ownerNumber}\n`;
        responseText += `*الرابط:* ${successfulLink}\n`;
        responseText += `*عدد الأعضاء:* ${membersCount}\n`;
        await reply(sock, chatId, responseText, msg);
    } else {
        const failMessage = targetYear ? `❌ *لم يتم العثور على بوابة نشطة تطابق سنة ${targetYear} بعد فحص ${linksToProcess.length} بوابة.*` : `✅ *تم فحص ${linksToProcess.length} بوابة جديدة، ولم يتم العثور على أي بوابة نشطة حاليا.*`;
        await reply(sock, chatId, failMessage, msg);
    }
}
export default { NovaUltra, execute };
