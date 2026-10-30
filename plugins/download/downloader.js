import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";

const ffmpegPath = "/usr/bin/ffmpeg"; 
const API_KEY = "xshadowzax"; 

// دالة لجلب البيانات مع فحص الأخطاء بشكل معمق
async function getJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    // إذا كان الرد فارغاً أو ليس JSON سيذهب للـ catch مباشرة
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    // طباعة الرد الفعلي في الكونسول لمعرفة ما الذي ترسله الـ API (صفحة خطأ مثلاً)
                    console.log("⚠️ Full API Response:", data);
                    reject("الـ API أرسلت رداً غير صالح (ليست JSON)");
                }
            });
        }).on("error", err => reject(`خطأ في الاتصال: ${err.message}`));
    });
}

function downloadFile(url, out) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(out);
        https.get(url, res => {
            if (res.statusCode !== 200) return reject(`فشل التحميل: كود ${res.statusCode}`);
            res.pipe(file);
            file.on("finish", () => { file.close(); resolve(); });
        }).on("error", reject);
    });
}

// دالة التحويل السريع
function convertMedia(input, output, isVideo) {
    const args = isVideo 
        ? ["-y", "-i", input, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", output]
        : ["-y", "-i", input, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", output];
    
    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, args);
        ff.on("close", c => c === 0 ? resolve() : reject("خطأ في معالجة الملف عبر FFmpeg"));
    });
}

export default {
    command: ["تحميل", "dl"],
    category: "download",
    async execute({ sock, msg, args }) {
        const jid = msg.chat || msg.key.remoteJid;
        const type = args[0]; 
        const isVideo = type === "فيديو";
        
        if (!type || (!isVideo && type !== "صوت")) {
            return sock.sendMessage(jid, { text: "⚠️ استخدم: .تحميل فيديو [الرابط] أو .تحميل صوت [الرابط]" });
        }

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
        const urls = (text + " " + quotedText).match(/https?:\/\/[^\s]+/gi) || [];
        
        if (!urls[0]) return sock.sendMessage(jid, { text: "❌ أين الرابط؟" });

        const loading = await sock.sendMessage(jid, { text: "⏳ جاري الفحص..." });
        const tempDir = path.join(process.cwd(), "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const raw = path.join(tempDir, `raw_${Date.now()}`);
        const out = path.join(tempDir, `out_${Date.now()}.${isVideo ? "mp4" : "mp3"}`);

        try {
            // ملاحظة: قمت هنا بتعديل منطق الـ API ليكون أكثر مرونة
            let apiUrl = `https://api.acsd-x.com/api/download/${urls[0].includes("instagr") ? "ig" : "yt"}?url=${encodeURIComponent(urls[0])}&apikey=${API_KEY}`;
            
            const res = await getJson(apiUrl);
            
            // محاولة استخراج الرابط من كل المفاتيح الممكنة (تحديث لمواجهة تغيير الـ API)
            const downloadUrl = res?.data?.url || res?.result?.url || res?.url || res?.download || res?.result?.download;

            if (!downloadUrl) throw "الـ API لم توفر رابط تحميل مباشر. قد يكون الفيديو خاصاً أو محمياً.";

            await sock.sendMessage(jid, { text: "📥 جاري تحميل الملف من السيرفر..." }, { edit: loading.key });
            await downloadFile(downloadUrl, raw);

            await sock.sendMessage(jid, { text: "⚙️ جاري المعالجة والتحويل..." }, { edit: loading.key });
            await convertMedia(raw, out, isVideo);

            if (isVideo) {
                await sock.sendMessage(jid, { video: { url: out }, caption: "✅ تم بنجاح" }, { quoted: msg });
            } else {
                await sock.sendMessage(jid, { audio: { url: out }, mimetype: "audio/mpeg" }, { quoted: msg });
            }

            await sock.sendMessage(jid, { text: "✅ اكتملت العملية" }, { edit: loading.key });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(jid, { text: `❌ فشل: ${e}` }, { edit: loading.key });
        } finally {
            if (fs.existsSync(raw)) fs.unlinkSync(raw);
            if (fs.existsSync(out)) fs.unlinkSync(out);
        }
    }
};
