import path from "path";
import fs from "fs";
import { join } from "path";
import { generateWAMessageFromContent, jidDecode } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
    command: "كود",
    description: "مدير ملفات البلوجينات التفاعلي",
    usage: ".كود",
    category: "tools",
    elite: "on",
    lock: "on",
    group: false,
    prv: false,
    nova: "off"
};
function decode(jid) {
    return (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
}
const pluginsDir = join(process.cwd(), "plugins");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function execute({ sock, msg }) {
    const _nova_origSend = sock.sendMessage;
    sock.sendMessage = async (jid, content, options = {}) => {
        const _textBody = content?.text || content?.caption;
        if (!_textBody || typeof _textBody !== "string") {
            return _nova_origSend.call(sock, jid, content, options);
        }
        const hf = config.ui || ["", ""];
        const finalText = [hf[0], _textBody, hf[1]].filter(Boolean).join("\n\n");
        const newContent = { ...content, text: finalText };
        delete newContent.caption;
        return _nova_origSend.call(sock, jid, newContent, options);
    };
    const chatId = msg.key.remoteJid;
    const owner = msg.key.participant || chatId;
    let state = "FOLDERS"; 
    let currentFolder = null;
    let botMsgKey = null;
    let activeListener = true;
    const folders = () =>
        fs.existsSync(pluginsDir)
            ? fs.readdirSync(pluginsDir).filter(f => fs.statSync(join(pluginsDir, f)).isDirectory())
            : [];
    const files = f =>
        fs.existsSync(join(pluginsDir, f))
            ? fs.readdirSync(join(pluginsDir, f)).filter(x => x.endsWith(".js"))
            : [];
    const updateMessage = async (newText) => {
        if (!botMsgKey) {
            const sent = await sock.sendMessage(chatId, { text: newText });
            botMsgKey = sent.key;
        } else {
            await sock.sendMessage(chatId, {
                text: newText,
                edit: botMsgKey
            });
        }
    };
    const reactOK = key => sock.sendMessage(chatId, { react: { text: "✅", key } });
    const findFileGlobally = name => {
        for (const folder of folders()) {
            const p = join(pluginsDir, folder, name);
            if (fs.existsSync(p)) return p;
        }
        return null;
    };
    const showFolders = async () => {
        state = "FOLDERS";
        currentFolder = null;
        let txt = `
᠀ الفولدرات الموجودة 𔒩
${folders().map(f => `⌏📁⌌ ⤳ *◜ ${f} ◞*`).join("\n") || "❌ لا يوجد"}
✧⤾ *انشئ* + اسم الفولدر الجديد 
✧⤾ *عدل + اسم الملف* بالرد علي الكود
✧⤾ *حذف + اسم الملف*
✧⤾ *انهاء* لقفل امر كود
✧⤾ *ارسل اسم الفولدر الذي تريد الدخول له*
`;
        await updateMessage(txt);
    };
    const showFiles = async () => {
        if (!currentFolder) return updateMessage("⚠️ لم يتم اختيار الفئة بعد.");
        state = "FILES";
        let txt = `
❀⤾ *⌏ 📂 ${currentFolder} ⌌*
${files(currentFolder).map(f => `⌏📄⌌ ⤳ *◜ ${f} ◞*`).join("\n") || "❗ فارغ"}
✧⤾ *اضف + اسم الملف * بالرد علي الكود
✧⤾ *عدل + اسم الملف* بالرد علي الكود
✧⤾ *حذف + اسم الملف*
✧⤾ *اسم الملف* لجلبه
✧⤾ *رجوع* للعودة للقائمة الرئيسية
✧⤾ *انهاء* لإنهاء الأمر
`;
        await updateMessage(txt);
    };
    const handleSuccess = async (successText, nextAction) => {
        await updateMessage(`✅ ${successText}\n\n⏳ جاري العودة للقائمة...`);
        await sleep(4000);
        if (nextAction === "FOLDERS") return showFolders();
        if (nextAction === "FILES") return showFiles();
    };
    await showFolders();
    const listener = async ({ messages }) => {
        if (!activeListener) return;
        const m = messages[0];
        if (!m?.message) return;
        if ((m.key.participant || m.key.remoteJid) !== owner) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text;
        if (!text) return;
        const input = text.trim();
        if (input === "انهاء") {
            activeListener = false;
            sock.ev.off("messages.upsert", listener);
            await updateMessage("❌ تم إنهاء الجلسة وإغلاق المستمع.");
            return;
        }
        if (input === "رجوع") {
            await reactOK(m.key);
            if (state === "FILES") return showFolders();
            return; 
        }
        if (state === "FOLDERS" && input.startsWith("انشئ")) {
            const folderName = input.replace("انشئ", "").trim();
            if (!folderName) return updateMessage("⚠️ اكتب اسم الفولدر الجديد.");
            const newPath = join(pluginsDir, folderName);
            if (!fs.existsSync(newPath)) fs.mkdirSync(newPath);
            await reactOK(m.key);
            return handleSuccess(`تم إنشاء الفولدر *${folderName}* بنجاح`, "FOLDERS");
        }
        if ((input.startsWith("عدل ") || input.startsWith("حذف ")) && state === "FOLDERS") {
            const isDelete = input.startsWith("حذف ");
            const nameInput = input.replace(isDelete ? "حذف " : "عدل ", "").trim();
            const name = nameInput.endsWith(".js") ? nameInput : nameInput + ".js";
            const filePath = findFileGlobally(name);
            if (!filePath) return updateMessage(`⚠️ الملف ${name} غير موجود في أي فولدر.`);
            if (isDelete) {
                fs.unlinkSync(filePath);
                await reactOK(m.key);
                return handleSuccess(`تم حذف الملف *${name}* بنجاح`, "FOLDERS");
            } else {
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                               m.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
                if (!quoted) return updateMessage("⚠️ الرجاء الرد على رسالة تحتوي على الكود الجديد.");
                fs.writeFileSync(filePath, quoted);
                await reactOK(m.key);
                return handleSuccess(`تم تعديل محتوى *${name}* بنجاح`, "FOLDERS");
            }
        }
        if (state === "FOLDERS" && folders().includes(input)) {
            currentFolder = input;
            await reactOK(m.key);
            return showFiles();
        }
        if (state === "FILES") {
            if (input.startsWith("اضف ")) {
                const nameInput = input.replace("اضف ", "").trim();
                const name = nameInput.endsWith(".js") ? nameInput : nameInput + ".js";
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                               m.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
                if (!quoted) return updateMessage("⚠️ الرجاء الرد على رسالة الكود.");
                fs.writeFileSync(join(pluginsDir, currentFolder, name), quoted);
                await reactOK(m.key);
                return handleSuccess(`تم إضافة الملف *${name}*`, "FILES");
            }
            if (input.startsWith("عدل ")) {
                const nameInput = input.replace("عدل ", "").trim();
                const name = nameInput.endsWith(".js") ? nameInput : nameInput + ".js";
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                               m.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
                const p = join(pluginsDir, currentFolder, name);
                if (!fs.existsSync(p)) return updateMessage("⚠️ الملف غير موجود.");
                if (!quoted) return updateMessage("⚠️ الرجاء الرد على الكود.");
                fs.writeFileSync(p, quoted);
                await reactOK(m.key);
                return handleSuccess(`تم تعديل الملف *${name}*`, "FILES");
            }
            if (input.startsWith("حذف ")) {
                const nameInput = input.replace("حذف ", "").trim();
                const name = nameInput.endsWith(".js") ? nameInput : nameInput + ".js";
                const p = join(pluginsDir, currentFolder, name);
                if (!fs.existsSync(p)) return updateMessage("⚠️ الملف غير موجود.");
                fs.unlinkSync(p);
                await reactOK(m.key);
                return handleSuccess(`تم حذف الملف *${name}*`, "FILES");
            }
        const nameInput = input.trim();
        const name = nameInput.endsWith(".js") ? nameInput : nameInput + ".js";
        const p = join(pluginsDir, currentFolder, name);
        if (fs.existsSync(p)) {
            await sock.sendMessage(chatId, {
                document: fs.readFileSync(p),
                fileName: name,
                mimetype: "application/javascript" 
            }, { quoted: m }); 
            await reactOK(m.key);
        }
    }
};
    sock.ev.off("messages.upsert", listener);
    sock.ev.on("messages.upsert", listener);
    setTimeout(() => {
        if (activeListener) {
            activeListener = false;
            sock.ev.off("messages.upsert", listener);
            updateMessage("⏱️ انتهى وقت الجلسة.");
        }
    }, 600000);
}
export default { NovaUltra, execute };
