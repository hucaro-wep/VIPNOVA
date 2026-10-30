import fs from "fs";
import { join } from "path";
import { jidDecode } from "@whiskeysockets/baileys";
// تم حذف سطر استدعاء zarfConfig لأنه مكرر ويسبب المشكلة

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeSendMessage(sock, jid, message, options = {}) {
  try {
    return await sock.sendMessage(jid, message, options);
  } catch (err) {
    if (err?.data === 429) {
      await sleep(1000);
      return await sock.sendMessage(jid, message, options);
    }
    throw err;
  }
}

// تعريف الإعدادات هنا (وهذا هو الصحيح)
export let zarfConfig = {
  reaction: {
    status: `on`,
    emoji: `🪽`
  },
  group: {
    status: `on`,
    descStatus: `on`,
    newSubject: `مــزروف #هيكارو`,
    newDescription: `DJN owns your area..\n\nمابقول لك مين دجن، قرب وبتعرفه كويس..\n\nتبي تعرف كيف انزرفت..؟\nاجابتك بتنزل هنا قريب :\n\n𖠇 𝐃𝐉𝐍 - 𝐀𝐍𝐀𝐒𝐓𝐀𝐒𝐈𝐀\n↬ t.me/anastasiadjn\n\n---\n\nكل شي يخص دجن تلقوه هنا :\n\n𖠇 قناة 𝐃𝐉𝐍\n↬ https://whatsapp.com/channel/0029Vb3iTR59WtC2r1e3mL2Q\n\n\n𖠇 𝑫𝑱𝑵'𝑺 𝑺𝑯𝑶𝑾\n↬ chat.whatsapp.com/CEsy1h0Ng0pCEHyxJd1QGu\n\n𖠇 𝐃𝐉𝐍 - 𝐂𝐇𝐀𝐓\n↬ chat.whatsapp.com/BgqfjEjsmaMDiDyDNlzFl0\n\n𖠇 𝗗𝗝𝗡 𝗖𝗢𝗥𝗘\n↬ https://chat.whatsapp.com/Ji90ht63ELJIdpDVeSI7DG\n\n𖠇 𝐷𝐽𝑁 𝐶𝐴𝐺𝐸\n↬ https://chat.whatsapp.com/CzKEuwFWclWGiYosfvSjNm\n\n______`
  },
  mention: {
    status: `on`,
    text: `𝐀𝐧𝐚𝐬𝐭𝐚𝐬𝐭𝐢𝐚`
  },
  finalMessage: {
    status: `on`,
    text: `DJN owns your area..\n\nمابقول لك مين دجن، قرب وبتعرفه كويس..\n\nتبي تعرف كيف انزرفت..؟\nاجابتك بتنزل هنا قريب :\n\n𖠇 𝐃𝐉𝐍 - 𝐀𝐍𝐀𝐒𝐓𝐀𝐒𝐈𝐀\n↬ t.me/anastasiadjn\n\n𖠇 قناة 𝐃𝐉𝐍\n↬ https://whatsapp.com/channel/0029Vb3iTR59WtC2r1e3mL2Q`
  },
  media: {
    status: `on`,
    image: `image.jpeg`
  },
  audio: {
    status: `off`,
    file: `nova/sounds/AUDIO.mp3`
  },
  video: {
    status: `on`,
    file: `nova/data/zarf.mp4`
  }
};


// === دالة الانفجار المشتركة ===
async function startBombing(sock, jid, msg, promptMessage, countNum, botJid) {
    try {
        // 1. الرياكت
        const reactionEmoji = zarfConfig?.reaction?.emoji || '🫦';
        await safeSendMessage(sock, jid, {
            react: { text: reactionEmoji, key: msg.key }
        }).catch(() => {});

        // 2. معالجة الرسالة الأولى
        if (promptMessage) {
            await safeSendMessage(sock, jid, {
                edit: promptMessage.key,
                text: '𝐀𝐂𝐓𝐈𝐕𝐀𝐓𝐄 𝐓𝐇𝐄 𝐓𝐈𝐌𝐄 𝐁𝐎𝐌𝐁 💣'
            });
        } else {
            promptMessage = await safeSendMessage(sock, jid, {
                text: '𝐀𝐂𝐓𝐈𝐕𝐀𝐓𝐄 𝐓𝐇𝐄 𝐓𝐈𝐌𝐄 𝐁𝐎𝐌𝐁 💣'
            }, { quoted: msg });
        }

        await sleep(500);

        // 3. تعديل الرسالة إلى "بدء العد"
        if (promptMessage) {
            await safeSendMessage(sock, jid, {
                edit: promptMessage.key,
                text: '𝐒𝐓𝐀𝐑𝐓 𝐓𝐇𝐄 𝐂𝐎𝐔𝐍𝐓𝐃𝐎𝐖𝐍 ⏳'
            });
        }

        // 4. حلقة العد التنازلي
        for (let i = countNum; i >= 0; i--) {
            await sleep(250); 
            
            if (promptMessage) {
                await safeSendMessage(sock, jid, {
                    edit: promptMessage.key,
                    text: `*${i.toString().padStart(2, '0')}: 💣⏰*`
                });
            }
        }

        await sleep(250);

        // 5. الانفجار
        if (promptMessage) {
            await safeSendMessage(sock, jid, {
                edit: promptMessage.key,
                text: '*💣💥𝙱𝙾𝙾𝙼*'
            });
        }

        // 6. منطق الطرد
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;
        
        const toRemove = [];
        
        for (const p of participants) {
            if (p.id === botJid) continue;
            
            let isElite = false;
            try {
                isElite = await sock.isElite({ sock, id: p.id });
            } catch (e) { isElite = false; }
            
            if (!isElite) {
                toRemove.push(p.id);
            }
        }

        if (toRemove.length > 0) {
            await sock.groupParticipantsUpdate(jid, toRemove, 'remove').catch(err => {
                console.error(err);
                safeSendMessage(sock, jid, { text: '❌ حدث خطأ أثناء محاولة الطرد.' }, { quoted: msg });
            });
        } else {
            await safeSendMessage(sock, jid, { text: '🛡️ جميع الأعضاء نخبة، لا يوجد أحد لطرده.' });
        }

    } catch (innerError) {
        console.error("Error in startBombing:", innerError);
    }
}

async function execute({ sock, msg }) {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || jid;
  const botJid = (jidDecode(sock.user.id)?.user || sock.user.id.split("@")[0]) + "@s.whatsapp.net";

  try {
    const useTimer = NovaUltra.time === "on";

    if (useTimer) {
        // ============================
        //  مسار 1: التايمر مفعل (ON)
        // ============================
        
        await safeSendMessage(sock, jid, { react: { text: '⏳️', key: msg.key } }).catch(() => {});

        const promptMessage = await safeSendMessage(sock, jid, {
            text: "*⌛️𝐂𝐇𝐎𝐎𝐒𝐄 𝐍𝐔𝐌𝐁𝐄𝐑⏳️*\n*⏳️𝐁𝐄𝐓𝐖𝐄𝐄𝐍      𝟏  - 𝟔𝟎⌛️*"
        }, { quoted: msg });

        const listener = async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.remoteJid !== jid) return;
            const incomingSender = m.key.participant || m.key.remoteJid;
            if (incomingSender !== sender) return;
            const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
            if (!text) return;

            // 🔥 زر الإلغاء المخفي 🔥
            if (text.trim() === "كنسل") {
                // 1. إيقاف المستمع
                sock.ev.off("messages.upsert", listener);
                
                // 2. عمل رياكت
                await safeSendMessage(sock, jid, { react: { text: '✅️', key: m.key } }).catch(() => {});
                
                // 3. تعديل الرسالة لتوضيح الإلغاء (اختياري لجمالية المنظر)
                if (promptMessage) {
                    await safeSendMessage(sock, jid, {
                        edit: promptMessage.key,
                        text: '*❌ 𝐂𝐀𝐍𝐂𝐄𝐋𝐋𝐄𝐃*'
                    });
                }
                return;
            }

            const countNum = parseInt(text.trim());
            if (isNaN(countNum) || countNum < 1 || countNum > 60) return;

            sock.ev.off("messages.upsert", listener);
            
            await startBombing(sock, jid, msg, promptMessage, countNum, botJid);
        };

        sock.ev.on("messages.upsert", listener);

    } else {
        // ============================
        //  مسار 2: التايمر مغلق (OFF)
        // ============================
        await startBombing(sock, jid, msg, null, 3, botJid);
    }

  } catch (error) {
    console.error(error);
    await safeSendMessage(sock, jid, { text: '❌ حدث خطأ غير متوقع.' }, { quoted: msg });
  }
}

export const NovaUltra = {
  command: "بوم",
  description: "طرد الأعضاء (مع مؤقت اختياري)",
  elite: "on",
  group: true,
  prv: false,
  lock: "off",
  time: "on" 
};

export default { NovaUltra, execute };