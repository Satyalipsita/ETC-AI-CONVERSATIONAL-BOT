const express = require('express');
const fetch   = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── Keep-alive ping (prevents Render free tier from sleeping) ────────────────
app.get('/ping', (req, res) => res.send('ok'));

// ── Config ───────────────────────────────────────────────────────────────────
const ANTH_KEY          = process.env.ANTHROPIC_API_KEY;
const VAPI_KEY          = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;   // from VAPI dashboard
const VAPI_PHONE_ID     = process.env.VAPI_PHONE_NUMBER_ID; // from VAPI dashboard

// ── System prompts (used for web chat) ───────────────────────────────────────
const SYS_EN = `You are Arjun, a friendly enthusiastic admission counsellor at DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha. Speak naturally and warmly like a real person. Expert in Electronics & Telecommunication Engineering (ETC) branch.

PERSONALITY: Warm, encouraging. "Great question!", "Absolutely!", "Let me tell you...". Short clear sentences. No bullet points. Ask questions to engage.

DRIEMS FACTS: Established 2003. Contact: 0671-2595062, driemsdiploma@driems.ac.in. Website: www.driemspolytechnic.org. AICTE Autonomous (first private polytechnic in Odisha, 2026). QCI #2 in Odisha.
Courses: Mechanical(210 NBA), Computer(120 NBA), Electrical(120 NBA), Civil(60), ETC(60 seats).
ETC: 3yr Diploma, 60 seats, VLSI Design, Embedded Systems, IoT, 5G, Fiber Optics, Embedded C, Python, 100% placement — TCS/Infosys/Wipro/L&T/BHEL/BSNL. IIT Bombay Virtual Lab. Admission via OJEE, 10th pass Science+Maths.

INSTRUCTIONS: 2-4 sentences per reply. Enthusiastically highlight ETC. No markdown. End with question sometimes.`;

const SYS_OR = `ଆପଣ ଅର୍ଜୁନ, DRIEMS Polytechnic (Autonomous), ତଙ୍ଗି, କଟକ, ଓଡ଼ିଶା ର ଉତ୍ସାହୀ admission counsellor। ଓଡ଼ିଆ ଭାଷାରେ ସ୍ୱାଭାବିକ ଓ ଉଷ୍ଣ ଭାବରେ କଥା ହୁଅନ୍ତୁ।

ବ୍ୟକ୍ତିତ୍ୱ: "ବହୁତ ଭଲ ପ୍ରଶ୍ନ!", "ହଁ!", "ଦେଖନ୍ତୁ..." ଭଳି phrases। ସ୍ୱଳ୍ପ ସ୍ପଷ୍ଟ ବାକ୍ୟ। Bullet points ନୁହେଁ।

DRIEMS ତଥ୍ୟ: ପ୍ରତିଷ୍ଠା ୨୦୦୩। ଫୋନ: 0671-2595062। AICTE Autonomous (ଓଡ଼ିଶାରେ ପ୍ରଥମ, 2026)। QCI #2।
ETC Branch: ୩ ବର୍ଷ Diploma, ୬୦ ଆସନ, VLSI, Embedded Systems, IoT, 5G, Python, C। ୧୦୦% placement — TCS/Infosys/L&T/BHEL। OJEE ମାଧ୍ୟମରେ admission, ୧୦ ମ pass।

ନିର୍ଦ୍ଦେଶ: ୨-୪ ବାକ୍ୟ। ETC ର ଶକ୍ତି ଦେଖାନ୍ତୁ। Markdown ନୁହେଁ।`;

// ── Google TTS (web chat only) ────────────────────────────────────────────────
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
  const glang  = lang === 'or' ? 'or' : 'en-IN';
  const chunks = splitText(text.trim(), 190);
  const bufs   = [];
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${glang}&client=tw-ob&ttsspeed=0.9`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
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
        'Content-Type':      'application/json',
        'x-api-key':         ANTH_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages
      })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VAPI outbound call: /api/outbound-call ────────────────────────────────────
// VAPI handles the entire phone call conversation:
//   dial → greet in Odia (Azure or-IN-SunitaNeural) → listen → Claude reply → speak → loop
app.post('/api/outbound-call', async (req, res) => {
  const { phone, lang = 'or' } = req.body;

  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  if (!phone.startsWith('+')) return res.status(400).json({ error: 'Use international format: +91xxxxxxxxxx' });

  if (!VAPI_KEY)          return res.status(500).json({ error: 'VAPI_API_KEY not set in environment' });
  if (!VAPI_ASSISTANT_ID) return res.status(500).json({ error: 'VAPI_ASSISTANT_ID not set in environment' });
  if (!VAPI_PHONE_ID)     return res.status(500).json({ error: 'VAPI_PHONE_NUMBER_ID not set in environment' });

  // Per-call system prompt and voice based on language
  const assistantOverrides = lang === 'or' ? {
    firstMessage: 'ନମସ୍କାର! ମୁଁ ଅର୍ଜୁନ, DRIEMS Polytechnic ରୁ ଫୋନ କରୁଛି। Electronics ଓ Telecommunication Diploma admission ବିଷୟରେ ଦୁଇ ମିନିଟ କଥା ହୋଇ ପାରିବ କି?',
    model: {
      provider: 'anthropic',
      model:    'claude-sonnet-4-20250514',
      systemPrompt: SYS_OR + '\n\nFONE CALL: ସ୍ୱଳ୍ପ ୧-୩ ବାକ୍ୟ ଉତ୍ତର ଦିଅନ୍ତୁ। ଫୋନ call ପରି ସ୍ୱାଭାବିକ ଭାବରେ।'
    },
    voice: {
      provider: 'azure',
      voiceId:  'or-IN-SunitaNeural'  // Native Odia Azure TTS voice
    },
    transcriber: {
      provider: 'azure',
      language: 'or-IN'
    }
  } : {
    firstMessage: "Hello! This is Arjun from DRIEMS Polytechnic, Cuttack. I'm calling about our Electronics and Telecommunication Engineering diploma program. Do you have two minutes to chat?",
    model: {
      provider: 'anthropic',
      model:    'claude-sonnet-4-20250514',
      systemPrompt: SYS_EN + '\n\nPHONE CALL: Keep replies to 1-3 short sentences. Be natural like a real phone call.'
    },
    voice: {
      provider: 'azure',
      voiceId:  'en-IN-NeerjaNeural'  // Indian English female voice
    },
    transcriber: {
      provider: 'deepgram',
      model:    'nova-2',
      language: 'en-IN'
    }
  };

  try {
    const r = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + VAPI_KEY,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        assistantId:     VAPI_ASSISTANT_ID,
        assistantOverrides,
        phoneNumberId:   VAPI_PHONE_ID,
        customer: { number: phone }
      })
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || data.error || 'VAPI error ' + r.status);

    res.json({ success: true, callId: data.id, status: data.status });
  } catch (e) {
    console.error('VAPI call error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Poll call status: /api/call-status/:id ────────────────────────────────────
app.get('/api/call-status/:id', async (req, res) => {
  if (!VAPI_KEY) return res.status(500).json({ error: 'VAPI_API_KEY not set' });
  try {
    const r = await fetch('https://api.vapi.ai/call/' + req.params.id, {
      headers: { 'Authorization': 'Bearer ' + VAPI_KEY }
    });
    const data = await r.json();
    res.json({ status: data.status, duration: data.duration || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('DRIEMS Bot running on port ' + PORT));
