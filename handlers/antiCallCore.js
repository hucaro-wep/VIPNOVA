import { jidDecode } from "@whiskeysockets/baileys";
import chalk from "chalk";
import config from "../nova/config.js";


export const handleAntiCall = async (sock, callEvent) => {

    const { anticall = "off" } = config.anti || {};

    if (anticall !== "on") return;

    const call = callEvent[0];
    
    if (call.status !== 'offer') return;

    const callId = call.id;
    const callerId = call.from;

    // 2.  رفض المكالمة مباشرo
    try {
        console.log(chalk.yellow(`[ANTI-CALL] Rejecting call from: ${callerId}`));
        await sock.rejectCall(callId, callerId);
    } catch (err) {
        console.error(chalk.red("[ANTI-CALL ERROR]"), err);
    }
};