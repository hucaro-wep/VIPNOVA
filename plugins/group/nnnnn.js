import fs from "fs";
export const NovaUltra = {
    command: ["منشنات"],
    description: "التقاط المنشنات والردود على المستخدم",
    elite: "off",
    group: true,
    prv: false,
    lock: "off",
};
const sleep = ms => new Promise(res => setTimeout(res, ms));
const trackers = {}; 
export async function execute({sock, msg, args, BIDS}) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
    if (text.startsWith(".منشنات")) {
        trackers[jid] = {
            user: sender,
            messages: [],
            active: true
        };
        await sock.sendMessage(jid, {
            text: "👁️ *بدأت مراقبة المنشنات…*\nاكتب: وريني لعرض الرسائل."
        }, { quoted: msg });
        const listener = async ({ messages }) => {
            const m = messages[0];
            if (!m || !trackers[jid] || !trackers[jid].active) return;
            if (m.key.remoteJid !== jid) return;
            const body =
                m.message?.conversation ||
                m.message?.extendedTextMessage?.text ||
                "";
            const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const replyTo = m.message?.extendedTextMessage?.contextInfo?.participant;
            if (mentions.includes(trackers[jid].user) || replyTo === trackers[jid].user) {
                trackers[jid].messages.push(m);
            }
            if (body.trim() === "وريني") {
                if (trackers[jid].messages.length === 0) {
                    await sock.sendMessage(jid, {
                        text: "❌ لا يوجد أي منشنات إلى الآن."
                    }, { quoted: m });
                    return;
                }
                for (const saved of trackers[jid].messages) {
                    await sock.sendMessage(jid, { text: "." }, { quoted: saved });
                    await sleep(250);
                }
            }
        };
        sock.ev.on("messages.upsert", listener);
        setTimeout(() => {
            if (trackers[jid] && trackers[jid].active) {
                trackers[jid].active = false;
                sock.ev.off("messages.upsert", listener);
                console.log("⏱ Tracking stopped automatically.");
            }
        }, 10 * 60 * 1000); 
        return;
    }
}
export default { NovaUltra, execute };
