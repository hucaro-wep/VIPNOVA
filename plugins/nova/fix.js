import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
export const NovaUltra = {
  command: "fix",
  description: "مسح آمن (SAFE) لجميع المصادر، فحص الروابط، حفظ التفاصيل في datalinks.json وتصنيفها حسب سنة التأسيس.",
  elite: "on",
  group: false,
  prv: false
};
const TARGET_URLS = [
  "https://whatlinkshub.info/"
];
const DB_DIR = path.join(process.cwd(), 'nova', 'data');
const DATA_FILE = path.join(DB_DIR, 'datalinks.json');
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 3500;
const sleep = ms => new Promise(res => setTimeout(res, ms));
const loadDataFile = async () => {
  try {
    if (!fs.existsSync(DB_DIR)) await fs.promises.mkdir(DB_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      const blank = { meta: { createdAt: new Date().toISOString() }, byYear: {}, allLinksMap: {} };
      await fs.promises.writeFile(DATA_FILE, JSON.stringify(blank, null, 2), 'utf8');
      return blank;
    }
    const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error("Error loading data file:", err);
    return { meta: { createdAt: new Date().toISOString() }, byYear: {}, allLinksMap: {} };
  }
};
const saveDataFile = async (obj) => {
  try {
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving data file:", err);
  }
};
async function fetchLinksFromSources(urls) {
  const linksSet = new Set();
  for (const url of urls) {
    const siteName = url.replace(/^https?:\/\//, '').split('/')[0];
    try {
      console.log(`⤷ Scraping ${siteName} ...`);
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
        },
        timeout: 15000
      });
      const $ = cheerio.load(data);
      $('a[href*="chat.whatsapp.com/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.match(/https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9\-_]{15,}/)) {
          linksSet.add(href.split('?')[0]);
        }
      });
      console.log(`   ✓ ${siteName} scraped. Found so far: ${linksSet.size}`);
    } catch (err) {
      console.warn(`   ❌ Failed scraping ${siteName}: ${err.message}`);
    }
    await sleep(500);
  }
  return Array.from(linksSet);
}
export async function execute({sock, msg, args, BIDS,sender}) {
  const chatId = msg?.key?.remoteJid || 'console';
  console.log("=== بدء عملية fix (SAFE SCAN) ===");
  const data = await loadDataFile();
  const allLinksMap = data.allLinksMap || {};
  const byYear = data.byYear || {};
  console.log("تحميل قاعدة البيانات: ", Object.keys(allLinksMap).length, "روابط محفوظة.");
  console.log(`جلب الروابط من ${TARGET_URLS.length} مصدر...`);
  const fetchedLinks = await fetchLinksFromSources(TARGET_URLS);
  console.log(`إجمالي روابط مميزة: ${fetchedLinks.length}`);
  const newLinks = fetchedLinks.filter(l => !allLinksMap[l]);
  console.log(`روابط جديدة: ${newLinks.length}`);
  if (newLinks.length === 0) {
    return replyIfPossible(sock, chatId, "لا توجد روابط جديدة.", msg);
  }
  const BATCH_SIZE = 50;
  function chunkArray(arr, size) {
    const res = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }
  const batches = chunkArray(newLinks, BATCH_SIZE);
  let processed = 0;
  let successes = 0;
  let failures = 0;
  let skipped = 0;
  console.log(`الفحص الآن بــ دفعات حجم الواحدة = ${BATCH_SIZE}`);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`\n=== دفعة ${b + 1} / ${batches.length} (عددها ${batch.length}) ===`);
    await Promise.all(batch.map(async (link) => {
      processed++;
      console.log(`\n[${processed}/${newLinks.length}] فحص: ${link}`);
      try {
        const regex = /(https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9\-_]{15,})/;
        const m = link.match(regex);
        if (!m) {
          console.log(" -> تنسيق خاطئ.");
          skipped++;
          return;
        }
        const code = m[2];
        let inviteInfo;
        try {
          inviteInfo = await sock.groupGetInviteInfo(code);
        } catch (err) {
          console.warn(` -> فشل getInviteInfo (${code}): ${err.message}`);
          failures++;
          return;
        }
        if (!inviteInfo || !inviteInfo.subject) {
          failures++;
          console.log(" -> الرابط غير صالح / منتهي.");
          return;
        }
        const creationTs = inviteInfo.creation ? inviteInfo.creation * 1000 : null;
        const createdDate = creationTs ? new Date(creationTs) : null;
        const year = createdDate ? createdDate.getFullYear() : 'unknown';
        const ownerJid = inviteInfo.owner || null;
        const ownerNumber = ownerJid ? extractPureNumber(ownerJid) : null;
        const record = {
          link,
          code,
          subject: inviteInfo.subject,
          ownerJid,
          ownerNumber,
          size: inviteInfo.size || 0,
          creationTimestamp: creationTs,
          creationISO: createdDate ? createdDate.toISOString() : null,
          year,
          fetchedAt: new Date().toISOString(),
          source: null
        };
        allLinksMap[link] = record;
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(record);
        successes++;
        console.log(` -> ✅ ${inviteInfo.subject} (${year})`);
      } catch (err) {
        failures++;
        console.error(" -> خطأ:", err.message);
      }
    }));
    data.meta.lastRun = new Date().toISOString();
    data.byYear = byYear;
    data.allLinksMap = allLinksMap;
    await saveDataFile(data);
    const delay = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
    console.log(`انتهت الدفعة – انتظار ${delay}ms قبل التالية...`);
    await sleep(delay);
  }
  console.log("\n=== ملخص ===");
  console.log(`معالجة: ${processed}`);
  console.log(`نجاح: ${successes}`);
  console.log(`فشل: ${failures}`);
  console.log(`تجاوز: ${skipped}`);
  return replyIfPossible(sock, chatId, `انتهى. نجحت: ${successes} | فشلت: ${failures}`, msg);
}
async function replyIfPossible(sock, chatId, text, quoted) {
  try {
    await sock.sendMessage(chatId, { text }, { quoted });
  } catch (err) {
    console.warn("تعذّر إرسال الرسالة:", err.message);
  }
}
export default { NovaUltra, execute };
