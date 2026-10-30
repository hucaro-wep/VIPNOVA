import fs from "fs";
import path, { join, relative } from "path";
import { exec } from "child_process";
import { downloadContentFromMessage, jidDecode } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
    command: "ملفات",
    description: "نظام إدارة ملفات البوت (يدعم tar.gz للوحات التحكم)",
    usage: ".ملفات",
    category: "tools",
    elite: "on", 
    lock: "on",
    group: true,
    prv: false,
    nova: "off"
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function decode(jid) {
    return (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
}
const formatSize = (size) => {
    if (size === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
const downloadMedia = async (message) => {
    let type = Object.keys(message)[0];
    let msg = message[type];
    if (type === "viewOnceMessage") {
        msg = message.viewOnceMessage.message[Object.keys(message.viewOnceMessage.message)[0]];
        type = Object.keys(message.viewOnceMessage.message)[0];
    }
    const stream = await downloadContentFromMessage(msg, type.replace("Message", ""));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
};
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
    let currentPath = process.cwd();
    let botMsgKey = null;
    let activeListener = true;
    let waitingForTar = null; 
    const ls = (dir) => {
        try {
            const items = fs.readdirSync(dir);
            return items.map(item => {
                try {
                    const stat = fs.statSync(join(dir, item));
                    return { name: item, isDir: stat.isDirectory(), size: stat.size };
                } catch { return null; }
            }).filter(Boolean).sort((a, b) => b.isDir - a.isDir);
        } catch (e) {
            return [];
        }
    };
    const updateMessage = async (newText) => {
        if (!botMsgKey) {
            const sent = await sock.sendMessage(chatId, { text: newText });
            botMsgKey = sent.key;
        } else {
            await sock.sendMessage(chatId, { text: newText, edit: botMsgKey });
        }
    };
    const reactOK = key => sock.sendMessage(chatId, { react: { text: "✅", key } });
    const reactLoad = key => sock.sendMessage(chatId, { react: { text: "⏳", key } });
    const showDir = async () => {
        const relativePath = relative(process.cwd(), currentPath) || "."; 
        const items = ls(currentPath);
        let txt = `❀⤾ *⌏ 📂المسار ⌌* :\`${relativePath}\` 𔒩\n\n`;
        if (items.length === 0) txt += "❌ المجلد فارغ\n";
        else {
            txt += items.map(i => {
                const icon = i.isDir ? "📁" : "📄";
                const size = i.isDir ? "" : `(${formatSize(i.size)})`;
                return `⌏${icon}⌌  ⤳ *◜${i.name}◞*  ${size}`;
            }).join("\n");
        }
        txt += `\n\n
❀⤾ *⌏ 🎮 التحكم ⌌*
✧⤾ *دخول* + اسم الفولدر
✧⤾ *ملف* + اسم الملف (تحميل)
✧⤾ *انشئ* + اسم (فولدر)
✧⤾ *اضف* + اسم (رد بكود/ملف)
✧⤾ *عدل* + اسم (رد بكود/ملف)
✧⤾ *حذف* + اسم (ملف/فولدر)
✧⤾ *ضغط* <الهدف> <الاسم> <استثناء1,استثناء2>
✧⤾ *فك* <اسم الملف.tar.gz>
✧⤾ *تحديث* <اسم الفولدر> (استبدال بملف tar.gz)
✧⤾ *نظف* (حذف temp, tar.gz, empty files)
✧⤾ *رجوع* (خطوه لوراء)
✧⤾ *انهاء*`;
        await updateMessage(txt);
    };
    const handleSuccess = async (text) => {
        await updateMessage(`✅ ${text}\n\nجاري التحديث...`);
        await sleep(2000);
        await showDir();
    };
    await showDir();
    const listener = async ({ messages }) => {
        if (!activeListener) return;
        const m = messages[0];
        if (!m?.message) return;
        if ((m.key.participant || m.key.remoteJid) !== owner) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text;
        const isDocument = m.message.documentMessage || 
                           m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
        if (waitingForTar && (isDocument || m.message.documentMessage)) {
            const docMsg = m.message.documentMessage || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
            const mimetype = docMsg?.mimetype || "";
            const fileName = docMsg?.fileName || "";
            if (!mimetype.includes("gzip") && !mimetype.includes("tar") && !fileName.endsWith(".tar.gz") && !fileName.endsWith(".tgz")) {
                await updateMessage("⚠️ الملف المرفق ليس بصيغة tar.gz أو tgz.");
                waitingForTar = null;
                return;
            }
            await reactLoad(m.key);
            const folderName = waitingForTar.folderName;
            const targetDir = join(currentPath, folderName);
            const tarPath = join(currentPath, "temp_update.tar.gz");
            try {
                const buffer = await downloadMedia({ documentMessage: docMsg });
                fs.writeFileSync(tarPath, buffer);
                if (fs.existsSync(targetDir)) {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                }
                exec(`tar -xzf "${tarPath}" -C "${currentPath}"`, (err) => {
                    fs.unlinkSync(tarPath); 
                    if (err) {
                        updateMessage(`❌ فشل فك الضغط: ${err.message}`);
                    } else {
                        waitingForTar = null;
                        handleSuccess(`تم تحديث الفولدر *${folderName}* عبر Tar.gz بنجاح!`);
                    }
                });
            } catch (e) {
                updateMessage(`❌ حدث خطأ: ${e.message}`);
                waitingForTar = null;
            }
            return;
        }
        if (!text) return;
        const input = text.trim();
        const args = input.split(" ");
        const command = args[0];
        const param = args.slice(1).join(" ");
        if (input === "انهاء") {
            activeListener = false;
            sock.ev.off("messages.upsert", listener);
            return updateMessage("👋 تم إغلاق السيستم.");
        }
        if (input === "رجوع") {
            const parent = path.dirname(currentPath);
            currentPath = parent;
            await reactOK(m.key);
            return showDir();
        }
        if (command === "دخول") {
            const target = join(currentPath, param);
            if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
                currentPath = target;
                await reactOK(m.key);
                return showDir();
            } else return updateMessage("⚠️ المسار غير موجود.");
        }
        if (command === "ملف") {
            const filePath = join(currentPath, param);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                await reactOK(m.key);
                await sock.sendMessage(chatId, {
                    document: fs.readFileSync(filePath),
                    fileName: param,
                    mimetype: "application/octet-stream"
                }, { quoted: m });
            }
            return;
        }
        if (command === "انشئ") {
            const newDir = join(currentPath, param);
            if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir);
                await reactOK(m.key);
                return handleSuccess(`تم إنشاء *${param}*`);
            }
        }
        if (command === "حذف") {
            const target = join(currentPath, param);
            if (fs.existsSync(target)) {
                fs.rmSync(target, { recursive: true, force: true });
                await reactOK(m.key);
                return handleSuccess(`تم حذف *${param}*`);
            }
        }
        if (command === "اضف" || command === "عدل") {
            const fileName = param;
            if (!fileName) return updateMessage("⚠️ اكتب اسم الملف.");
            const filePath = join(currentPath, fileName);
            const quotedMsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg?.documentMessage) {
                await reactLoad(m.key);
                const buffer = await downloadMedia({ documentMessage: quotedMsg.documentMessage });
                fs.writeFileSync(filePath, buffer);
                await reactOK(m.key);
                return handleSuccess(`تم حفظ الملف *${fileName}*`);
            }
            else if (quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text) {
                const content = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
                fs.writeFileSync(filePath, content);
                await reactOK(m.key);
                return handleSuccess(`تم حفظ الملف *${fileName}*`);
            } 
            else return updateMessage("⚠️ رد على رسالة أو ملف.");
        }
        if (command === "ضغط") {
            const parts = param.split(" ");
            const targetName = parts[0]; 
            const outputName = parts[1] || "backup";
            const excludeStr = parts[2] || "";
            if (!targetName) return updateMessage("⚠️ الاستخدام: ضغط <الهدف> <الاسم> <استثناء1,استثناء2>");
            const targetPath = join(currentPath, targetName);
            const finalOutputName = outputName.endsWith('.tar.gz') ? outputName : outputName + '.tar.gz';
            const outputPath = join(currentPath, finalOutputName);
            if (!fs.existsSync(targetPath)) return updateMessage("⚠️ الهدف غير موجود.");
            await reactLoad(m.key);
            const excludes = excludeStr.split(",")
                .filter(Boolean)
                .map(x => `--exclude='${x}'`)
                .join(" ");
            const cmd = `cd "${currentPath}" && tar -czf "${finalOutputName}" ${excludes} "${targetName}"`;
            exec(cmd, (err) => {
                if (err) return updateMessage(`❌ فشل الضغط: ${err.message}`);
                reactOK(m.key);
                handleSuccess(`تم ضغط *${targetName}* في ملف *${finalOutputName}*`);
            });
            return;
        }
        if (command === "فك") {
            const fileName = param;
            const filePath = join(currentPath, fileName);
            if (!fs.existsSync(filePath)) return updateMessage("⚠️ الملف غير موجود.");
            if (!fileName.endsWith("tar.gz") && !fileName.endsWith(".tgz")) return updateMessage("⚠️ الصيغة غير مدعومة (يجب أن تكون .tar.gz).");
            await reactLoad(m.key);
            exec(`tar -xzf "${filePath}" -C "${currentPath}"`, (err) => {
                if (err) return updateMessage(`❌ فشل فك الضغط: ${err.message}`);
                reactOK(m.key);
                handleSuccess(`تم فك الضغط بنجاح.`);
            });
            return;
        }
        if (input === "نظف") {
            await reactLoad(m.key);
            let log = [];
            const tempDir = join(process.cwd(), "temp");
            if (fs.existsSync(tempDir)) {
                fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(join(tempDir, f)));
                log.push("🗑️ تم تنظيف Temp");
            }
            const archives = ls(currentPath).filter(f => !f.isDir && (f.name.endsWith(".tar.gz") || f.name.endsWith(".tgz")));
            archives.forEach(z => fs.unlinkSync(join(currentPath, z.name)));
            if(archives.length > 0) log.push(`🗑️ تم حذف ${archives.length} ملف أرشيف.`);
            const removeEmpty = (dir) => {
                let count = 0;
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = join(dir, item);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            if (item !== "node_modules" && item !== ".git") { 
                                count += removeEmpty(fullPath);
                            }
                        } else if (stat.size === 0) {
                            fs.unlinkSync(fullPath);
                            count++;
                        }
                    } catch {}
                }
                return count;
            };
            const emptyCount = removeEmpty(currentPath);
            if(emptyCount > 0) log.push(`🗑️ تم حذف ${emptyCount} ملف فارغ.`);
            await reactOK(m.key);
            return handleSuccess(log.length ? log.join("\n") : "✨ النظام نظيف بالفعل.");
        }
        if (command === "تحديث") {
            if (!param) return updateMessage("⚠️ اكتب اسم الفولدر المراد تحديثه.");
            waitingForTar = { folderName: param };
            await updateMessage(`📤 *تحديث الفولدر: ${param}*\n\nارسل الآن ملف بصيغة *.tar.gz* ليتم استبدال الفولدر به.`);
            return;
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
    }, 1200000);
}
export default { NovaUltra, execute };
