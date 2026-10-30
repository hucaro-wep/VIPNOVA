import fs from "fs";

import { join } from "path";

import { spawn } from "child_process";

import { performance } from "perf_hooks";

const dataDir = join(process.cwd(), "nova", "data");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const ytDlpPath = join(dataDir, "yt-dlp");

export let downloadConfig = {

  progress: {

    status: `on`

  },

  format: {

    status: `on`

  }

};

async function safeSendMessage(sock, jid, message, options = {}) {

  try {

    await sock.sendMessage(jid, message, options);

  } catch (err) {

    if (err?.data === 429) await sock.sendMessage(jid, message, options);

  }

}

async function execute({ sock, msg, args }) {

  const jid = msg.key.remoteJid;

  try {

    let commandText =

      msg.message?.extendedTextMessage?.text ||

      msg.message?.conversation ||

      "";

    if (commandText && commandText.startsWith(".تحميل")) {

      const parts = commandText.split(" ");

      if (parts.length < 3) {

        return await safeSendMessage(sock, jid, { text: "❌ الاستخدام: .تحميل [فيديو|صوت] [الرابط]" }, { quoted: msg });

      }

      args = [parts[1].toLowerCase(), parts.slice(2).join(" ").trim()];

    }

    if (!args || args.length < 2) {

      return await safeSendMessage(sock, jid, { text: "❌ الاستخدام: .تحميل [فيديو|صوت] [الرابط]" }, { quoted: msg });

    }

    const [format, url] = [args[0].toLowerCase(), args[1].trim()];

    if (format !== "فيديو" && format !== "صوت") {

      return await safeSendMessage(sock, jid, { text: "❌ يجب تحديد نوع التحميل (فيديو أو صوت)." }, { quoted: msg });

    }

    if (!url.startsWith("http")) {

      return await safeSendMessage(sock, jid, { text: "❌ الرابط غير صالح." }, { quoted: msg });

    }

    if (!fs.existsSync(ytDlpPath)) {

      return await safeSendMessage(sock, jid, { text: "❌ أداة yt-dlp غير موجودة في المسار المحدد." }, { quoted: msg });

    }

    const tempDir = join(process.cwd(), "temp");

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const timestamp = Date.now();

    const isVideo = format === "فيديو";

    const fileExtension = isVideo ? "mp4" : "mp3";

    const outputFilePath = join(tempDir, `${timestamp}.${fileExtension}`);

    const ytdlpArgs = isVideo

      ? ["-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", "-o", outputFilePath, "--progress", "--no-warnings", "--no-continue", url]

      : ["--extract-audio", "--audio-format", "mp3", "-o", outputFilePath, "--progress", "--no-warnings", "--no-continue", url];

    const loadingMsg = await safeSendMessage(sock, jid, { text: "⏳ جاري التحميل، يرجى الانتظار..." }, { quoted: msg });

    const ytdlp = spawn(ytDlpPath, ytdlpArgs);

    let lastUpdateTime = 0;

    let lastPercentage = -1;

    let errorOutput = "";

    ytdlp.stderr.on("data", (data) => {

      const output = data.toString();

      errorOutput += output;

      const match = output.match(/\[download\]\s+([\d\.]+)%/);

      if (match) {

        const percent = Math.floor(parseFloat(match[1]));

        const now = performance.now();

        if (percent > lastPercentage && (percent % 10 === 0 || now - lastUpdateTime > 2000)) {

          lastPercentage = percent;

          lastUpdateTime = now;

          safeSendMessage(sock, jid, { text: `⏳ جاري التحميل... ${percent}%` }).catch(() => {});

        }

      }

    });

    const cleanup = () => {

      if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);

    };

    ytdlp.on("close", async () => {

      if (fs.existsSync(outputFilePath) && fs.statSync(outputFilePath).size > 0) {

        await safeSendMessage(sock, jid, { text: "✅ تم التحميل بنجاح! جاري الإرسال..." });

        try {

          if (isVideo) {

            await sock.sendMessage(jid, { video: { url: outputFilePath }, caption: "🎥 تم تحميل الفيديو بنجاح" }, { quoted: msg });

          } else {

            await sock.sendMessage(jid, { audio: { url: outputFilePath }, mimetype: "audio/mpeg" }, { quoted: msg });

          }

        } catch {

          await safeSendMessage(sock, jid, { text: "❌ خطأ أثناء إرسال الملف." });

        } finally {

          cleanup();

        }

      } else {

        await safeSendMessage(sock, jid, { text: "❌ فشل تحميل الملف." });

        console.error("yt-dlp error:", errorOutput);

        cleanup();

      }

    });

    ytdlp.on("error", async (err) => {

      console.error("❌ فشل تشغيل yt-dlp:", err);

      await safeSendMessage(sock, jid, { text: "❌ حدث خطأ عند بدء التحميل." });

    });

  } catch (err) {

    console.error("❌ خطأ عام:", err);

    await safeSendMessage(sock, jid, { text: `❌ حدث خطأ غير متوقع.\n${err.message}` }, { quoted: msg });

  }

}

export const NovaUltra = {

  command: "تحميل",

  description: "تحميل فيديو أو صوت مع عرض نسبة التقدم",

  elite: "off",

  group: true,

  prv: false,

  lock: "off"

};

export default { NovaUltra, execute };