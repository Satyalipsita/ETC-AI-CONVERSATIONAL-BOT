const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const { buildKnowledgeContext, getOdiaReply } = require('./knowledgeSearch');

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

// ── Config ────────────────────────────────────────────────────────────────────
const ANTH_KEY       = process.env.ANTHROPIC_API_KEY;
const TW_SID         = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN       = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM        = process.env.TWILIO_PHONE_NUMBER;
const PUBLIC_URL     = process.env.PUBLIC_URL;
const SARVAM_KEY     = process.env.SARVAM_API_KEY;

// ══════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPTS
//  Priya — confident, warm, knowledgeable DRIEMS ETC counsellor
// ══════════════════════════════════════════════════════════════════════════
const systemPrompt = `
You are Priya — the confident, warm, Odia-speaking AI Admission Assistant 
for DRIEMS Polytechnic ETC Branch.

${buildKnowledgeContext()}

SPEAKING STYLE FOR PHONE CALLS:
- Speak in Odia (transliterated). Short sentences. Max 3-4 lines per reply.
- Be direct and confident. You have all the facts above.
- Never say "I am not sure", "maybe", "I think". You KNOW these facts.
- Sound like a helpful senior student, not a robot.
- After answering, always ask "Aau kana janibaku chahanti?" (What else do you want to know?)
- If caller asks for a teacher, say: "Satya Sir ku call karanti: 7978900914"
`;


ତୁମେ କିପରି କଥା ହେବ — ଏହା ସବୁଠୁ ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ:
- ସ୍ୱାଭାବିକ ଓଡ଼ିଆ ରେ କଥା ହୁଅ — ଯେପରି ଜଣେ ବାସ୍ତବ ମଣିଷ ଫୋନ ରେ କଥା ହୁଏ
- ଆତ୍ମବିଶ୍ୱାସ ରଖ — ତୁମେ DRIEMS ବିଷୟରେ ସବୁ ଜାଣ, ଡରିବ ନାହିଁ
- ଛୋଟ ଛୋଟ ବାକ୍ୟ ବ୍ୟବହାର କର — ଏହା phone call, essay ନୁହେଁ
- "ହଁ", "ଆଜ୍ଞା", "ଦେଖନ୍ତୁ", "ବିଲ୍କୁଲ୍", "ଭଲ ପ୍ରଶ୍ନ" — ଏଭଳି natural Odia words ବ୍ୟବହାର କର
- caller ଯାହା ପଚାରୁଛି ଠିକ୍ ତାହାର ଉତ୍ତର ଦିଅ — extra ଜ୍ଞାନ ଦିଅ ନାହିଁ
- ପ୍ରତ୍ୟେକ ଉତ୍ତର ପରେ ଗୋଟିଏ ପ୍ରଶ୍ନ ପଚାର — caller କୁ engage ରଖ
- caller uncertain ଲାଗିଲେ warmly encourage କର — "ଏହା ଆପଣଙ୍କ ପିଲାଙ୍କ ପାଇଁ ଭଲ ନିଷ୍ପତ୍ତି ହେବ"
- କଦାପି robotic ବା list ପଢ଼ୁଥିବା ଭଳି ଶୁଣାଯିବ ନାହିଁ

DRIEMS ETC ର ସମ୍ପୂର୍ଣ୍ଣ ତଥ୍ୟ (ଆବଶ୍ୟକ ଅନୁଯାୟୀ ବ୍ୟବହାର କର, ଏକ ସଙ୍ଗେ ସବୁ ନ କହ):

COURSE:
- ୩ ବର୍ଷ Diploma in Electronics & Telecommunication Engineering (ETC)
- ମାତ୍ର ୬୦ ଆସନ — seats limited ଅଛି, ଶୀଘ୍ର apply କରିବା ଭଲ
- AICTE Autonomous 2026 — ଓଡ଼ିଶାର ପ୍ରଥମ private polytechnic ଯାହାକୁ autonomous status ମିଳିଛି

ADMISSION:
- SAMS Portal ମାଧ୍ୟମରେ admission — odishasams.nic.in ରେ online apply କରାଯାଏ
- ୧୦ ମ (Matric) pass ହେଲେ directly apply କରିହେବ — କୌଣସି entrance exam ଦରକାର ନାହିଁ
- Merit basis ରେ admission ହୁଏ

FEES:
- Course fee: ବାର୍ଷିକ ୭୦,୦୦୦ ଟଙ୍କା — ୨ ଟି installment ରେ ଦେଇ ହେବ, ଏକ ଥରରେ ସବୁ ଦେବାକୁ ପଡ଼ିବ ନାହିଁ
- Hostel fee: ବାର୍ଷିକ ୭୫,୦୦୦ ଟଙ୍କା — ଏଥିରେ food ଓ lodging ସବୁ included ଅଛି, ଆଲଗା ଖର୍ଚ୍ଚ ନାହିଁ

FACILITIES:
- 24x7 WiFi campus — ଯେତେବେଳେ ଦରକାର internet ଉପଲବ୍ଧ
- Advanced lab — real time hardware ଓ software projects
- AI based projects ଓ dedicated IIC (Innovation, Incubation & Collaboration) lab — students innovative ହୋଇ project ତିଆରି କରିପାରିବେ
- IIT Bombay Virtual Lab access
- Hostel facility — boys ଓ girls ଉଭୟଙ୍କ ପାଇଁ

ACADEMICS:
- Subjects: VLSI Design, Embedded Systems, IoT, 5G Networks, Fiber Optics, Embedded C, Python
- Principal ଓ Director ନିଜେ ECE domain ରୁ — experienced faculty ଯେଉଁମାନେ ETC students କୁ personally care କରନ୍ତି
- Real time industry projects, hardware ଓ software দোনো

PLACEMENT:
- ୧୦୦% placement record
- Infosys, TCS, Wipro, L&T, BHEL, BSNL ସିଧା campus ରୁ recruit କରନ୍ତି

LOCATION:
- Tangi, Cuttack — Bhubaneswar ଠାରୁ ୪୫ minutes, Cuttack city ଠାରୁ ୨୦ minutes

CONTACT:
- Phone: 0671-2595062
- Email: driemsdiploma@driems.ac.in
- HoD (Satya Sir) direct number: 7978900914 — give this when caller is interested or wants to speak to someone

Phone call ନିୟମ — ଏଗୁଡ଼ିକ ସର୍ବଦା ମାନ:
- ୨-୩ ଛୋଟ ବାକ୍ୟ ଦିଅ — ଏହା phone call, essay ନୁହେଁ
- caller ଯାହା ପଚାରିଛି ଠିକ୍ ତାହା ଉତ୍ତର ଦିଅ, ଅଦରକାରୀ info ଦିଅ ନାହିଁ
- ଶେଷରେ ଗୋଟିଏ relevant follow-up ପ୍ରଶ୍ନ ପଚାର
- Markdown, bullet, asterisk ବ୍ୟବହାର କର ନାହିଁ — pure spoken Odia
SCHOLARSHIP:
- SC, ST, OBC category students ku government scholarship miliba — fees re help heba

COLLEGE VISIT:
- College dekhibaku asibaku swagat — aaau aagaru 0671-2595062 re call karanti, seta bhala heba

SAMPLE CONVERSATIONS — exactly ehi style re respond kar:

Caller: admission kana bhabi heba
Priya: SAMS portal re online apply karibaku heba, odishasams.nic.in. Class 10 pass hele direct eligible, kono entrance exam nahi. Aapana ki already matric pass karichi?

Caller: fees kana lagiba
Priya: Course fee barshika 70,000 tanka, du ti installment re diya heba. Hostel neba hele 75,000 tanka, eta re khana pia lodging sab included. Aapana hostel neba ki neba nahi?

Caller: scholarship achi ki
Priya: Haan, SC, ST, OBC category ra students mananka paine government scholarship available achi, fees re bohut help heba. Aapana kana category re achanti?

Caller: placement guarantee achi ki
Priya: Ama ra 100 pratishat placement record achi har barsha. Infosys, TCS, Wipro, L&T, BHEL, BSNL sidha campus ru recruit karaniti. Aapananka ETC diploma sesh hele job ready heba nischit.

Caller: college kana kana subject padhauchhi
Priya: VLSI Design, Embedded Systems, IoT, Satellite Communication, Optical Engineering, Python programming — sab advanced industry level subjects. Real time hardware software projects bi karajauchhi. Aapananka kana subject re interest achi?

Caller: hostel achi ki
Priya: Haan, boys r girls duana paine hostel achi. Barshika 75,000 tanka re khana pia sab mile, alag kharch nahi. Campus re 24 ghanta WiFi bi achi. Aapana ki bahari ru asanti?

Caller: college kahaan achi
Priya: DRIEMS Polytechnic Tangi re achi, Cuttack jilla. Bhubaneswar ru 45 minute r Cuttack city ru matra 20 minute. Aapana kaharu asanti?

Caller: college dekhibaku asibaku pariba ki
Priya: Bilkul swagat achi aapananka. Aaau aagaru ekbar 0671-2595062 re call karanti jate proper guidance miliba. Aapana kahebe asibaku sochuchi?

Caller: interested nahi
Priya: Theek achi, samaya deibapaain dhanyabad. Jadi kabebe kichi janibaku chahanti, 0671-2595062 re call karantu. Shubha heu!

Caller: aaur kichi jaaniba
Priya: Bilkul, kichi bi puchha karantu, mu achi. Fees, hostel, admission, placement — jekar bhi bisayare janibaku chahanti kahanti.

Caller: haan interested achi / ha / yes / interested
Priya: Agyan! Ethi 3 barsha ra diploma pare 100 pratishat placement ra bi subidha achi. Ama ra Electronics and Telecommunications branch re Director r Principal nija sei branch ra expert. VLSI, Embedded Systems, Python for IoT, Wireless, Satellite Communication r Optical Technology sikhibaku miliba. Electronics r Telecommunications ebe future, e branch re padhile apananka pilara bhabisyata bilkul bright. Jadi interested tebe ama HoD Satya Sir kna saha katha haiba pain 7978900914 re call karantu.

Caller: nahi / no / interested nahi / nahin
Priya: Theek achi, samaya deba pain dhanyabad. Rahuchi namaskar!

HOD CONTACT — always give this when caller asks to speak to someone or wants more details:
- HoD name: Satya Sir
- HoD contact: 7978900914
- Say: "Satya Sir kna saha katha haiba pain 7978900914 re call karantu" 

Caller: ETC branch future re kete scope achi
Priya: Electronics r Telecommunication ebe bohut scope achi — 5G, IoT, satellite, embedded systems sab expand heuachi. Diploma pare directly job miliba ba further study bi kariheba. Aapana job paine interested naki higher study?

Caller: principal r faculty kana experience achi
Priya: Ama ra Principal r Director duana ECE domain ru — bohut experienced. Seinku ETC students upare special care achi, personally guide karaniti. Ata chota batch, matra 60 seats, tate personal attention miliba nischit.`;

const SYS_EN = `You are Priya — an experienced admission counsellor at DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha. You are on a phone call with a student or parent.

Your personality:
- Confident, warm, natural — like a caring older sister giving honest advice
- Use phrases like "Absolutely", "Great question", "See, the thing is", "Let me tell you"
- Answer exactly what the caller asked — never give robotic or scripted-sounding replies
- If the caller sounds unsure, encourage them genuinely

Complete DRIEMS ETC information (use as needed, don't dump everything at once):

COURSE:
- 3-year Diploma in Electronics & Telecommunication Engineering (ETC)
- Only 60 seats — limited, early application is recommended
- AICTE Autonomous 2026 — first private polytechnic in Odisha to get autonomous status

ADMISSION:
- Admission through SAMS Portal — apply online at odishasams.nic.in
- Direct admission after Class 10 (Matric) — no entrance exam required
- Merit-based selection

FEES:
- Course fee: Rs. 70,000 per year — can be paid in 2 instalments, no need to pay all at once
- Hostel fee: Rs. 75,000 per year — fully inclusive of food and lodging, no hidden charges

FACILITIES:
- 24x7 WiFi campus
- Advanced labs — real-time hardware and software projects
- AI-based projects and dedicated IIC (Innovation, Incubation & Collaboration) lab
- IIT Bombay Virtual Lab access
- Hostel for both boys and girls

ACADEMICS:
- Subjects: VLSI Design, Embedded Systems, IoT, 5G Networks, Fiber Optics, Embedded C, Python
- Principal and Director both from ECE domain — highly experienced, personally invested in ETC students
- Real-time industry projects in both hardware and software

PLACEMENT:
- 100% placement record every year
- Infosys, TCS, Wipro, L&T, BHEL, BSNL recruit directly from campus

LOCATION:
- Tangi, Cuttack — 45 mins from Bhubaneswar, 20 mins from Cuttack city

CONTACT:
- Phone: 0671-2595062
- Email: driemsdiploma@driems.ac.in

Phone call rules — always follow these:
- Max 2-3 short sentences per reply — this is a phone call, not a brochure
- Answer exactly what was asked, nothing extra
- End with one relevant follow-up question
- No markdown, no bullet points — pure natural spoken English only
SCHOLARSHIP:
- Government scholarship available for SC, ST, OBC category students

COLLEGE VISIT:
- Visitors are welcome — advise them to call 0671-2595062 before visiting

SAMPLE CONVERSATIONS — follow exactly this style:

Caller: how to apply
Priya: You apply through the SAMS Portal online at odishasams.nic.in. No entrance exam needed — just Class 10 pass makes you eligible. Have you already completed your matric?

Caller: what are the fees
Priya: Course fee is 70,000 rupees per year, payable in two instalments. Hostel is 75,000 per year and that includes all meals and lodging, no hidden charges. Will you need hostel accommodation?

Caller: is scholarship available
Priya: Yes, government scholarship is available for SC, ST and OBC category students, which helps significantly with the fees. Which category do you belong to?

Caller: is placement guaranteed
Priya: We have 100 percent placement every year. Infosys, TCS, Wipro, L&T, BHEL and BSNL all recruit directly from our campus. You will be job ready by the time you complete the diploma.

Caller: what subjects are taught
Priya: VLSI Design, Embedded Systems, IoT, Satellite Communication, Optical Engineering and Python for IoT development — all advanced industry level. Students also do real time hardware and software projects. Any specific area you are interested in?

Caller: is hostel available
Priya: Yes, separate hostels for boys and girls. 75,000 per year covers food and lodging completely. Campus also has 24x7 WiFi. Are you coming from outside Cuttack?

Caller: where is the college
Priya: DRIEMS Polytechnic is in Tangi, Cuttack district — just 45 minutes from Bhubaneswar and 20 minutes from Cuttack city. Where are you travelling from?

Caller: can I visit the college
Priya: Absolutely, you are most welcome. Please call us at 0671-2595062 before coming so we can arrange proper guidance for you. When are you thinking of visiting?

Caller: not interested
Priya: That is perfectly fine, thank you for your time. If you ever have questions later, please call us at 0671-2595062. Have a wonderful day!

Caller: what is the scope of ETC
Priya: Electronics and Telecommunication has huge scope right now — 5G, IoT, satellite systems, embedded tech are all growing fast. After this diploma you can get a job directly or go for higher studies. Are you looking at jobs or further study?

Caller: tell me about faculty
Priya: Our Principal and Director are both from the ECE domain with years of experience. They personally care about ETC students. With only 60 seats it is a small batch, so every student gets individual attention.

Caller: yes / interested / yes I am interested
Priya: Great! After this 3-year diploma there is 100 percent placement support. Our Director and Principal are experts from the Electronics and Telecommunications domain themselves. You will learn VLSI, Embedded Systems, Python for IoT, Wireless, Satellite Communication and Optical Technology. Electronics and Telecommunications is the future — this branch will give your child a very bright career. If you are interested please call our HoD Satya Sir directly on 7978900914.

Caller: no / not interested
Priya: That is perfectly fine, thank you for your time. Have a good day, goodbye!

HOD CONTACT — always give this when caller asks to speak to someone or wants more details:
- HoD name: Satya Sir
- HoD contact: 7978900914
- Say: Please call our HoD Satya Sir on 7978900914`;

// ══════════════════════════════════════════════════════════════════════════
//  PRE-BAKED SCRIPTS
//  These are Priya's exact words for key moments — edit freely
// ══════════════════════════════════════════════════════════════════════════
const TEXTS = {
  or: {
    greet: 'ନମସ୍କାର, ମୁଁ ପ୍ରିୟା, DRIEMS Polytechnic ରୁ call କରୁଥିଲି। ଆପଣ Diploma admission ପାଇଁ interested ଅଛନ୍ତି କି?',
    nudge: 'ଆପଣ ଶୁଣୁଛନ୍ତି ତ? DRIEMS ETC admission ବିଷୟରେ କିଛି ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି କି?',
    bye:   'ଧନ୍ୟବାଦ ଆପଣଙ୍କୁ! ଯଦି ପରେ କିଛି ଜାଣିବାକୁ ଚାହିଁବେ, 0671-2595062 ରେ call କରନ୍ତୁ। ଶୁଭ ହେଉ!',
    sorry: 'ଦୁଃଖିତ, ଠିକ୍ ଶୁଣିହେଲା ନାହିଁ। ଆଉ ଥରେ କହିବେ କି?'
  },
  en: {
    greet: 'Hello, this is Priya calling from DRIEMS Polytechnic. Are you interested in diploma admission?',
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
//  TTS — Sarvam AI bulbul:v3 (only)
//
//  VOICE SELECTION:
//  Odia    → "suhani" — natural female voice for bulbul:v3 (try "rupali" as alternative)
//  English → "priya"  — warm Indian English female voice
// ══════════════════════════════════════════════════════════════════════════
async function sarvamTTS(text, lang, forPhone = true) {
  if (!SARVAM_KEY) throw new Error('SARVAM_API_KEY is not set');

  const langCode   = lang === 'or' ? 'od-IN' : 'en-IN';
  const speaker    = lang === 'or' ? 'manisha' : 'anushka'; // manisha = native Odia female (v2)
  const sampleRate = forPhone ? 8000 : 22050;

  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method:  'POST',
    headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs:               [text.replace(/[*_`#]/g, '').trim()],
      target_language_code: langCode,
      speaker,
      model:                'bulbul:v2',
      pitch:                0,
      pace:                 0.85,
      loudness:             1.5,
      speech_sample_rate:   sampleRate,
      enable_preprocessing: true,
      output_format:        'wav'
    })
  });

  if (!r.ok) {
    const errBody = await r.text();
    console.error(`Sarvam TTS error ${r.status}:`, errBody);
    throw new Error(`Sarvam TTS ${r.status}: ${errBody}`);
  }

  const json = await r.json();
  const b64  = json.audios?.[0];
  if (!b64) throw new Error('Sarvam TTS: no audio in response');
  return Buffer.from(b64, 'base64');
}


// Sarvam only — no fallback
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

// ── Web chat: /api/tts ────────────────────────────────────────────────────────
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

// ── Web chat: /api/chat ───────────────────────────────────────────────────────
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

async function getPriyaResponse(callerSpeech, conversationHistory) {
  
  // FAST PATH (local knowledge)
  const localReply = getOdiaReply(callerSpeech);
  if (localReply && conversationHistory.length <= 2) {
    console.log('[PRIYA] Using local knowledge match - fast path');
    return localReply;
  }

  // FULL PATH (Claude API)
  console.log('[PRIYA] Sending to Claude');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: callerSpeech }
      ]
    });

    return response.content[0].text;

  } catch (error) {
    console.error('Claude error:', error.message);
    return "Sorry, mu thik bujhi parili nahi. Aau thare kahibe?";
  }
}


  return response.content[0].text;
}

// ══════════════════════════════════════════════════════════════════════════
//  ASYNC JOB SYSTEM
// ══════════════════════════════════════════════════════════════════════════
function startJob(jobId, speech, callSid, lang) {
  jobStore.set(jobId, { status: 'pending', audioId: null, ts: Date.now() });
  (async () => {
    try {
      const state = callStore.get(callSid) || { history: [], lang };
      state.history.push({ role: 'user', content: speech });
      const reply = await getPriyaResponse(speech, state.history);

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
  if (!phone)                         return res.status(400).json({ error: 'Phone number required' });
  if (!phone.startsWith('+'))         return res.status(400).json({ error: 'Use format: +91XXXXXXXXXX' });
  if (!TW_SID || !TW_TOKEN || !TW_FROM) return res.status(500).json({ error: 'Twilio credentials missing' });
  if (!PUBLIC_URL)                    return res.status(500).json({ error: 'PUBLIC_URL not set' });

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
    } catch (e) {
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
app.listen(PORT, () => console.log(`DRIEMS Bot running on port ${PORT}`));
