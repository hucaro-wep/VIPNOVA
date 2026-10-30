import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import logger from '../../utils/console.js'; 
import { loadPlugins } from '../../handlers/plugins.js'; 
const __dirname = dirname(fileURLToPath(import.meta.url));
export const NovaUltra = {
    command: "clean",
    description: "تنظيف جميع البلوجينات من التعليقات (Comments) وترتيب الكود",
    usage: ".clean",
    category: "system",
    elite: "on", 
    group: true,
    prv: false
};
const pluginsDir = join(process.cwd(), "plugins");
function getAllPluginFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllPluginFiles(filePath, fileList);
        } else {
            if (file.endsWith(".js") && !filePath.endsWith("clean.js")) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}
async function cleanFile(filePath) {
    let code = fs.readFileSync(filePath, "utf8");
    const originalSize = code.length;
    code = code.replace(/(^|\s)\/\/.*$/gm, "$1");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");
    code = code.replace(/^\s*[\r\n]/gm, "");
    code = code.trim() + "\n";
    if (code.length !== originalSize) {
        fs.writeFileSync(filePath, code, "utf8");
        return true; 
    }
    return false; 
}
export async function execute({ sock, msg, args }) {
    const jid = msg.key.remoteJid;
    await sock.sendMessage(jid, { text: "🧹 *جاري تنظيف جميع ملفات البوت...*\nالعملية قد تأخذ ثوانٍ." }, { quoted: msg });
    try {
        const files = getAllPluginFiles(pluginsDir);
        let cleanedCount = 0;
        let totalFiles = files.length;
        for (const file of files) {
            const wasCleaned = await cleanFile(file);
            if (wasCleaned) cleanedCount++;
        }
        try { await loadPlugins(); } catch (e) { }
        const resultText = `✅ *تمت عملية التنظيف بنجاح!*
📂 *الملفات المفحوصة:* ${totalFiles}
✨ *الملفات التي تم تنظيفها:* ${cleanedCount}
تم حذف جميع التعليقات (Comments) والأسطر الفارغة الزائدة.`;
        return sock.sendMessage(jid, { text: resultText }, { quoted: msg });
    } catch (err) {
        console.error(err);
        return sock.sendMessage(jid, { text: "❌ حدث خطأ أثناء التنظيف، راجع الكونسول." }, { quoted: msg });
    }
}
export default { NovaUltra, execute };
