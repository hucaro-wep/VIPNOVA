import makeWASocket, {

  useMultiFileAuthState,

  DisconnectReason,

  fetchLatestBaileysVersion

} from "@whiskeysockets/baileys";

import pino from "pino";

import fs from "fs-extra";

import path from "path";

import { handleMessages } from "../handlers/messages.js";

const delay = ms => new Promise(r => setTimeout(r, ms));

/**

 * 🧠 VIP SESSION STORE (داخلي)

 */

const sessionStore = {};

export async function sessionCreator(

  sessionName,

  phoneNumber,

  parentSock,

  msg,

  updateMessage // optional

) {

  const sessionPath = path.join("sessions", sessionName);

  await fs.ensureDir(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({

    version,

    auth: state,

    logger: pino({ level: "silent" }),

    markOnlineOnConnect: true

  });

  sock.ev.on("creds.update", saveCreds);

  // 🟡 سجل الجلسة

  sessionStore[sessionName] = {

    cancelled: false,

    sock

  };

  const isCancelled = () =>

    sessionStore[sessionName]?.cancelled === true;

  /**

   * 🔑 PAIRING CODE

   */

  if (!state.creds.registered) {

    await delay(1500);

    if (isCancelled()) {

      sock.end();

      return;

    }

    const cleanNumber = phoneNumber.replace(/\D/g, "");

    const code = await sock.requestPairingCode(cleanNumber);

    if (updateMessage) {

      await updateMessage(

`╭─〔 🔑 VIP PAIRING 〕

│ Session : ${sessionName}

│ Number  : ${cleanNumber}

│

│ Code :

│ ${code}

│

│ WhatsApp → Linked Devices

╰──────────────`

      );

    } else {

      await parentSock.sendMessage(msg.key.remoteJid, {

        text: `🔑 Pairing Code:\n\n${code}`

      });

    }

  }

  /**

   * 📡 CONNECTION EVENTS

   */

  sock.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect } = update;

    // ⛔ Cancel

    if (isCancelled()) {

      sock.end();

      delete sessionStore[sessionName];

      return;

    }

    // ✅ CONNECTED

    if (connection === "open") {

      delete sessionStore[sessionName];

      if (updateMessage) {

        await updateMessage(

`╭─〔 🤖 VIP SESSION 〕

│ Session : ${sessionName}

│ Status  : Connected

│ Mode    : Active

╰──────────────`

        );

      }

      sock.ev.on("messages.upsert", async (m) => {

        try {

          await handleMessages(sock, m);

        } catch {}

      });

    }

    // ❌ CLOSED

    if (connection === "close") {

      const code =

        lastDisconnect?.error?.output?.statusCode;

      if (code === DisconnectReason.loggedOut) {

        delete sessionStore[sessionName];

        await fs.remove(sessionPath);

        if (updateMessage) {

          await updateMessage(

`╭─〔 ⚠️ VIP SESSION 〕

│ Session : ${sessionName}

│ Status  : Logged Out

│ Action  : Re-link required

╰──────────────`

          );

        }

        return;

      }

      // 🔄 Reconnect

      if (state.creds.registered) {

        await delay(3000);

        sessionCreator(

          sessionName,

          phoneNumber,

          parentSock,

          msg,

          updateMessage

        );

      }

    }

  });

  return sock;

}

/**

 * ⛔ VIP CANCEL

 */

export function cancelSession(sessionName) {

  const session = sessionStore[sessionName];

  if (!session) return false;

  session.cancelled = true;

  session.sock?.end();

  delete sessionStore[sessionName];

  return true;

}