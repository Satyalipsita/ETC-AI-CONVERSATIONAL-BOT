// ================== IMPORTS ==================
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');

// ================== APP SETUP ==================
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ================== ENV VARIABLES ==================
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL;

// ================== ANTHROPIC ==================
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// ================== MEMORY ==================
let sessionStore = {};

// ================== KNOWLEDGE ==================
function buildKnowledgeContext() {
  return `
DRIEMS Polytechnic ETC:
- 3-year Diploma
- 60 seats
- Admission via SAMS
- Fees: 70,000/year
- Hostel: 75,000/year
- Location: Tangi, Cuttack
- 100% placement
`;
}

// ================== LOCAL FAST REPLY ==================
function getOdiaReply(text) {
  const t = text.toLowerCase();

  if (t.includes('fee')) return "Fee 70,000 per year. Hostel 75,000. Aau kana janibaku chahanti?";
  if (t.includes('placement')) return "100 percent placement support achhi. Aau kana janibaku chahanti?";
  if (t.includes('location')) return "College Tangi, Cuttack re achhi. Aau kana janibaku chahanti?";

  return null;
}

// ================== SYSTEM PROMPT ==================
const systemPrompt = `
You are Priya — the confident, warm, Odia-speaking AI Admission Assistant 
for DRIEMS Polytechnic ETC Branch.

${buildKnowledgeContext()}

SPEAKING STYLE:
- Speak in Odia (simple + short sentences)
- Max 3-4 lines per reply
- Sound like a real human, not a robot
- Always ask: "Aau kana janibaku chahanti?"

ତୁମେ କିପରି କଥା ହେବ:
- ସ୍ୱାଭାବିକ ଓଡ଼ିଆ ରେ କଥା ହୁଅ
- ଛୋଟ ବାକ୍ୟ ବ୍ୟବହାର କର
- caller କୁ engage ରଖ

IMPORTANT INFO:
- Fees: 70,000/year
- Hostel: 75,000/year
- 60 seats only
- Admission via SAMS
- Location: Tangi, Cuttack
`;

// ================== AI RESPONSE ==================
async function getPriyaResponse(userText, history) {
  const local = getOdiaReply(userText);

  if (local && history.length <= 2) {
    return local;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        ...history,
        { role: "user", content: userText }
      ]
    });

    return response.content[0].text;

  } catch (err) {
    console.error(err);
    return "Sorry, mu bujhi parili nahi. Aau thare kahibe?";
  }
}

// ================== SPEECH TO TEXT ==================
async function speechToText(audioUrl) {
  try {
    const res = await fetch(audioUrl);
    const buffer = await res.arrayBuffer();

    const r = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY
      },
      body: buffer
    });

    const data = await r.json();
    return data.text || "";

  } catch (err) {
    console.error(err);
    return "";
  }
}

// ================== TEXT TO SPEECH ==================
async function textToSpeech(text) {
  try {
    const r = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': SARVAM_API_KEY
      },
      body: JSON.stringify({ text })
    });

    const buffer = await r.arrayBuffer();
    return Buffer.from(buffer);

  } catch (err) {
    console.error(err);
    return null;
  }
}

// ================== TWILIO WEBHOOK ==================
app.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;

  if (!sessionStore[callSid]) {
    sessionStore[callSid] = { history: [] };
  }

  const state = sessionStore[callSid];

  let userSpeech = "";

  if (recordingUrl) {
    userSpeech = await speechToText(recordingUrl);
  }

  const reply = await getPriyaResponse(userSpeech, state.history);

  state.history.push({ role: "user", content: userSpeech });
  state.history.push({ role: "assistant", content: reply });

  const audioBuffer = await textToSpeech(reply);

  const audioUrl = `${PUBLIC_URL}/audio/${callSid}.mp3`;

  if (audioBuffer) {
    require('fs').writeFileSync(`./audio_${callSid}.mp3`, audioBuffer);
  }

  const twiml = `
<Response>
  <Play>${audioUrl}</Play>
  <Record action="/voice" />
</Response>
`;

  res.type('text/xml');
  res.send(twiml);
});

// ================== START SERVER ==================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
