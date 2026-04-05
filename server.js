require("dotenv").config();
const express    = require("express");
const bodyParser = require("body-parser");
const axios      = require("axios");
const fs         = require("fs");
const path       = require("path");
const { v4: uuidv4 } = require("uuid");
const Anthropic  = require("@anthropic-ai/sdk");
const twilio     = require("twilio");

// ──────────────────────────────────────────────────────────
//  SETUP
// ──────────────────────────────────────────────────────────
const app = express();
app.use(bodyParser.json());                          // for /api/* routes (UI)
app.use(bodyParser.urlencoded({ extended: false })); // for Twilio webhooks

const PORT             = process.env.PORT || 3000;
const PUBLIC_URL       = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const SARVAM_API_KEY   = process.env.SARVAM_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const AUDIO_DIR        = "/tmp/audio";

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const claude       = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ──────────────────────────────────────────────────────────
//  KNOWLEDGE BASE
// ──────────────────────────────────────────────────────────
const KNOWLEDGE_BASE = `
DRIEMS Polytechnic – ETC Branch Admissions (2025-26)
=====================================================

ADMISSION PROCESS:
- Eligibility: Pass 10th standard (Matric / SSC)
- How to apply: Apply online on DRIEMS official website
- Selection: Merit-based / SSJAT counselling

COURSE FEE:
- Total: Rs. 65,000 for the full 3-year diploma programme
- Payment: Two equal installments (flexible)

HOSTEL FACILITY:
- Hostel fee: Rs. 75,000 (one-time)
- FREE transportation from: Bhubaneswar, Cuttack, Jajpur, Chandikhol

CAMPUS FACILITIES:
- 100-acre green campus
- Free Wi-Fi across the entire campus
- Modern labs, workshops, seminar halls

PLACEMENTS:
- Top companies: Centum Electronics, Cummins India, Voltas, and many more core companies
- Strong placement record for ETC graduates
- Industry-oriented training included in curriculum

WHY ETC IS THE BEST BRANCH:
- Unique dual advantage: learn BOTH hardware AND software in one branch
- Hardware: VLSI design, Embedded Systems, IoT hardware
- Software: Python for IoT projects, real-time coding
- Real-time industrial knowledge = stronger placement readiness
- ETC is the FUTURE branch:
    * 6G communication technology
    * Satellite communication
    * Optical fibre technology
    * IoT and smart city infrastructure
- Civil and Computer Science are good, but ETC has the widest future scope
- ETC students can work in both IT companies AND core electronics companies

CONTACT:
- Visit DRIEMS campus, Tangi, Cuttack, Odisha
- Phone: 0671-2595062 / 9438065742
`;

// ──────────────────────────────────────────────────────────
//  SYSTEM PROMPTS  (English + Odia — used by web UI)
// ──────────────────────────────────────────────────────────
const SYS_EN = `You are Arjun, a friendly enthusiastic admission counsellor at DRIEMS Polytechnic (Autonomous), Tangi, Cuttack, Odisha. Speak naturally and warmly like a real person. Expert in Electronics & Telecommunication Engineering (ETC) branch.

PERSONALITY: Warm, encouraging. Short clear sentences. No bullet points. Ask questions to engage.

${KNOWLEDGE_BASE}

INSTRUCTIONS: 2-4 sentences per reply. Enthusiastically highlight ETC. No markdown. End with a question sometimes. Unknown questions → website or 0671-2595062.`;

const SYS_OR = `ଆପଣ ଅର୍ଜୁନ, DRIEMS Polytechnic (Autonomous), ତଙ୍ଗି, କଟକ, ଓଡ଼ିଶା ର ଉତ୍ସାହୀ admission counsellor। ଓଡ଼ିଆ ଭାଷାରେ ସ୍ୱାଭାବିକ ଓ ଉଷ୍ଣ ଭାବରେ କଥା ହୁଅନ୍ତୁ।

ବ୍ୟକ୍ତିତ୍ୱ: ସ୍ୱଳ୍ପ ସ୍ପଷ୍ଟ ବାକ୍ୟ। Bullet points ନୁହେଁ।

${KNOWLEDGE_BASE}

ନିର୍ଦ୍ଦେଶ: ୨-୪ ବାକ୍ୟ। ETC ର ଶକ୍ତି ଦେଖାନ୍ତୁ। Markdown ନୁହେଁ। ଅଜଣା ପ୍ରଶ୍ନ → 0671-2595062।`;

// ──────────────────────────────────────────────────────────
//  SYSTEM PROMPT  (for Twilio voice calls)
// ──────────────────────────────────────────────────────────
const VOICE_SYSTEM_PROMPT = `You are Arjun, a warm and enthusiastic voice admissions counsellor for DRIEMS Polytechnic, promoting the Electronics and Telecommunication Engineering (ETC) branch in Cuttack, Odisha.

LANGUAGE: Respond in simple conversational Odia (romanised transliteration). Keep sentences short — this is a phone call.

INTENT DETECTION — answer ONLY what the caller asks:
1. GREETING        → Introduce yourself, ask how you can help
2. ADMISSION       → 10th pass eligible, apply online on DRIEMS website
3. COURSE FEE      → sixty five thousand rupees in two installments
4. HOSTEL          → seventy five thousand rupees, free transport from Bhubaneswar, Cuttack, Jajpur, Chandikhol
5. CAMPUS          → hundred acre green campus, free Wi-Fi, modern labs
6. PLACEMENTS      → Centum Electronics, Cummins, Voltas, core companies
7. WHY ETC         → Both hardware and software, VLSI, Embedded, Python, 6G future
8. GOODBYE         → Warm farewell, invite to visit campus

STRICT RULES:
- Maximum 3 short sentences per reply
- NEVER repeat what you already said
- Speak numbers as words
- Do NOT invent facts

${KNOWLEDGE_BASE}`;

// ──────────────────────────────────────────────────────────
//  TWILIO VOICE SESSION STORE
// ──────────────────────────────────────────────────────────
const sessions = {};

function getHistory(callSid) { return sessions[callSid] || []; }

function saveTurn(callSid, role, content) {
  if (!sessions[callSid]) sessions[callSid] = [];
  sessions[callSid].push({ role, content });
  if (sessions[callSid].length > 8)
    sessions[callSid] = sessions[callSid].slice(-8);
}

function clearSession(callSid) { delete sessions[callSid]; }

// ──────────────────────────────────────────────────────────
//  SARVAM TTS  — shared by both UI and voice routes
// ──────────────────────────────────────────────────────────
async function sarvamTTS(text, lang = "or") {
  const langCode = "od-IN";  // always Odia
  const speaker  = "meera";  // best Odia voice on Sarvam

  const response = await axios.post(
    "https://api.sarvam.ai/text-to-speech",
    {
      inputs: [text],
      target_language_code: langCode,
      speaker,
      pitch: 0,
      pace: 1.05,
      loudness: 1.5,
      speech_sample_rate: 8000,        // telephony optimised
      enable_preprocessing: true,
      model: "bulbul:v2",
    },
    {
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
      responseType: "json",
    }
  );

  const b64Audio = response.data?.audios?.[0];
  if (!b64Audio) throw new Error("Sarvam returned no audio");
  return Buffer.from(b64Audio, "base64");
}

// ──────────────────────────────────────────────────────────
//  STATIC FILES  (serves public/index.html as the UI)
// ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use("/audio", express.static(AUDIO_DIR));

// ──────────────────────────────────────────────────────────
//  API: /api/tts  — used by the web UI to play Arjun's voice
// ──────────────────────────────────────────────────────────
app.post("/api/tts", async (req, res) => {
  const { text, lang = "or" } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    const audioBuffer = await sarvamTTS(text, lang);
    res.set("Content-Type", "audio/wav");
    res.send(audioBuffer);
  } catch (err) {
    console.error("TTS error:", err.response?.data || err.message);
    res.status(500).json({ error: "TTS failed", detail: err.message });
  }
});

// ──────────────────────────────────────────────────────────
//  API: /api/chat  — used by the web UI chat window
// ──────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { system, messages } = req.body;
  if (!messages) return res.status(400).json({ error: "No messages" });

  try {
    const response = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: system || SYS_OR,
      messages,
    });
    res.json(response);
  } catch (err) {
    console.error("Claude error:", err.message);
    res.status(500).json({ error: "Claude API failed", detail: err.message });
  }
});

// ──────────────────────────────────────────────────────────
//  API: /api/outbound-call  — Twilio outbound calling
// ──────────────────────────────────────────────────────────
app.post("/api/outbound-call", async (req, res) => {
  const { phone, lang = "or" } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  try {
    const call = await twilioClient.calls.create({
      to: phone,
      from: TWILIO_PHONE_NUMBER,
      url: `${PUBLIC_URL}/voice?lang=${lang}`,
      method: "POST",
    });
    res.json({ callSid: call.sid, status: call.status });
  } catch (err) {
    console.error("Outbound call error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────
//  API: /api/call-status/:sid  — poll call status
// ──────────────────────────────────────────────────────────
app.get("/api/call-status/:sid", async (req, res) => {
  try {
    const call = await twilioClient.calls(req.params.sid).fetch();
    res.json({ status: call.status, duration: call.duration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────
//  TWILIO VOICE WEBHOOKS
// ──────────────────────────────────────────────────────────

async function getVoiceReply(callSid, userText) {
  saveTurn(callSid, "user", userText);
  const history = getHistory(callSid);
  try {
    const response = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: VOICE_SYSTEM_PROMPT,
      messages: history,
    });
    const reply = response.content[0].text.trim();
    saveTurn(callSid, "assistant", reply);
    return reply;
  } catch (err) {
    console.error("Claude voice error:", err.message);
    return "Sorry, I had a small issue. Please ask your question again.";
  }
}

async function buildVoiceTwiml(text, actionUrl) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const vr = new VoiceResponse();

  let audioUrl = null;
  try {
    const audioBuffer = await sarvamTTS(text, "or");
    const filename = `${uuidv4()}.wav`;
    fs.writeFileSync(path.join(AUDIO_DIR, filename), audioBuffer);
    audioUrl = `${PUBLIC_URL}/audio/${filename}`;
  } catch (err) {
    console.error("TTS failed, using Twilio fallback:", err.message);
  }

  if (actionUrl) {
    const gather = vr.gather({
      input: "speech",
      action: actionUrl,
      method: "POST",
      timeout: 5,
      speechTimeout: "auto",
      language: "hi-IN",
      hints: "admission fee hostel placement ETC campus apply",
    });
    if (audioUrl) gather.play(audioUrl);
    else gather.say({ voice: "Polly.Aditi", language: "en-IN" }, text);
    vr.redirect({ method: "POST" }, actionUrl);
  } else {
    if (audioUrl) vr.play(audioUrl);
    else vr.say({ voice: "Polly.Aditi", language: "en-IN" }, text);
    vr.hangup();
  }

  return vr.toString();
}

// Entry point when call connects
app.post("/voice", async (req, res) => {
  const callSid = req.body.CallSid || "unknown";
  clearSession(callSid);

  const greeting = await getVoiceReply(
    callSid,
    "A new caller just connected. Greet them warmly as Arjun and ask how you can help."
  );
  console.log(`[${callSid}] GREETING → ${greeting.slice(0, 80)}`);

  const twiml = await buildVoiceTwiml(greeting, `${PUBLIC_URL}/respond`);
  res.type("text/xml").send(twiml);
});

// Every caller utterance
app.post("/respond", async (req, res) => {
  const callSid    = req.body.CallSid || "unknown";
  const userSpeech = (req.body.SpeechResult || "").trim();
  const confidence = parseFloat(req.body.Confidence || 0);

  console.log(`[${callSid}] USER (${confidence.toFixed(2)}): "${userSpeech}"`);

  if (!userSpeech || confidence < 0.25) {
    const nudge = "Sorry, I did not catch that. Could you please repeat your question?";
    const twiml = await buildVoiceTwiml(nudge, `${PUBLIC_URL}/respond`);
    return res.type("text/xml").send(twiml);
  }

  const byeWords = ["bye", "goodbye", "thank you", "thanks", "no more", "that's all", "ok bye", "dhanyabad"];
  if (byeWords.some(w => userSpeech.toLowerCase().includes(w))) {
    const farewell = await getVoiceReply(
      callSid,
      "The caller said goodbye. Give a warm 2-sentence farewell and invite them to visit DRIEMS."
    );
    clearSession(callSid);
    const twiml = await buildVoiceTwiml(farewell, null); // null = hangup after
    return res.type("text/xml").send(twiml);
  }

  const reply = await getVoiceReply(callSid, userSpeech);
  console.log(`[${callSid}] ARJUN → ${reply.slice(0, 100)}`);

  const twiml = await buildVoiceTwiml(reply, `${PUBLIC_URL}/respond`);
  res.type("text/xml").send(twiml);
});

// ──────────────────────────────────────────────────────────
//  HEALTH CHECK
// ──────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", bot: "Arjun — Sarvam TTS" });
});

// ──────────────────────────────────────────────────────────
//  START
// ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Arjun bot running on port ${PORT}`);
});
