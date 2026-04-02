const express  = require('express');
const fetch    = require('node-fetch');
const twilio   = require('twilio');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.get('/ping', (req, res) => res.send('ok'));

// ── Config ───────────────────────────────────────────────────────────────────
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER;   // e.g. +12015550123
const PUBLIC_URL   = process.env.PUBLIC_URL;            // e.g. https://driems-etc-bot.onrender.com
const ANTH_KEY     = process.env.ANTHROPIC_API_KEY;

const twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);

// ── In-memory stores ─────────────────────────────────────────────────────────
const audioStore = new Map();   // id -> { buf, created }
const callStore  = new Map();   // callSid -> { history, lang }

// Clean stale audio every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [id, { created }] of audioStore)
    if (now - created > 600000) audioStore.delete(id);
}, 600000);

// ── System Prompts ────────────────────────────────────────────────────────────
const SYS = {
  en: `You are Arjun, a friendly admission counsellor calling from DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha. You are making an OUTBOUND PHONE CALL to a prospective student or their parent. Speak naturally, warmly, like a real human on a phone call.

IMPORTANT PHONE CALL RULES:
- Keep replies SHORT — max 3 sentences. Phone callers lose patience with long speech.
- Be conversational, not formal. Use natural phrases.
- Occasionally pause and ask a question to keep engagement.
- If they seem uninterested, politely ask if they want to know more or if it's a bad time.
- End call gracefully if they say goodbye/not interested.

DRIEMS ETC BRANCH KEY POINTS:
- 3-year Diploma in Electronics & Telecommunication Engineering (ETC)
- Only 60 seats — very personal attention from faculty
- VLSI Design, Embedded Systems, IoT, 5G, Fiber Optics, Python, C
- 100% placement record — TCS, Infosys, Wipro, L&T, BHEL, BSNL campus drives
- AICTE Autonomous status — first private polytechnic in Odisha (2026)
- IIT Bombay Virtual Lab access
- Admission via OJEE. 10th pass with Science & Maths. Call 0671-2595062
- Website: www.driemspolytechnic.org

Reply in 1-3 short sentences only. No markdown. Be natural like a real phone call.`,

  or: `ଆପଣ ଅର୍ଜୁନ, DRIEMS Polytechnic (Autonomous), ତଙ୍ଗି, କଟକ, ଓଡ଼ିଶା ରୁ PHONE CALL କରୁଛନ୍ତି। ଆପଣ ଜଣେ ଛାତ୍ର ବା ତାଙ୍କ ଅଭିଭାବକଙ୍କୁ ଫୋନ କରୁଛନ୍ତି। ସ୍ୱାଭାବିକ ଓ ଉଷ୍ଣ ଭାବରେ ଓଡ଼ିଆ ଭାଷାରେ ଫୋନ କଥାବାର୍ତ୍ତା ପରି କଥା ହୁଅନ୍ତୁ।

ଫୋନ CALL ନିୟମ:
- ସ୍ୱଳ୍ପ ଉତ୍ତର — ସର୍ବାଧିକ ୩ ବାକ୍ୟ। ଫୋନରେ ଦୀର୍ଘ କଥା ଭଲ ନୁହେଁ।
- ସ୍ୱାଭାବିକ ଭାବରେ କଥା ହୁଅନ୍ତୁ, "ହଁ ଭାଇ", "ଦେଖନ୍ତୁ" ଭଳି phrases ବ୍ୟବହାର କରନ୍ତୁ।
- ଛାତ୍ରଙ୍କୁ ବା ଅଭିଭାବକଙ୍କୁ ପ୍ରଶ୍ନ ପଚାରି engage ରଖନ୍ତୁ।

DRIEMS ETC BRANCH:
- ୩ ବର୍ଷ Diploma, ୬୦ ଆସନ, ୧୦୦% placement
- VLSI, Embedded Systems, IoT, 5G, Python, C ଶିଖ
- Infosys, TCS, Wipro, L&T, BHEL ଆସି campus drive ଦିଅନ୍ତି
- OJEE ମାଧ୍ୟମରେ admission, ୧୦ ମ pass ହେଲେ apply କରିହେବ
- ଯୋଗାଯୋଗ: 0671-2595062

ମାତ୍ର ୧-୩ ଛୋଟ ବାକ୍ୟ ଉତ୍ତର ଦିଅନ୍ତୁ। Markdown ନୁହେଁ।`
};

const GREET = {
  en: "Hello! This is Arjun calling from DRIEMS Polytechnic, Cuttack. Am I speaking with you about the Electronics and Telecommunication diploma admission? We have excellent placement and curriculum. Do you have two minutes to talk?",
  or: "ନମସ୍କାର! ମୁଁ ଅର୍ଜୁନ, DRIEMS Polytechnic, କଟକ ରୁ ଫୋନ କରୁଛି। Electronics ଓ Telecommunication Diploma admission ବିଷୟରେ ଆପଣଙ୍କ ସହ କଥା ହେବାକୁ ଚାହୁଁଥିଲି। ଏବେ ଦୁଇ ମିନିଟ ସମୟ ଅଛି କି?"
};

// ── Google TTS helper ─────────────────────────────────────────────────────────
function splitText(str, max) {
  const chunks = [];
  const sents  = str.replace(/([।.!?])\s*/g, '$1|').split('|');
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
  const glang   = lang === 'or' ? 'or' : 'en-IN';
  const chunks  = splitText(text.trim(), 190);
  const bufs    = [];
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${glang}&client=tw-ob&ttsspeed=0.9`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://translate.google.com/'
      }
    });
    if (!r.ok) throw new Error('Google TTS HTTP ' + r.status);
    bufs.push(await r.buffer());
  }
  return Buffer.concat(bufs);
}

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
        'Content-Type':   'application/json',
        'x-api-key':      ANTH_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system, messages })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Serve stored audio for Twilio ─────────────────────────────────────────────
app.get('/audio/:id', (req, res) => {
  const entry = audioStore.get(req.params.id);
  if (!entry) return res.status(404).send('Not found');
  res.set('Content-Type', 'audio/mpeg');
  res.set('Cache-Control', 'no-store');
  res.send(entry.buf);
});

// ── Twilio: generate TTS, store, return URL ───────────────────────────────────
async function ttsUrl(text, lang) {
  const buf = await makeTTS(text, lang);
  const id  = uuidv4();
  audioStore.set(id, { buf, created: Date.now() });
  return `${PUBLIC_URL}/audio/${id}`;
}

// ── Twilio: Claude response ───────────────────────────────────────────────────
async function claudeReply(history, lang) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-api-key':      ANTH_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SYS[lang] || SYS.or,
      messages: history
    })
  });
  const data = await r.json();
  return data.content?.[0]?.text || (lang === 'or' ? 'ଦୁଃଖିତ, ଏକ ସମସ୍ୟା ହୋଇଛି।' : 'Sorry, there was an issue.');
}

// ── TwiML builder ─────────────────────────────────────────────────────────────
function buildTwiML(audioUrl, gatherAction, gatherLang, hangup = false) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const r = new VoiceResponse();
  r.play(audioUrl);
  if (hangup) {
    r.hangup();
  } else {
    const g = r.gather({
      input:        'speech',
      action:       gatherAction,
      method:       'POST',
      language:     gatherLang,
      speechTimeout: '3',
      timeout:      '10'
    });
    // Silence during gather
    g.pause({ length: 1 });
    // If no input, redirect to same gather
    r.redirect({ method: 'POST' }, gatherAction + '?noInput=1');
  }
  return r.toString();
}

// ── POST /api/outbound-call — initiate call from dashboard ───────────────────
app.post('/api/outbound-call', async (req, res) => {
  const { phone, lang = 'or' } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM)
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  if (!PUBLIC_URL)
    return res.status(500).json({ error: 'PUBLIC_URL env var not set' });

  try {
    const call = await twilioClient.calls.create({
      to:  phone,
      from: TWILIO_FROM,
      url: `${PUBLIC_URL}/call/start?lang=${lang}`,
      method: 'POST',
      statusCallback: `${PUBLIC_URL}/call/status`,
      statusCallbackMethod: 'POST'
    });
    res.json({ success: true, callSid: call.sid, status: call.status });
  } catch (e) {
    console.error('Outbound call error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /call/start — Twilio webhook when call is answered ──────────────────
app.post('/call/start', async (req, res) => {
  const lang   = req.query.lang || 'or';
  const callSid = req.body.CallSid;

  // Init conversation history
  callStore.set(callSid, { history: [], lang });

  try {
    const greetText = GREET[lang] || GREET.or;
    const state = callStore.get(callSid);
    state.history.push({ role: 'assistant', content: greetText });

    const audioUrl = await ttsUrl(greetText, lang);
    const gatherLang = lang === 'or' ? 'or-IN' : 'en-IN';
    const twiml = buildTwiML(
      audioUrl,
      `${PUBLIC_URL}/call/respond?lang=${lang}&callSid=${callSid}`,
      gatherLang
    );
    res.type('text/xml').send(twiml);
  } catch (e) {
    console.error('Call start error:', e);
    const r = new twilio.twiml.VoiceResponse();
    r.say({ language: 'or-IN' }, 'ଦୁଃଖିତ, ଏକ ଛୋଟ ସମସ୍ୟା ହୋଇଛି।');
    r.hangup();
    res.type('text/xml').send(r.toString());
  }
});

// ── POST /call/respond — Twilio sends user speech here ───────────────────────
app.post('/call/respond', async (req, res) => {
  const lang    = req.query.lang || 'or';
  const callSid = req.query.callSid || req.body.CallSid;
  const speech  = req.body.SpeechResult || '';
  const noInput = req.query.noInput === '1';

  let state = callStore.get(callSid);
  if (!state) {
    state = { history: [], lang };
    callStore.set(callSid, state);
  }

  const gatherLang = lang === 'or' ? 'or-IN' : 'en-IN';
  const respondUrl = `${PUBLIC_URL}/call/respond?lang=${lang}&callSid=${callSid}`;

  try {
    // If no speech, gently prompt again
    if (!speech.trim() || noInput) {
      const prompt = lang === 'or'
        ? 'ଆପଣ ଶୁଣୁଛନ୍ତି କି? ଆପଣ ଯଦି ଆଡ୍ମିଶନ ବିଷୟରେ ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି, ପ୍ଲିଜ ବୋଲନ୍ତୁ।'
        : 'Are you there? Please feel free to ask me anything about the ETC admission.';
      const audioUrl = await ttsUrl(prompt, lang);
      return res.type('text/xml').send(buildTwiML(audioUrl, respondUrl, gatherLang));
    }

    // Detect goodbye / not interested
    const bye = ['bye','goodbye','no thank','not interested','hang up','end','ok bye',
                 'ଠିକ ଅଛି','ଧନ୍ୟବାଦ','ବିଦାୟ','ଆଉ ନାହିଁ','ରଖ','ଭଲ ଅଛି'];
    if (bye.some(w => speech.toLowerCase().includes(w))) {
      const farewell = lang === 'or'
        ? 'ବହୁତ ଧନ୍ୟବାଦ! ଯଦି ଆଗରୁ ଆଡ୍ମିଶନ ବିଷୟରେ ଜାଣିବାକୁ ଚାହୁଁଛନ୍ତି, ଆମ ନମ୍ବର 0671-2595062 ରେ ଫୋନ କରନ୍ତୁ। ଶୁଭ ହେଉ!'
        : 'Thank you so much for your time! If you ever want to know more, please call us at 0671-2595062. Have a great day!';
      const audioUrl = await ttsUrl(farewell, lang);
      return res.type('text/xml').send(buildTwiML(audioUrl, respondUrl, gatherLang, true));
    }

    // Add user speech to history
    state.history.push({ role: 'user', content: speech });

    // Get Claude response
    const reply = await claudeReply(state.history, lang);
    state.history.push({ role: 'assistant', content: reply });

    // Keep history manageable (last 10 turns)
    if (state.history.length > 20) state.history = state.history.slice(-20);

    const audioUrl = await ttsUrl(reply, lang);
    res.type('text/xml').send(buildTwiML(audioUrl, respondUrl, gatherLang));

  } catch (e) {
    console.error('Call respond error:', e.message);
    const sorry = lang === 'or'
      ? 'ଦୁଃଖିତ, ଏକ ଛୋଟ ସମସ୍ୟା ହୋଇଛି। ଆଉ ଥରେ ଚେଷ୍ଟା କରନ୍ତୁ।'
      : 'Sorry, a small issue occurred. Please try again.';
    const audioUrl = await ttsUrl(sorry, lang);
    res.type('text/xml').send(buildTwiML(audioUrl, respondUrl, gatherLang));
  }
});

// ── POST /call/status — Twilio status callback ────────────────────────────────
app.post('/call/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`Call ${CallSid} status: ${CallStatus}`);
  if (['completed','failed','busy','no-answer','canceled'].includes(CallStatus)) {
    callStore.delete(CallSid);
  }
  res.sendStatus(200);
});

// ── GET /api/call-status/:sid — poll call status from frontend ───────────────
app.get('/api/call-status/:sid', async (req, res) => {
  try {
    const call = await twilioClient.calls(req.params.sid).fetch();
    res.json({ status: call.status, duration: call.duration });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('DRIEMS Bot running on port ' + PORT));
