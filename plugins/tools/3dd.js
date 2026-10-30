import path from "path";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
import fs from "fs";
import { join } from "path";
import { jidDecode } from "@whiskeysockets/baileys";
import { getUniqueKicked } from '../../nova/dataUtils.js';
const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';
async function execute({sock, msg, args, BIDS,sender}) {
    
    const jid = msg.key.remoteJid;
    try {
        const kickedSet = getUniqueKicked();
        const total = kickedSet.size;
        const levels = [
            { threshold: 0, emoji: '🔻' },
            { threshold: 50, emoji: '🔵' },
            { threshold: 100, emoji: '🟠' },
            { threshold: 200, emoji: '🟢' },
            { threshold: 400, emoji: '💲' },
            { threshold: 800, emoji: '🟣' },
            { threshold: 1600, emoji: '🟤' },
            { threshold: 3200, emoji: '🔴' },
            { threshold: 6400, emoji: '⚫' },
            { threshold: 12800, emoji: '⚪' },
            { threshold: 25600, emoji: '🔆' },
            { threshold: 51200, emoji: '⚜️' },
            { threshold: 102400, emoji: '🔱' },
            { threshold: 204800, emoji: '✴️' },
            { threshold: 409600, emoji: '☢️' },
            { threshold: 819200, emoji: '💠' },
            { threshold: 1638400, emoji: '♾️' }
        ];
        let level = 0;
        let emoji = '🔶';
        for (let i = levels.length - 1; i >= 0; i--) {
            if (total >= levels[i].threshold) {
                level = i;
                emoji = levels[i].emoji;
                break;
            }
        }
        const message = `المستوى : ${level} ${emoji}\nعدد التصفية : ${total} 🔹`;
        await sock.sendMessage(jid, {
            text: message
        }, { quoted: msg });
    } catch (err) {
        console.error("❌ خطأ أثناء تنفيذ أمر العدد:", err);
        await sock.sendMessage(jid, {
            text: `❌ حدث خطأ أثناء تنفيذ الأمر:\n${err.message || err}`
        });
    }
}
export const NovaUltra = {
command: "عدد",
    description: "يعرض عدد الأعضاء الذين تم طردهم ومستوى التصفية",
    elite: "off", 
    group: false,
    prv: false,
    lock: "off"
};
export default { NovaUltra, execute };