const express = require('express');
const fetch   = require('node-fetch');
const twilio  = require('twilio');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── ENV ─────────────────────────────────────
const ANTH_KEY   = process.env.ANTHROPIC_API_KEY;
const TW_SID     = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM    = process.env.TWILIO_PHONE_NUMBER;
const PUBLIC_URL = process.env.PUBLIC_URL;
const SARVAM_KEY = process.env.SARVAM_API_KEY;

// ── STORES ──────────────────────────────────
const audioStore = new Map();
const callStore  = new Map();
const jobStore   = new Map();
const leads      = new Map();

// ── INTENT + EMOTION ───────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();
  if (t.includes('fee')) return 'fees';
  if (t.includes('placement')) return 'placement';
  if (t.includes('admission') || t.includes('apply')) return 'admission';
  if (t.includes('hostel')) return 'hostel';
  return 'general';
}

function detectEmotion(text) {
  const t = text.toLowerCase();
  if (t.includes('not interested') || t.includes('no')) return 'negative';
  if (t.includes('later') || t.includes('thinking')) return 'hesitant';
  if (t.includes('apply')) return 'ready';
  return 'neutral';
}

// ── SYSTEM PROMPT ──────────────────────────
const SYS = `You are Priya, a confident admission counsellor. 
Understand intent first, then answer clearly and confidently.
Always guide the user toward admission.`;

// ── CLAUDE ────────────────────────────────
async function claudeReply(history) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTH_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: SYS,
      messages: history
    })
  });

  const d = await r.json();
  return d.content?.[0]?.text || "Sorry, please repeat.";
}

// ── SARVAM TTS ONLY ───────────────────────
async function makeTTS(text) {
  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'api-subscription-key': SARVAM_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: 'en-IN',
      speaker: 'priya',
      model: 'bulbul:v2',
      speech_sample_rate: 8000
    })
  });

  const json = await r.json();
  return Buffer.from(json.audios[0], 'base64');
}

async function storeAudio(text) {
  const buf = await makeTTS(text);
  const id = uuidv4();
  audioStore.set(id, { buf });
  return id;
}

app.get('/audio/:id', (req, res) => {
  const e = audioStore.get(req.params.id);
  if (!e) return res.sendStatus(404);
  res.set('Content-Type', 'audio/wav').send(e.buf);
});

// ── JOB SYSTEM ────────────────────────────
async function processAI(jobId, speech, callSid, phone) {

  const state = callStore.get(callSid) || { history: [], score: 0 };

  const intent  = detectIntent(speech);
  const emotion = detectEmotion(speech);

  let score = state.score;

  if (intent === 'admission') score += 30;
  if (intent === 'fees') score += 20;
  if (emotion === 'ready') score += 40;
  if (emotion === 'hesitant') score += 10;
  if (emotion === 'negative') score -= 20;

  state.score = score;

  let leadType = 'cold';
  if (score > 60) leadType = 'hot';
  else if (score > 30) leadType = 'warm';

  let reply;

  if (leadType === 'hot') {
    reply = "You seem ready. Apply now to secure your seat. Shall I guide you?";
  } else if (emotion === 'hesitant') {
    reply = "Seats are limited to 60. It is better to apply early.";
  } else if (emotion === 'negative') {
    reply = "Tell me your concern, I will help you.";
  } else {
    state.history.push({ role: 'user', content: speech });
    reply = await claudeReply(state.history);
  }

  reply = reply.replace(/maybe|might|can/gi, 'definitely');

  leads.set(callSid, {
    phone,
    score,
    leadType,
    intent,
    emotion
  });

  state.history.push({ role: 'assistant', content: reply });
  callStore.set(callSid, state);

  const audioId = await storeAudio(reply);

  jobStore.set(jobId, { status: 'done', audioId });
}

// ── TWILIO FLOW ───────────────────────────
app.post('/call/start', async (req, res) => {

  const callSid = req.body.CallSid;
  const phone   = req.body.From;

  callStore.set(callSid, { history: [], score: 0, phone });

  const greet = await storeAudio("Hello, this is Priya from DRIEMS. Are you interested in admission?");

  const vr = new twilio.twiml.VoiceResponse();

  const g = vr.gather({
    input: 'speech',
    action: `/call/respond?sid=${callSid}`,
    method: 'POST'
  });

  g.play(`${PUBLIC_URL}/audio/${greet}`);

  res.type('text/xml').send(vr.toString());
});

// ── RESPOND ───────────────────────────────
app.post('/call/respond', (req, res) => {

  const callSid = req.query.sid;
  const speech  = req.body.SpeechResult || '';
  const phone   = req.body.From;

  const jobId = uuidv4();

  processAI(jobId, speech, callSid, phone);

  const vr = new twilio.twiml.VoiceResponse();
  vr.pause({ length: 1 });
  vr.redirect(`/call/poll?j=${jobId}&sid=${callSid}`);

  res.type('text/xml').send(vr.toString());
});

// ── POLL ─────────────────────────────────
app.post('/call/poll', (req, res) => {

  const job = jobStore.get(req.query.j);

  if (job && job.status === 'done') {

    const vr = new twilio.twiml.VoiceResponse();

    const g = vr.gather({
      input: 'speech',
      action: `/call/respond?sid=${req.query.sid}`,
      method: 'POST'
    });

    g.play(`${PUBLIC_URL}/audio/${job.audioId}`);

    return res.type('text/xml').send(vr.toString());
  }

  const vr = new twilio.twiml.VoiceResponse();
  vr.pause({ length: 1 });
  vr.redirect(`/call/poll?j=${req.query.j}&sid=${req.query.sid}`);

  res.type('text/xml').send(vr.toString());
});

// ── WHATSAPP FOLLOWUP ─────────────────────
async function sendWhatsApp(to, msg) {
  const client = twilio(TW_SID, TW_TOKEN);

  await client.messages.create({
    from: 'whatsapp:' + TW_FROM,
    to: 'whatsapp:' + to,
    body: msg
  });
}

// ── CALL STATUS ───────────────────────────
app.post('/call/status', async (req, res) => {

  const { CallSid, CallStatus } = req.body;

  if (CallStatus === 'completed') {
    const lead = leads.get(CallSid);

    if (lead && lead.leadType === 'hot') {
      await sendWhatsApp(
        lead.phone,
        "Apply now: https://odishasams.nic.in"
      );
    }
  }

  callStore.delete(CallSid);
  res.sendStatus(200);
});

// ── DASHBOARD API ─────────────────────────
app.get('/api/leads', (req, res) => {
  res.json(Array.from(leads.values()));
});

// ── AUTO RECALL ───────────────────────────
setInterval(async () => {
  for (const [sid, lead] of leads) {
    if (lead.leadType === 'cold') {

      const client = twilio(TW_SID, TW_TOKEN);

      await client.calls.create({
        to: lead.phone,
        from: TW_FROM,
        url: `${PUBLIC_URL}/call/start`
      });
    }
  }
}, 8 * 60 * 60 * 1000);

// ── START ────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
