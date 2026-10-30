import fs from "fs";
import { join } from "path";
import { jidDecode } from "@whiskeysockets/baileys";
const dataDir = join(process.cwd(), 'data');
const numberFilePath = join(dataDir, 'numbe.txt');
const codeFilePath = join(dataDir, 'code.txt');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const activeSessions = {};
let isSessionListener = false;
const decodeJid = (jid) => {
    if (!jid) return null;
    return jidDecode(jid)?.user || jid.split('@')[0];
};
const generateRandomNumber = () => Math.floor(100000 + Math.random() * 900000);
const countries = [
    { name: 'اوكرانيا 🇺🇦', base: '+3809471' },
    { name: 'كوريا 🇰🇷', base: '+821025' },
    { name: 'مصر 🇪🇬', base: '+201280' },
    { name: 'المغرب 🇲🇦', base: '+212767' },
    { name: 'عشوائي 🏳🏴🚩', base: 'RANDOM' },
];
function loadRandomNumber() {
    if (!fs.existsSync(numberFilePath)) return null;
    try {
        const raw = fs.readFileSync(numberFilePath, 'utf8').trim();
        const match = raw.match(/\[\+?\d+\]/);
        return match ? match[0].replace(/[\[\]]/g, '') : null;
    } catch {
        return null;
    }
}
function saveRandomNumber(number) {
    try {
        fs.writeFileSync(numberFilePath, `[${number}]`, 'utf8');
    } catch (err) {
        console.error('❌ خطأ أثناء حفظ numbe.txt:', err);
    }
}
function loadEliteCode() {
    if (!fs.existsSync(codeFilePath)) return null;
    try {
        const raw = fs.readFileSync(codeFilePath, 'utf8').trim();
        const match = raw.match(/\[\d{6}\]/);
        return match ? match[0].replace(/[\[\]]/g, '') : null;
    } catch {
        return null;
    }
}
async function handleSessionStep(sock, chat, text, session) {
    if (session.stage === 'choose_country') {
        let selected;
        const numChoice = parseInt(text) - 1;
        if (!isNaN(numChoice) && countries[numChoice]) {
            selected = countries[numChoice];
        } else {
            selected = countries.find(c => c.name.includes(text));
        }
        if (!selected) {
            await sock.sendMessage(chat, { text: '❌ اختر رقم صحيح أو اسم الدولة من القائمة.' });
            return;
        }
        session.country = selected.name;
        session.stage = 'number_sent';
        session.mode = selected.base === 'RANDOM' ? 'random' : 'normal';
        const number = session.mode === 'random'
            ? loadRandomNumber()
            : `${selected.base}${generateRandomNumber()}`;
        if (!number) {
            await sock.sendMessage(chat, { text: '⚠️ لا يوجد رقم محفوظ في numbe.txt.' });
            delete activeSessions[chat];
            return;
        }
        session.number = number;
        session.eliteCode = null;
        await sock.sendMessage(chat, {
            text: `☑️ ⌯ تم شراء الرقم بنجاح!\n\n🌐 ⌯ الدولة: ${selected.name}\n📆 ⌯ ${new Date().toLocaleString()}\n\n☎️ ⌯ الرقم: ${number}\n⚠️ ⌯ الحالة: ... Waiting\n🧿 ⌯ معرّف العملية: ${generateRandomNumber()}\n\n💬 ⌯ الكود: اكتب "تحقق" بعد استلام الكود.`
        });
        return;
    }
    if (session.stage === 'number_sent' && !/^تحقق$/i.test(text)) {
        saveRandomNumber(text);
        return;
    }
    if (/^تحقق$/i.test(text)) {
        if (session.eliteCode) {
            await sock.sendMessage(chat, { text: `💬 كود التحقق المعتمد: ${session.eliteCode}` });
            delete activeSessions[chat];
            return;
        }
        const code = loadEliteCode();
        if (!code) {
            await sock.sendMessage(chat, { text: '⚠️ لم يصل الكود بعد.' });
            return;
        }
        session.eliteCode = code;
        await sock.sendMessage(chat, { text: `💬 كود التحقق المعتمد: ${code}` });
        delete activeSessions[chat];
    }
}
function setupSessionListener(sock) {
    if (isSessionListener) return;
    isSessionListener = true;
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m || !m.message || m.key.fromMe) return;
        const chat = m.key.remoteJid;
        const session = activeSessions[chat];
        if (!session) return;
        const text = m.message.conversation?.trim() || m.message.extendedTextMessage?.text?.trim() || '';
        if (!text) return;
        const senderNow = decodeJid(m.key.participant || m.key.remoteJid);
        if (senderNow !== session.user) return;
        await handleSessionStep(sock, chat, text, session);
    });
}
async function execute({sock, msg, args, BIDS}) {
    setupSessionListener(sock);
    const from = msg.key.remoteJid;
    const sender = decodeJid(msg.key.participant || msg.key.remoteJid);
    activeSessions[from] = {
        stage: 'choose_country',
        user: sender,
    };
    await sock.sendMessage(from, {
        text: '🌍 اختر الدولة:\n1. اوكرانيا 🇺🇦\n2. كوريا 🇰🇷\n3. مصر 🇪🇬\n4. المغرب 🇲🇦\n5. عشوائي 🏳🏴🚩'
    }, { quoted: msg });
}
export const NovaUltra = {
    command: "رقم",
    description: "توليد رقم حسب الدولة ومحاكاة التحقق",
    elite: "off",
    group: true,
    prv: false,
    lock: "off"
};
export default { NovaUltra, execute };
