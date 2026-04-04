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
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY;

// ══════════════════════════════════════════════════════════════════════════
//  SYSTEM PROMPTS
//  Priya — confident, warm, knowledgeable DRIEMS ETC counsellor
// ══════════════════════════════════════════════════════════════════════════
const SYS_OR = `ତୁମେ ପ୍ରିୟା — DRIEMS Polytechnic, ତଙ୍ଗି, କଟକ ର ଜଣେ ଅଭିଜ୍ଞ admission counsellor। ତୁମେ ଏକ phone call ରେ ଜଣେ ଛାତ୍ର ବା ଅଭିଭାବକଙ୍କ ସହ ଓଡ଼ିଆ ରେ କଥା ହେଉଛ।

ତୁମର ବ୍ୟକ୍ତିତ୍ୱ:
- ଆତ୍ମବିଶ୍ୱାସୀ, ଉଷ୍ମ ଓ ସ୍ୱାଭାବିକ — ଯେପରି ଜଣେ ବଡ଼ ଦିଦି ଯତ୍ନ ନେଇ ପରାମର୍ଶ ଦେଉଛି
- "ହଁ", "ଦେଖନ୍ତୁ", "ବିଲ୍କୁଲ୍", "ଆଜ୍ଞା", "ଭଲ ପ୍ରଶ୍ନ କରିଛନ୍ତି" ଭଳି phrases ବ୍ୟବହାର କର
- caller ଯାହା ପଚାରିଛି ତାର directly ଉତ୍ତର ଦିଅ — scripted ବା robotic ଶୁଣାଯିବ ନାହିଁ
- ଯଦି caller uncertain ଲାଗୁଛି, encourage କର ଓ confidence ଦିଅ

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
- No markdown, no bullet points — pure natural spoken English only`;

// ══════════════════════════════════════════════════════════════════════════
//  PRE-BAKED SCRIPTS
//  These are Priya's exact words for key moments — edit freely
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
//  TTS — Sarvam AI (primary) → Google Cloud TTS (fallback)
//
//  VOICE SELECTION:
//  Odia  → "manisha" — most natural native Odia female speaker in Sarvam
//  English → "priya" — warm Indian English female voice
//  If manisha sounds unnatural, try "vidya" as alternative
// ══════════════════════════════════════════════════════════════════════════
async function sarvamTTS(text, lang, forPhone = true) {
  if (!SARVAM_KEY) throw new Error('SARVAM_API_KEY is not set');

  const langCode   = lang === 'or' ? 'od-IN' : 'en-IN';
  const speaker    = lang === 'or' ? 'manisha' : 'priya';  // manisha = natural Odia female
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
      pace:                 1.0,   // natural pace — not rushed
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

async function googleCloudTTS(text, lang, forPhone = true) {
  if (!GOOGLE_TTS_KEY) throw new Error('GOOGLE_TTS_KEY is not set');

  const voiceMap = {
    or: { languageCode: 'or-IN', name: 'or-IN-Standard-A', ssmlGender: 'FEMALE' },
    en: { languageCode: 'en-IN', name: 'en-IN-Neural2-A',  ssmlGender: 'FEMALE' }
  };
  const voice         = voiceMap[lang] || voiceMap.en;
  const sampleRate    = forPhone ? 8000 : 22050;
  const audioEncoding = forPhone ? 'LINEAR16' : 'MP3';

  const r = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input:       { text: text.replace(/[*_`#]/g, '').trim() },
        voice,
        audioConfig: { audioEncoding, sampleRateHertz: sampleRate, speakingRate: 1.0 }
      })
    }
  );

  if (!r.ok) {
    const errBody = await r.text();
    console.error(`Google Cloud TTS error ${r.status}:`, errBody);
    throw new Error(`Google Cloud TTS ${r.status}: ${errBody}`);
  }

  const json = await r.json();
  if (!json.audioContent) throw new Error('Google Cloud TTS: no audio in response');
  return Buffer.from(json.audioContent, 'base64');
}

async function makeTTS(text, lang, forPhone = true) {
  const clean = text.replace(/[*_`#\n]/g, ' ').replace(/\s+/g, ' ').trim();
  try {
    return await sarvamTTS(clean, lang, forPhone);
  } catch (e) {
    console.warn(`Sarvam failed (${e.message}), falling back to Google Cloud TTS...`);
    return await googleCloudTTS(clean, lang, forPhone);
  }
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

// ── Claude reply for phone ────────────────────────────────────────────────────
async function claudeReply(history, lang) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTH_KEY, 'anthropic-version': '2023-06-01' },
    body:    JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system:     lang === 'or' ? SYS_OR : SYS_EN,
      messages:   history
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text || TEXTS[lang]?.sorry || 'Sorry.';
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
      const reply = await claudeReply(state.history, lang);
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
