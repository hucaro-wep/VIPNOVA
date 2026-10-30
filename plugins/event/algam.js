// /////////////////////////////////////////

// ملف mines.js (لعبة الألغام - الموت الحتمي - مع مؤقت)

// /////////////////////////////////////////

import fs from 'fs';

import path from 'path';

// مسار ملف المشاركين

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json');

// --- إعدادات المستويات المطلوبة للمواجهة ---

const LEVEL_TEAM_A = "A4";

const LEVEL_TEAM_B = "B4";

// إعدادات الوقت

const TURN_TIMEOUT = 30; // 30 ثانية لكل دور

// الدالة المساعدة لإنشاء تأخير

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// دالة تنظيف المعرف

const normalizeId = (jid) => {

    if (!jid) return null;

    return jid.split(':')[0];

};

// كائن لحفظ بيانات الألعاب الجارية

const games = {};

// -------------------------

// إعدادات اللعبة

// -------------------------

const TOTAL_NUMBERS = 20;

const TOTAL_MINES = 5;

const MAX_HEARTS = 3;

// -------------------------

// دوال مساعدة لملف البيانات

// -------------------------

const getPlayersByLevel = (targetLvl) => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        return data.filter(p => p.status === true && p.lvl === targetLvl);

    } catch (e) {

        console.error("Error reading msharkin.json:", e);

        return [];

    }

};

const disqualifyPlayer = (playerId) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const index = data.findIndex(p => p.id === playerId);

        if (index !== -1) {

            data[index].status = false; 

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) {

        console.error("Error disqualifying player:", e);

    }

};

const promoteWinner = (playerId) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const index = data.findIndex(p => p.id === playerId);

        if (index !== -1) {

            data[index].lvl = "win"; 

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) {

        console.error("Error promoting winner:", e);

    }

};

const kickMember = async (sock, groupJid, participantId) => {

    try {

        await sock.groupParticipantsUpdate(groupJid, [participantId], 'remove');

    } catch (e) {

        console.error(`Failed to kick ${participantId}:`, e);

    }

};

// -------------------------

// دوال اللوحة والعرض

// -------------------------

const formatBoard = (game) => {

    let boardStr = "";

    for (let i = 1; i <= TOTAL_NUMBERS; i++) {

        const spot = game.board[i];

        let symbol = `[${i}]`; 

        if (spot.revealed) {

            symbol = spot.isMine ? '💣' : '✅';

        }

        boardStr += `${symbol} `;

        if (i % 4 === 0) boardStr += '\n';

    }

    return boardStr;

};

const getHeartsStatus = (game) => {

    let status = "\n*♡ القلوب الحالية:*\n";

    game.players.forEach(p => {

        const hearts = '♡'.repeat(p.hearts) + '💥'.repeat(MAX_HEARTS - p.hearts);

        status += `👤 ${p.nickname} : ${hearts}\n`;

    });

    return status;

};

const createBoard = () => {

    const board = {};

    const minesIndices = new Set();

    while (minesIndices.size < TOTAL_MINES) {

        minesIndices.add(Math.floor(Math.random() * TOTAL_NUMBERS) + 1);

    }

    for (let i = 1; i <= TOTAL_NUMBERS; i++) {

        board[i] = { id: i, isMine: minesIndices.has(i), revealed: false };

    }

    return board;

};

// دالة لاختيار رقم عشوائي متاح

const getRandomAvailableSpot = (game) => {

    const available = [];

    for (let i = 1; i <= TOTAL_NUMBERS; i++) {

        if (!game.board[i].revealed) {

            available.push(i);

        }

    }

    if (available.length === 0) return null;

    return available[Math.floor(Math.random() * available.length)];

};

// -------------------------

// منطق إدارة الدور والمؤقت

// -------------------------

const stopTimer = (game) => {

    if (game.timerInterval) {

        clearInterval(game.timerInterval);

        game.timerInterval = null;

    }

};

// دالة بدء دور جديد (إرسال اللوحة + بدء المؤقت)

const startTurn = async (sock, groupJid) => {

    const game = games[groupJid];

    if (!game) return;

    const currentPlayer = game.players[game.turnIndex];

    

    // إرسال اللوحة وحالة القلوب

    let msgContent = `\n${formatBoard(game)}\n${getHeartsStatus(game)}\n🎲 *الدور على: ${currentPlayer.nickname}* (@${currentPlayer.id.split('@')[0]}) \n🔢 اختر رقم من 1 إلى 20`;

    

    await sock.sendMessage(groupJid, { 

        text: msgContent, 

        mentions: game.players.map(p => p.id) 

    });

    // إرسال رسالة المؤقت الأولية

    const timerMsg = await sock.sendMessage(groupJid, { text: `⏳ *المتبقي: ${TURN_TIMEOUT}*` });

    game.timerMsgKey = timerMsg.key; // حفظ مفتاح الرسالة للتعديل

    game.timeLeft = TURN_TIMEOUT;

    // بدء العد التنازلي

    game.timerInterval = setInterval(async () => {

        game.timeLeft--;

        if (game.timeLeft > 0) {

            // تحديث الرسالة كل ثانية (يمكن تقليل التكرار إذا حدث حظر، مثلاً كل 5 ثواني)

            // ملاحظة: كثرة التعديل قد تسبب ضغطاً، لكن هذا هو المطلوب

            if (game.timeLeft % 5 === 0 || game.timeLeft <= 5) { // لتخفيف الضغط نحدث كل 5 ثواني، وفي آخر 5 ثواني نحدث كل ثانية

                 try {

                    await sock.sendMessage(groupJid, { 

                        text: `⏳ *المتبقي: ${game.timeLeft}*`, 

                        edit: game.timerMsgKey 

                    });

                } catch (e) {

                    // تجاهل الأخطاء البسيطة في التعديل

                }

            }

        } else {

            // انتهى الوقت

            stopTimer(game);

            await sock.sendMessage(groupJid, { 

                text: `⌛ *انتهى الوقت!* سيقوم البوت بالاختيار عشوائياً عن ${currentPlayer.nickname}...`,

                edit: game.timerMsgKey

            });

            

            // اختيار عشوائي

            const autoChoice = getRandomAvailableSpot(game);

            if (autoChoice) {

                await processTurn(sock, groupJid, autoChoice, true);

            }

        }

    }, 1000);

};

// دالة معالجة الاختيار (سواء من اللاعب أو تلقائي)

const processTurn = async (sock, groupJid, choice, isAuto = false) => {

    const game = games[groupJid];

    if (!game) return;

    const currentP = game.players[game.turnIndex];

    const spot = game.board[choice];

    spot.revealed = true;

    

    let responseMsg = isAuto ? `🤖 *اختيار تلقائي:* ${choice}\n` : `👉 *اخترت:* ${choice}\n`;

    let turnEnded = false; 

    let gameOver = false;

    let loser = null;

    let winner = null;

    // 1. إذا كان لغماً 💣

    if (spot.isMine) {

        currentP.hearts--;

        responseMsg += `💥 *بوووم! لغم!* ${currentP.nickname} خسر قلباً.\n`;

        

        if (currentP.hearts <= 0) {

            gameOver = true;

            loser = currentP;

            winner = game.players.find(p => p.id !== currentP.id);

            responseMsg += `💔 *انتهت القلوب!* ${currentP.nickname} تم إقصاؤه.\n👑 *الفائز: ${winner.nickname}*`;

        } else {

            responseMsg += `تبقت لك ${currentP.hearts} قلوب.`;

            responseMsg += `\n🔄 *عليك الاختيار مرة أخرى!*`;

            turnEnded = false; // الدور يظل معه

        }

    } 

    // 2. إذا كان أمان ✅

    else {

        responseMsg += `✅ *أمان!* ${currentP.nickname} نجا.\n`;

        turnEnded = true;

    }

    // إرسال النتيجة

    await sock.sendMessage(groupJid, { 

        text: responseMsg, 

        mentions: [currentP.id] 

    });

    // معالجة نهاية اللعبة

    if (gameOver) {

        stopTimer(game); // تأكيد إيقاف أي مؤقت

        await sock.sendMessage(groupJid, { 

            text: `🏁 *نهاية اللعبة*\n\n${formatBoard(game)}`, 

            mentions: game.players.map(p => p.id) 

        });

        // إزالة مستمع الرسائل

        if (game.listener) {

            sock.ev.off('messages.upsert', game.listener);

        }

        delete games[groupJid];

        if (winner && loser) {

            await sleep(1000);

            promoteWinner(winner.id);

            disqualifyPlayer(loser.id);

            await sock.sendMessage(groupJid, {

                text: `🚫 جاري طرد اللاعب "${loser.nickname}" (رقم ${loser.number}) @${loser.id.split('@')[0]} ...`,

                mentions: [loser.id]

            });

            await sleep(2000); 

            await kickMember(sock, groupJid, loser.id);

        }

        return;

    }

    // الانتقال للدور التالي

    if (turnEnded) {

        game.turnIndex = game.turnIndex === 0 ? 1 : 0;

    }

    

    // بدء جولة جديدة (إرسال اللوحة + المؤقت)

    await sleep(1000);

    await startTurn(sock, groupJid);

};

// -------------------------

// التنفيذ الرئيسي

// -------------------------

async function execute({ sock, msg, args }) {

    const groupJid = msg.key.remoteJid;

    if (!groupJid.endsWith('@g.us')) {

        return await sock.sendMessage(groupJid, { text: '⚠️ هذه اللعبة للمجموعات فقط.' }, { quoted: msg });

    }

    if (games[groupJid]) {

        return await sock.sendMessage(groupJid, { text: '⚠️ هناك لعبة ألغام جارية بالفعل.' }, { quoted: msg });

    }

    const groupA = getPlayersByLevel(LEVEL_TEAM_A); 

    const groupB = getPlayersByLevel(LEVEL_TEAM_B); 

    

    if (groupA.length === 0 || groupB.length === 0) {

        return await sock.sendMessage(groupJid, { 

            text: `⚠️ فشل بدء المواجهة.\nلا يوجد لاعبين مؤهلين.\nA: ${groupA.length} | B: ${groupB.length}` 

        }, { quoted: msg });

    }

    const p1Data = groupA[Math.floor(Math.random() * groupA.length)];

    const p2Data = groupB[Math.floor(Math.random() * groupB.length)];

    const selectedPlayers = [

        { ...p1Data, hearts: MAX_HEARTS },

        { ...p2Data, hearts: MAX_HEARTS }

    ];

    games[groupJid] = {

        state: 'PLAYING',

        players: selectedPlayers,

        board: createBoard(),

        turnIndex: 0,

        timerInterval: null,

        timerMsgKey: null,

        timeLeft: 0,

        listener: null

    };

    const p1 = selectedPlayers[0];

    const p2 = selectedPlayers[1];

    await sock.sendMessage(groupJid, {

        text: `*💣 مواجهة الألغام (الموت الحتمي)!*

        

🔥 *الخصوم:*

1️⃣ ${p1.nickname} (رقم ${p1.number})

⚡️ *VS*

2️⃣ ${p2.nickname} (رقم ${p2.number})

⚔️ *القوانين:*

- كل لاعب لديه 3 قلوب.

- الموت يعني الطرد المباشر.

- ⏳ *لديك ${TURN_TIMEOUT} ثانية فقط للرد!*

- إذا انتهى الوقت، سيختار البوت عنك (وربما يختار لغماً!).

⏳ جاري تحضير ساحة الموت...`,

        mentions: [p1.id, p2.id]

    });

    await sleep(3000);

    // تعريف المستمع وحفظه في الكائن

    const gameListener = async ({ messages }) => {

        const m = messages[0];

        if (!m || !m.key || !m.message) return;

        if (m.key.fromMe) return;

        const chatJid = m.key.remoteJid;

        const rawParticipant = m.key.participant || m.key.remoteJid;

        const senderRawId = normalizeId(rawParticipant); 

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();

        if (chatJid !== groupJid) return;

        

        const currentGame = games[groupJid];

        if (!currentGame) return; // اللعبة انتهت

        const currentP = currentGame.players[currentGame.turnIndex];

        const isTurn = (senderRawId === normalizeId(currentP.id)) || (senderRawId === normalizeId(currentP.lid));

        if (!isTurn) return;

        const choice = parseInt(text);

        if (isNaN(choice) || choice < 1 || choice > 20) return; 

        if (currentGame.board[choice].revealed) {

            return await sock.sendMessage(groupJid, { text: '⚠️ هذا الرقم مكشوف مسبقاً.' }, { quoted: m });

        }

        // بما أن اللاعب رد، نوقف المؤقت فوراً

        stopTimer(currentGame);

        // تعديل رسالة المؤقت لتوضيح أن اللاعب اختار

        if (currentGame.timerMsgKey) {

            try {

                await sock.sendMessage(groupJid, { 

                    text: `✅ *تم الاختيار من ${currentP.nickname}*`, 

                    edit: currentGame.timerMsgKey 

                });

            } catch (e) {}

        }

        // تنفيذ الدور

        await processTurn(sock, groupJid, choice, false);

    };

    games[groupJid].listener = gameListener;

    sock.ev.on('messages.upsert', gameListener);

    // بدء الدور الأول

    await startTurn(sock, groupJid);

}

export const NovaUltra = {

    command: 'الغام',

    description: 'لعبة الألغام الإقصائية (الموت الحتمي) مع مؤقت.',

    elite: "on",

    group: true,

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

