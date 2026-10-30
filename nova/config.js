let prefix = '.';

const config = {
    botName: 'Anastasia',
    version: '3.0.0',
    owner: '201070185184',

    defaultPrefix: '.',

    pairing:{
        phone:null,
        code :null,
    },


    botState:{
        bot: "on",
        mode: "on",
        nova: "on",
    },

      anti:{
         antidelete: "on",
         antilink: "on",  
         antispam: "on",        
         spamLimit: 5,        
         spamReset: 10000,
         antivirus: "on",
         maxChar: 8000, 
         whitelist: [      
            "whatsapp.com", 
            "youtube.com"
        ],
          anticall :"on"
    
     },


    novaInfo: {
        ceiling: "© 𝐃𝐉𝐍",
        name: "𝐀𝐧𝐚𝐬𝐭𝐚𝐬𝐢𝐚 𝐯𝟒",
        description: "𝚄𝙻𝚃𝚁𝙰 𝙽𝙾𝚅𝙰 𝚅𝙴𝚁",
        verification: true,
        media: true
    },
    
  ui: [
  "╭─˚‧₊⊹ 𝑢𝑙𝑡𝑟𝑎 𝑛𝜊𝜈𝑎 𝛎𝜄𝜌 ᠀⊹˚‧₊──",  //  0 
  "╰──˚‧₊⊹ 𝜜𝜨𝜜𝑺𝜯𝜜𝑺𝜤𝜜🐊⊹˚‧₊──\n> © 𝐃𝐉𝐍"       // 1
    ],

    get prefix() {
        return prefix;
    },

    set prefix(newPrefix) {
        if (newPrefix && typeof newPrefix === 'string') {
            prefix = newPrefix;
        }
    },

    allowedGroups: [],

    messages: {
        error: '❌ حدث خطأ أثناء تنفيذ الأمر',
        noPermission: 'ليس لديك صلاحية لاستخدام هذا الأمر',
        groupOnly: 'هذا الأمر متاح فقط في المجموعات',
        ownerOnly: 'هذا الأمر متاح فقط للنخبة',
        notAllowedGroup: 'عذراً، البوت لا يعمل في هذه المجموعة'
    },

    colors: {
        success: '\x1b[38;2;255;255;0m',
        error:   '\x1b[38;2;255;80;120m',
        info:    '\x1b[38;2;140;120;255m',
        warn:    '\x1b[38;2;255;200;0m',
        reset:   '\x1b[0m'
    },
};

export default config;
