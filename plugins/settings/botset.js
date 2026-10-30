import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
    command: "حساب",
    description: "إدارة الحساب (بيزنس، بروفايل، خصوصية، حظر)",
    usage: ".حساب",
    category: "system",
    elite: "on",
    lock: "on",
    group: false,
    prv: false,
    nova: "off"
};
const downloadBuffer = async (message, type) => {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
};
function applyHF(text) {
    const hf = config.ui || ["", ""];
    return [hf[0], text, hf[1]].filter(Boolean).join("\n\n");
}
async function sendHF(sock, chatId, text, session, forceNew = false) {
    const finalText = applyHF(text);
    let sent;
    try {
        if (session.menuKey && !forceNew) {
            sent = await sock.sendMessage(chatId, { text: finalText, edit: session.menuKey });
        } else {
            sent = await sock.sendMessage(chatId, { text: finalText });
        }
    } catch (e) {
        sent = await sock.sendMessage(chatId, { text: finalText });
    }
    if (sent?.key) {
        session.menuKey = sent.key;
        if (session.ignoreIDs) session.ignoreIDs.add(sent.key.id);
    }
    return sent;
}
const getJidToBlock = (msg, input) => {
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        return msg.message.extendedTextMessage.contextInfo.participant;
    }
    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        return msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    if (input) {
        let num = input.replace(/[^0-9]/g, ""); 
        if (num.length > 5) return num + "@s.whatsapp.net";
    }
    return null;
};
const translatePrivacy = (val) => {
    const map = {
        "all": "الكل 🟢",
        "contacts": "جهات الاتصال 👥",
        "contact_blacklist": "جهات الاتصال باستثناء 🚫",
        "none": "لا أحد 🔒",
        "match_last_seen": "نفس آخر ظهور 👁️",
        "undefined": "غير معروف ❓",
        "true": "مفعل ✅",
        "false": "معطل ❌"
    };
    return map[val] || val || "غير معروف";
};
async function getBizData(sock, jid) {
    try {
        const profile = await sock.getBusinessProfile(jid);
        return {
            description: profile.description || "غير محدد",
            address: profile.address || "غير محدد",
            email: profile.email || "غير محدد",
            website: (profile.website && profile.website[0]) ? profile.website[0] : "غير محدد"
        };
    } catch (e) {
        return { description: "...", address: "...", email: "...", website: "..." };
    }
}
async function getStatus(sock, jid) {
    try {
        const status = await sock.fetchStatus(jid);
        return status?.status || "غير متوفر";
    } catch {
        return "غير متوفر";
    }
}
let activeSessions = {}; 
async function execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;
    const ownerJid = sock.user.id.split(':')[0] + "@s.whatsapp.net";
    if (!msg.key.fromMe && msg.key.participant !== ownerJid && chatId !== ownerJid) return;
    const sessionId = ownerJid;
    if (activeSessions[sessionId]) return;
    activeSessions[sessionId] = { 
        state: "MAIN",
        ignoreIDs: new Set(),
        menuKey: null,
        data: {
            name: sock.user.name || sock.user.notify || "غير معروف",
            bio: "جاري التحميل...",
            biz: { description: "...", address: "...", email: "...", website: "..." },
            privacy: {},
            blockList: [] 
        }
    };
    let session = activeSessions[sessionId];
    let timeout;
    try {
        const [bio, biz] = await Promise.all([
            getStatus(sock, ownerJid),
            getBizData(sock, ownerJid)
        ]);
        session.data.bio = bio;
        session.data.biz = biz;
    } catch (e) {
        console.log("Error fetching data:", e);
    }
    const renderMain = () => `
 * ❀⤾⌏ ⚙ Account Control ⌌*
*⌌👤⌏ ⤳ الاسم:* ${session.data.name}

*⌌📄⌏ ⤳البايو:* ${session.data.bio.substring(0, 25)}...

*✧⤾◞ البروفايل الاساسي ◜*

✧⤾ *اسم* 
✧⤾ *بايو* 
✧⤾ *صورة*

*✧⤾◞ الاعمال ◜*

✧⤾ *بيزنس* (إدارة بيانات الأعمال)
✧⤾ *غلاف* (تغيير/حذف الغلاف)

*✧⤾◞ الاعدادات ◜*

✧⤾ *خصوصية* (عرض وتعديل الخصوصية)
✧⤾ *حظر* (إدارة قائمة الحظر)

✧⤾ *انهاء*
`;
    const renderBusiness = () => `
❀⤾ *⌌ إعدادات الأعمال (Business) ⌏*
*⌌📌⌏ ⤳ الوصف:*
${session.data.biz.description}

*⌌📍⌏ ⤳ العنوان:* ${session.data.biz.address}
*⌌📧⌏ ⤳ الايميل:* ${session.data.biz.email}
*⌌🌐⌏ ⤳ الموقع:* ${session.data.biz.website}
---
*مثال ارسل الوصف لتعديله*
🔙 *رجوع*`;
    const renderPrivacy = (p) => {
        const safeP = p || {};
        return `
❀⤾ *⌌🔏 اعدادات الخصوصية ⌏*
*⌌👁⌏ ⤳ اخر ظهور:* ${translatePrivacy(safeP.last)}
*⌌🟢⌏⤳ متصل الآن:* ${translatePrivacy(safeP.online)}
*⌌🖼️⌏ ⤳الصورة:* ${translatePrivacy(safeP.profile)}
*⌌📝⌏ ⤳ الحالة (Bio):* ${translatePrivacy(safeP.status)}
*⌌📖⌏ ⤳ مؤشر القراءة:* ${translatePrivacy(safeP.readreceipts)}
*⌌👥⌏ ⤳المجموعات:* ${translatePrivacy(safeP.groupadd)}
---
👇 *للتعديل ارسل الجزء الذي تريد تغييره*
🔙 *رجوع*`;
    };
    const renderBlockMenu = () => `
❀⤾ *⌌ 🚫 إدارة الحظر ⌏*

*⌌👁️⌏ ⤳ عرض (لعرض جميع الارقام المحظورة)
⌌🔒⌏ ⤳ *احظر* (حظر رقم جديد)
⌌🔓⌏ ⤳ *فك* (فك حظر عن رقم)
🔙 *رجوع*`;
    const resetTimeout = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            sock.ev.off("messages.upsert", listener);
            delete activeSessions[sessionId];
            sendHF(sock, chatId, "🔒 انتهت الجلسة.", session, true);
        }, 300000); 
    };
    const listener = async ({ messages }) => {
        const m = messages[0];
        if (!m?.message) return;
        if (m.message.protocolMessage || m.message.editedMessage) return;
        if (session.ignoreIDs.has(m.key.id)) return;
        if (!m.key.fromMe) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
        const input = text.trim();
        resetTimeout();
        if (input === "انهاء") {
            sock.ev.off("messages.upsert", listener);
            delete activeSessions[sessionId];
            return sendHF(sock, chatId, "👋 تم إغلاق لوحة التحكم.", session, false);
        }
        if (input === "رجوع" || input === "الغاء") {
            session.state = "MAIN";
            return sendHF(sock, chatId, renderMain(), session, false);
        }
        if (session.state === "MAIN") {
            if (input === "بيزنس") {
                session.state = "MENU_BIZ";
                return sendHF(sock, chatId, renderBusiness(), session, false);
            }
            if (input === "خصوصية") {
                try {
                    if (sock.fetchPrivacySettings) {
                        session.data.privacy = await sock.fetchPrivacySettings(true);
                    }
                } catch (e) {}
                session.state = "MENU_PRIV";
                return sendHF(sock, chatId, renderPrivacy(session.data.privacy), session, false);
            }
            if (input === "حظر") {
                session.state = "MENU_BLOCK";
                return sendHF(sock, chatId, renderBlockMenu(), session, false);
            }
            if (input === "اسم") {
                session.state = "SET_NAME";
                return sendHF(sock, chatId, `👤 *الاسم الحالي:* ${session.data.name}\n\n✏️ ارسل الاسم الجديد:`, session, false);
            }
            if (input === "بايو") {
                session.state = "SET_BIO";
                return sendHF(sock, chatId, `📝 *البايو الحالي:* ${session.data.bio}\n\n✏️ ارسل البايو الجديد:`, session, false);
            }
            if (input === "صورة") {
                session.state = "SET_PIC";
                return sendHF(sock, chatId, "🖼️ ارسل الصورة الشخصية الجديدة (أو رد على صورة)...", session, false);
            }
            if (input === "غلاف") {
                session.state = "SET_COVER";
                return sendHF(sock, chatId, "🖼️ ارسل صورة الغلاف الجديدة.\n🗑️ أو اكتب *حذف* لإزالة الغلاف.", session, false);
            }
        }
        if (session.state === "MENU_BLOCK") {
            if (input === "عرض") {
                try {
                    const blocklist = await sock.fetchBlocklist();
                    if (!blocklist || blocklist.length === 0) {
                        return sendHF(sock, chatId, "🚫 لا يوجد أي أرقام محظورة حالياً.", session, false);
                    }
                    const formattedList = blocklist.map((jid, i) => `${i + 1}. +${jid.split('@')[0]}`).join('\n');
                    return sendHF(sock, chatId, `📋 *قائمة المحظورين (${blocklist.length}):*\n\n${formattedList}\n\n🔙 *رجوع*`, session, false);
                } catch (e) {
                    return sendHF(sock, chatId, `❌ فشل جلب القائمة: ${e.message}`, session, false);
                }
            }
            if (input === "احظر") {
                session.state = "BLOCK_ADD";
                return sendHF(sock, chatId, "⛔ ارسل الرقم لحظره، أو قم بعمل منشن، أو رد على رسالته.", session, false);
            }
            if (input === "فك") {
                session.state = "BLOCK_REMOVE";
                return sendHF(sock, chatId, "🔓 ارسل الرقم لفك الحظر عنه.", session, false);
            }
        }
        if (session.state === "BLOCK_ADD") {
            const targetJid = getJidToBlock(m, input);
            if (!targetJid) {
                return sendHF(sock, chatId, "⚠️ رقم غير صالح. ارسل رقم صحيح أو اكتب 'رجوع'.", session, false);
            }
            try {
                await sock.updateBlockStatus(targetJid, "block");
                await sendHF(sock, chatId, `✅ تم حظر الرقم: +${targetJid.split('@')[0]}`, session, false);
                session.state = "MENU_BLOCK";
                setTimeout(() => sendHF(sock, chatId, renderBlockMenu(), session, false), 1500);
            } catch (e) {
                sendHF(sock, chatId, `❌ فشل الحظر: ${e.message}`, session, false);
            }
            return;
        }
        if (session.state === "BLOCK_REMOVE") {
            const targetJid = getJidToBlock(m, input);
            if (!targetJid) {
                return sendHF(sock, chatId, "⚠️ رقم غير صالح. ارسل رقم صحيح أو اكتب 'رجوع'.", session, false);
            }
            try {
                await sock.updateBlockStatus(targetJid, "unblock");
                await sendHF(sock, chatId, `✅ تم فك حظر الرقم: +${targetJid.split('@')[0]}`, session, false);
                session.state = "MENU_BLOCK";
                setTimeout(() => sendHF(sock, chatId, renderBlockMenu(), session, false), 1500);
            } catch (e) {
                sendHF(sock, chatId, `❌ فشل فك الحظر: ${e.message}`, session, false);
            }
            return;
        }
        if (session.state === "MENU_BIZ") {
            if (["وصف", "عنوان", "موقع", "ايميل"].includes(input)) {
                session.state = `SET_BIZ_${input.toUpperCase()}`;
                const map = { "وصف": "description", "عنوان": "address", "موقع": "website", "ايميل": "email" };
                const fieldKey = map[input];
                const currentVal = session.data.biz[fieldKey];
                return sendHF(sock, chatId, `🏢 جاري تعديل: *${input}*\n\n📌 القيمة الحالية: ${currentVal}\n\n✏️ ارسل القيمة الجديدة:`, session, false);
            }
        }
        if (session.state.startsWith("SET_BIZ_")) {
            const type = session.state.split("_")[2];
            const payload = {};
            const map = { "وصف": "description", "عنوان": "address", "موقع": "website", "ايميل": "email" };
            const field = map[type.toLowerCase()];
            if (field) {
                payload[field] = (field === "website") ? [input] : input;
                try {
                    await sock.updateBussinesProfile(payload);
                    await sendHF(sock, chatId, `✅ تم تحديث ${type} العمل بنجاح.`, session, false);
                    session.data.biz[field] = input;
                    setTimeout(() => {
                        sendHF(sock, chatId, renderBusiness(), session, false);
                    }, 1500);
                    session.state = "MENU_BIZ";
                    return; 
                } catch (e) {
                    sendHF(sock, chatId, `❌ فشل التحديث: ${e.message}`, session, false);
                }
            }
            session.state = "MENU_BIZ";
            return sendHF(sock, chatId, renderBusiness(), session, false);
        }
        if (session.state === "MENU_PRIV") {
            const commands = ["ظهور", "اونلاين", "صورة_ب", "حالة", "قراءة", "مجموعات"];
            if (commands.includes(input)) {
                session.state = `SET_PRIV_${input}`;
                const keyMap = { "ظهور": "last", "اونلاين": "online", "صورة_ب": "profile", "حالة": "status", "قراءة": "readreceipts", "مجموعات": "groupadd" };
                const currKey = keyMap[input];
                const currVal = session.data.privacy[currKey] ? translatePrivacy(session.data.privacy[currKey]) : "غير معروف";
                return sendHF(sock, chatId, `🔒 تعديل *${input}*:\nالحالة الحالية: ${currVal}\n\nاختر: (الكل - جهات - لااحد${input === 'اونلاين' ? ' - نفس_الظهور' : ''})`, session, false);
            }
        }
        if (session.state.startsWith("SET_PRIV_")) {
            const type = session.state.replace("SET_PRIV_", "");
            const privacyMap = { "الكل": "all", "جهات": "contacts", "لااحد": "none", "نفس_الظهور": "match_last_seen" };
            const val = privacyMap[input];
            if (!val && input !== "تفعيل" && input !== "تعطيل") {
                return sendHF(sock, chatId, "⚠️ قيمة غير صحيحة. حاول مرة أخرى أو اكتب 'رجوع'.", session, false);
            }
            try {
                if (type === "ظهور") await sock.updateLastSeenPrivacy(val);
                if (type === "صورة_ب") await sock.updateProfilePicturePrivacy(val);
                if (type === "حالة") await sock.updateStatusPrivacy(val);
                if (type === "مجموعات") await sock.updateGroupsAddPrivacy(val);
                if (type === "اونلاين") await sock.updateOnlinePrivacy(val);
                if (type === "قراءة") {
                    const rVal = (input === "تفعيل") ? "all" : "none";
                    await sock.updateReadReceiptsPrivacy(rVal);
                }
                await sendHF(sock, chatId, `✅ تم تحديث الخصوصية لـ ${type}.`, session, false);
            } catch (e) {
                await sendHF(sock, chatId, `❌ حدث خطأ: ${e.message}`, session, false);
            }
            setTimeout(async () => {
                try {
                    if (sock.fetchPrivacySettings) {
                        session.data.privacy = await sock.fetchPrivacySettings(true);
                    }
                } catch {}
                sendHF(sock, chatId, renderPrivacy(session.data.privacy), session, false);
            }, 1000);
            session.state = "MENU_PRIV";
            return;
        }
        if (session.state === "SET_NAME") {
            if (!input) return;
            await sock.updateProfileName(input);
            sock.user.name = input;
            session.data.name = input;
            session.state = "MAIN";
            return sendHF(sock, chatId, `✅ تم تغيير الاسم.\n\n${renderMain()}`, session, false);
        }
        if (session.state === "SET_BIO") {
            if (!input) return;
            await sock.updateProfileStatus(input);
            session.data.bio = input;
            session.state = "MAIN";
            return sendHF(sock, chatId, `✅ تم تحديث البايو.\n\n${renderMain()}`, session, false);
        }
        if (session.state === "SET_PIC" || session.state === "SET_COVER") {
            if (session.state === "SET_COVER" && input === "حذف") {
                try {
                    await sock.removeCoverPhoto();
                    await sendHF(sock, chatId, "✅ تم حذف غلاف الحساب بنجاح.", session, false);
                } catch(e) {
                    await sendHF(sock, chatId, `❌ فشل الحذف: ${e.message}`, session, false);
                }
                session.state = "MAIN";
                setTimeout(() => sendHF(sock, chatId, renderMain(), session, false), 1500);
                return;
            }
            const isImage = m.message.imageMessage;
            const isQuotedImage = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (isImage || isQuotedImage) {
                try {
                    const imageMsg = isImage ? m.message.imageMessage : isQuotedImage;
                    const buffer = await downloadBuffer(imageMsg, "image");
                    if (session.state === "SET_PIC") {
                        await sock.updateProfilePicture(sock.user.id, buffer);
                        await sendHF(sock, chatId, "✅ تم تغيير الصورة الشخصية.", session, false);
                    } else {
                        await sock.updateCoverPhoto(buffer);
                        await sendHF(sock, chatId, "✅ تم تغيير غلاف الحساب (Cover).", session, false);
                    }
                } catch (e) {
                    await sendHF(sock, chatId, `❌ فشل العملية: ${e.message}`, session, false);
                }
                session.state = "MAIN";
                setTimeout(() => sendHF(sock, chatId, renderMain(), session, false), 1500);
                return;
            } else {
                return sendHF(sock, chatId, "⚠️ الرجاء إرسال صورة أو كتابة 'حذف' (للغلاف).", session, false);
            }
        }
    };
    sock.ev.on("messages.upsert", listener);
    resetTimeout();
    await sendHF(sock, chatId, renderMain(), session, false);
}
export default { NovaUltra, execute };
