const express = require('express');
const fetch   = require('node-fetch');
const twilio  = require('twilio');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// ── Keep-alive (UptimeRobot pings this every 5 min) ──────────────────────────
app.get('/ping', (req, res) => res.send('ok'));

// ── Config ───────────────────────────────────────────────────────────────────
const ANTH_KEY     = process.env.ANTHROPIC_API_KEY;
const TW_SID       = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN     = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM      = process.env.TWILIO_PHONE_NUMBER;
const PUBLIC_URL   = process.env.PUBLIC_URL;

// ── System prompts ───────────────────────────────────────────────────────────
const SYS_EN = `You are Arjun, a friendly enthusiastic admission counsellor at DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha. Speak naturally and warmly like a real person. Expert in Electronics & Telecommunication Engineering (ETC) branch.
PERSONALITY: Warm, encouraging. Short clear sentences. No bullet points.
DRIEMS FACTS: Est. 2003. Contact: 0671-2595062, driemsdiploma@driems.ac.in. www.driemspolytechnic.org. AICTE Autonomous 2026 (first private poly in Odisha). QCI #2.
ETC: 3yr Diploma, 60 seats, VLSI, Embedded Systems, IoT, 5G, Python, C, 100% placement — TCS/Infosys/Wipro/L&T/BHEL/BSNL. IIT Bombay Virtual Lab. Admission via OJEE, 10th pass.
PHONE CALL RULES: Max 2-3 short sentences. Natural phone conversation. Ask one question to keep engagement.`;

const SYS_OR = `ଆପଣ ଅର୍ଜୁନ, DRIEMS Polytechnic (Autonomous), ତଙ୍ଗି, କଟକ, ଓଡ଼ିଶା ର ଉତ୍ସାହୀ admission counsellor। ଓଡ଼ିଆ ଭାଷାରେ ସ୍ୱାଭାବିକ ଭାବରେ କଥା ହୁଅନ୍ତୁ।
DRIEMS: ଫୋନ 0671-2595062। AICTE Autonomous 2026। ETC Branch: ୩ ବର୍ଷ Diploma, ୬୦ ଆସନ, VLSI, IoT, 5G, Python, ୧୦୦% placement।
ଫୋନ CALL: ସର୍ବଧ ୨-୩ ଛୋଟ ବାକ୍ୟ। ସ୍ୱାଭାବିକ ଭାବରେ। ଗୋଟିଏ ପ୍ରଶ୍ନ ପଚାରନ୍ତୁ।`;

const GREET = {
  en: "Hello! This is Arjun calling from DRIEMS Polytechnic, Cuttack. I'm calling about our Electronics and Telecommunication Engineering diploma — we have 100% placement and excellent VLSI curriculum. Do you have two minutes to chat?",
  or: "ନମସ୍କାର! ମୁଁ ଅର୍ଜୁନ, DRIEMS Polytechnic, କଟକ ରୁ ଫୋନ କରୁଛି। ଆମ Electronics ଓ Telecommunication Diploma ବିଷୟରେ ଦୁଇ ମିନିଟ କଥା ହୋଇ ପାରିବ କି?"
};

const BYE_WORDS = ['bye','goodbye','no thank','not interested','hang up',
  'ଠିକ ଅଛି','ଧନ୍ୟବାଦ','ବିଦାୟ','ଆଉ ନାହିଁ','ରଖ','ଭଲ ଅଛି'];

// ── In-memory stores ─────────────────────────────────────────────────────────
const audioStore = new Map();  // id → { buf, ts }
const callStore  = new Map();  // callSid → { history, lang }

setInterval(() => {
  const now = Date.now();
  for (const [id, { ts }] of audioStore)
    if (now - ts > 600000) audioStore.delete(id);
}, 600000);

// ── Google TTS helper ─────────────────────────────────────────────────────────
function splitText(str, max) {
  const chunks = [];
  const sents = str.replace(/([।.!?])\s*/g, '$1|').split('|');
  let cur = '';
  for (const s of sents) {
    if (!s.trim()) continue;
    if ((cur + s).length > max) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = s.length > max ? '' : s;
      if (s.length > max) {
        s.split(' ').forEach(w => {
          if ((cur + ' ' + w).length > max) { if (cur.trim()) chunks.push(cur.trim()); cur = w; }
          else cur += (cur ? ' ' : '') + w;
        });
      }
    } else { cur += (cur ? ' ' : '') + s; }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(c => c.length > 0);
}

async function makeTTS(text, lang) {
  const gl = lang === 'or' ? 'or' : 'en-IN';
  const bufs = [];
  for (const chunk of splitText(text.trim(), 190)) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${gl}&client=tw-ob&ttsspeed=0.9`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://translate.google.com/'
      }
    });
    if (!r.ok) throw new Error('Google TTS HTTP ' + r.status);
    bufs.push(await r.buffer());
  }
  return Buffer.concat(bufs);
}

// ── Store audio, return public URL for Twilio ─────────────────────────────────
async function ttsUrl(text, lang) {
  const buf = await makeTTS(text, lang);
  const id  = uuidv4();
  audioStore.set(id, { buf, ts: Date.now() });
  return `${PUBLIC_URL}/audio/${id}`;
}

// ── Serve stored audio ────────────────────────────────────────────────────────
app.get('/audio/:id', (req, res) => {
  const entry = audioStore.get(req.params.id);
  if (!entry) return res.status(404).send('Not found');
  res.set('Content-Type', 'audio/mpeg');
  res.set('Cache-Control', 'no-store');
  res.send(entry.buf);
});

// ── Web chat: /api/tts ────────────────────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text, lang } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'No text' });
  try {
    const buf = await makeTTS(text, lang || 'en');
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(buf);
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
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTH_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system, messages })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Claude reply helper ───────────────────────────────────────────────────────
async function claudeReply(history, lang) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTH_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 200,
      system:     lang === 'or' ? SYS_OR : SYS_EN,
      messages:   history
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text ||
    (lang === 'or' ? 'ଦୁଃଖିତ, ଏକ ସମସ୍ୟା ହୋଇଛି।' : 'Sorry, small issue. Please try again.');
}

// ── TwiML builder ─────────────────────────────────────────────────────────────
function buildTwiML(audioUrl, gatherAction, gatherLang, hangup = false) {
  const VR = twilio.twiml.VoiceResponse;
  const r  = new VR();
  r.play(audioUrl);
  if (hangup) {
    r.pause({ length: 1 });
    r.hangup();
  } else {
    const g = r.gather({
      input:        'speech',
      action:       gatherAction,
      method:       'POST',
      language:     gatherLang,
      speechTimeout:'3',
      timeout:      '8'
    });
    g.pause({ length: 1 });
    r.redirect({ method: 'POST' }, gatherAction + '?noInput=1');
  }
  return r.toString();
}

// ── POST /api/outbound-call ───────────────────────────────────────────────────
app.post('/api/outbound-call', async (req, res) => {
  const { phone, lang = 'or' } = req.body;
  if (!phone)           return res.status(400).json({ error: 'Phone number required' });
  if (!phone.startsWith('+')) return res.status(400).json({ error: 'Use format: +91XXXXXXXXXX' });
  if (!TW_SID || !TW_TOKEN || !TW_FROM)
    return res.status(500).json({ error: 'Twilio credentials not set in Render environment variables' });
  if (!PUBLIC_URL)
    return res.status(500).json({ error: 'PUBLIC_URL not set in Render environment variables' });

  try {
    const client = twilio(TW_SID, TW_TOKEN);
    const call   = await client.calls.create({
      to:     phone,
      from:   TW_FROM,
      url:    `${PUBLIC_URL}/call/start?lang=${lang}`,
      method: 'POST',
      statusCallback:       `${PUBLIC_URL}/call/status`,
      statusCallbackMethod: 'POST'
    });
    res.json({ success: true, callSid: call.sid, status: call.status });
  } catch (e) {
    console.error('Outbound call error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /call/start — Twilio webhook when answered ──────────────────────────
app.post('/call/start', async (req, res) => {
  const lang    = req.query.lang || 'or';
  const callSid = req.body.CallSid;
  const greet   = GREET[lang] || GREET.or;

  callStore.set(callSid, { history: [{ role: 'assistant', content: greet }], lang });

  try {
    const url     = await ttsUrl(greet, lang);
    const glang   = lang === 'or' ? 'or-IN' : 'en-IN';
    const action  = `${PUBLIC_URL}/call/respond?lang=${lang}&sid=${callSid}`;
    res.type('text/xml').send(buildTwiML(url, action, glang));
  } catch (e) {
    console.error('call/start error:', e.message);
    const r = new twilio.twiml.VoiceResponse();
    r.say({ language: 'or-IN' }, 'ଦୁଃଖିତ, ଏକ ସମସ୍ୟା ହୋଇଛି।');
    r.hangup();
    res.type('text/xml').send(r.toString());
  }
});

// ── POST /call/respond — Twilio sends speech here ────────────────────────────
app.post('/call/respond', async (req, res) => {
  const lang    = req.query.lang || 'or';
  const callSid = req.query.sid  || req.body.CallSid;
  const speech  = (req.body.SpeechResult || '').trim();
  const noInput = req.query.noInput === '1';

  let state = callStore.get(callSid) || { history: [], lang };
  callStore.set(callSid, state);

  const glang  = lang === 'or' ? 'or-IN' : 'en-IN';
  const action = `${PUBLIC_URL}/call/respond?lang=${lang}&sid=${callSid}`;

  try {
    // No speech — prompt gently
    if (!speech || noInput) {
      const nudge = lang === 'or'
        ? 'ଆପଣ ଶୁଣୁଛନ୍ତି କି? ଆଡ୍ମିଶନ ବିଷୟରେ କ\'ଣ ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି?'
        : 'Are you there? Feel free to ask me anything about ETC admission.';
      const url = await ttsUrl(nudge, lang);
      return res.type('text/xml').send(buildTwiML(url, action, glang));
    }

    // Goodbye detection
    if (BYE_WORDS.some(w => speech.toLowerCase().includes(w))) {
      const farewell = lang === 'or'
        ? 'ବହୁତ ଧନ୍ୟବାଦ! ଯଦି ଆଡ୍ମିଶନ ବିଷୟରେ ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି, 0671-2595062 ରେ ଫୋନ କରନ୍ତୁ। ଶୁଭ ହେଉ!'
        : 'Thank you so much! If you want to know more, please call us at 0671-2595062. Have a great day!';
      const url = await ttsUrl(farewell, lang);
      return res.type('text/xml').send(buildTwiML(url, action, glang, true));
    }

    // Add user speech, get Claude reply
    state.history.push({ role: 'user', content: speech });
    const reply = await claudeReply(state.history, lang);
    state.history.push({ role: 'assistant', content: reply });
    if (state.history.length > 20) state.history = state.history.slice(-20);

    const url = await ttsUrl(reply, lang);
    res.type('text/xml').send(buildTwiML(url, action, glang));

  } catch (e) {
    console.error('call/respond error:', e.message);
    const sorry = lang === 'or'
      ? 'ଦୁଃଖିତ, ଏକ ଛୋଟ ସମସ୍ୟା। ଆଉ ଥରେ ଚେଷ୍ଟା କରନ୍ତୁ।'
      : 'Sorry, small issue. Please try again.';
    const url = await ttsUrl(sorry, lang);
    res.type('text/xml').send(buildTwiML(url, action, glang));
  }
});

// ── POST /call/status ─────────────────────────────────────────────────────────
app.post('/call/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus}`);
  if (['completed','failed','busy','no-answer','canceled'].includes(CallStatus))
    callStore.delete(CallSid);
  res.sendStatus(200);
});

// ── GET /api/call-status/:sid ─────────────────────────────────────────────────
app.get('/api/call-status/:sid', async (req, res) => {
  try {
    const client = twilio(TW_SID, TW_TOKEN);
    const call   = await client.calls(req.params.sid).fetch();
    res.json({ status: call.status, duration: call.duration || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('DRIEMS Bot running on port ' + PORT));
