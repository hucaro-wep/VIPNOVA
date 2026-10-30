import { sessionCreator } from "./functions/sessionCreatorFunction.js";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';

import fs from 'fs-extra';

import pino from 'pino';

import path from 'path';

import chalk from 'chalk';

import readline from 'readline';

import logger from './utils/console.js';

import { fileURLToPath, pathToFileURL } from 'url';

import crypto from 'crypto';

import os from 'os';

import config from './nova/config.js';

// === استيراد المعالج الصحيح ===

import { handleMessages, initializePlugins } from "./handlers/messages.js";

import { handleAntiCall } from "./handlers/antiCallCore.js";

// === استيراد نظام النخبة ===

import elitePro from './handlers/elite-pro.js';

// === استيراد نظام الحماية (تأكد أن المسار صحيح) ===

import protectionSystem from './plugins/event/protection_bots.js'; 

import { play, playError, playLogout } from './utils/sound.js';

import delay from 'delay';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// ===== PATHS =====

const sessionDir = path.join(__dirname, 'ملف_الاتصال');

const passwordFile = path.join(sessionDir, 'Password.txt'); 

const errorFilePath = path.join(__dirname, 'node_modules', 'axios', 'errorMsg.txt');

// ===== SECURE ENCRYPTION HANDLER =====

const SECRET_KEY = crypto.createHash('sha256').update('jnd_secure_session_v1').digest();

function encryptText(text) {

  try {

    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');

    encrypted += cipher.final('base64');

    return iv.toString('base64') + ':' + encrypted;

  } catch (e) { return null; }

}

function decryptTextSafe(text) {

  try {

    const index = text.indexOf(':');

    if (index === -1) return null;

    const ivBase64 = text.slice(0, index);

    const data = text.slice(index + 1);

    const iv = Buffer.from(ivBase64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);

    let decrypted = decipher.update(data, 'base64', 'utf8');

    decrypted += decipher.final('utf8');

    return decrypted;

  } catch (err) {

    return null;

  }

}

if (fs.existsSync(errorFilePath)) {

  try {

    const content = fs.readFileSync(errorFilePath, 'utf8').trim();

    if (!/^[A-Za-z0-9+/]{20,}={0,2}:[A-Za-z0-9+/]+={0,2}$/.test(content)) {

      fs.writeFileSync(errorFilePath, encryptText(content));

    }

  } catch (err) {}

}

const question = (text) =>

  new Promise((resolve) => {

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.question(text, (answer) => { rl.close(); resolve(answer); });

  });

// ========= SYSTEM FINGERPRINT =========

function getSystemFingerprint() {

    const sysData = `${os.hostname()}_${process.cwd()}`;

    return crypto.createHash('md5').update(sysData).digest('hex');

}

// ========= THEME LOADER =========

async function loadTheme() {

  try {

    const settingsPath = path.join(__dirname, './nova/themes/settings.txt');

    if (!fs.existsSync(settingsPath)) throw new Error('settings.txt not found');

    const folderName = fs.readFileSync(settingsPath, 'utf-8').trim().replace(/[\[\]]/g, '');

    const themeFolder = path.join(__dirname, './nova/themes', folderName);

    const jsFiles = (await fs.readdir(themeFolder)).filter(f => f.endsWith('.js'));

    const asciiArtPath = path.join(themeFolder, jsFiles[0]);

    const themeArt = await import(pathToFileURL(asciiArtPath).href);

    const mp3Files = (await fs.readdir(themeFolder)).filter(f => f.endsWith('.mp3'));

    const soundPath = path.join(themeFolder, mp3Files[0]);

    const themeContent = fs.readFileSync(asciiArtPath, 'utf-8');

    const match = themeContent.match(/chalk\.hex\(['"](#(?:[0-9A-Fa-f]{6}))['"]\)/);

    return { asciiArt: themeArt.asciiArt || '', soundPath, themeColor: match ? match[1] : 'FF6BFF' };

  } catch (err) {

    return { asciiArt: '', soundPath: '', themeColor: 'FF6BFF' };

  }

}
async function loadChildSessions() {

  const sessionsRoot = path.join(__dirname, "sessions");

  if (!fs.existsSync(sessionsRoot)) return;

  const folders = await fs.readdir(sessionsRoot);

  for (const name of folders) {

    const sessionPath = path.join(sessionsRoot, name);

    const credsPath = path.join(sessionPath, "creds.json");

    if (!fs.existsSync(credsPath)) continue;

    sessionCreator(name, {

  onReady: (sock) => {

    if (!global.activeSessions) {

      global.activeSessions = {};

    }

    global.activeSessions[name] = sock;

  }

})

.catch(err => {

  console.error(`❌ Session error [${name}]:`, err.message);

});

  }

}

// ========== BOT STARTUP ==========

export async function startBot() {
  try {
    const { asciiArt, soundPath, themeColor } = await loadTheme();
    if (asciiArt) console.log(asciiArt);
    if (soundPath) play(soundPath);

    await fs.ensureDir(sessionDir);

    // ===== LOAD CHILD SESSIONS (البوتات الفرعية) =====
    async function loadChildSessions() {
      const sessionsRoot = path.join(__dirname, "sessions");
      if (!fs.existsSync(sessionsRoot)) return;

      const folders = await fs.readdir(sessionsRoot);
      for (const name of folders) {
        const sessionPath = path.join(sessionsRoot, name);
        const credsPath = path.join(sessionPath, "creds.json");
        if (!fs.existsSync(credsPath)) continue;

        sessionCreator(name, {
          onReady: (sock) => {
            if (!global.activeSessions) global.activeSessions = {};
            global.activeSessions[name] = sock;
          }
        }).catch(err => {
          console.error(`❌ Session error [${name}]:`, err.message);
        });
      }
    }

    await loadChildSessions(); // تنفيذ تحميل البوتات الفرعية

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const hardLogout = async () => {
      console.log(chalk.red.bold('\n☢️  INITIATING SELF-DESTRUCT SEQUENCE...'));
      try {
        const tempSock = makeWASocket({
          auth: state,
          version,
          printQRInTerminal: false,
          logger: pino({ level: 'silent' })
        });
        await delay(1000);
        await tempSock.logout();
        console.log(chalk.green('✅ Session revoked from WhatsApp servers.'));
      } catch (e) {
        console.log(chalk.yellow('⚠️ Could not revoke server session.'));
      }
      await fs.remove(sessionDir);
      console.log(chalk.red.bold('🗑️  Local session files destroyed.'));
      process.exit(1);
    };

    // ===== SECURITY CHECK =====

    if (state.creds && state.creds.registered) {

        let storedData = null;

        let isCorrupt = false;

        if (fs.existsSync(passwordFile)) {

            try {

                const encryptedContent = fs.readFileSync(passwordFile, 'utf8');

                const decryptedJson = decryptTextSafe(encryptedContent);

                if (decryptedJson) {

                    storedData = JSON.parse(decryptedJson);

                } else {

                    isCorrupt = true;

                }

            } catch(e) {

                isCorrupt = true;

            }

        } else {

            isCorrupt = true;

        }

        if (isCorrupt) {

            console.log(chalk.red.bold('\n⚠️  SECURITY ERROR: Password file missing or corrupt!'));

            console.log(chalk.yellow('🔄 Performing hard reset for security...\n'));

            await hardLogout();

        }

        const currentFingerprint = getSystemFingerprint();

        if (storedData && storedData.fingerprint !== currentFingerprint) {

            console.log(chalk.red.bold('\n⚠️  SECURITY ALERT: Session moved to a new device!'));

            console.log(chalk.gray('Forget password? Send "reset" to destroy session.')); 

            const bgColor = `#${themeColor}`;

            let attempts = 0;

            let authenticated = false;

            while (attempts < 3) {

                const rawInput = await question(chalk.bgHex(bgColor).black(` PASSWORD SESSION (${3 - attempts}): `));

                const inputPass = rawInput.trim();

                const inputUpper = inputPass.toUpperCase();

                if (inputUpper === storedData.password) {

                    authenticated = true;

                    console.log(chalk.green.bold('✅ Access Granted. Updating Device Fingerprint...'));

                    

                    const newData = JSON.stringify({ 

                        password: storedData.password, 

                        fingerprint: currentFingerprint 

                    });

                    fs.writeFileSync(passwordFile, encryptText(newData));

                    await delay(1000);

                    break;

                } 

                else if (inputPass.toLowerCase() === 'reset') {

                    console.log(chalk.yellow.bold('\n🔄 Reset command received. Destroying session...'));

                    await hardLogout();

                }

                else {

                    console.log(chalk.red.bold('❌ Access Denied.'));

                    attempts++;

                }

            }

            if (!authenticated) {

                console.log(chalk.bgRed.white.bold('\n ⛔ FATAL ERROR: Too many failed attempts. '));

                console.log(chalk.red.bold(' ☢️  REVOKING WHATSAPP SESSION AND DELETING FILES... '));

                await hardLogout();

            }

        }

    } else {

        if (fs.existsSync(passwordFile)) {

            fs.unlinkSync(passwordFile);

        }

    }

    // ===== SOCKET INITIALIZATION =====

    const sock = makeWASocket({

      auth: state,

      version,

      printQRInTerminal: false,

      browser: ['MacOS', 'Chrome', '1.0.0'],

      logger: pino({ level: 'silent' }),

      markOnlineOnConnect: true,

      syncFullHistory: false,

    });

    // ===== PAIRING MODE =====

    if (!sock.authState.creds.registered) {

      const bgColor = `#${themeColor}`;

      let phoneNumber;

      let pairingCode;

      if (config?.pairing?.phone) {

        phoneNumber = config.pairing.phone.replace(/[^0-9]/g, '');

      } else {

        while (true) {

          const input = await question(chalk.bgHex(bgColor).black(' Phone Number : '));

          if (/^[0-9\s+\-\(\)]+$/.test(input) && input.trim().length > 0) {

            const cleanNumber = input.replace(/[^0-9]/g, '');

            if (cleanNumber.length > 6) {

                phoneNumber = cleanNumber;

                break;

            } else {

                console.log(chalk.red.bold("❌ Error: Phone number is too short."));

            }

          } else {

            console.log(chalk.red.bold("❌ Error: Please enter digits only."));

          }

        }

      }

      if (config?.pairing?.code) {

        pairingCode = config.pairing.code.toUpperCase().trim();

      } else {

        while (true) {

          const rawInput = await question(chalk.bgHex(bgColor).black(' Password (8 chars): '));

          const input = rawInput.trim();

          if (input.length !== 8) {

            console.log(chalk.red.bold(`❌ Error: Password must be 8 chars.`));

            continue;

          }

          const allowedRegex = /^[a-zA-Z0-9\u0600-\u06FF\u0400-\u04FF]+$/; 

          if (!allowedRegex.test(input)) {

            console.log(chalk.red.bold("❌ Error: Invalid characters."));

            continue;

          }

          pairingCode = input.toUpperCase();

          break;

        }

      }

      try {

        await delay(1200);

        const code = await sock.requestPairingCode(phoneNumber, pairingCode);

        console.log('\n────────── Pairing Information ──────────');

        console.log(`Phone Number : ${phoneNumber}`);

        console.log(`Pairing Code : ${code}`);

        console.log('─────────────────────────────────────────\n');

        

        const securityData = JSON.stringify({

            password: pairingCode,

            fingerprint: getSystemFingerprint()

        });

        

        await fs.writeFile(passwordFile, encryptText(securityData));

      } catch (err) {

        console.log("\nERROR : CONNECTION FAILED\n");

        playError();

        process.exit(1);

      }

    }

    // ===== CONNECTION EVENTS =====

    sock.ev.on('connection.update', async (update) => {

      const { connection, lastDisconnect } = update;

      if (connection === 'connecting') logger.info('Connecting to WhatsApp...');

      if (connection === 'open') {

        logger.success(`CONNECTED! USER ID: ${sock.user.id}`);

        await initializePlugins();

        try {

            const botJid = jidNormalizedUser(sock.user.id);

            const isBotElite = await elitePro.isElite({ sock, id: botJid });

            if (!isBotElite) {

                console.log(chalk.yellow(`⚠️ Adding Bot (${botJid}) to Elite...`));

                await elitePro.addElite({ sock, ids: [botJid] });

            }

        } catch (eliteErr) {

            console.error(chalk.red("Error in Auto-Elite logic"), eliteErr);

        }

      }

      if (connection === 'close') {

        const statusCode = lastDisconnect?.error?.output?.statusCode;

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        const isBanned = statusCode === DisconnectReason.forbidden;

        if (statusCode === 408) {

            playError();

            console.log(chalk.red.bold('\n❌ INTERNET CONNECTION LOST (408)'));

            process.exit(1);

        }

        if (statusCode === 440) {

            playError();

            console.log(chalk.magenta.bold('\n⚠️ SECURITY ALERT (440): Session conflict.'));

        }

        if (isBanned) {

          playError();

          console.log(chalk.red.bold('\n🚫 ACCOUNT BANNED! Send "3" to reset.'));

          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

          rl.question('', async (answer) => {

            if (answer.trim() === '3') {

              rl.close();

              sock.end(undefined);

              await delay(1000);

              await fs.remove(sessionDir);

              process.send?.('reset');

              process.exit();

            } else { process.exit(0); }

          });

          return;

        }

        if (isLoggedOut) {

          playLogout();

          console.log(chalk.red.bold('\nLogged out. Send "2" to reset.'));

          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

          rl.question('', async (answer) => {

            if (answer.trim() === '2') {

              rl.close();

              sock.end(undefined);

              await delay(1000);

              await fs.remove(sessionDir);

              process.send?.('reset');

              process.exit();

            } else { process.exit(0); }

          });

          return;

        }

        console.log(chalk.yellow(`Connection closed (${statusCode}). Reconnecting...`));

        setTimeout(startBot, 3000);

      }

    });

    // ===== MESSAGE HANDLER =====

    sock.ev.on('messages.upsert', async (m) => {

      await handleMessages(sock, m);

    });

  
   // ===== ANTI-CALL HANDLER =====

    sock.ev.on('call', async (callEvent) => {

     await handleAntiCall(sock, callEvent);

   });


  sock.ev.on('creds.update', saveCreds);


    // ===== 🛡️ نظام الحماية والمراقبة (مع طباعة الأخطاء) =====

    sock.ev.on('group-participants.update', async (update) => {

        try {

            await protectionSystem.monitorGroupUpdate(sock, update);

        } catch (err) {

            // طباعة أي خطأ غير متوقع يحدث في الدالة الرئيسية

            console.error('❌ CRITICAL ERROR in Protection System Monitor:', err);

        }

    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {

    console.error('Startup Error:', err);

    setTimeout(startBot, 3000);

  }

}

startBot();

