export default {
    command: ["lid"], 
    description: "جلب رقم المستخدم",
    usage: ".رقم [منشن | رد | رقم]",
    elite: "off",
    group: false,
    prv: false,
    category: "tools",
    async execute({sock, msg, args, BIDS,sender}) {
     return sock.sendMessage(msg.key.remoteJid,{text:sender.lid.split("@")[0]})
    }
};
