// /////////////////////////////////////////
// ملف data.js (نظام البيانات المتقدم - إحصائيات وتفاصيل تفاعلية)
// /////////////////////////////////////////
import fs from "fs";
import path from "path";

// مسار ملف البيانات
const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

// خريطة تحويل المستويات إلى أسماء (للعرض)
const LEVEL_DISPLAY = {
    "A0": "قنبلة 💣",
    "B0": "غزو 👽",
    "A1": "النجوم ⭐",
    "B1": "الزومبي 🧟‍♂️",
    "A2": "مافيا 🕵️‍♂️",
    "B2": "جوكر 🃏",
    "A3": "مسدس 🔫",
    "B3": "تخمين 🔢",
    "A4": "اللعبة الأخيرة 🏁",
    "B4": "اللعبة الأخيرة 🏁"
};

// خريطة تحويل الأسماء المدخلة إلى كود المستوى (للبحث)
const INPUT_MAP = {
    "قنبلة": "A0", "قنبله": "A0",
    "غزو": "B0", "الغزو": "B0",
    "نجوم": "A1", "النجوم": "A1",
    "زومبي": "B1", "الزومبي": "B1",
    "مافيا": "A2", "المافيا": "A2",
    "جوكر": "B2", "الجوكر": "B2",
    "مسدس": "A3", "المسدس": "A3", "روليت": "A3",
    "تخمين": "B3", "ارقام": "B3", "أرقام": "B3",
    "اللعبة الاخيرة": "A4", "الأخيرة": "A4"
};

// متغير لتخزين المستمعين النشطين (لتجنب التداخل)
const activeListeners = new Map();

// -------------------------
// التنفيذ
// -------------------------
async function execute({ sock, msg, args }) {
    const chatId = msg.key.remoteJid;

    // 1. قراءة البيانات
    if (!fs.existsSync(DATA_PATH)) return await sock.sendMessage(chatId, { text: "⚠️ لا توجد بيانات." });
    
    let allPlayers = [];
    try {
        allPlayers = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch { return await sock.sendMessage(chatId, { text: "❌ ملف البيانات تالف." }); }

    // فلترة الأحياء فقط
    const activePlayers = allPlayers.filter(p => p.status === true);

    // ----------------------------------------------------
    // الحالة 1: الأمر بدون إدخال (.بيانات) -> عرض الإحصائيات
    // ----------------------------------------------------
    if (!args || args.length === 0) {
        const stats = {};
        
        // تصفير العدادات
        Object.keys(LEVEL_DISPLAY).forEach(lvl => stats[lvl] = 0);

        // حساب الاعداد
        activePlayers.forEach(p => {
            if (stats[p.lvl] !== undefined) stats[p.lvl]++;
            else stats[p.lvl] = 1; // للمستويات غير المعروفة
        });

        let summaryMsg = `📊 *إحصائيات الألعاب الجارية:*\n\n`;
        let hasActiveGames = false;

        for (const [lvl, count] of Object.entries(stats)) {
            if (count > 0) {
                summaryMsg += `🎮 *${LEVEL_DISPLAY[lvl] || lvl}:* ${count} مشارك\n`;
                hasActiveGames = true;
            }
        }

        if (!hasActiveGames) summaryMsg += "لا توجد ألعاب نشطة حالياً.\n";
        
        summaryMsg += `\n💡 *للتفاصيل اكتب:* .بيانات [اسم اللعبة]\nمثال: .بيانات غزو`;
        
        return await sock.sendMessage(chatId, { text: summaryMsg }, { quoted: msg });
    }

    // ----------------------------------------------------
    // الحالة 2: الأمر مع اسم لعبة (.بيانات غزو) -> عرض الأسماء + مستمع
    // ----------------------------------------------------
    const inputGame = args.join(" ").trim();
    const targetLvl = INPUT_MAP[inputGame] || INPUT_MAP[inputGame.replace("ال", "")]; // محاولة تخمين الاسم

    if (!targetLvl) {
        return await sock.sendMessage(chatId, { text: `⚠️ لم يتم العثور على لعبة بهذا الاسم: "${inputGame}"` }, { quoted: msg });
    }

    // جلب لاعبي هذه اللعبة فقط
    const gamePlayers = activePlayers.filter(p => p.lvl === targetLvl);

    if (gamePlayers.length === 0) {
        return await sock.sendMessage(chatId, { text: `📂 لا يوجد مشاركين نشطين في لعبة *${LEVEL_DISPLAY[targetLvl]}*.` }, { quoted: msg });
    }

    // عرض القائمة
    let listMsg = `📂 *قائمة مشاركين ${LEVEL_DISPLAY[targetLvl]} (${gamePlayers.length}):*\n\n`;
    gamePlayers.forEach((p, i) => {
        listMsg += `${i + 1}- ${p.nickname}\n`;
    });
    listMsg += `\nℹ️ *اكتب "لقب" أي مشارك الآن لعرض بطاقته الكاملة.* (معك 60 ثانية)`;

    await sock.sendMessage(chatId, { text: listMsg }, { quoted: msg });

    // -------------------------
    // تفعيل المستمع المؤقت
    // -------------------------
    
    // إزالة المستمع السابق إن وجد في نفس الشات
    if (activeListeners.has(chatId)) {
        sock.ev.off('messages.upsert', activeListeners.get(chatId));
        clearTimeout(activeListeners.get(chatId + '_timer'));
    }

    const detailListener = async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        if (m.key.remoteJid !== chatId) return;

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
        if (!text) return;

        // البحث عن اللاعب باللقب (Nickname)
        const targetPlayer = gamePlayers.find(p => p.nickname === text);

        if (targetPlayer) {
            const cardMsg = `
👤 *بطاقة اللاعب التعريفية*
━━━━━━━━━━━━━━━━━━
🏷️ *اللقب:* ${targetPlayer.nickname}
🔢 *الرقم:* ${targetPlayer.number}
🎮 *اللعبة:* ${LEVEL_DISPLAY[targetPlayer.lvl]}
🆔 *المنشن:* @${targetPlayer.id.split('@')[0]}
━━━━━━━━━━━━━━━━━━
`;
            await sock.sendMessage(chatId, { 
                text: cardMsg, 
                mentions: [targetPlayer.id] 
            }, { quoted: m });
            
            // (اختياري: هل تريد إغلاق المستمع بعد أول طلب؟ أم تركه يكمل الدقيقة؟)
            // سنتركه يكمل الدقيقة ليتيح الاستفسار عن أكثر من شخص
        }
    };

    // ربط المستمع
    sock.ev.on('messages.upsert', detailListener);
    activeListeners.set(chatId, detailListener);

    // مؤقت الإغلاق (60 ثانية)
    const timer = setTimeout(() => {
        sock.ev.off('messages.upsert', detailListener);
        activeListeners.delete(chatId);
        // (اختياري: إرسال رسالة بانتهاء الوقت)
        // sock.sendMessage(chatId, { text: "⏰ انتهى وقت الاستعلام." });
    }, 60000);
    
    activeListeners.set(chatId + '_timer', timer);
}

export const NovaUltra = {
    command: 'بيانات',
    description: 'عرض إحصائيات الألعاب أو تفاصيل المشاركين.',
    elite: "on",
    group: true,
    prv: false,
    lock: "off"
};

export default { NovaUltra, execute };
