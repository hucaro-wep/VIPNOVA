// /////////////////////////////////////////

// ملف joker.js (لعبة الجوكر - بطولة B2 -> B3)

// /////////////////////////////////////////

import fs from 'fs';

import { join, dirname } from 'path';

import { fileURLToPath } from 'url';

// إعداد المسارات

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

const DATA_PATH = join(process.cwd(), 'data', 'msharkin.json');

const GAME_STATES_FILE = join(__dirname, '../../nova/data/jokerGameStates.json'); // مسار حفظ الحالة

const HEARTS_DIR = join(__dirname, '../../nova/data/hearts/'); 

// إعدادات البطولة

const REQUIRED_LEVEL = "B2";

const NEXT_LEVEL = "B3";

// الثوابت

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const MIN_PLAYERS = 5; // لضمان وجود جوكر واحد على الأقل

const MAX_GUESSES_PER_ROUND = 3;

const SYMBOLS = ['♡', '♤', '◇', '♧'];

const SYMBOL_TO_IMAGE = {

    '♤': join(HEARTS_DIR, '1.jpg'),

    '♡': join(HEARTS_DIR, '2.jpg'),

    '◇': join(HEARTS_DIR, '3.jpg'),

    '♧': join(HEARTS_DIR, '4.jpg'),

};

// تخزين الألعاب

const games = new Map();

let isListenerAttached = false;

// -------------------------

// دوال مساعدة (Utils)

// -------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// دالة توحيد المعرف (JID/LID)

const normalizeId = (id) => {

    if (!id) return "";

    return id.split(':')[0].split('@')[0];

};

// تحميل حالات الألعاب

const loadGameStates = () => {

    try {

        if (fs.existsSync(GAME_STATES_FILE)) {

            const data = JSON.parse(fs.readFileSync(GAME_STATES_FILE, 'utf8'));

            for (const [jid, gameState] of Object.entries(data)) {

                gameState.playersMap = new Map();

                gameState.players.forEach(p => {

                    gameState.playersMap.set(normalizeId(p.id), p);

                    if (p.lid) gameState.playersMap.set(normalizeId(p.lid), p);

                });

                games.set(jid, gameState);

            }

        }

    } catch (error) {

        console.error("Error loading Joker game states:", error);

    }

};

// حفظ حالات الألعاب

const saveGameStates = () => {

    try {

        const gamesObj = {};

        for (const [jid, game] of games.entries()) {

            const { playersMap, timer, ...serializableGame } = game;

            gamesObj[jid] = serializableGame;

        }

        const dir = dirname(GAME_STATES_FILE);

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(GAME_STATES_FILE, JSON.stringify(gamesObj, null, 2), 'utf8');

    } catch (error) {

        console.error("Error saving Joker game states:", error);

    }

};

// جلب اللاعبين المؤهلين

const getEligiblePlayers = () => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        return data.filter(p => p.status === true && p.lvl === REQUIRED_LEVEL);

    } catch (e) { return []; }

};

// تحديث الحالة (JSON)

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const index = data.findIndex(p => normalizeId(p.id) === normalizeId(playerId));

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) {}

};

// دوال الإرسال

const reply = async (sock, from, content, mentions = [], quoteMsg = null) => {

    return await sock.sendMessage(from, { text: content, mentions: mentions }, { quoted: quoteMsg });

};

const sendDM = async (sock, jid, text, mentions = []) => {

    try { await sock.sendMessage(jid, { text: text, mentions: mentions }); } catch (e) {}

};

const sendOneTimeViewImage = async (sock, jid, imagePath, caption) => {

    try {

        if (!fs.existsSync(dirname(imagePath))) fs.mkdirSync(dirname(imagePath), { recursive: true });

        if (fs.existsSync(imagePath)) {

            const imageBuffer = fs.readFileSync(imagePath);

            await sock.sendMessage(jid, { image: imageBuffer, caption: caption, viewOnce: true });

        } else {

            await sock.sendMessage(jid, { text: `[صورة مفقودة] ${caption}` });

        }

    } catch (e) { console.error('Error sending ViewOnce:', e); }

};

const kickMember = async (sock, groupJid, participantId) => {

    try { await sock.groupParticipantsUpdate(groupJid, [participantId], 'remove'); } catch (e) {}

};

// تحميل البيانات

loadGameStates();

// -------------------------

// المستمع الذكي (Smart Listener)

// -------------------------

function attachListener(sock) {

    if (isListenerAttached) return;

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const m = messages[0];

        if (!m || !m.message || m.key.fromMe) return;

        const chatJid = m.key.remoteJid;

        const senderRaw = m.key.participant || m.key.remoteJid;

        const senderClean = normalizeId(senderRaw);

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim().toUpperCase();

        // 1. تحديد اللعبة المناسبة

        let game = games.get(chatJid); 

        let isPrivate = !chatJid.endsWith('@g.us');

        // البحث في الخاص عبر playersMap

        if (isPrivate) {

            for (const [gJid, g] of games.entries()) {

                if (g.playersMap.has(senderClean) && g.playersMap.get(senderClean).isAlive) {

                    game = g;

                    break;

                }

            }

        }

        if (!game) return;

        const groupJid = Object.keys(Object.fromEntries(games)).find(key => games.get(key) === game) || chatJid;

        const player = game.playersMap.get(senderClean);

        // --- التعامل مع رسائل المجموعة (منع الغش) ---

        if (!isPrivate && chatJid === groupJid && game.stage === 'IN_ROUND_DISCUSSION') {

            if (m.message?.imageMessage || m.message?.videoMessage || m.message?.stickerMessage || m.message?.audioMessage) {

                try { await sock.sendMessage(groupJid, { delete: m.key }); } catch (e) {}

                if (player && player.isAlive) {

                    await removePlayer(sock, game, player.id, "إرسال وسائط (غش)");

                }

            }

            return;

        }

        // --- التعامل مع رسائل الخاص ---

        if (isPrivate && player && player.isAlive) {

            

            // مرحلة النقاش: كشف الرموز

            if (game.stage === 'IN_ROUND_DISCUSSION') {

                if (ALPHABET.includes(text) && text.length === 1) {

                    if (player.guessesUsed >= MAX_GUESSES_PER_ROUND) {

                        return await sendDM(sock, player.id, '⚠️ لقد استهلكت جميع محاولاتك في هذه الجولة.');

                    }

                    

                    const target = game.players.find(x => x.code === text && x.isAlive);

                    if (!target) return await sendDM(sock, player.id, '❌ رمز غير صحيح.');

                    if (target.id === player.id) return await sendDM(sock, player.id, '❌ لا يمكنك كشف رمزك بنفسك.');

                    await sendOneTimeViewImage(sock, player.id, SYMBOL_TO_IMAGE[target.symbol], `رمز اللاعب صاحب الكود ${target.code}`);

                    player.guessesUsed++;

                    await sendDM(sock, player.id, `✅ تم الكشف. المتبقي: ${MAX_GUESSES_PER_ROUND - player.guessesUsed} محاولات.`);

                }

            }

            // مرحلة التصويت: اختيار الرمز الخاص

            else if (game.stage === 'VOTING') {

                if (SYMBOLS.includes(text)) {

                    if (!player.roundChoice) {

                        player.roundChoice = text;

                        await sendDM(sock, player.id, `✅ تم تسجيل اختيارك: ${text}`);

                    } else {

                        await sendDM(sock, player.id, `⚠️ لقد قمت بالاختيار مسبقاً.`);

                    }

                }

            }

        }

    });

    isListenerAttached = true;

    console.log("Joker Listener Attached.");

}

// -------------------------

// Game Logic

// -------------------------

const startGame = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    game.stage = 'STARTED';

    saveGameStates();

    // توزيع الجوكرز

    const totalPlayers = game.players.length;

    const jokerCount = Math.floor(totalPlayers / 5);

    

    // خلط اللاعبين

    const shuffled = game.players.sort(() => 0.5 - Math.random());

    

    // تعيين الجوكرز

    for (let i = 0; i < jokerCount; i++) {

        shuffled[i].isJoker = true;

        await sendDM(sock, shuffled[i].id, '*🤡 أنت الجوكر!* مهمتك القضاء على الجميع والبقاء للأخير.');

    }

    await reply(sock, groupJid, `✅ تم توزيع الأدوار.\nعدد الجوكرز: ${jokerCount}`);

    await sleep(2000);

    const explanation = `*📜 شرح اللعبة (B2):*\n\nكل جولة مدتها دقيقتين. لديك رمز سري (${SYMBOLS.join(' ')}) لا تعرفه.\nاسأل اللاعبين في الخاص واكشف رموزهم (3 محاولات) لتعرف رمزك.\nفي نهاية الجولة، ارسل رمزك الصحيح للبوت في الخاص.\n\n🤡 *الجوكر:* يعرف رمزه ويحاول خداعكم.\nإذا مات كل الجوكرز = فوز المواطنين.`;

    await reply(sock, groupJid, explanation);

    await sleep(5000);

    await startRound(sock, groupJid);

};

const startRound = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    game.round++;

    game.stage = 'IN_ROUND_SETUP';

    saveGameStates();

    const alive = game.players.filter(p => p.isAlive);

    let msg = `*👥 المشاركين (${alive.length}):*\n\n`;

    for (const p of game.players) {

        msg += `@${p.id.split('@')[0]} : ${p.code} "${p.isAlive ? '🟢' : '🔴'}"\n`;

    }

    await reply(sock, groupJid, msg, game.players.map(p => p.id));

    await sleep(3000);

    const jokersAlive = game.players.filter(p => p.isJoker && p.isAlive).length;

    await reply(sock, groupJid, `*🤡 الجوكرز الأحياء: ${jokersAlive}*`);

    await sleep(3000);

    await reply(sock, groupJid, `*🔄 الجولة ${game.round}*\nلمعرفة رمز أي شخص ارسل حرفه (الكود) للبوت في الخاص.`);

    await sleep(2000);

    try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); } catch(e){}

    await reply(sock, groupJid, '*📢 بدأ النقاش! (دقيقتان)*');

    game.stage = 'IN_ROUND_DISCUSSION';

    game.players.forEach(p => p.guessesUsed = 0);

    saveGameStates();

    setTimeout(() => endDiscussion(sock, groupJid), 120000);

};

const endDiscussion = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game || game.stage !== 'IN_ROUND_DISCUSSION') return;

    try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch(e){}

    await reply(sock, groupJid, '*⏳ انتهى النقاش!*');

    await sleep(1000);

    game.stage = 'VOTING';

    game.players.forEach(p => p.roundChoice = null);

    saveGameStates();

    await reply(sock, groupJid, `*📝 وقت التصويت (30 ثانية)*\nارسل رمزك المتوقع (${SYMBOLS.join(' ')}) للبوت في الخاص.\nالخطأ = طرد!`);

    setTimeout(() => calculateResults(sock, groupJid), 30000);

};

const removePlayer = async (sock, game, playerId, reason = "") => {

    const player = game.players.find(p => p.id === playerId);

    if (player && player.isAlive) {

        player.isAlive = false;

        await reply(sock, game.groupJid, `🚫 تم طرد @${playerId.split('@')[0]} (${reason})`, [playerId]);

        await kickMember(sock, game.groupJid, playerId);

    }

};

const calculateResults = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game || game.stage !== 'VOTING') return;

    await reply(sock, groupJid, '*📊 جاري تحليل النتائج...*');

    await sleep(4000);

    let killed = [];

    // التحقق من الإجابات

    for (const p of game.players.filter(x => x.isAlive)) {

        if (p.roundChoice !== p.symbol) {

            killed.push(p);

        }

    }

    // الطرد

    for (const p of killed) {

        await removePlayer(sock, game, p.id, "فشل في معرفة رمزه");

        await sleep(1000);

    }

    const survivors = game.players.filter(p => p.isAlive);

    const jokersAlive = survivors.filter(p => p.isJoker);

    const citizensAlive = survivors.filter(p => !p.isJoker);

    let winner = null;

    if (jokersAlive.length === 0) {

        winner = 'citizens';

    } else if (citizensAlive.length <= jokersAlive.length) {

        winner = 'jokers';

    } else if (survivors.length <= 1) {

        winner = jokersAlive.length > 0 ? 'jokers' : 'citizens';

    }

    if (winner) {

        let winMsg = "", winTeam = [], loseTeam = [];

        if (winner === 'citizens') {

            winMsg = `🎉 *فوز المواطنين!* 🎉\nتم القضاء على جميع الجوكرز.\n\n`;

            winTeam = game.players.filter(p => !p.isJoker);

            loseTeam = game.players.filter(p => p.isJoker);

        } else {

            winMsg = `🤡 *فوز الجوكرز!* 🤡\nسيطر الجوكرز على اللعبة.\n\n`;

            winTeam = game.players.filter(p => p.isJoker);

            loseTeam = game.players.filter(p => !p.isJoker);

        }

        winMsg += `🆙 *الفائزون (ترقية لـ ${NEXT_LEVEL}):*\n`;

        const formatList = (list) => list.map(p => `- @${p.id.split('@')[0]}`).join('\n');

        winMsg += formatList(winTeam);

        

        winMsg += `\n\n🚫 *الخاسرون (إقصاء):*\n`;

        winMsg += formatList(loseTeam);

        await reply(sock, groupJid, winMsg, game.players.map(p => p.id));

        // الترقية والإقصاء

        for (const p of winTeam) {

            updatePlayerStatus(p.id, { lvl: NEXT_LEVEL });

            await sendDM(sock, p.id, `🎉 مبروك! فاز فريقك في الجوكر.\n✅ تمت ترقيتك للمستوى *${NEXT_LEVEL}*.`);

        }

        for (const p of loseTeam) {

            updatePlayerStatus(p.id, { status: false });

            await sendDM(sock, p.id, `❌ للاسف خسر فريقك.\n🚫 تم إقصاؤك من البطولة.`);

            if (p.isAlive) await kickMember(sock, groupJid, p.id);

        }

        games.delete(groupJid);

        saveGameStates();

    } 

    else {

        // توزيع رموز جديدة للجولة التالية

        game.players.forEach((p, idx) => {

            if(p.isAlive) {

                p.symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

                // الجوكر يعرف رمزه الجديد

                if(p.isJoker) {

                    sendDM(sock, p.id, `🤡 رمزك الجديد لهذه الجولة: ${p.symbol}`);

                } else {

                    sendDM(sock, p.id, `🔄 بدأت جولة جديدة، تم تغيير رمزك السري.`);

                }

            }

        });

        

        await startRound(sock, groupJid);

    }

};

// /////////////////////////////////////////

// دالة التنفيذ الرئيسية

// /////////////////////////////////////////

async function execute({ sock, msg }) {

    attachListener(sock); 

    const from = msg.key.remoteJid;

    const sender = msg.key.participant || msg.key.remoteJid;

    if (!from.endsWith('@g.us')) return await reply(sock, from, '⚠️ البطولة للمجموعات فقط.', [], msg);

    if (games.has(from)) return await reply(sock, from, '⚠️ اللعبة جارية بالفعل.', [], msg);

    // 1. سحب اللاعبين المؤهلين تلقائياً

    const eligiblePlayers = getEligiblePlayers();

    

    // الحد الأقصى 26 لأن الحروف الأبجدية A-Z تستخدم كأكواد

    const finalPlayersList = eligiblePlayers.slice(0, 26); 

    if (finalPlayersList.length < MIN_PLAYERS) {

        return await reply(sock, from, `⚠️ العدد غير كافٍ للبدء.\nالموجود (B2): ${finalPlayersList.length}\nالمطلوب: ${MIN_PLAYERS}`, [], msg);

    }

    // 2. إعداد اللعبة

    const newGame = {

        stage: 'distributing',

        groupJid: from,

        host: sender,

        players: [],

        playersMap: new Map(),

        round: 0,

        registrationCount: 0,

    };

    // تعبئة اللاعبين والرموز

    finalPlayersList.forEach((p, index) => {

        const playerCode = ALPHABET[index];

        const playerSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

        

        const newPlayer = {

            id: p.id,

            lid: p.lid || null,

            name: p.name || p.id.split('@')[0],

            code: playerCode,

            symbol: playerSymbol,

            isAlive: true,

            isJoker: false,

            guessesUsed: 0,

            roundChoice: null

        };

        newGame.players.push(newPlayer);

        

        // الخريطة المزدوجة

        newGame.playersMap.set(normalizeId(p.id), newPlayer);

        if (p.lid) newGame.playersMap.set(normalizeId(p.lid), newPlayer);

        // إرسال الرموز الأولية

        sendDM(sock, p.id, `✅ تم تسجيلك في الجوكر!\n🆔 رمزك العلني: *${playerCode}*\n🔣 رمزك السري: *${playerSymbol}*\n🤫 احتفظ به سراً!`);

    });

    games.set(from, newGame);

    saveGameStates();

    await reply(sock, from,

        `*🃏 الجوكر (تصفيات B2 -> B3) 🃏*\n\n✅ تم سحب ${newGame.players.length} لاعب مؤهل.\nلكل 5 لاعبين يوجد جوكر واحد.\n🚀 جاري بدء اللعبة فوراً...`

    );

    await sleep(3000);

    await startGame(sock, from);

}

export const NovaUltra = {

    command: 'جوكر',

    description: 'لعبة الجوكر (بطولة B2).',

    elite: "on",

    group: true,

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

