import fs from "fs";

import path from "path";

// مسار ملف البيانات

const dataPath = path.join(process.cwd(), "data/msharkin.json");

export const NovaUltra = {

    command: "تسجيل",

    description: "تسجيل لقب فريد مع تحديد المستوى (فردي A0 - زوجي B0)",

    usage: ".تسجيل [اللقب]",

    category: "tools",

    elite: "off",

    lock: "off",

    group: false,

    prv: true,

    nova: "on"

};

export async function execute({ sock, msg, args, sender }) {

    const chatId = msg.key.remoteJid;

    // 1. تجاهل المحادثات الجماعية (صامت)

    if (chatId.endsWith("@g.us")) return;

    // 2. تجاهل إذا لم يكتب اللقب (صامت)

    const nickname = args.join(" ").trim();

    if (!nickname) return;

    // 3. التحقق من مفتاح الدولة (فلتر الأرقام المسموحة)

    const userNumber = sender.pn.split('@')[0];

    const allowedPrefixes = [

        "966", "20", "972", "973", "974", "965", "962", "961", "970", "98",

        "212", "213", "216", "218", "252", "249", "964", "963", "967", "968", "39"

    ];

    const isAllowed = allowedPrefixes.some(prefix => userNumber.startsWith(prefix));

    if (!isAllowed) return;

    // 4. تجهيز ملف البيانات

    if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });

    let data = [];

    if (fs.existsSync(dataPath)) {

        try { data = JSON.parse(fs.readFileSync(dataPath, "utf8")); }

        catch { data = []; }

    }

    // 5. تجاهل إذا كان المستخدم مسجلاً مسبقاً (صامت)

    const userExists = data.find(u => u.id === sender.pn);

    if (userExists) return;

    // 6. التحقق من تكرار اللقب (صامت)

    const nameExists = data.find(u => u.nickname === nickname);

    if (nameExists) return;

    // 7. التحقق من اكتمال العدد (256)

    if (data.length >= 256) {

        await sock.sendMessage(chatId, { react: { text: "✋️", key: msg.key } });

        return;

    }

    // 8. حساب الرقم وتحديد المستوى (lvl)

    const num = data.length + 1;

    

    // التعديل هنا:

    // إذا كان الرقم فردياً (1, 3, 5...) يأخذ A0

    // إذا كان الرقم زوجياً (2, 4, 6...) يأخذ B0

    const level = (num % 2 !== 0) ? "A0" : "B0";

    const entry = { 

        id: sender.pn,     

        lid: sender.lid,   

        nickname: nickname, 

        number: num,

        lvl: level,       

        status: true       

    };

    

    data.push(entry);

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 4));

    // 9. التفاعل بنجاح

    await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

}

export default { NovaUltra, execute };

