import { jidDecode } from "@whiskeysockets/baileys";
import config from "../../nova/config.js";
const NovaUltra = {
  command: "زخرف",
  description: "زخرفة النصوص بخطوط متعددة",
  usage: ".زخرف",
  category: "tools",
  group: true
};
const decode = jid =>
  (jidDecode(jid)?.user || jid.split("@")[0]) + "@s.whatsapp.net";
function applyHF(text) {
  const hf = config.ui || ["", ""];
  return [hf[0], text, hf[1]].filter(Boolean).join("\n\n");
}
async function sendHF(sock, chatId, text, quoted = null) {
  return sock.sendMessage(chatId, {
    text: applyHF(text),
    edit: quoted?.key
  });
}
const fonts = [
  {
    id: "bold",
    preview: "𝐃𝐉𝐍",
    map: {
      a: "𝐚", b: "𝐛", c: "𝐜", d: "𝐝", e: "𝐞", f: "𝐟",
      g: "𝐠", h: "𝐡", i: "𝐢", j: "𝐣", k: "𝐤", l: "𝐥",
      m: "𝐦", n: "𝐧", o: "𝐨", p: "𝐩", q: "𝐪", r: "𝐫",
      s: "𝐬", t: "𝐭", u: "𝐮", v: "𝐯", w: "𝐰", x: "𝐱",
      y: "𝐲", z: "𝐳",
      A: "𝐀", B: "𝐁", C: "𝐂", D: "𝐃", E: "𝐄", F: "𝐅",
      G: "𝐆", H: "𝐇", I: "𝐈", J: "𝐉", K: "𝐊", L: "𝐋",
      M: "𝐌", N: "𝐍", O: "𝐎", P: "𝐏", Q: "𝐐", R: "𝐑",
      S: "𝐒", T: "𝐓", U: "𝐔", V: "𝐕", W: "𝐖", X: "𝐗",
      Y: "𝐘", Z: "𝐙"
    }
  },
  {
    id: "bold_italic",
    preview: "𝑫𝑱𝑵",
    map: {
      a: "𝒂", b: "𝒃", c: "𝒄", d: "𝒅", e: "𝒆", f: "𝒇",
      g: "𝒈", h: "𝒉", i: "𝒊", j: "𝒋", k: "𝒌", l: "𝒍",
      m: "𝒎", n: "𝒏", o: "𝒐", p: "𝒑", q: "𝒒", r: "𝒓",
      s: "𝒔", t: "𝒕", u: "𝒖", v: "𝒗", w: "𝒘", x: "𝒙",
      y: "𝒚", z: "𝒛",
      A: "𝑨", B: "𝑩", C: "𝑪", D: "𝑫", E: "𝑬", F: "𝑭",
      G: "𝑮", H: "𝑯", I: "𝑰", J: "𝑱", K: "𝑲", L: "𝑳",
      M: "𝑴", N: "𝑵", O: "𝑶", P: "𝑷", Q: "𝑸", R: "𝑹",
      S: "𝑺", T: "𝑻", U: "𝑼", V: "𝑽", W: "𝑾", X: "𝑿",
      Y: "𝒀", Z: "𝒁"
    }
  },
  {
    id: "italic",
    preview: "𝐷𝐽𝑁",
    map: {
      a: "𝑎", b: "𝑏", c: "𝑐", d: "𝑑", e: "𝑒", f: "𝑓",
      g: "𝑔", h: "ℎ", i: "𝑖", j: "𝑗", k: "𝑘", l: "𝑙",
      m: "𝑚", n: "𝑛", o: "𝑜", p: "𝑝", q: "𝑞", r: "𝑟",
      s: "𝑠", t: "𝑡", u: "𝑢", v: "𝑣", w: "𝑤", x: "𝑥",
      y: "𝑦", z: "𝑧",
      A: "𝐴", B: "𝐵", C: "𝐶", D: "𝐷", E: "𝐸", F: "𝐹",
      G: "𝐺", H: "𝐻", I: "𝐼", J: "𝐽", K: "𝐾", L: "𝐿",
      M: "𝑀", N: "𝑁", O: "𝑂", P: "𝑃", Q: "𝑄", R: "𝑅",
      S: "𝑆", T: "𝑇", U: "𝑈", V: "𝑉", W: "𝑊", X: "𝑋",
      Y: "𝑌", Z: "𝑍"
    }
  },
  {
    id: "script",
    preview: "𝓓𝓙𝓝",
    map: {
      a: "𝓪", b: "𝓫", c: "𝓬", d: "𝓭", e: "𝓮", f: "𝓯",
      g: "𝓰", h: "𝓱", i: "𝓲", j: "𝓳", k: "𝓴", l: "𝓵",
      m: "𝓶", n: "𝓷", o: "𝓸", p: "𝓹", q: "𝓺", r: "𝓻",
      s: "𝓼", t: "𝓽", u: "𝓾", v: "𝓿", w: "𝔀", x: "𝔁",
      y: "𝔂", z: "𝔃",
      A: "𝓐", B: "𝓑", C: "𝓒", D: "𝓓", E: "𝓔", F: "𝓕",
      G: "𝓖", H: "𝓗", I: "𝓘", J: "𝓙", K: "𝓚", L: "𝓛",
      M: "𝓜", N: "𝓝", O: "𝓞", P: "𝓟", Q: "𝓠", R: "𝓡",
      S: "𝓢", T: "𝓣", U: "𝓤", V: "𝓥", W: "𝓦", X: "𝓧",
      Y: "𝓨", Z: "𝓩"
    }
  },
  {
    id: "fraktur",
    preview: "𝔇𝔍𝔑",
    map: {
      a: "𝔞", b: "𝔟", c: "𝔠", d: "𝔡", e: "𝔢", f: "𝔣",
      g: "𝔤", h: "𝔥", i: "𝔦", j: "𝔧", k: "𝔨", l: "𝔩",
      m: "𝔪", n: "𝔫", o: "𝔬", p: "𝔭", q: "𝔮", r: "𝔯",
      s: "𝔰", t: "𝔱", u: "𝔲", v: "𝔳", w: "𝔴", x: "𝔵",
      y: "𝔶", z: "𝔷",
      A: "𝔄", B: "𝔅", C: "ℭ", D: "𝔇", E: "𝔈", F: "𝔉",
      G: "𝔊", H: "ℌ", I: "ℑ", J: "𝔍", K: "𝔎", L: "𝔏",
      M: "𝔐", N: "𝔑", O: "𝔒", P: "𝔓", Q: "𝔔", R: "ℜ",
      S: "𝔖", T: "𝔗", U: "𝔘", V: "𝔙", W: "𝔚", X: "𝔛",
      Y: "𝔜", Z: "ℨ"
    }
  },
  {
    id: "double_struck",
    preview: "𝕯𝕵𝕹",
    map: {
      a: "𝖆", b: "𝖇", c: "𝖈", d: "𝖉", e: "𝖊", f: "𝖋",
      g: "𝖌", h: "𝖍", i: "𝖎", j: "𝖏", k: "𝖐", l: "𝖑",
      m: "𝖒", n: "𝖓", o: "𝖔", p: "𝖕", q: "𝖖", r: "𝖗",
      s: "𝖘", t: "𝖙", u: "𝖚", v: "𝖛", w: "𝖜", x: "𝖝",
      y: "𝖞", z: "𝖟",
      A: "𝕬", B: "𝕭", C: "𝕮", D: "𝕯", E: "𝕰", F: "𝕱",
      G: "𝕲", H: "𝕳", I: "𝕴", J: "𝕵", K: "𝕶", L: "𝕷",
      M: "𝕸", N: "𝕹", O: "𝕺", P: "𝕻", Q: "𝕼", R: "𝕽",
      S: "𝕾", T: "𝕿", U: "𝖀", V: "𝖁", W: "𝖂", X: "𝖃",
      Y: "𝖄", Z: "𝖅"
    }
  },
  {
    id: "monospace_square",
    preview: "𝙳𝙹𝙽",
    map: {
      a: "𝚊", b: "𝚋", c: "𝚌", d: "𝚍", e: "𝚎", f: "𝚏",
      g: "𝚐", h: "𝚑", i: "𝚒", j: "𝚓", k: "𝚔", l: "𝚕",
      m: "𝚖", n: "𝚗", o: "𝚘", p: "𝚙", q: "𝚚", r: "𝚛",
      s: "𝚜", t: "𝚝", u: "𝚞", v: "𝚟", w: "𝚠", x: "𝚡",
      y: "𝚢", z: "𝚣",
      A: "𝙰", B: "𝙱", C: "𝙲", D: "𝙳", E: "𝙴", F: "𝙵",
      G: "𝙶", H: "𝙷", I: "𝙸", J: "𝙹", K: "𝙺", L: "𝙻",
      M: "𝙼", N: "𝙽", O: "𝙾", P: "𝙿", Q: "𝚀", R: "𝚁",
      S: "𝚂", T: "𝚃", U: "𝚄", V: "𝚅", W: "𝚆", X: "𝚇",
      Y: "𝚈", Z: "𝚉"
    }
  },
  {
    id: "bold_sans",
    preview: "𝗗𝗝𝗡",
    map: {
      a: "𝗮", b: "𝗯", c: "𝗰", d: "𝗱", e: "𝗲", f: "𝗳",
      g: "𝗴", h: "𝗵", i: "𝗶", j: "𝗷", k: "𝗸", l: "𝗹",
      m: "𝗺", n: "𝗻", o: "𝗼", p: "𝗽", q: "𝗾", r: "𝗿",
      s: "𝘀", t: "𝘁", u: "𝘂", v: "𝘃", w: "𝘄", x: "𝘅",
      y: "𝘆", z: "𝘇",
      A: "𝗔", B: "𝗕", C: "𝗖", D: "𝗗", E: "𝗘", F: "𝗙",
      G: "𝗚", H: "𝗛", I: "𝗜", J: "𝗝", K: "𝗞", L: "𝗟",
      M: "𝗠", N: "𝗡", O: "𝗢", P: "𝗣", Q: "𝗤", R: "𝗥",
      S: "𝗦", T: "𝗧", U: "𝗨", V: "𝗩", W: "𝗪", X: "𝗫",
      Y: "𝗬", Z: "𝗭"
    }
  },
  {
    id: "bold_italic_sans",
    preview: "𝘿𝙅𝙉",
    map: {
      a: "𝙖", b: "𝙗", c: "𝙘", d: "𝙙", e: "𝙚", f: "𝙛",
      g: "𝙜", h: "𝙝", i: "𝙞", j: "𝙟", k: "𝙠", l: "𝙡",
      m: "𝙢", n: "𝙣", o: "𝙤", p: "𝙥", q: "𝙦", r: "𝙧",
      s: "𝙨", t: "𝙩", u: "𝙪", v: "𝙫", w: "𝙬", x: "𝙭",
      y: "𝙮", z: "𝙯",
      A: "𝘼", B: "𝘽", C: "𝘾", D: "𝘿", E: "𝙀", F: "𝙁",
      G: "𝙂", H: "𝙃", I: "𝙄", J: "𝙅", K: "𝙆", L: "𝙇",
      M: "𝙈", N: "𝙉", O: "𝙊", P: "𝙋", Q: "𝙌", R: "𝙍",
      S: "𝙎", T: "𝙏", U: "𝙐", V: "𝙑", W: "𝙒", X: "𝙓",
      Y: "𝙔", Z: "𝙕"
    }
  },
  {
    id: "italic_sans",
    preview: "𝘿𝙅𝙉",
    map: {
      a: "𝘢", b: "𝘣", c: "𝘤", d: "𝘥", e: "𝘦", f: "𝘧",
      g: "𝘨", h: "𝘩", i: "𝘪", j: "𝘫", k: "𝘬", l: "𝘭",
      m: "𝘮", n: "𝘯", o: "𝘰", p: "𝘱", q: "𝘲", r: "𝘳",
      s: "𝘴", t: "𝘵", u: "𝘶", v: "𝘷", w: "𝘸", x: "𝘹",
      y: "𝘺", z: "𝘻",
      A: "𝘈", B: "𝘉", C: "𝘊", D: "𝘋", E: "𝘌", F: "𝘍",
      G: "𝘎", H: "𝘏", I: "𝘐", J: "𝘑", K: "𝘒", L: "𝘓",
      M: "𝘔", N: "𝘕", O: "𝘖", P: "𝘗", Q: "𝘘", R: "𝘙",
      S: "𝘚", T: "𝘛", U: "𝘜", V: "𝘝", W: "𝘞", X: "𝘟",
      Y: "𝘠", Z: "𝘡"
    }
  },
  {
    id: "fancy_mixed",
    preview: "𝐃𝐉𝚴",
    map: {
      a: "𝐚", b: "𝐛", c: "𝐜", d: "𝐝", e: "𝐞", f: "𝐟",
      g: "𝐠", h: "𝐡", i: "𝛊", j: "𝐣", k: "𝐤", l: "𝐥",
      m: "𝐦", n: "𝐧", o: "𝛐", p: "𝐩", q: "𝛒", r: "𝐫",
      s: "𝐬", t: "𝛕", u: "𝐮", v: "𝐯", w: "𝐰", x: "𝛘",
      y: "𝐲", z: "𝐳",
      A: "𝚨", B: "𝚩", C: "𝐂", D: "𝐃", E: "𝚬", F: "𝐅",
      G: "𝐆", H: "𝚮", I: "𝚰", J: "𝐉", K: "𝚱", L: "𝐋",
      M: "𝚳", N: "𝚴", O: "𝚶", P: "𝚸", Q: "𝐐", R: "𝐑",
      S: "𝐒", T: "𝚻", U: "𝐔", V: "𝐕", W: "𝐖", X: "𝚾",
      Y: "𝐘", Z: "𝚭"
    }
  },
  {
    id: "fancy_unicode",
    preview: "𝐷𝐽𝛮",
    map: {
      a: "𝑎", b: "𝑏", c: "𝑐", d: "𝑑", e: "𝑒", f: "𝑓",
      g: "𝑔", h: "ℎ", i: "𝑖", j: "𝑗", k: "𝑘", l: "𝑙",
      m: "𝑚", n: "𝑛", o: "𝑜", p: "𝜌", q: "𝑞", r: "𝑟",
      s: "𝑠", t: "𝜏", u: "𝑢", v: "𝑣", w: "𝑤", x: "𝑥",
      y: "𝑦", z: "𝑧",
      A: "𝜜", B: "𝜝", C: "𝐶", D: "𝐷", E: "𝜠", F: "𝐹",
      G: "𝐺", H: "𝜢", I: "𝛪", J: "𝐽", K: "𝛫", L: "𝐿",
      M: "𝛭", N: "𝛮", O: "𝛰", P: "𝛲", Q: "𝑄", R: "𝑅",
      S: "𝑆", T: "𝛵", U: "𝑈", V: "𝑉", W: "𝑊", X: "𝛸",
      Y: "𝑌", Z: "𝛧"
    }
  },
  {
    id: "fancy_unicode_2",
    preview: "𝑫𝑱𝜨",
    map: {
      a: "𝑎", b: "𝑏", c: "𝑐", d: "𝑑", e: "𝑒", f: "𝑓",
      g: "𝑔", h: "ℎ", i: "𝑖", j: "𝑗", k: "𝑘", l: "𝑙",
      m: "𝑚", n: "𝑛", o: "𝑜", p: "𝑝", q: "𝑞", r: "𝑟",
      s: "𝑠", t: "𝑡", u: "𝑢", v: "𝑣", w: "𝑤", x: "𝑥",
      y: "𝒀", z: "𝑧",
      A: "𝜜", B: "𝜝", C: "𝑪", D: "𝑫", E: "𝜠", F: "𝑭",
      G: "𝑮", H: "𝜢", I: "𝜤", J: "𝑱", K: "𝜥", L: "𝑳",
      M: "𝜧", N: "𝜨", O: "𝜪", P: "𝜬", Q: "𝑸", R: "𝑹",
      S: "𝑺", T: "𝜯", U: "𝑼", V: "𝑽", W: "𝑾", X: "𝜲",
      Y: "𝒀", Z: "𝜡"
    }
  },
];
function stylize(text, map) {
  return [...text].map(c => map[c] || c).join("");
}
const sessions = {};
const SESSION_TIME = 180000;
async function execute({ sock, msg }) {
  const chatId = msg.key.remoteJid;
  if (!chatId.endsWith("@g.us")) return;
  const sender = decode(msg.key.participant || chatId);
  const sid = `${chatId}_${sender}`;
  if (sessions[sid]) return;
  sessions[sid] = {
    step: "WAIT_TEXT",
    text: "",
    menuMsg: null,
    timer: setTimeout(() => delete sessions[sid], SESSION_TIME)
  };
  const askText = await sock.sendMessage(chatId, {
    text: applyHF("✎ ارسل الكلمه او الجمله التي تريد زخرفتها")
  });
  sessions[sid].menuMsg = askText;
  const listener = async ({ messages }) => {
    const m = messages[0];
    if (!m?.message) return;
    if (m.key.remoteJid !== chatId) return;
    if (decode(m.key.participant || chatId) !== sender) return;
    if (!sessions[sid]) return;
    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      "";
    const input = text.trim();
    const session = sessions[sid];
    if (input === "انهاء") {
      clearTimeout(session.timer);
      delete sessions[sid];
      sock.ev.off("messages.upsert", listener);
      return;
    }
    if (session.step === "WAIT_TEXT") {
      session.text = input;
      session.step = "WAIT_STYLE";
      let menu = "❀⤾ *⌌ الزخارف ⌏*\n\n";
      fonts.forEach((f, i) => {
        menu += `✦ ${i + 1} ⤳ ${f.preview}\n`;
      });
      menu +=
        "\n✎ اختر رقم الخط\n" +
        "✎ ارسل (انهاء) لإنهاء\n" +
        "✎ او ارسل كلمه جديده";
      await sock.sendMessage(chatId, {
        text: applyHF(menu),
        edit: session.menuMsg.key
      });
      return;
    }
    if (session.step === "WAIT_STYLE") {
      const index = parseInt(input) - 1;
      if (!isNaN(index) && fonts[index]) {
        const result = stylize(session.text, fonts[index].map);
        await sock.sendMessage(chatId, { text: result });
        return;
      }
      session.text = input;
      return sock.sendMessage(chatId, {
        text: applyHF("✎ اختر رقم الخط من القائمه السابقه")
      });
    }
  };
  sock.ev.on("messages.upsert", listener);
}
export default {
  NovaUltra,
  execute
};
