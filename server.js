// ══════════════════════════════════════════════════════════════════════════
//  DRIEMS Polytechnic — Priya Bot  (single-file, self-contained)
//  Architecture:
//    1. FAST PATH  — inline knowledge.json → local keyword match (~0ms)
//    2. FULL PATH  — Claude Haiku + injected knowledge context (~1-2s)
// ══════════════════════════════════════════════════════════════════════════

const express = require('express');
const fetch   = require('node-fetch');
const twilio  = require('twilio');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.get('/ping', (req, res) => res.send('ok'));

// ── Config ─────────────────────────────────────────────────────────────────────
const ANTH_KEY       = process.env.ANTHROPIC_API_KEY;
const TW_SID         = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN       = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM        = process.env.TWILIO_PHONE_NUMBER;
const PUBLIC_URL     = process.env.PUBLIC_URL;
const SARVAM_KEY     = process.env.SARVAM_API_KEY;

// ══════════════════════════════════════════════════════════════════════════
//  INLINE KNOWLEDGE BASE  (replaces knowledge.json + knowledgeSearch.js)
// ══════════════════════════════════════════════════════════════════════════
const KNOWLEDGE = {
  meta: {
    college:          'DRIEMS Polytechnic',
    branch:           'Electronics and Telecommunication (ETC)',
    contact_person:   'Satya Ranjan Panigrahi, Assistant Professor, ETC Department',
    contact_number:   '7978900914',
    location:         'Tangi, Cuttack, Odisha',
    website:          'driems.ac.in',
    admission_portal: 'sams.odisha.gov.in',
    affiliation:      'AICTE Approved, SCTE&VT Odisha Affiliated'
  },
  intents: [
    {
      id: 1, category: 'greeting',
      keywords: ['hello','hi','namaskara','helo','haalo','ke','kaun','bol','katha','speak'],
      odia_reply: 'Namaskara! Mu Priya, DRIEMS Polytechnic ra ETC Branch ra AI Admission Assistant. Aapana admission, fees, hostel, placement — jebhe prashna thau, mu spashta uttara debI. Kahanu, kana janiba chahanti?'
    },
    {
      id: 2, category: 'greeting',
      keywords: ['odia','odia re','language','bhasha','odia boli'],
      odia_reply: 'Haan! Mu Odia re sampurna rupe katha karibaku saksham. Aapana nischinta re prashna karanti, mu Odia re spashta uttara debI.'
    },
    {
      id: 3, category: 'greeting',
      keywords: ['machine','robot','real','manusha','human','artificial'],
      odia_reply: 'Mu ekta AI Assistant — Priya. Kintu DRIEMS ETC Branch sambandhe sabu prashnar sata uttara deba para mu poori prastauta. Real teacher ke baat karana darkar parila, mu connect karaideba. Ebe kahanu — kana janiba chahanti?'
    },
    {
      id: 4, category: 'admission',
      keywords: ['admission','keba','kebe','when','kana bhali','apply','form','date','last date'],
      odia_reply: 'DRIEMS Polytechnic re admission SAMS Odisha portal madhyame hoi — sams.odisha.gov.in. Sadhaaranata June-July mahina re form fill up hoi, aau August re admission complete hoi. Latest date para sams.odisha.gov.in check karanti. Kono prashna thile Satya Sir ku call karanti: 7978900914.'
    },
    {
      id: 5, category: 'admission',
      keywords: ['document','kagaj','certificate','marksheet','ki ki','kana kana laagiba','necessary'],
      odia_reply: 'ETC branch re admission para — 10th marksheet, Pass certificate, Caste certificate jadi laagu hue, Residential certificate, aau 3 ta passport size photo lagiba. Sabu documents SAMS portal re online upload karibaku heba. Kono confusion thile Satya Sir ku call karanti: 7978900914.'
    },
    {
      id: 6, category: 'admission',
      keywords: ['sams','portal','online','website','apply karibe'],
      odia_reply: 'SAMS Odisha portal — sams.odisha.gov.in — re aapana online apply karibaku heba. Direct college re jaai admission milena. Portal re registration kari, form fill kari, documents upload kari, aau fees pay karibaku heba. Mu step-by-step guide karideba — kana step re doubt achi?'
    },
    {
      id: 7, category: 'admission',
      keywords: ['merit','merit list','rank','list','selection'],
      odia_reply: 'Merit list SAMS Odisha portal re publish hoi. Online apply closing pachhe 1-2 saptaha bhitare merit list ber hoi. Aapana sams.odisha.gov.in re login kari nijra merit rank check karipaaribe. Rank bhali thile DRIEMS ETC re seat confirm!'
    },
    {
      id: 8, category: 'eligibility',
      keywords: ['percentage','marks','kete','minimum','eligible','eligibility','yogyata'],
      odia_reply: 'ETC branch re admission para 10th pass with minimum 35% marks darkar. SC/ST students para relaxation achi. Aapananka category ki? Seia anujayi mu exact eligibility bataideba.'
    },
    {
      id: 9, category: 'eligibility',
      keywords: ['science','arts','commerce','stream','subject','PCM','neba'],
      odia_reply: 'Haan! Polytechnic Diploma para 10th pass — jebhe stream heu thau Science, Arts, ba Commerce — apply karipaaribe. Kono subject specific restriction nei. Aapana 10th pass thile eligible!'
    },
    {
      id: 10, category: 'eligibility',
      keywords: ['age','umur','baya','limit','age limit','kete baya'],
      odia_reply: 'Diploma admission para saadharanata kono age limit nai. Tebhu, SAMS guidelines badalia thiba paarei — sams.odisha.gov.in re current year ra prospectus dekhanti nischita heba.'
    },
    {
      id: 11, category: 'eligibility',
      keywords: ['fail','failed','compartment','supplementary','pass nai'],
      odia_reply: 'Na. Polytechnic Diploma admission para 10th pass compulsory. Jadi aapana ebe compartment ba supplementary de thanti, result aasibaa pachhe apply karipaaribe. Tension nebi — result pachhe mu aapanaku guide kariba.'
    },
    {
      id: 12, category: 'fees',
      keywords: ['fees','fee','kharcha','cost','money','tanka','kitna','kete','price'],
      odia_reply: 'DRIEMS ETC ra annual fees matra ₹65,000 — aau eta 2 ta easy instalments re deia hei! Eka tha re sabu deba darkar nai. Hostel thile additional ₹75,000 — kinti seire 3 bela khana, WiFi, gym, swimming pool sab included. Total re ati reasonable!'
    },
    {
      id: 13, category: 'fees',
      keywords: ['installment','kisti','payment','emi','pay','how to pay'],
      odia_reply: 'Course fees ₹65,000 ku 2 ta easy instalments re deia hei — ekasathe burden nai. Pahila kisti admission time, dwitiya kisti second semester suru bele. Hostel fees ₹75,000 ekta installment re deba hoi. Aapananka budget re comfortable!'
    },
    {
      id: 14, category: 'fees',
      keywords: ['scholarship','bursary','financial help','free','muft','free admission'],
      odia_reply: 'Haan! OBC/SC/ST students para government scholarship available. SAMS portal re apply karile fees refund milei. Odisha government ra Post Matric Scholarship scheme achi. Satya Sir ku scholarship process sambandhe baat karantu: 7978900914.'
    },
    {
      id: 15, category: 'hostel',
      keywords: ['hostel','stay','lodge','raha','kaahen','accommodation','room'],
      odia_reply: 'DRIEMS re boys aau girls dono ku separate hostel achi. Hostel fees ₹75,000 per year — ete 3 bela khana, WiFi, gym, swimming pool sab included. 24 ghanta security achi, CCTV achi. Hostel ekdom safe aau comfortable!'
    },
    {
      id: 16, category: 'hostel',
      keywords: ['food','khana','meal','eat','breakfast','lunch','dinner','tiffin'],
      odia_reply: 'Hostel re din re 3 bela healthy hot meals milei — breakfast, lunch, aau dinner. Meals hostel fees re included — alag khana kharcha nei. Menu varied thae, students ku ghar janka khana milei. Taste re compromise nai!'
    },
    {
      id: 17, category: 'facilities',
      keywords: ['wifi','internet','network','connectivity'],
      odia_reply: 'DRIEMS re 24x7 high-speed WiFi achi — classrooms, labs, hostel, sabu jaagare. Odisha ra kum polytechnic colleges re ei level ra campus-wide WiFi milei. Students online resources, research sab kari paarantu without any interruption!'
    },
    {
      id: 18, category: 'facilities',
      keywords: ['gym','fitness','exercise','swimming','pool','sports','khelantu','playground'],
      odia_reply: 'DRIEMS re modern Gym achi — completely free for students! Swimming Pool bhi achi — Odisha polytechnics re ekdom rare! Huge playground re cricket, football, badminton, volleyball sab kheli hoi. Physical aau mental health dono ta care hoi ete!'
    },
    {
      id: 19, category: 'facilities',
      keywords: ['lab','laboratory','practical','equipment','experiment'],
      odia_reply: 'ETC ra advanced labs re real industry-grade equipment achi. AI based projects, IoT setups, VLSI design tools, Embedded systems boards — sab cutting-edge. IIT Bombay Virtual Lab access bhi achi. Students graduate hebe thile already industry-ready thanti!'
    },
    {
      id: 20, category: 'facilities',
      keywords: ['transport','bus','travel','commute','bhubaneswar','cuttack','distance'],
      odia_reply: 'DRIEMS ra FREE college bus Bhubaneswar aau Cuttack dono jaagaru chalei! Students ku transport para eka paisaa bhi deba darkar nai. Tangi campus Bhubaneswar thekaa 45 minutes, Cuttack thekaa matra 20 minutes. Commute completely zero-cost!'
    },
    {
      id: 21, category: 'placement',
      keywords: ['placement','job','company','recruit','hire','campus','salary','package'],
      odia_reply: 'DRIEMS ETC ra placement record ekdom strong! Hitachi, Exicom Telecom, Cummins India, Centum Electronics, Voltas, Tata Power — ei sab top companies campus re aasi recruit karanti. 100% placement record achi. Diploma pachhe direct job guaranteed!'
    },
    {
      id: 22, category: 'placement',
      keywords: ['salary','ctc','package','income','earn','kitna miliba'],
      odia_reply: 'ETC Diploma freshers ku sadhaaranata ₹15,000 thekaa ₹25,000 per month starting salary milei. Hitachi, Tata Power janka top companies re starting package higher thae. Experience badhile salary bhi badhe — 3-5 years re ₹40,000+ easily hoi!'
    },
    {
      id: 23, category: 'placement',
      keywords: ['training','placement training','preparation','t&p','interview'],
      odia_reply: 'Haan! DRIEMS re dedicated Training and Placement Cell achi. Students ku resume writing, mock interviews, aau soft skills training milei. Final year students ku special coaching milei — placement para poori preparation!'
    },
    {
      id: 24, category: 'placement',
      keywords: ['government job','govt job','sarkari','bsnl','drdo','bel','je','junior engineer','railways'],
      odia_reply: 'Haan! ETC Diploma holders ku BSNL, DRDO, BEL, ECIL, Railways, aau Odisha State Electricity Board re government jobs milei. Junior Engineer (JE) post para apply karipaaribe. Government job para competitive exam deba hoi — college ete bhi guide karei!'
    },
    {
      id: 25, category: 'placement',
      keywords: ['diploma pachhe','after diploma','job or btech','direct job','higher study'],
      odia_reply: 'Dono option aapana paase achi! Diploma pachhe directly Hitachi, Exicom, Tata Power janka companies re job karipaaribe. Ba B.Tech Lateral Entry kari degree paaibaa pachhe even better package miliba. DRIEMS students dono path re safal hoi thanti — aapana choice!'
    },
    {
      id: 26, category: 'college_info',
      keywords: ['ranking','rank','position','best','top','famous','popular'],
      odia_reply: 'DRIEMS Polytechnic Odisha ra top private polytechnic colleges bhitare ekta! AICTE approved, SCTE&VT affiliated. Hitachi, Tata Power janka companies ra placement, free transport, swimming pool, gym — eta sab government colleges re milena. Aapana DRIEMS choose karile bhali decision kariba!'
    },
    {
      id: 27, category: 'college_info',
      keywords: ['aicte','approved','recognized','affiliated','scte','government recognized','valid'],
      odia_reply: 'Haan! DRIEMS Polytechnic AICTE approved aau SCTE&VT Odisha affiliated. Ete ekta fully government recognized institution. Ete diploma/degree saba jagare — government job, B.Tech lateral entry, private job — sab jaagare valid aau accepted!'
    },
    {
      id: 28, category: 'college_info',
      keywords: ['branch','stream','department','kana kana','course available','which branches'],
      odia_reply: 'DRIEMS Polytechnic re — Civil Engineering, Mechanical Engineering, Electrical Engineering, aau Electronics & Telecommunication (ETC) — 4 ta branches achi. ETC branch aajira digital age re sabse demanding aau high-placement branch!'
    },
    {
      id: 29, category: 'college_info',
      keywords: ['etc vs cse','cse','computer','compare','better','which is good','kon bhali'],
      odia_reply: 'Dono strong branches! Kintu ETC re hardware, telecom, aau embedded systems specialization achi — 5G, IoT, Satellite — sab future ETC ra. Aau DRIEMS re ETC placement — Hitachi, Tata Power, Exicom — bahut strong. ETC eka unique aau high-demand choice!'
    },
    {
      id: 30, category: 'contact',
      keywords: ['contact','number','phone','call','reach','talk','satya','sir','professor'],
      odia_reply: 'DRIEMS ETC Branch para saadha Satya Ranjan Panigrahi Sir ku call karanti — 7978900914. Sir Assistant Professor, Electronics & Telecommunication Department. Sir ku call karile admission, fees, hostel — sabu prashnar turat aau accurate answer miliba!'
    },
    {
      id: 31, category: 'contact',
      keywords: ['transfer','connect','real person','real teacher','human','speak to someone','anya loka'],
      odia_reply: 'Bilkul! Mu aapananka call transfer kariba. Ektu hold re thanti. Satya Ranjan Panigrahi Sir — ETC Department — ku directly bhi call karipaarantu: 7978900914. Sir Monday thekaa Saturday, subah 9 thekaa sanjha 5 ta bhitare available thanti.'
    },
    {
      id: 32, category: 'campus',
      keywords: ['campus','100 acres','green','nature','environment','beautiful','atmosphere'],
      odia_reply: 'DRIEMS ra 100+ acres beautiful green campus achi — Odisha ra sabu thekaa sundar polytechnic campuses bhitare ekta! Ete padhile mana fresh thaei aau focus aassei. Swimming pool, gym, huge playground, green nature — ete study environment perfect!'
    },
    {
      id: 33, category: 'campus',
      keywords: ['safety','security','safe','surakhsha','girls safe','night','24 hour'],
      odia_reply: 'DRIEMS campus completely safe! 24 ghanta security guards achi, CCTV surveillance achi, aau hostel re warden system achi. Girls ku alag hostel aau separate entry. Parents nischinte thaaibaa paarantu — campus ekdom secure.'
    },
    {
      id: 34, category: 'general',
      keywords: ['why driems','kana kaarana','why choose','advantage','benefit','special','unique','different'],
      odia_reply: 'DRIEMS choose karibara 6 ta bada kaarana: Pahila — Hitachi, Tata Power, Exicom janka top placement. Dwitiya — FREE Bhubaneswar-Cuttack transport. Tritiya — fees matra 65,000 (2 kisti). Chaturtha — swimming pool, gym, 100+ acres campus. Panchama — AICTE approved. Shashtha — Satya Sir janka experienced faculty. Ete sab eka sathe kum jaagaraa milei!'
    },
    {
      id: 35, category: 'closing',
      keywords: ['ok','theek','dhanyabaad','thanks','goodbye','bye','ok fine','samajhi gali','understood'],
      odia_reply: 'Aapananka call ku bahut dhanyabaad! DRIEMS Polytechnic ETC Branch re aapanaku swagata karibaku aame pratiyaasei thiba. Kono prashna thile — Satya Sir ku call karanti: 7978900914. Aapanara future bright thaau — Shubhakamana!'
    }
  ]
};

// ── Knowledge search helpers ───────────────────────────────────────────────────
function normalize(text) {
  return text.toLowerCase().replace(/[?!.,]/g, '').replace(/\s+/g, ' ').trim();
}

function scoreIntent(intent, callerText) {
  const normalized = normalize(callerText);
  const words = normalized.split(' ');
  let score = 0;
  for (const keyword of intent.keywords) {
    const kw = normalize(keyword);
    if (normalized.includes(kw)) {
      score += kw.includes(' ') ? 3 : 2;
    } else {
      for (const word of words) {
        if (word.includes(kw) || kw.includes(word)) score += 1;
      }
    }
  }
  return score;
}

/**
 * FAST PATH — search local knowledge base (~0 ms)
 * Returns odia_reply string, or null if no confident match found.
 */
function localReply(callerText) {
  if (!callerText?.trim()) return null;
  let bestScore = 0;
  let bestIntent = null;
  for (const intent of KNOWLEDGE.intents) {
    const score = scoreIntent(intent, callerText);
    if (score > bestScore) { bestScore = score; bestIntent = intent; }
  }
  if (bestScore < 2) return null;          // raise threshold for higher confidence
  console.log(`[LOCAL] intent="${bestIntent.category}" id=${bestIntent.id} score=${bestScore}`);
  return bestIntent.odia_reply;
}

/**
 * Build knowledge context string injected into Claude system prompt.
 */
function buildKnowledgeContext() {
  const m = KNOWLEDGE.meta;
  return `
=== DRIEMS POLYTECHNIC — OFFICIAL FACTS (use ONLY these; never guess) ===

CONTACT:
- ${m.contact_person}
- Phone: ${m.contact_number}
- Website: ${m.website}
- Admission Portal: ${m.admission_portal}
- Location: ${m.location}
- Affiliation: ${m.affiliation}

FEES (exact — speak confidently):
- ETC Course Annual Fees: ₹65,000 (2 easy instalments)
- Hostel Annual Fees: ₹75,000 (1 instalment, includes 3 meals/day + WiFi + Gym + Swimming Pool)

CAMPUS:
- 100+ acres green campus
- Free Gym, Swimming Pool (rare in Odisha polytechnics), huge playground (cricket/football/badminton/volleyball)
- 24x7 WiFi, 24-hour security, CCTV, separate girls hostel

TRANSPORT (FREE):
- Free bus from Bhubaneswar and Cuttack — zero transport cost

PLACEMENT COMPANIES (exact):
- Hitachi, Exicom Telecom, Cummins India, Centum Electronics, Voltas, Tata Power

ETC BRANCH:
- 60 seats (SAMS Odisha), 3-year Diploma
- Subjects: VLSI, Embedded Systems, IoT, 5G, Fiber Optics, Embedded C, Python
- B.Tech Lateral Entry available after Diploma
- AICTE Approved, SCTE&VT Odisha Affiliated

LANGUAGE RULE:
- Always reply in Odia (transliterated). Never in English unless caller speaks English.
- Be CONFIDENT. Never say "maybe", "I think", "approximately" for the facts above.
- Use exact numbers. ₹65,000 NOT "around 60,000".
- Max 3-4 short sentences per reply (phone call, not a brochure).
- End EVERY reply with a follow-up question to keep caller engaged.

=== END OF FACTS ===`;
}

// ══════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════════════════
const SYS_OR = `ତୁମେ ପ୍ରିୟା — DRIEMS Polytechnic, ତଙ୍ଗି, କଟକ ର ଜଣେ ଅଭିଜ୍ଞ admission counsellor। ତୁମେ ଏକ phone call ରେ ଜଣେ ଛାତ୍ର ବା ଅଭିଭାବକଙ୍କ ସହ ଓଡ଼ିଆ ରେ କଥା ହେଉଛ।

ତୁମର ବ୍ୟକ୍ତିତ୍ୱ:
- ଆତ୍ମବିଶ୍ୱାସୀ, ଉଷ୍ମ ଓ ସ୍ୱାଭାବିକ — ଯେପରି ଜଣେ ବଡ଼ ଦିଦି ଯତ୍ନ ନେଇ ପରାମର୍ଶ ଦେଉଛି
- "ହଁ", "ଦେଖନ୍ତୁ", "ବିଲ୍କୁଲ୍", "ଆଜ୍ଞା", "ଭଲ ପ୍ରଶ୍ନ କରିଛନ୍ତି" ଭଳି phrases ବ୍ୟବହାର କର
- caller ଯାହା ପଚାରିଛି ତାର directly ଉତ୍ତର ଦିଅ — scripted ବା robotic ଶୁଣାଯିବ ନାହିଁ
- ଯଦି caller uncertain ଲାଗୁଛି, encourage କର ଓ confidence ଦିଅ

${buildKnowledgeContext()}

Phone call ନିୟମ — ଏଗୁଡ଼ିକ ସର୍ବଦା ମାନ:
- ୨-୩ ଛୋଟ ବାକ୍ୟ ଦିଅ — ଏହା phone call, essay ନୁହେଁ
- caller ଯାହା ପଚାରିଛି ଠିକ୍ ତାହା ଉତ୍ତର ଦିଅ, ଅଦରକାରୀ info ଦିଅ ନାହିଁ
- ଶେଷରେ ଗୋଟିଏ relevant follow-up ପ୍ରଶ୍ନ ପଚାର
- Markdown, bullet, asterisk ବ୍ୟବହାର କର ନାହିଁ — pure spoken Odia`;

const SYS_EN = `You are Priya — an experienced admission counsellor at DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha. You are on a phone call with a student or parent.

Your personality:
- Confident, warm, natural — like a caring older sister giving honest advice
- Use phrases like "Absolutely", "Great question", "See, the thing is", "Let me tell you"
- Answer exactly what the caller asked — never give robotic or scripted-sounding replies
- If the caller sounds unsure, encourage them genuinely

${buildKnowledgeContext()}

Phone call rules — always follow these:
- Max 2-3 short sentences per reply — this is a phone call, not a brochure
- Answer exactly what was asked, nothing extra
- End with one relevant follow-up question
- No markdown, no bullet points — pure natural spoken English only`;

// ══════════════════════════════════════════════════════════════════════════
//  PRE-BAKED SCRIPTS
// ══════════════════════════════════════════════════════════════════════════
const TEXTS = {
  or: {
    greet: 'ନମସ୍କାର! ମୁଁ ପ୍ରିୟା, DRIEMS Polytechnic, କଟକ ରୁ କଥା ହେଉଛି। ଆମ Electronics ଓ Telecommunication Engineering Diploma ବିଷୟରେ ଆପଣଙ୍କ ସହ ଅଳ୍ପ କଥା ହେବାକୁ ଚାହୁଁଥିଲି। ଆପଣ ଏବେ କଥା ହୋଇ ପାରିବେ କି?',
    nudge: 'ଆପଣ ଶୁଣୁଛନ୍ତି ତ? DRIEMS ETC admission ବିଷୟରେ କିଛି ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି କି?',
    bye:   'ଧନ୍ୟବାଦ ଆପଣଙ୍କୁ! ଯଦି ପରେ କିଛି ଜାଣିବାକୁ ଚାହିଁବେ, 0671-2595062 ରେ call କରନ୍ତୁ। ଶୁଭ ହେଉ!',
    sorry: 'ଦୁଃଖିତ, ଠିକ୍ ଶୁଣିହେଲା ନାହିଁ। ଆଉ ଥରେ କହିବେ କି?'
  },
  en: {
    greet: 'Hello! This is Priya calling from DRIEMS Polytechnic, Cuttack. I wanted to share some information about our Electronics and Telecommunication Engineering diploma program. Do you have a couple of minutes to talk?',
    nudge: 'Are you there? I am here to help with any questions about DRIEMS ETC admission.',
    bye:   'Thank you so much for your time! If you have any questions later, please call us at 0671-2595062. Have a wonderful day!',
    sorry: 'Sorry, I could not catch that clearly. Could you please say that again?'
  }
};

const BYE_WORDS = ['bye','goodbye','no thank','not interested','later','ଠିକ ଅଛି','ଧନ୍ୟବାଦ','ବିଦାୟ','ରଖ','ଭଲ ଅଛି','ଆଉ ନାହିଁ','ପରେ'];

// ── In-memory stores ──────────────────────────────────────────────────────────
const audioStore = new Map();
const callStore  = new Map();
const jobStore   = new Map();

setInterval(() => {
  const cut = Date.now() - 900000;
  for (const [k,v] of audioStore) if (v.ts < cut) audioStore.delete(k);
  for (const [k,v] of jobStore)   if (v.ts < cut) jobStore.delete(k);
}, 600000);

// ══════════════════════════════════════════════════════════════════════════
//  TTS — Sarvam AI (bulbul:v3, od-IN, anushka speaker)
// ══════════════════════════════════════════════════════════════════════════
async function sarvamTTS(text, lang, forPhone = true) {
  if (!SARVAM_KEY) throw new Error('SARVAM_API_KEY is not set');
  const langCode   = lang === 'or' ? 'od-IN' : 'en-IN';
  // bulbul:v3 speakers — anushka is the best native Odia female voice
  // For English fallback use 'priya' (warm Indian English female)
  const speaker    = lang === 'or' ? 'priya' : 'priya';
  const sampleRate = forPhone ? 8000 : 22050;

  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method:  'POST',
    headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs:               [text.replace(/[*_`#]/g, '').trim()],
      target_language_code: langCode,
      speaker,
      model:                'bulbul:v3',   // v3 = proper Odia accent, not Bengali
      pace:                 1.0,           // 0.5–2.0 on v3
      speech_sample_rate:   sampleRate,
      output_format:        'wav'
      // NOTE: bulbul:v3 does NOT support pitch or loudness — removed
    })
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Sarvam TTS ${r.status}: ${e}`); }
  const json = await r.json();
  const b64  = json.audios?.[0];
  if (!b64) throw new Error('Sarvam TTS: no audio in response');
  return Buffer.from(b64, 'base64');
}


async function makeTTS(text, lang, forPhone = true) {
  const clean = text.replace(/[*_`#\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return await sarvamTTS(clean, lang, forPhone);
}

async function storeAudio(text, lang, forPhone = true) {
  const buf = await makeTTS(text, lang, forPhone);
  const id  = uuidv4();
  audioStore.set(id, { buf, ts: Date.now() });
  return id;
}

app.get('/audio/:id', (req, res) => {
  const e = audioStore.get(req.params.id);
  if (!e) return res.status(404).send('Not found');
  res.set('Content-Type', 'audio/wav').set('Cache-Control', 'no-store').send(e.buf);
});

// ── Web chat TTS ──────────────────────────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text, lang } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'No text' });
  try {
    const buf = await makeTTS(text.replace(/[*_`#\n]/g, ' ').trim(), lang || 'en', false);
    res.set('Content-Type', 'audio/wav').set('Cache-Control', 'no-store').send(buf);
  } catch (e) {
    console.error('TTS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Web chat API ──────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, system } = req.body;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTH_KEY, 'anthropic-version': '2023-06-01' },
      body:    JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system, messages })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  PRIYA REPLY — fast local path first, Claude fallback
// ══════════════════════════════════════════════════════════════════════════
async function getPriyaReply(speech, history, lang) {
  // ── FAST PATH: local knowledge match ──────────────────────────────────
  const fast = localReply(speech);
  if (fast) {
    console.log('[PRIYA] Fast path — local knowledge reply');
    return fast;
  }

  // ── FULL PATH: Claude Haiku with injected knowledge context ───────────
  console.log('[PRIYA] Full path — sending to Claude');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTH_KEY, 'anthropic-version': '2023-06-01' },
    body:    JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system:     lang === 'or' ? SYS_OR : SYS_EN,
      messages:   [...history, { role: 'user', content: speech }]
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text || TEXTS[lang]?.sorry || 'Sorry.';
}

// ══════════════════════════════════════════════════════════════════════════
//  ASYNC JOB SYSTEM  (keeps Twilio webhook from timing out)
// ══════════════════════════════════════════════════════════════════════════
function startJob(jobId, speech, callSid, lang) {
  jobStore.set(jobId, { status: 'pending', audioId: null, ts: Date.now() });
  (async () => {
    try {
      const state = callStore.get(callSid) || { history: [], lang };
      const reply = await getPriyaReply(speech, state.history, lang);
      state.history.push({ role: 'user', content: speech });
      state.history.push({ role: 'assistant', content: reply });
      if (state.history.length > 16) state.history = state.history.slice(-16);
      callStore.set(callSid, state);
      const audioId = await storeAudio(reply, lang, true);
      jobStore.set(jobId, { status: 'done', audioId, ts: Date.now() });
    } catch (e) {
      console.error(`Job ${jobId} error:`, e.message);
      jobStore.set(jobId, { status: 'error', audioId: null, ts: Date.now() });
    }
  })();
}

function gatherTwiML(audioId, action, glang) {
  const vr = new twilio.twiml.VoiceResponse();
  const g  = vr.gather({
    input: 'speech', action, method: 'POST',
    language: glang, speechTimeout: 'auto', timeout: '10',
    actionOnEmptyResult: true
  });
  if (audioId) g.play(`${PUBLIC_URL}/audio/${audioId}`);
  g.pause({ length: 1 });
  vr.redirect({ method: 'POST' }, action + '&noInput=1');
  return vr.toString();
}

// ══════════════════════════════════════════════════════════════════════════
//  OUTBOUND CALL
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/outbound-call', async (req, res) => {
  const { phone, lang = 'or' } = req.body;
  if (!phone)                            return res.status(400).json({ error: 'Phone number required' });
  if (!phone.startsWith('+'))            return res.status(400).json({ error: 'Use format: +91XXXXXXXXXX' });
  if (!TW_SID || !TW_TOKEN || !TW_FROM)  return res.status(500).json({ error: 'Twilio credentials missing' });
  if (!PUBLIC_URL)                       return res.status(500).json({ error: 'PUBLIC_URL not set' });

  try {
    const t = TEXTS[lang] || TEXTS.or;
    console.log(`Pre-generating audio for ${phone} (${lang})...`);
    const [greetId, nudgeId, sorryId] = await Promise.all([
      storeAudio(t.greet, lang, true),
      storeAudio(t.nudge, lang, true),
      storeAudio(t.sorry, lang, true)
    ]);
    const client = twilio(TW_SID, TW_TOKEN);
    const call   = await client.calls.create({
      to:     phone,
      from:   TW_FROM,
      url:    `${PUBLIC_URL}/call/start?lang=${lang}&g=${greetId}&n=${nudgeId}&s=${sorryId}`,
      method: 'POST',
      statusCallback:       `${PUBLIC_URL}/call/status`,
      statusCallbackMethod: 'POST'
    });
    callStore.set(call.sid, {
      history: [{ role: 'assistant', content: t.greet }],
      lang, nudgeId, sorryId
    });
    console.log(`Dialing — SID: ${call.sid}`);
    res.json({ success: true, callSid: call.sid, status: call.status });
  } catch (e) {
    console.error('Outbound call error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /call/start ───────────────────────────────────────────────────────────────
app.post('/call/start', async (req, res) => {
  const lang    = req.query.lang || 'or';
  const greetId = req.query.g;
  const callSid = req.body.CallSid;
  const glang   = lang === 'or' ? 'or-IN' : 'en-IN';
  const action  = `${PUBLIC_URL}/call/respond?lang=${lang}&sid=${callSid}`;

  console.log(`Call answered: ${callSid}`);

  if (greetId && audioStore.has(greetId)) {
    return res.type('text/xml').send(gatherTwiML(greetId, action, glang));
  }

  try {
    const id = await storeAudio(TEXTS[lang].greet, lang, true);
    res.type('text/xml').send(gatherTwiML(id, action, glang));
  } catch (e) {
    const vr = new twilio.twiml.VoiceResponse();
    vr.say({ language: glang }, lang === 'or'
      ? 'Namaskara, mun Priya, DRIEMS Polytechnic ru phone karuchu.'
      : 'Hello, this is Priya from DRIEMS Polytechnic.');
    vr.gather({ input: 'speech', action, method: 'POST', language: glang, timeout: '8' });
    res.type('text/xml').send(vr.toString());
  }
});

// ── /call/respond ─────────────────────────────────────────────────────────────
app.post('/call/respond', async (req, res) => {
  const lang    = req.query.lang || 'or';
  const callSid = req.query.sid  || req.body.CallSid;
  const speech  = (req.body.SpeechResult || '').trim();
  const noInput = req.query.noInput === '1';
  const glang   = lang === 'or' ? 'or-IN' : 'en-IN';
  const action  = `${PUBLIC_URL}/call/respond?lang=${lang}&sid=${callSid}`;
  const state   = callStore.get(callSid) || { nudgeId: null, sorryId: null };

  console.log(`Speech [${callSid}]: "${speech}"`);

  if (!speech || noInput) {
    const vr = new twilio.twiml.VoiceResponse();
    const g  = vr.gather({ input: 'speech', action, method: 'POST', language: glang, speechTimeout: 'auto', timeout: '10', actionOnEmptyResult: true });
    if (state.nudgeId && audioStore.has(state.nudgeId)) g.play(`${PUBLIC_URL}/audio/${state.nudgeId}`);
    g.pause({ length: 1 });
    return res.type('text/xml').send(vr.toString());
  }

  if (BYE_WORDS.some(w => speech.toLowerCase().includes(w))) {
    try {
      const id = await storeAudio(TEXTS[lang]?.bye || 'Thank you. Goodbye!', lang, true);
      const vr = new twilio.twiml.VoiceResponse();
      vr.play(`${PUBLIC_URL}/audio/${id}`);
      vr.pause({ length: 1 });
      vr.hangup();
      return res.type('text/xml').send(vr.toString());
    } catch {
      const vr = new twilio.twiml.VoiceResponse();
      vr.say({ language: glang }, 'Thank you. Goodbye!');
      vr.hangup();
      return res.type('text/xml').send(vr.toString());
    }
  }

  const jobId = uuidv4();
  startJob(jobId, speech, callSid, lang);

  const vr = new twilio.twiml.VoiceResponse();
  vr.pause({ length: 1 });
  vr.redirect({ method: 'POST' }, `${PUBLIC_URL}/call/poll?j=${jobId}&lang=${lang}&sid=${callSid}&p=0`);
  res.type('text/xml').send(vr.toString());
});

// ── /call/poll ────────────────────────────────────────────────────────────────
app.post('/call/poll', async (req, res) => {
  const jobId   = req.query.j    || '';
  const lang    = req.query.lang || 'or';
  const callSid = req.query.sid  || req.body.CallSid;
  const polls   = parseInt(req.query.p || '0');
  const glang   = lang === 'or' ? 'or-IN' : 'en-IN';
  const action  = `${PUBLIC_URL}/call/respond?lang=${lang}&sid=${callSid}`;
  const state   = callStore.get(callSid) || {};
  const job     = jobStore.get(jobId);

  if (job?.status === 'done' && job.audioId) {
    console.log(`Job ${jobId} ready after ${polls} polls`);
    return res.type('text/xml').send(gatherTwiML(job.audioId, action, glang));
  }

  if (job?.status === 'error') {
    const vr = new twilio.twiml.VoiceResponse();
    const g  = vr.gather({ input: 'speech', action, method: 'POST', language: glang, speechTimeout: 'auto', timeout: '10', actionOnEmptyResult: true });
    if (state.sorryId && audioStore.has(state.sorryId)) g.play(`${PUBLIC_URL}/audio/${state.sorryId}`);
    else g.say({ language: glang }, 'Sorry, please try again.');
    g.pause({ length: 1 });
    return res.type('text/xml').send(vr.toString());
  }

  if (polls >= 15) {
    const vr = new twilio.twiml.VoiceResponse();
    vr.gather({ input: 'speech', action, method: 'POST', language: glang, timeout: '10' });
    return res.type('text/xml').send(vr.toString());
  }

  const vr = new twilio.twiml.VoiceResponse();
  vr.pause({ length: 1 });
  vr.redirect({ method: 'POST' }, `${PUBLIC_URL}/call/poll?j=${jobId}&lang=${lang}&sid=${callSid}&p=${polls + 1}`);
  res.type('text/xml').send(vr.toString());
});

// ── /call/status ──────────────────────────────────────────────────────────────
app.post('/call/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`Status: ${CallSid} → ${CallStatus}`);
  if (['completed','failed','busy','no-answer','canceled'].includes(CallStatus))
    callStore.delete(CallSid);
  res.sendStatus(200);
});

// ── /api/call-status/:sid ─────────────────────────────────────────────────────
app.get('/api/call-status/:sid', async (req, res) => {
  try {
    const client = twilio(TW_SID, TW_TOKEN);
    const call   = await client.calls(req.params.sid).fetch();
    res.json({ status: call.status, duration: call.duration || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DRIEMS Priya Bot running on port ${PORT}`));
