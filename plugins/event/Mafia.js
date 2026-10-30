// /////////////////////////////////////////

// ملف mafia.js (مافيا 42 - بطولة A2 -> A3 - سحب تلقائي)

// /////////////////////////////////////////

import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";

// تعريف المسارات

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// إعدادات الملفات والمجلدات

const GAME_STATES_FILE = path.join(__dirname, '../../nova/data/mafiaGameStates.json'); // مسار حفظ الحالة

const IMAGES_DIR = path.join(__dirname, '../../nova/data/mafia/'); // مسار الصور

const DATA_PATH = path.join(process.cwd(), 'data', 'msharkin.json'); // مسار بيانات المشاركين

// إعدادات البطولة

const REQUIRED_LEVEL = "A2";

const NEXT_LEVEL = "A3";

const MIN_PLAYERS = 5;

// كائن لحفظ بيانات الألعاب الجارية

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

// تحميل حالات الألعاب (للاستمرارية)

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

        console.error("Error loading Mafia game states:", error);

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

        const dir = path.dirname(GAME_STATES_FILE);

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(GAME_STATES_FILE, JSON.stringify(gamesObj, null, 2), 'utf8');

    } catch (error) {

        console.error("Error saving Mafia game states:", error);

    }

};

// جلب اللاعبين المؤهلين

const getEligiblePlayers = () => {

    if (!fs.existsSync(DATA_PATH)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        // تصفية: المستوى A2 + الحالة True

        return data.filter(p => p.status === true && p.lvl === REQUIRED_LEVEL);

    } catch (e) { return []; }

};

// تحديث بيانات اللاعب (JSON)

const updatePlayerStatus = (playerId, updates) => {

    if (!fs.existsSync(DATA_PATH)) return;

    try {

        let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

        const index = data.findIndex(p => normalizeId(p.id) === normalizeId(playerId));

        if (index !== -1) {

            Object.assign(data[index], updates);

            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4));

        }

    } catch (e) { console.error("Error updating JSON:", e); }

};

// إرسال صورة مع نص fallback

const sendImage = async (sock, jid, imageName, caption) => {

    const imagePath = path.join(IMAGES_DIR, imageName);

    try {

        if (fs.existsSync(imagePath)) {

            const buffer = fs.readFileSync(imagePath);

            await sock.sendMessage(jid, { image: buffer, caption: caption });

        } else {

            await sock.sendMessage(jid, { text: caption });

        }

    } catch (e) {

        await sock.sendMessage(jid, { text: caption });

    }

};

// دالة الرد العام (للمجموعات)

const reply = async (sock, from, content, shouldQuote = false, quotedMsg = null, mentions = []) => {

    const quote = shouldQuote ? (quotedMsg || null) : null;

    return await sock.sendMessage(from, { text: content, mentions: mentions }, { quoted: quote });

};

// ⭐ دالة إرسال الخاص (محدثة لدعم المنشن) ⭐

const sendDM = async (sock, jid, text, mentions = []) => {

    try { 

        await sock.sendMessage(jid, { text: text, mentions: mentions }); 

    } catch (e) {}

};

const kickMember = async (sock, groupJid, participantId) => {

    try { await sock.groupParticipantsUpdate(groupJid, [participantId], 'remove'); } catch (e) {}

};

// تحميل البيانات عند البدء

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

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();

        if (!text) return;

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

        // --- التعامل مع رسائل الخاص (أكشن، تصويت، شات فرق) ---

        if (isPrivate && player && player.isAlive) {

            

            // A. محادثات الفريق (مافيا / عشاق)

            if (game.stage === 'night') {

                const mafiaTeam = ['مافيا'];

                if (game.spyJoined) mafiaTeam.push('جاسوس');

                if (player.role === 'زراف' && player.roleData.joinedMafia) mafiaTeam.push('زراف');

                const isMafiaMember = mafiaTeam.includes(player.role);

                if (isMafiaMember) {

                    const teammates = game.players.filter(p => 

                        p.isAlive && normalizeId(p.id) !== senderClean && 

                        (p.role === 'مافيا' || (p.role === 'جاسوس' && game.spyJoined) || (p.role === 'زراف' && p.roleData.joinedMafia))

                    );

                    if (teammates.length > 0) {

                        const teamMsg = `*${player.role} @${player.id.split('@')[0]} أرسل:* ${text}`;

                        for (const mate of teammates) {

                            // ⭐ تمرير المنشن هنا

                            await sendDM(sock, mate.id, teamMsg, [player.id]);

                        }

                    }

                }

                if (player.role === 'حبيب') {

                    const partnerId = player.roleData.loverId;

                    const partner = game.players.find(p => p.id === partnerId && p.isAlive);

                    if (partner) {

                        const loverMsg = `*رسالة من الحبيب @${player.id.split('@')[0]}:* ${text}`;

                        // ⭐ تمرير المنشن هنا

                        await sendDM(sock, partner.id, loverMsg, [player.id]);

                    }

                }

            }

            const numInput = parseInt(text);

            // B. استقبال الأوامر الليلية

            if (game.stage === 'night' && !isNaN(numInput)) {

                await handleNightAction(sock, groupJid, player, numInput);

            }

            // C. استقبال التصويت

            if (game.stage === 'voting' && !isNaN(numInput)) {

                await handleVoting(sock, groupJid, player, numInput);

            }

        }

        // --- مرحلة النقاش النهاري (في المجموعة) ---

        if (game.stage === 'discussion' && chatJid === groupJid) {

            if (text === 'تزويد' || text === 'تنقيص') {

                if (game.timeModifiers.includes(senderClean)) return;

                game.timeModifiers.push(senderClean);

                if (text === 'تزويد') {

                    game.discussionTime += 15;

                    await reply(sock, groupJid, `➕ قام @${senderClean} بالتزويد. المتبقي ${game.discussionTime} ثانية.`, false, null, [senderRaw]);

                } else if (text === 'تنقيص') {

                    game.discussionTime = Math.max(0, game.discussionTime - 15);

                    await reply(sock, groupJid, `➖ قام @${senderClean} بالخصم. المتبقي ${game.discussionTime} ثانية.`, false, null, [senderRaw]);

                }

            }

        }

    });

    

    isListenerAttached = true;

    console.log("Mafia Listener Attached.");

}

// -------------------------

// منطق اللعبة (Game Logic)

// -------------------------

const startGame = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    game.stage = 'distributing';

    saveGameStates();

    try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch(e) {}

    await sock.sendMessage(groupJid, { text: '🔒 أغلقت الأبواب! جاري توزيع الأدوار...' });

    const count = game.players.length;

    let activeRoles = [];

    let mafiaCount = (count >= 8) ? 2 : 1;

    for (let i = 0; i < mafiaCount; i++) activeRoles.push('مافيا');

    let specialRoles = ['طبيب', 'شرطي', 'رجل عصابة', 'جندي', 'سياسي', 'شهيد', 'جاسوس', 'زراف', 'حبيب', 'حبيب'];

    if (count < 8) specialRoles = ['طبيب', 'شرطي', 'رجل عصابة', 'جندي', 'سياسي', 'شهيد'];

    specialRoles.sort(() => 0.5 - Math.random());

    

    for (let role of specialRoles) {

        if (activeRoles.length < count) activeRoles.push(role);

    }

    while (activeRoles.length < count) activeRoles.push('مواطن');

    while (activeRoles.length > count) activeRoles.pop();

    activeRoles.sort(() => 0.5 - Math.random());

    game.players.forEach((p, index) => {

        p.role = activeRoles[index];

        p.number = index + 1;

    });

    const lovers = game.players.filter(p => p.role === 'حبيب');

    if (lovers.length === 2) {

        lovers[0].roleData.loverId = lovers[1].id;

        lovers[1].roleData.loverId = lovers[0].id;

    } else if (lovers.length === 1) {

        lovers[0].role = 'مواطن';

    }

    // إرسال الأدوار

    for (const p of game.players) {

        let roleMsg = '', imageName = '';

        switch (p.role) {

            case 'مافيا': imageName = 'mafia.png'; roleMsg = `الوظيفة : *المافيا*\nالقدرة : \n *[القتل] يمكنك قتل شخص كل ليلة*`; break;

            case 'طبيب': imageName = 'doctor.png'; roleMsg = `الوظيفة : *طبيب*\nالقدرة : \n *[الحماية] تقدر تحمي لاعب واحد كل ليلة*`; break;

            case 'شرطي': imageName = 'cop.png'; roleMsg = `الوظيفة : *شرطي*\nالقدرة : \n *[العدالة] يمكنك التحقيق مع اي شخص كل ليلة ولو كان المافيا سيظهر لك*`; break;

            case 'شهيد': imageName = 'shd.png'; roleMsg = `الوظيفة : *شهيد*\nالقدرة : \n*1 [قربان] في حال اجتمع التصويت عليك قبل ان ينتهي الوقت يمكنك اختيار شخص بحيث اذا تم اعدامك يموت معك.*\n*2 [تدمير ذاتي] يمكنك اختيار لاعب كل ليلة، في حال كان له قدرة القتل واختار قتلك بتموتوا مع بعض.*`; break;

            case 'رجل عصابة': imageName = 'gang.png'; roleMsg = `الوظيفة : *رجل عصابة*\nالقدرة : *يمكنك في كل ليلة تهديد شخص ومنعه من التصويت حتى اليوم التالي..*`; break;

            case 'جندي': imageName = 'army.png'; roleMsg = `الوظيفة : *جندي*\nالقدرة : \n*1 [ضد الرصاص] يمكنك النجاة من هجوم المافيا لمرة واحدة فقط*\n*2 [حراسة ليلية] انت محصن ضد الجاسوس والزراف، اذا حاولوا ضدك بينكشف لك هوياتهم*`; break;

            case 'سياسي': imageName = 'syasi.png'; roleMsg = `الوظيفة : *سياسي*\nالقدرة :\n*1 [تضليل] لا يمكن اعدامك عبر التصويت.*\n*2 [المناظر] على عكس البقية تصويتك عن تصويتين.*`; break;

            case 'حبيب': imageName = 'lovers.png'; roleMsg = `الوظيفة : *حبيب*\nحبيبك الاخر : @${p.roleData.loverId.split('@')[0]}\nالقدرة : \n*1 [الرومانسية] يمكنك انت وحبيبك التحدث أثناء الليل عن طريق خاص البوت.*\n*2 [التضحية] في حال كنت انت وحبيبك الاثنين لازلتم احياء والماف قتل واحد منكم الحبيب الاخر هو الي بيموت وبيبقى الي تم استهدافه على قيد الحياة*`; break;

            case 'جاسوس': imageName = 'spy.png'; roleMsg = `الوظيفة : *جاسوس*\nالقدرة : \n*1 [التجسس] يمكنك كل ليلة التجسس ع هوية شخص.*\n*2 [الموعد] في حال ليلة من الليالي كشفت هوية ماف بيصير بينك وبينهم تواصل وبيتجنبوا قتلك.*`; break;

            case 'زراف': imageName = '7rami.png'; roleMsg = `الوظيفة : *زراف*\nالقدرة : \n *1 [الزرف] يمكنك سرقة وظيفة اي شخص عند بدء التصويت وقبل انتهاء وقت التصويت واستخدام قدرته حتى تسرق وظيفة اخرى.*\n*2 [الموعد] في حال الي سرقته كان ماف بتنضم للماف وتصير عندك قدرة الماف كذلك الي هي القتل.*`; break;

            default: roleMsg = `الوظيفة : مواطن\nالقدرة : مجرد مواطن مافي قدرة حاول تنجو.`;

        }

        if (imageName) await sendImage(sock, p.id, imageName, roleMsg);

        else await sock.sendMessage(p.id, { text: roleMsg, mentions: p.role === 'حبيب' ? [p.roleData.loverId] : [] });

        await sleep(500);

        if (['مافيا', 'طبيب', 'شرطي', 'رجل عصابة', 'جاسوس', 'شهيد'].includes(p.role)) {

            await sendDM(sock, p.id, '🔢 يرجى اختيار رقم شخص لتطبيق قدرتك عليه.');

        }

    }

    let listMsg = `📋 *اللاعبون:*\n`;

    game.players.forEach(p => listMsg += `${p.number}. @${p.id.split('@')[0]}\n`);

    await sock.sendMessage(groupJid, { text: listMsg, mentions: game.players.map(p => p.id) });

    await sleep(2000);

    await startNight(sock, groupJid);

};

const startNight = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    

    game.round++;

    game.stage = 'night';

    game.nightActions = {};

    saveGameStates();

    await sock.sendMessage(groupJid, { text: `🌙 *الليل...* (35 ثانية)` });

    try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch(e) {}

    const alive = game.players.filter(p => p.isAlive);

    let msg = `*الأحياء (الليلة ${game.round}):* \n` + alive.map(p => `${p.number}. @${p.id.split('@')[0]}`).join('\n');

    await sock.sendMessage(groupJid, { text: msg, mentions: alive.map(p => p.id) });

    await sleep(35000);

    await endNight(sock, groupJid);

};

const handleNightAction = async (sock, groupJid, player, targetNum) => {

    const game = games.get(groupJid);

    if (!game) return;

    

    const target = game.players.find(p => p.number === targetNum && p.isAlive);

    if (!target) return await sendDM(sock, player.id, '❌ رقم اللاعب غير صحيح أو ميت.');

    let role = player.role;

    if (player.role === 'زراف' && player.roleData.stolenAbility) role = player.roleData.stolenAbility;

    if (role === 'مافيا') {

        game.nightActions[player.id] = { type: 'kill', targetId: target.id };

        const team = game.players.filter(p => p.isAlive && (p.role === 'مافيا' || p.roleData.joinedMafia || (p.role === 'جاسوس' && game.spyJoined)));

        for (const t of team) {

            // ⭐ تمرير المنشن هنا

            await sendDM(sock, t.id, `🔫 الهدف المحدد: @${target.id.split('@')[0]}`, [target.id]);

        }

    } 

    else if (role === 'طبيب') {

        game.nightActions[player.id] = { type: 'heal', targetId: target.id };

        await sendDM(sock, player.id, `👨‍⚕️ تم اختيار حماية ${target.number}`);

    }

    else if (role === 'شرطي') {

        game.nightActions[player.id] = { type: 'investigate', targetId: target.id };

        let res = (target.role === 'مافيا' || (target.role === 'جاسوس' && game.spyJoined)) ? 'مافيا 🔫' : 'بريء 👤';

        await sendDM(sock, player.id, `👮‍♂️ نتيجة التحقيق مع ${target.number}: ${res}`);

    }

    else if (role === 'رجل عصابة') {

        game.nightActions[player.id] = { type: 'block', targetId: target.id };

        await sendDM(sock, player.id, `🥊 تم تهديد ${target.number}`);

        if (target.role !== 'مافيا') await sendDM(sock, target.id, "🥊 تم تهديدك من طرف مجهول!");

    }

    else if (role === 'شهيد') {

        game.nightActions[player.id] = { type: 'bomb', targetId: target.id };

        await sendDM(sock, player.id, `💣 تفخخ ${target.number}`);

    }

    else if (role === 'جاسوس') {

        game.nightActions[player.id] = { type: 'spy', targetId: target.id };

        if (target.role === 'مافيا') {

            game.spyJoined = true;

            await sendDM(sock, player.id, `🕵️ انضممت للمافيا! هم الآن يرون رسائلك.`);

            const mafias = game.players.filter(p => p.isAlive && p.role === 'مافيا');

            for(const m of mafias) await sendDM(sock, m.id, `🕵️ انضم جاسوس لفريقكم!`);

        } else if (target.role === 'جندي') {

            await sendDM(sock, player.id, `🪖 كشفك الجندي!`);

            await sendDM(sock, target.id, `🪖 جاسوس حاول كشفك!`);

        } else {

            await sendDM(sock, player.id, `🕵️ هوية ${target.number} هي: ${target.role}`);

        }

    }

};

const endNight = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    

    let deaths = [];

    let report = "";

    const killAction = Object.values(game.nightActions).filter(a => a.type === 'kill').pop();

    const healAction = Object.values(game.nightActions).filter(a => a.type === 'heal').pop();

    const bombActions = Object.values(game.nightActions).filter(a => a.type === 'bomb');

    let killerId = null;

    if (killAction) {

         killerId = Object.keys(game.nightActions).find(key => game.nightActions[key] === killAction);

    }

    if (killAction) {

        const victim = game.players.find(p => p.id === killAction.targetId);

        let actualVictim = victim;

        let isDead = true;

        if (healAction && healAction.targetId === victim.id) {

            isDead = false;

            // ⭐ تمرير المنشن هنا

            report += `👨‍⚕️ تم إنقاذ @${victim.id.split('@')[0]} من قبل الطبيب!\n`;

        }

        else if (victim.role === 'جندي' && victim.immunity === 0) {

            isDead = false;

            victim.immunity = 1;

            // ⭐ تمرير المنشن هنا

            report += `تصدى الجندي @${victim.id.split('@')[0]} لهجوم المافيا🪖\n`;

        }

        if (isDead && victim.role === 'حبيب') {

            const loverId = victim.roleData.loverId;

            const lover = game.players.find(p => p.id === loverId && p.isAlive);

            if (lover) {

                actualVictim = lover; 

                report += `💘 ضحى الحبيب بنفسه لإنقاذ شريكه!\n`;

            }

        }

        if (isDead && actualVictim.role === 'شهيد') {

             if (killerId) {

                const shahidAction = bombActions.find(a => {

                    const actorId = Object.keys(game.nightActions).find(k => game.nightActions[k] === a);

                    return actorId === actualVictim.id;

                });

                

                if (shahidAction && shahidAction.targetId === killerId) {

                    const killer = game.players.find(p => p.id === killerId);

                    if (killer && killer.isAlive) {

                         killer.isAlive = false;

                         deaths.push(killer);

                         // ⭐ تمرير المنشن هنا

                         report += `💣 الشهيد فجر المافيا @${killer.id.split('@')[0]} معه!\n`;

                         await kickMember(sock, groupJid, killer.id);

                    }

                }

             }

        }

        if (isDead) {

            actualVictim.isAlive = false;

            deaths.push(actualVictim);

            // ⭐ تمرير المنشن هنا

            report += `🔫 المافيا قتلت @${actualVictim.id.split('@')[0]}!\n`;

            await kickMember(sock, groupJid, actualVictim.id);

        }

    } else {

        report += `🕊️ ليلة هادئة، لم يمت أحد.\n`;

    }

    const blockActions = Object.values(game.nightActions).filter(a => a.type === 'block');

    blockActions.forEach(a => {

        const p = game.players.find(x => x.id === a.targetId);

        if (p) p.roleData.blocked = true;

    });

    await sock.sendMessage(groupJid, { text: report, mentions: game.players.map(p => p.id) });

    if (await checkWin(sock, groupJid)) return;

    await startDiscussion(sock, groupJid);

};

const startDiscussion = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    game.stage = 'discussion';

    game.discussionTime = 180;

    game.timeModifiers = [];

    saveGameStates();

    try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); } catch(e) {}

    await sock.sendMessage(groupJid, { text: `☀️ *الصباح!* (3 دقائق)\nاكتب *تزويد* أو *تنقيص* لتعديل الوقت.` });

    const interval = setInterval(async () => {

        if (!games.get(groupJid) || game.stage !== 'discussion') {

            clearInterval(interval);

            return;

        }

        game.discussionTime--;

        if (game.discussionTime <= 0) {

            clearInterval(interval);

            await startVoting(sock, groupJid);

        }

    }, 1000);

    game.timer = interval;

};

const startVoting = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    game.stage = 'voting';

    game.dayVotes = {};

    game.hasVoted = [];

    saveGameStates();

    try { await sock.groupSettingUpdate(groupJid, 'announcement'); } catch(e) {}

    

    const alive = game.players.filter(p => p.isAlive);

    let msg = `🗳️ *وقت التصويت (30 ثانية)*\nيرجى إرسال رقم اللاعب في الخاص للتصويت عليه.\n`;

    alive.forEach(p => msg += `${p.number}. @${p.id.split('@')[0]}\n`);

    await sock.sendMessage(groupJid, { text: msg, mentions: alive.map(p => p.id) });

    const thief = game.players.find(p => p.isAlive && p.role === 'زراف');

    if (thief) await sendDM(sock, thief.id, '*🦹 اختر رقم لاعب لسرقة وظيفته الآن!*');

    

    const shahid = game.players.find(p => p.isAlive && p.role === 'شهيد');

    if (shahid) await sendDM(sock, shahid.id, '*💣 اختر رقم لاعب لتسحبه معك للموت في حال تم إعدامك.*');

    await sleep(30000);

    await endVoting(sock, groupJid);

};

const handleVoting = async (sock, groupJid, player, targetNum) => {

    const game = games.get(groupJid);

    if (!game) return;

    const target = game.players.find(p => p.number === targetNum && p.isAlive);

    if (!target) return;

    if (player.role === 'زراف') {

        let stolenRole = target.role;

        if (target.role === 'جندي') {

            await sendDM(sock, player.id, `🪖 فشلت السرقة! الجندي محصن.`);

            await sendDM(sock, target.id, `🦹 حاول الزراف سرقتك!`);

            return;

        }

        if (stolenRole === 'مافيا') {

            player.roleData.joinedMafia = true;

            await sendDM(sock, player.id, `🦹 سرقت المافيا! لقد انضممت لهم.`);

             const mafias = game.players.filter(p => p.isAlive && p.role === 'مافيا');

             for(const m of mafias) await sendDM(sock, m.id, `🦹 الزراف انضم لكم!`);

        } else if (target.role === 'جاسوس' && game.spyJoined) {

             player.roleData.joinedMafia = true;

             await sendDM(sock, player.id, `🦹 سرقت جاسوساً عميلاً! أنت الآن مع المافيا.`);

        } else {

             await sendDM(sock, player.id, `🦹 تم زرف الوظيفة: ${stolenRole}`);

        }

        player.roleData.stolenAbility = stolenRole;

        return;

    }

    if (player.role === 'شهيد') {

        player.roleData.votingTarget = target.id;

        await sendDM(sock, player.id, `💣 حددت القربان.`);

    }

    if (game.hasVoted.includes(player.id)) return await sendDM(sock, player.id, '❌ صوتت مسبقاً.');

    if (player.roleData.blocked) return await sendDM(sock, player.id, '❌ أنت ممنوع من التصويت.');

    let weight = player.role === 'سياسي' ? 2 : 1;

    game.dayVotes[target.id] = (game.dayVotes[target.id] || 0) + weight;

    game.hasVoted.push(player.id);

    await sendDM(sock, player.id, `✅ تم التصويت.`);

};

const endVoting = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return;

    

    let resultsMsg = "*نتائج التصويت:*\n";

    let max = 0;

    let victimId = null;

    let tie = false;

    for (const [pid, count] of Object.entries(game.dayVotes)) {

        if (count > 0) resultsMsg += `@${pid.split('@')[0]}: ${count}\n`;

        if (count > max) { max = count; victimId = pid; tie = false; }

        else if (count === max) { tie = true; }

    }

    await sock.sendMessage(groupJid, { text: resultsMsg, mentions: Object.keys(game.dayVotes) });

    await sleep(2000);

    if (tie || !victimId) {

        await sock.sendMessage(groupJid, { text: '⚖️ تعادل! لن يعدم أحد.' });

    } else {

        const victim = game.players.find(p => p.id === victimId);

        if (victim.role === 'سياسي') {

            await sock.sendMessage(groupJid, { text: '🗳️ السياسي لا يعدم!' });

        } else {

            victim.isAlive = false;

            let msg = `⚖️ إعدام @${victim.id.split('@')[0]}!`;

            let mentions = [victim.id];

            await kickMember(sock, groupJid, victim.id);

            if (victim.role === 'شهيد' && victim.roleData.votingTarget) {

                const drag = game.players.find(p => p.id === victim.roleData.votingTarget && p.isAlive);

                if (drag) {

                    drag.isAlive = false;

                    msg += `\n💣 وسحب معه @${drag.id.split('@')[0]}!`;

                    mentions.push(drag.id);

                    await kickMember(sock, groupJid, drag.id);

                }

            }

            await sock.sendMessage(groupJid, { text: msg, mentions: mentions });

        }

    }

    game.players.forEach(p => { if (p.roleData) delete p.roleData.blocked; });

    if (await checkWin(sock, groupJid)) return;

    await startNight(sock, groupJid);

};

const checkWin = async (sock, groupJid) => {

    const game = games.get(groupJid);

    if (!game) return false;

    

    const mafiaTeam = game.players.filter(p => 

        p.role === 'مافيا' || 

        (p.role === 'جاسوس' && game.spyJoined) || 

        (p.role === 'زراف' && p.roleData.joinedMafia)

    );

    

    const citizenTeam = game.players.filter(p => !mafiaTeam.includes(p));

    const mafiaAlive = mafiaTeam.filter(p => p.isAlive).length;

    const citizenAlive = citizenTeam.filter(p => p.isAlive).length;

    const specialAlive = game.players.some(p => p.isAlive && ['شرطي', 'طبيب', 'شهيد', 'سياسي'].includes(p.role));

    let winner = null;

    if (mafiaAlive === 0) winner = 'citizens';

    else if (mafiaAlive >= citizenAlive) winner = 'mafia';

    else if (!specialAlive && (mafiaAlive + citizenAlive) > 2 && mafiaAlive > 0) winner = 'mafia';

    if (winner) {

        let winMsg = "", winTeamPlayers = [], loseTeamPlayers = [];

        if (winner === 'citizens') {

            winMsg = `🎉 *انتصار المواطنين!* 🎉`;

            winTeamPlayers = citizenTeam;

            loseTeamPlayers = mafiaTeam;

        } else {

            winMsg = `🕴️ *انتصار المافيا!* 🕴️`;

            winTeamPlayers = mafiaTeam;

            loseTeamPlayers = citizenTeam;

        }

        const formatList = (list) => list.map(p => `@${p.id.split('@')[0]} (${p.role}) ${p.isAlive ? '✅' : '💀'}`).join('\n');

        winMsg += `\n\n*الفائزون:*\n${formatList(winTeamPlayers)}\n\n*الخاسرون:*\n${formatList(loseTeamPlayers)}`;

        await sock.sendMessage(groupJid, { text: winMsg, mentions: game.players.map(p => p.id) });

        // الترقية والإقصاء

        for (const p of winTeamPlayers) {

            updatePlayerStatus(p.id, { lvl: NEXT_LEVEL });

            await sendDM(sock, p.id, `🎉 مبروك! فاز فريقك في مافيا.\n✅ تمت ترقيتك للمستوى *${NEXT_LEVEL}*.`);

        }

        for (const p of loseTeamPlayers) {

            updatePlayerStatus(p.id, { status: false });

            await sendDM(sock, p.id, `❌ للأسف خسر فريقك.\n🚫 تم إقصاؤك من البطولة.`);

            if (p.isAlive) await kickMember(sock, groupJid, p.id);

        }

        games.delete(groupJid);

        saveGameStates();

        return true;

    }

    return false;

};

// /////////////////////////////////////////

// دالة التنفيذ الرئيسية

// /////////////////////////////////////////

async function execute({ sock, msg, args }) {

    attachListener(sock); // تفعيل المستمع الذكي

    const from = msg.key.remoteJid;

    const sender = msg.key.participant || msg.key.remoteJid;

    if (!from.endsWith('@g.us')) {

        return await reply(sock, from, '⚠️ البطولة للمجموعات فقط.', true, msg);

    }

    if (games.has(from)) {

        return await reply(sock, from, '⚠️ هناك لعبة جارية بالفعل.', true, msg);

    }

    // 1. سحب اللاعبين المؤهلين تلقائياً (نظام البطولة)

    const eligiblePlayers = getEligiblePlayers();

    const finalPlayersList = eligiblePlayers.slice(0, 12); // الحد الأقصى 12

    if (finalPlayersList.length < MIN_PLAYERS) {

        return await reply(sock, from, `⚠️ العدد غير كافٍ للبدء.\nالموجود (A2): ${finalPlayersList.length}\nالمطلوب: ${MIN_PLAYERS}`, true, msg);

    }

    // 2. إعداد اللعبة

    const newGame = {

        stage: 'distributing', // البدء فوراً بالتوزيع

        host: sender,

        players: finalPlayersList.map((p, index) => ({

            id: p.id,

            lid: p.lid || null,

            name: p.name || p.id.split('@')[0],

            isAlive: true,

            role: null,

            number: index + 1,

            immunity: 0,

            roleData: {}

        })),

        playersMap: new Map(), // الخريطة المزدوجة (JID + LID)

        round: 0,

        timer: null,

        discussionTime: 0,

        nightActions: {},

        dayVotes: {},

        hasVoted: [],

        timeModifiers: [],

        spyJoined: false,

    };

    // تعبئة الخريطة المزدوجة

    newGame.players.forEach(p => {

        newGame.playersMap.set(normalizeId(p.id), p);

        if (p.lid) newGame.playersMap.set(normalizeId(p.lid), p);

    });

    

    games.set(from, newGame);

    saveGameStates();

    await reply(sock, from,

        `*🕵️‍♂️ مافيا 42 (بطولة A2 -> A3) 🕵️‍♀️*\n\n✅ تم سحب ${finalPlayersList.length} لاعب مؤهل تلقائياً.\n🚀 جاري بدء اللعبة فوراً...`

    );

    await sleep(2000);

    await startGame(sock, from);

}

export const NovaUltra = {

    command: 'mafia',

    description: 'مافيا 42 (بطولة A2 -> A3)',

    elite: "on",

    group: true,

    prv: false,

    lock: "off"

};

export default { NovaUltra, execute };

