import fs from 'fs';

import path from 'path';

import chalk from 'chalk';

import { delay } from '@whiskeysockets/baileys';

// ================= CONFIG =================

const NovaUltra = {

    command: 'ح',

    description: 'نظام حماية متقدم (VIP Device Scan)',

    elite: 'on',

    group: true,

    lock: 'off',

};

// ================= STATE =================

const eventCache = new Set();

const groupState = {}; // تخزين آخر حالة معروفة

let monitorInterval = null;

// ================= UTILS =================

const clean = jid => jid?.split('@')[0] || 'unknown';

// ⚠️ عدّل هذه حسب نظامك

const isElite = jid => {

    // مثال: قائمة ثابتة أو تحقق من قاعدة بيانات

    return global.ELITE_USERS?.includes(jid);

};

// ================= DEVICE CHECK =================

async function checkDevice(sock, jid) {

    try {

        const devices = await sock.getUSyncDevices([jid], true);

        const count = Math.max(0, devices.length - 1);

        return { isBot: count > 0, count };

    } catch {

        return { isBot: false, count: 0 };

    }

}

// ================= SNAPSHOT =================

async function snapshotGroup(sock, groupJid) {

    const meta = await sock.groupMetadata(groupJid);

    const map = {};

    for (const p of meta.participants) {

        const res = await checkDevice(sock, p.id);

        map[p.id] = {

            admin: !!p.admin,

            isBot: res.isBot,

            devices: res.count

        };

        await delay(200);

    }

    return map;

}

// ================= ENFORCE RULES =================

async function enforceChanges(sock, groupJid, oldState, newState) {

    for (const jid in newState) {

        if (isElite(jid)) continue;

        const prev = oldState?.[jid];

        const curr = newState[jid];

        // 🔥 تحوّل فجأة إلى بوت

        if (curr.isBot && !prev?.isBot) {

            await sock.groupParticipantsUpdate(groupJid, [jid], 'remove');

            await sock.sendMessage(groupJid, {

                text: `🚨 *تم طرد رقم تحوّل إلى بوت*\n👤 @${clean(jid)}\n🔌 الأجهزة: *${curr.devices}*`,

                mentions: [jid]

            });

            continue;

        }

        // 👮‍♂️ ترقية لمشرف

        if (curr.admin && !prev?.admin) {

            await sock.sendMessage(groupJid, {

                text: `📢 *ترقية إشراف*\n👤 @${clean(jid)}`,

                mentions: [jid]

            });

            if (curr.isBot) {

                const promoter = prev?.promoter;

                const toKick = [jid];

                if (promoter && !isElite(promoter)) toKick.push(promoter);

                await sock.groupParticipantsUpdate(groupJid, toKick, 'remove');

                await sock.sendMessage(groupJid, {

                    text:

                        `🚨 *محاولة رفع بوت*\n` +

                        `👤 البوت: @${clean(jid)}\n` +

                        (promoter ? `👤 الرافع: @${clean(promoter)}` : ''),

                    mentions: toKick

                });

            }

        }

        // ❌ إشراف غير ELITE

        if (curr.admin && !isElite(jid)) {

            await sock.groupParticipantsUpdate(groupJid, [jid], 'demote');

            await sock.sendMessage(groupJid, {

                text: `⚠️ *تم خفض إشراف غير مصرح*\n👤 @${clean(jid)}`,

                mentions: [jid]

            });

        }

    }

}

// ================= EXECUTE =================

async function execute({ sock, msg }) {

    const groupJid = msg.key.remoteJid;

    if (!global.botProtection) global.botProtection = {};

    // ENABLE

    if (!global.botProtection[groupJid]) {

        global.botProtection[groupJid] = true;

        await sock.sendMessage(groupJid, {

            react: { text: '🛡️', key: msg.key }

        });

        await sock.sendMessage(groupJid, {

            text: '⏳ *تم تفعيل نظام الحماية المتقدمة – مراقبة حية كل 10 ثواني*'

        });

        groupState[groupJid] = await snapshotGroup(sock, groupJid);

        if (!monitorInterval) {

            monitorInterval = setInterval(async () => {

                for (const g of Object.keys(global.botProtection)) {

                    const newSnap = await snapshotGroup(sock, g);

                    await enforceChanges(sock, g, groupState[g], newSnap);

                    groupState[g] = newSnap;

                }

            }, 10000);

        }

        return;

    }

    // DISABLE

    delete global.botProtection[groupJid];

    delete groupState[groupJid];

    await sock.sendMessage(groupJid, {

        react: { text: '⛔', key: msg.key }

    });

}

// ================= LIVE UPDATES =================

async function monitorGroupUpdate(sock, update) {

    const { id: groupJid, action, participants, actor } = update;

    if (!global.botProtection?.[groupJid]) return;

    if (action === 'promote') {

        for (const jid of participants) {

            if (isElite(jid)) continue;

            const res = await checkDevice(sock, jid);

            await sock.sendMessage(groupJid, {

                text: `📢 *تغيير إشراف*\n👤 @${clean(jid)}`,

                mentions: [jid]

            });

            if (res.isBot) {

                const targets = [jid];

                if (actor && !isElite(actor)) targets.push(actor);

                await sock.groupParticipantsUpdate(groupJid, targets, 'remove');

                await sock.sendMessage(groupJid, {

                    text:

                        `🚨 *رفع بوت غير مسموح*\n` +

                        `👤 البوت: @${clean(jid)}\n` +

                        (actor ? `👤 الرافع: @${clean(actor)}` : ''),

                    mentions: targets

                });

            }

        }

    }

}

export default {

    NovaUltra,

    execute,

    monitorGroupUpdate

};