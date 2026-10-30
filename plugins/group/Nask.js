import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
const NovaUltra = {
    command: "نسخة",
    description: "مدير نسخ المجموعات",
    usage: ".نسخة",
    category: "group",
    elite: "on",
    lock: "off",
    group: true,
    prv: false,
    nova: "on"
};
const rootDir = path.join("tmp", "copy-group");
const sessions = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ensureDir = d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true });
const ensureFile = (f, c = "{}") => !fs.existsSync(f) && fs.writeFileSync(f, c);
async function execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;
    const owner = msg.key.participant || chatId;
    ensureDir(rootDir);
    const _send = sock.sendMessage;
    sock.sendMessage = async (jid, content, options = {}) => {
        if (NovaUltra.nova === "on" && content.text) {
            const m = generateWAMessageFromContent(
                jid,
                { extendedTextMessage: { text: content.text } },
                { userJid: sock.user.id, quoted: options.quoted || msg }
            );
            return sock.relayMessage(jid, m.message, { messageId: m.key.id });
        }
        return _send.call(sock, jid, content, options);
    };
    const sent = await sock.sendMessage(chatId, {
        text: "⌛ تحميل مدير النسخ..."
    }, { quoted: msg });
    const botKey = sent.key;
    const updateMessage = text =>
        sock.sendMessage(chatId, { text, edit: botKey });
    const showUI = async () => {
        const list = fs.readdirSync(rootDir).filter(d =>
            fs.statSync(path.join(rootDir, d)).isDirectory()
        );
        const txt = `
✧━── ❝ 𝐂𝐨𝐩𝐲 𝐌𝐚𝐧𝐚𝐠𝐞𝐫 ❞ ──━✧
📁 *النسخ المحفوظة:*
${list.map(n => `📦 ${n}`).join("\n") || "❌ لا توجد نسخ"}
✧━── ❝ 𝐎𝐩𝐭𝐢𝐨𝐧𝐬 ❞ ──━✧
📥 نسخ <اسم>
📤 لصق <اسم>
🗑️ حذف <اسم>
📂 حافظة
🔙 رجوع
`;
        await updateMessage(txt);
    };
    sessions.set(owner, { updateMessage, showUI });
    await showUI();
    const listener = async ({ messages }) => {
        const m = messages[0];
        if (!m?.message) return;
        if ((m.key.participant || m.key.remoteJid) !== owner) return;
        if (!sessions.has(owner)) return;
        const text =
            m.message.conversation ||
            m.message.extendedTextMessage?.text;
        if (!text) return;
        const input = text.trim();
        const [cmd, name] = input.split(/\s+/);
        if (input === "رجوع") {
            await showUI();
            return;
        }
        if (input === "حافظة") {
            await showUI();
            return;
        }
        if (cmd === "نسخ" && name) {
            const savePath = path.join(rootDir, name);
            ensureDir(savePath);
            const meta = await sock.groupMetadata(chatId);
            const data = {
                subject: meta.subject,
                description: meta.desc || "",
                settings: {
                    announce: !!meta.announce,
                    restrict: !!meta.restrict
                }
            };
            ensureFile(
                path.join(savePath, "group.json"),
                JSON.stringify(data, null, 2)
            );
            try {
                const pfp = await sock.profilePictureUrl(chatId, "image");
                const res = await fetch(pfp);
                fs.writeFileSync(
                    path.join(savePath, `${name}.jpg`),
                    Buffer.from(await res.arrayBuffer())
                );
            } catch {}
            await updateMessage(`✅ تم حفظ النسخة باسم: ${name}`);
            await sleep(1200);
            return showUI();
        }
        if (cmd === "لصق" && name) {
            const dir = path.join(rootDir, name);
            const json = path.join(dir, "group.json");
            if (!fs.existsSync(json))
                return updateMessage("❌ النسخة غير موجودة.");
            const data = JSON.parse(fs.readFileSync(json));
            await sock.groupUpdateSubject(chatId, data.subject || "");
            await sock.groupUpdateDescription(chatId, data.description || "");
            await sock.groupSettingUpdate(
                chatId,
                data.settings?.announce ? "announcement" : "not_announcement"
            );
            await sock.groupSettingUpdate(
                chatId,
                data.settings?.restrict ? "locked" : "unlocked"
            );
            const img = path.join(dir, `${name}.jpg`);
            if (fs.existsSync(img))
                await sock.updateProfilePicture(chatId, { url: img });
            await updateMessage(`📤 تم لصق النسخة: ${name}`);
            await sleep(1200);
            return showUI();
        }
        if (cmd === "حذف" && name) {
            const dir = path.join(rootDir, name);
            fs.rmSync(dir, { recursive: true, force: true });
            await updateMessage(`🗑️ تم حذف النسخة: ${name}`);
            await sleep(1200);
            return showUI();
        }
    };
    sock.ev.off("messages.upsert", listener);
    sock.ev.on("messages.upsert", listener);
    setTimeout(() => sock.ev.off("messages.upsert", listener), 180000);
}
export default { NovaUltra, execute };
