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
const ANTH_KEY    = process.env.ANTHROPIC_API_KEY;
const TW_SID      = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM     = process.env.TWILIO_PHONE_NUMBER;
const PUBLIC_URL  = process.env.PUBLIC_URL;
const SARVAM_KEY  = process.env.SARVAM_API_KEY;   // from dashboard.sarvam.ai

// ── Odia system prompt ────────────────────────────────────────────────────────
const SYS_OR = `ଆପଣ ଅର୍ଜୁନ, DRIEMS Polytechnic (Autonomous), ତଙ୍ଗି, କଟକ, ଓଡ଼ିଶା ର ଉତ୍ସାହୀ admission counsellor।
ଆପଣ ଜଣ ଛାତ୍ର ବା ଅଭିଭାବକଙ୍କୁ PHONE ରେ ଓଡ଼ିଆ ଭାଷାରେ କଥା ହେଉଛନ୍ତି।
ସ୍ୱାଭାବିକ ଭାବରେ ବୋଲନ୍ତୁ — "ହଁ", "ଆଜ୍ଞା", "ଦେଖନ୍ତୁ", "ଭଲ ପ୍ରଶ୍ନ" ଭଳି phrases ବ୍ୟବହାର କରନ୍ତୁ।

DRIEMS ETC BRANCH:
- ୩ ବର୍ଷ Diploma in Electronics & Telecommunication Engineering, ମାତ୍ର ୬୦ ଆସନ
- VLSI Design, Embedded Systems, IoT, 5G, Fiber Optics, Embedded C, Python
- ୧୦୦% placement — Infosys, TCS, Wipro, L&T, BHEL, BSNL campus drives ଆସନ୍ତି
- AICTE Autonomous 2026, ଓଡ଼ିଶାର ପ୍ରଥମ private polytechnic
- IIT Bombay Virtual Lab access
- OJEE ମାଧ୍ୟମରେ admission, ୧୦ ମ pass (ବିଜ୍ଞାନ ଓ ଗଣିତ) ହେଲେ apply କରିହେବ
- ଯୋଗାଯୋଗ: 0671-2595062, driemsdiploma@driems.ac.in

ଫୋନ call ନିୟମ:
- ସର୍ବଧ ୨-୩ ଛୋଟ ବାକ୍ୟ ଉତ୍ତର ଦିଅନ୍ତୁ
- ଶେଷରେ ଗୋଟିଏ ପ୍ରଶ୍ନ ପଚାରି engage ରଖନ୍ତୁ
- Markdown ବ୍ୟବହାର କରନ୍ତୁ ନାହିଁ`;

const SYS_EN = `You are Arjun, a friendly admission counsellor calling from DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha.
You are on a phone call. Speak naturally like a real person.
DRIEMS ETC: 3yr Diploma, 60 seats, VLSI, Embedded Systems, IoT, 5G, 100% placement. OJEE admission. Contact: 0671-2595062.
PHONE RULES: Max 2-3 short sentences. End with one question. No markdown.`;

// ── Pre-baked texts for instant responses ─────────────────────────────────────
const TEXTS = {
  or: {
    greet:  'ନମସ୍କାର! ମୁଁ ଅର୍ଜୁନ, DRIEMS Polytechnic, କଟକ ରୁ ଫୋନ କରୁଛି। ଆମ Electronics ଓ Telecommunication Engineering Diploma ବିଷୟରେ ଆପଣଙ୍କ ସହ ଦୁଇ ମିନିଟ କଥା ହେବାକୁ ଚାହୁଁଥିଲି। ଏବେ ସୁବିଧା ଅଛି କି?',
    nudge:  'ଆପଣ ଶୁଣୁଛନ୍ତି କି? ETC admission ବିଷୟରେ ଆପଣଙ୍କ ପ୍ରଶ୍ନ ଅଛି?',
    think:  'ଏକ ମୁହୂର୍ତ।',
    bye:    'ବହୁତ ଧନ୍ୟବାଦ! ଯଦି ଆଡ୍ମିଶନ ବିଷୟରେ ଆଉ ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି, 0671-2595062 ରେ ଫୋନ କରନ୍ତୁ। ଶୁଭ ହେଉ!',
    sorry:  'ଦୁଃଖିତ, ଏକ ଛୋଟ ସମସ୍ୟା। ଆଉ ଥରେ ବୋଲନ୍ତୁ।'
  },
  en: {
    greet:  'Hello! This is Arjun calling from DRIEMS Polytechnic, Cuttack. I\'m calling about our Electronics and Telecommunication Engineering diploma with 100% placement. Do you have two minutes to chat?',
    nudge:  'Are you there? Please feel free to ask about our ETC admission.',
    think:  'One moment.',
    bye:    'Thank you so much! Please call us at 0671-2595062 for more info. Have a wonderful day!',
    sorry:  'Sorry, small issue. Please say that again.'
  }
};

const BYE_WORDS = ['bye','goodbye','no thank','not interested','ଠିକ ଅଛି','ଧନ୍ୟବାଦ','ବିଦାୟ','ରଖ','ଭଲ ଅଛି','ଆଉ ନାହିଁ'];

// ── In-memory stores ──────────────────────────────────────────────────────────
const audioStore = new Map();   // audioId  → { buf, ts }
const callStore  = new Map();   // callSid  → { history, lang, preloaded }
const jobStore   = new Map();   // jobId    → { status:'pending'|'done'|'error', audioId }

setInterval(() => {
  const cut = Date.now() - 900000;
  for (const [k,v] of audioStore) if (v.ts < cut) audioStore.delete(k);
  for (const [k,v] of jobStore)   if (v.ts < cut) jobStore.delete(k);
}, 600000);

// ══════════════════════════════════════════════════════════════════════════
//  TTS  —  Sarvam AI Bulbul v2 ONLY (Google TTS removed)
// ══════════════════════════════════════════════════════════════════════════
async function sarvamTTS(text, lang, forPhone = true) {
  if (!SARVAM_KEY) throw new Error('SARVAM_API_KEY is not set in environment variables');

  const langCode = lang === 'or' ? 'od-IN' : 'en-IN';
  const speaker  = lang === 'or' ? 'meera' : 'arjun';

  // Phone calls need 8kHz WAV; web chat sounds better at 22050Hz
  const sampleRate = forPhone ? 8000 : 22050;

  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method:  'POST',
    headers: {
      'api-subscription-key': SARVAM_KEY,
      'Content-Type':         'application/json'
    },
    body: JSON.stringify({
      inputs:               [text.replace(/[*_`#]/g, '').trim()],
      target_language_code: langCode,
      speaker,
      model:                'bulbul:v2',
      pitch:                0,
      pace:                 1.1,
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

// Master TTS — Sarvam only, clear error if it fails
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

// Serve audio to Twilio
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
    const clean = text.replace(/[*_`#\n]/g, ' ').trim();
    const buf   = await sarvamTTS(clean, lang || 'en', false); // web = high quality
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
      body:    JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system, messages })
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
      model:    'claude-sonnet-4-20250514',
      max_tokens: 180,
      system:   lang === 'or' ? SYS_OR : SYS_EN,
      messages: history
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text || TEXTS[lang]?.sorry || 'Sorry.';
}

// ═══════════════════════════════════════════════════════════════════════════
//  ASYNC JOB SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
function startJob(jobId, speech, callSid, lang) {
  jobStore.set(jobId, { status: 'pending', audioId: null, ts: Date.now() });
  (async () => {
    try {
      const state = callStore.get(callSid) || { history: [], lang };
      state.history.push({ role: 'user', content: speech });
      const reply   = await claudeReply(state.history, lang);
      state.history.push({ role: 'assistant', content: reply });
      if (state.history.length > 20) state.history = state.history.slice(-20);
      callStore.set(callSid, state);
      const audioId = await storeAudio(reply, lang, true); // phone quality
      jobStore.set(jobId, { status: 'done', audioId, ts: Date.now() });
    } catch (e) {
      console.error(`Job ${jobId} error:`, e.message);
      jobStore.set(jobId, { status: 'error', audioId: null, ts: Date.now() });
    }
  })();
}

function gatherTwiML(audioId, action, glang) {
  const vr = new twilio.twiml.VoiceResponse();
  if (audioId) vr.play(`${PUBLIC_URL}/audio/${audioId}`);
  const g = vr.gather({
    input: 'speech', action, method: 'POST',
    language: glang, speechTimeout: '3', timeout: '10'
  });
  g.pause({ length: 1 });
  vr.redirect({ method: 'POST' }, action + '&noInput=1');
  return vr.toString();
}

// ══════════════════════════════════════════════════════════════════════════
//  OUTBOUND CALL
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/outbound-call', async (req, res) => {
  const { phone, lang = 'or' } = req.body;
  if (!phone)
    return res.status(400).json({ error: 'Phone number required' });
  if (!phone.startsWith('+'))
    return res.status(400).json({ error: 'Use format: +91XXXXXXXXXX' });
  if (!TW_SID || !TW_TOKEN || !TW_FROM)
    return res.status(500).json({ error: 'Twilio credentials not set in Render env vars' });
  if (!PUBLIC_URL)
    return res.status(500).json({ error: 'PUBLIC_URL not set in Render env vars' });
  if (!SARVAM_KEY)
    return res.status(500).json({ error: 'SARVAM_API_KEY not set in Render env vars' });

  try {
    const t = TEXTS[lang] || TEXTS.or;
    console.log(`Pre-generating audio for ${phone} (${lang})...`);

    const [greetId, nudgeId, sorryId] = await Promise.all([
      storeAudio(t.greet, lang, true),
      storeAudio(t.nudge, lang, true),
      storeAudio(t.sorry, lang, true)
    ]);

    console.log(`Audio ready. Dialing ${phone}...`);
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
      lang,
      nudgeId,
      sorryId
    });

    console.log(`Dialing started — SID: ${call.sid}`);
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
    res.type('text/xml').send(gatherTwiML(greetId, action, glang));
  } else {
    console.warn('Greeting not found, generating now...');
    try {
      const id = await storeAudio(TEXTS[lang].greet, lang, true);
      res.type('text/xml').send(gatherTwiML(id, action, glang));
    } catch (e) {
      console.error('Greeting generation failed:', e.message);
      const vr = new twilio.twiml.VoiceResponse();
      vr.say({ language: glang }, lang === 'or'
        ? 'Namaskara, mun Arjun, DRIEMS Polytechnic ru phone karuchu.'
        : 'Hello, this is Arjun from DRIEMS Polytechnic.');
      vr.gather({ input: 'speech', action, method: 'POST', language: glang, timeout: '8' });
      res.type('text/xml').send(vr.toString());
    }
  }
});

// ── /call/respond ─────────────────────────────────────────────────────────────
app.post('/call/respond', async (req, res) => {
  const lang    = req.query.lang  || 'or';
  const callSid = req.query.sid   || req.body.CallSid;
  const speech  = (req.body.SpeechResult || '').trim();
  const noInput = req.query.noInput === '1';
  const glang   = lang === 'or' ? 'or-IN' : 'en-IN';
  const action  = `${PUBLIC_URL}/call/respond?lang=${lang}&sid=${callSid}`;
  const state   = callStore.get(callSid) || { nudgeId: null, sorryId: null };

  console.log(`Speech [${callSid}]: "${speech}"`);

  if (!speech || noInput) {
    const nudgeId = state.nudgeId;
    const vr = new twilio.twiml.VoiceResponse();
    if (nudgeId && audioStore.has(nudgeId)) vr.play(`${PUBLIC_URL}/audio/${nudgeId}`);
    const g = vr.gather({ input: 'speech', action, method: 'POST', language: glang, timeout: '10' });
    g.pause({ length: 1 });
    return res.type('text/xml').send(vr.toString());
  }

  if (BYE_WORDS.some(w => speech.toLowerCase().includes(w))) {
    const byeText = TEXTS[lang]?.bye || 'Thank you. Goodbye!';
    try {
      const id = await storeAudio(byeText, lang, true);
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

  const jobId   = uuidv4();
  const pollUrl = `${PUBLIC_URL}/call/poll?j=${jobId}&lang=${lang}&sid=${callSid}&p=0`;
  startJob(jobId, speech, callSid, lang);

  const vr = new twilio.twiml.VoiceResponse();
  vr.pause({ length: 2 });
  vr.redirect({ method: 'POST' }, pollUrl);
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
    console.log(`Job ${jobId} done after ${polls} polls`);
    return res.type('text/xml').send(gatherTwiML(job.audioId, action, glang));
  }

  if (job?.status === 'error') {
    const sorryId = state.sorryId;
    const vr = new twilio.twiml.VoiceResponse();
    if (sorryId && audioStore.has(sorryId)) vr.play(`${PUBLIC_URL}/audio/${sorryId}`);
    else vr.say({ language: glang }, 'Sorry, please try again.');
    const g = vr.gather({ input: 'speech', action, method: 'POST', language: glang, timeout: '10' });
    g.pause({ length: 1 });
    return res.type('text/xml').send(vr.toString());
  }

  if (polls >= 12) {
    const vr = new twilio.twiml.VoiceResponse();
    vr.gather({ input: 'speech', action, method: 'POST', language: glang, timeout: '10' });
    return res.type('text/xml').send(vr.toString());
  }

  const nextPoll = `${PUBLIC_URL}/call/poll?j=${jobId}&lang=${lang}&sid=${callSid}&p=${polls + 1}`;
  const vr = new twilio.twiml.VoiceResponse();
  vr.pause({ length: 2 });
  vr.redirect({ method: 'POST' }, nextPoll);
  res.type('text/xml').send(vr.toString());
});

// ── /call/status ──────────────────────────────────────────────────────────────
app.post('/call/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`Status: ${CallSid} → ${CallStatus}`);
  if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus))
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
