import fs from "fs";
import path from "path";
import { Mutex } from 'async-mutex';

const __dirname = path.resolve(path.dirname(import.meta.url).replace('file://', '')); 
const DB_DIR = path.join(process.cwd(), 'database');
const ACCOUNTS_FILE = path.join(DB_DIR, 'db_accounts.json');

// دالة تحميل البيانات
const loadData = async (filePath) => {
    try {
        const data = await fs.promises.readFile(filePath, { encoding: 'utf8' });
        return JSON.parse(data || '{}'); 
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        console.error(`Error loading data from ${filePath}:`, error);
        return {};
    }
};

// إعدادات الأمر الجديدة
export const NovaUltra = {
    command: "نسخ",
    description: "نسخ احتياطي للأعضاء وإرسال جهات الاتصال.",
    usage: ".نسخ (داخل المجموعة) | .نسخ [رابط]",
    category: "group",
    elite: "on", // تم الإبقاء عليها كجزء من الهيكل الجديد، لكن تم إزالة التحقق البرمجي
    lock: "off",
    group: true,
    prv: false,
    nova: "on"
};

async function reply(sock, chatId, content, quoted) {
    try {
        await sock.sendMessage(chatId, typeof content === 'string' ? { text: content } : content, { quoted });
    } catch (err) {
        console.error("Error in reply:", err);
    }
}

async function sendContacts(sock, chatId, rawParticipants, groupName, msg) {
    let contacts = [];
    let index = 1;
    let sentCount = 0;
    const cleanGroupName = groupName.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, "_") || "Backup";

    for (const p of rawParticipants) {
        const finalJid = p.jid || p.id;
        // استبدال extractPureNumber بمنطق بسيط لاستخراج الرقم
        const phone = finalJid ? finalJid.split('@')[0] : null;

        let memberName = p.notify || p.name; 
        
        if (!phone || phone.length <= 5) continue;

        let displayName = "";
        if (memberName) {
            displayName = memberName.trim();
        } else {
            displayName = `عضو_${index}_${phone.slice(-4)}`;
        }

        displayName = displayName.replace(/[\u{1F300}-\u{1FAD6}]/gu, "").trim() || `عضو_غير_مسجل_${index}`;
        
        if (displayName.length > 50) {
            displayName = displayName.substring(0, 50).trim();
        }

        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;TYPE=CELL;waid=${phone}:+${phone}\nEND:VCARD`;
        contacts.push({ displayName, vcard });
        
        index++;
        sentCount++;

        if (contacts.length >= 100) {
            await reply(sock, chatId, {
                contacts: {
                    displayName: `Backup_${cleanGroupName}`,
                    contacts: contacts
                }
            }, msg);
            contacts = [];
        }
    }

    if (contacts.length > 0) {
        await reply(sock, chatId, {
            contacts: {
                displayName: `Backup_${cleanGroupName}`,
                contacts: contacts
            }
        }, msg);
    }
    return sentCount;
}

export async function execute({sock, msg, args, BIDS}) {
    const chatId = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    
    // تم إزالة التحقق من النخبة (isElite)

    let senderName = "مستخدم";
    try {
        const accounts = await loadData(ACCOUNTS_FILE);
        const account = accounts[senderJid];
        if (account && account.name) {
            senderName = account.name;
        } else {
            senderName = msg.pushName || senderJid.split('@')[0];
        }
    } catch(err) {
        senderName = msg.pushName || senderJid.split('@')[0];
        console.error("Error fetching account name, falling back to PushName:", err);
    }

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    const argsLink = msg.args && msg.args[0] ? msg.args[0] : null;
    
    const regexLink = /https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{20,}/;
    const match = text.match(regexLink);
    const targetLink = (argsLink && argsLink.includes("chat.whatsapp.com")) ? argsLink : (match ? match[0] : null);

    let rawParticipants = [];
    let groupName = "";
    let isCurrentGroup = false;

    try {
        if (targetLink) {
            // التعامل مع الرابط
            const code = targetLink.split("chat.whatsapp.com/")[1];
            await reply(sock, chatId, "⏳ *جاري جلب وتحليل بيانات الرابط (L2J)...*", msg);
            try {
                const inviteInfo = await sock.groupGetInviteInfo(code);
                groupName = inviteInfo.subject || "مجموعة_رابط";
                rawParticipants = inviteInfo.participants || [];
            } catch (e) {
                // في حال فشل جلب المعلومات (مثل انضمام سابق أو خطأ في الرابط)
                if (e.message === "not-authorized") { 
                     // محاولة بديلة إذا كان البوت بالفعل في المجموعة أو واجه مشكلة في الصلاحيات
                     // هذا الجزء اختياري ويعتمد على مكتبتك
                }
                throw e; 
            }

        } else if (chatId.endsWith("@g.us")) {
            // التعامل مع المجموعة الحالية
            isCurrentGroup = true;
            const metadata = await sock.groupMetadata(chatId);
            groupName = metadata.subject || "المجموعة_الحالية";
            rawParticipants = metadata.participants || [];
        } else {
            return reply(sock, chatId, "❌ *الرجاء استخدام الأمر في مجموعة أو إرفاق رابط.*", msg);
        }

        if (!rawParticipants || rawParticipants.length === 0) {
            return reply(sock, chatId, "❌ *لم يتم العثور على أعضاء أو تعذر قراءة المشاركين.*", msg);
        }

        await reply(sock, chatId, `⏳ *جاري تحضير ملفات جهات الاتصال (${rawParticipants.length} عضو)...*`, msg);
        
        const sentCount = await sendContacts(sock, chatId, rawParticipants, groupName, msg); 
        
    } catch (err) {
        console.error("Error in copy execution:", err);
        const errText = isCurrentGroup 
            ? "❌ *فشل جلب بيانات المجموعة. الأسباب المحتملة: 1. البوت ليس مشرفاً (قد يحتاج لصلاحيات). 2. المجموعة خاصة أو كبيرة جداً.*" 
            : "❌ *الرابط غير صالح أو انتهت صلاحيته أو المجموعة خاصة.*";
        return reply(sock, chatId, errText, msg);
    }
}

export default { NovaUltra, execute };