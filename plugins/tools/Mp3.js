import fs from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";

const dataDir = join(process.cwd(), "nova", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const tempDir = join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

async function safeSendMessage(sock, jid, message, options = {}) {
  try { 
    await sock.sendMessage(jid, message, options); 
  } catch (err) { 
    if (err?.data === 429) await sock.sendMessage(jid, message, options); 
  }
}

/**
 * يحول رسالة الميديا إلى Buffer
 * @param {Object} videoMessage - كائن رسالة الفيديو فقط وليس الرسالة الكاملة
 */
async function bufferFromMessage(videoMessage) {
  if (!videoMessage || !videoMessage.mediaKey) return null;

  try {
    const contentStream = await downloadContentFromMessage(videoMessage, "video");
    const buffer = [];
    for await (const chunk of contentStream) {
      buffer.push(chunk);
    }
    return Buffer.concat(buffer);
  } catch (error) {
    console.error("❌ Error downloading media:", error);
    return null;
  }
}

async function execute({ sock, msg }) {
  const jid = msg.key.remoteJid;

  try {
    let videoBuffer = null;

    // 1️⃣ تحديد نوع الفيديو (سواء كان رد أو رسالة مباشرة)
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (quoted && quoted.videoMessage) {
      // التحميل من الرد
      videoBuffer = await bufferFromMessage(quoted.videoMessage);
    } else if (msg.message?.videoMessage) {
      // التحميل من الرسالة الأصلية
      videoBuffer = await bufferFromMessage(msg.message.videoMessage);
    }

    // إذا فشل التحميل أو لم يكن هناك فيديو
    if (!videoBuffer) {
      return await safeSendMessage(sock, jid, { 
        text: "❌ فشل الوصول للفيديو. تأكد أنه فيديو صالح وغير قديم جداً." 
      }, { quoted: msg });
    }

    const videoPath = join(tempDir, `video_${Date.now()}.mp4`);
    fs.writeFileSync(videoPath, videoBuffer);

    const outputFilePath = join(tempDir, `${Date.now()}.mp3`);
    const ffmpegArgs = [
      "-i", videoPath,
      "-vn",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "192k",
      outputFilePath
    ];

    await safeSendMessage(sock, jid, { text: "⏳ جاري تحويل الفيديو إلى صوت..." }, { quoted: msg });

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    let errorOutput = "";

    ffmpeg.stderr.on("data", (data) => { errorOutput += data.toString(); });

    ffmpeg.on("close", async (code) => {
      // حذف الفيديو المؤقت فوراً
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

      if (code === 0 && fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 0) {
        try {
          await sock.sendMessage(jid, { 
            audio: { url: outputFilePath }, 
            mimetype: "audio/mpeg",
            fileName: "converted_audio.mp3"
          }, { quoted: msg });
        } catch (err) {
          await safeSendMessage(sock, jid, { text: "❌ خطأ أثناء إرسال ملف الصوت." });
        } finally {
          if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
        }
      } else {
        await safeSendMessage(sock, jid, { text: "❌ فشل تحويل الفيديو. قد يكون الملف تالفاً." });
        console.error("FFmpeg error:", errorOutput);
      }
    });

    ffmpeg.on("error", async (err) => {
      console.error("❌ فشل تشغيل ffmpeg:", err);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      await safeSendMessage(sock, jid, { text: "❌ حدث خطأ تقني في محرك التحويل." });
    });

  } catch (err) {
    console.error("❌ خطأ عام:", err);
    await safeSendMessage(sock, jid, { text: `❌ حدث خطأ غير متوقع.\n${err.message}` }, { quoted: msg });
  }
}

export const NovaUltra = {
  command: "تحويل",
  description: "تحويل أي فيديو إلى صوت MP3 من الرد أو من الفيديو المرفق",
  elite: "off",
  group: true,
  prv: false,
  lock: "off"
};

export default { NovaUltra, execute };
