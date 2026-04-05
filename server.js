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
app.use(bodyParser.urlencoded({ extended: false }));

const PORT          = process.env.PORT || 3000;
const PUBLIC_URL    = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const AUDIO_DIR     = "/tmp/audio";

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
- Call the admissions office for details
`;

// ──────────────────────────────────────────────────────────
//  SYSTEM PROMPT
// ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are Arjun, a warm and enthusiastic voice admissions counsellor for DRIEMS Polytechnic,
promoting the Electronics and Telecommunication Engineering (ETC) branch in Cuttack, Odisha.

LANGUAGE RULES:
- Respond BILINGUALLY: start with 1 sentence in Odia (romanised/transliterated Odia, NOT Odia script),
  then continue in simple English
- Example Odia opening: "Namaskara, mu Arjun, DRIEMS ra admissions counsellor"
- Keep Odia romanised because Sarvam TTS reads romanised Odia text better on phone calls
- Keep sentences short and natural — like a friendly local person talking

INTENT DETECTION — identify what the caller wants and answer ONLY that:
1. GREETING / WHO ARE YOU    → Introduce yourself warmly, ask what they want to know
2. ADMISSION / HOW TO APPLY  → 10th pass eligible, apply online on DRIEMS website
3. COURSE FEE                → Rs. 65,000 total, in two installments
4. HOSTEL / ACCOMMODATION    → Rs. 75,000, free transport from Bhubaneswar, Cuttack, Jajpur, Chandikhol
5. CAMPUS / FACILITIES       → 100-acre green campus, free Wi-Fi, modern labs
6. PLACEMENTS / JOB SCOPE    → Centum Electronics, Cummins, Voltas, core companies
7. WHY ETC / WHICH BRANCH    → Both hardware and software, VLSI, Embedded, Python, 6G future
8. GENERAL ENQUIRY           → Answer strictly from the knowledge base
9. GOODBYE / THANK YOU       → Warm farewell, invite to visit campus

STRICT RULES:
- Keep each response to 3-4 short sentences MAXIMUM (this is a phone call)
- NEVER repeat a sentence or idea you already said in this conversation
- NEVER begin two replies with the same opening phrase
- DO NOT use filler phrases like "Great question!" or "Absolutely!"
- Speak numbers as words: "sixty five thousand rupees" not "Rs. 65,000"
- Be enthusiastic and positive about ETC — it is the future!
- If you do not know something, say: "Please visit DRIEMS campus or call our admissions office"
- Do NOT invent any fact not in the knowledge base

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}
`;

// ──────────────────────────────────────────────────────────
//  SESSION STORE
// ──────────────────────────────────────────────────────────
const sessions = {};

function getHistory(callSid) {
  return sessions[callSid] || [];
}

function saveTurn(callSid, role, content) {
  if (!sessions[callSid]) sessions[callSid] = [];
  sessions[callSid].push({ role, content });
  // Keep last 8 turns only → lower latency
  if (sessions[callSid].length > 8) {
    sessions[callSid] = sessions[callSid].slice(-8);
  }
}

function clearSession(callSid) {
  delete sessions[callSid];
}

// ──────────────────────────────────────────────────────────
//  CLAUDE — get reply
// ──────────────────────────────────────────────────────────
async function getArjunReply(callSid, userText) {
  saveTurn(callSid, "user", userText);
  const history = getHistory(callSid);

  try {
    const response = await claude.messages.create({
      model: "claude-haiku-4-5",  // fastest model = lowest latency
      max_tokens: 180,
      system: SYSTEM_PROMPT,
      messages: history,
    });
    const reply = response.content[0].text.trim();
    saveTurn(callSid, "assistant", reply);
    return reply;
  } catch (err) {
    console.error("Claude error:", err.message);
    const fallback =
      "Mun ektu samaya nuchhi. Sorry, I had a small issue. Please ask your question again.";
    saveTurn(callSid, "assistant", fallback);
    return fallback;
  }
}

// ──────────────────────────────────────────────────────────
//  SARVAM TTS
// ──────────────────────────────────────────────────────────
async function textToSpeech(text) {
  try {
    const response = await axios.post(
      "https://api.sarvam.ai/text-to-speech",
      {
        inputs: [text],
        target_language_code: "od-IN",   // Odia
        speaker: "meera",                // best Odia female voice on Sarvam
        pitch: 0,
        pace: 1.1,                       // slightly faster = less dead air on phone
        loudness: 1.5,
        speech_sample_rate: 8000,        // 8kHz = telephony optimised
        enable_preprocessing: true,
        model: "bulbul:v2",
      },
      {
        headers: {
          "api-subscription-key": SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const b64Audio = response.data?.audios?.[0];
    if (!b64Audio) {
      console.error("Sarvam TTS: no audio in response");
      return null;
    }

    const filename = `${uuidv4()}.wav`;
    const filepath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(b64Audio, "base64"));
    return `${PUBLIC_URL}/audio/${filename}`;
  } catch (err) {
    console.error("Sarvam TTS error:", err.response?.data || err.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
//  TWIML HELPERS
// ──────────────────────────────────────────────────────────
const GATHER_TIMEOUT = 5;
const SPEECH_HINTS   = "admission fee hostel placement branch ETC campus apply";

function buildGatherTwiml(audioUrl, fallbackText, actionUrl) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const vr     = new VoiceResponse();
  const gather = vr.gather({
    input:         "speech",
    action:        actionUrl,
    method:        "POST",
    timeout:       GATHER_TIMEOUT,
    speechTimeout: "auto",
    language:      "hi-IN",       // Sarvam works best with hi-IN recognition for Indian accents
    hints:         SPEECH_HINTS,
  });
  if (audioUrl) {
    gather.play(audioUrl);
  } else {
    gather.say({ voice: "Polly.Aditi", language: "en-IN" }, fallbackText);
  }
  // If silence → loop back
  vr.redirect({ method: "POST" }, actionUrl);
  return vr.toString();
}

function buildEndTwiml(audioUrl, fallbackText) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const vr = new VoiceResponse();
  if (audioUrl) {
    vr.play(audioUrl);
  } else {
    vr.say({ voice: "Polly.Aditi", language: "en-IN" }, fallbackText);
  }
  vr.hangup();
  return vr.toString();
}

// ──────────────────────────────────────────────────────────
//  ROUTES
// ──────────────────────────────────────────────────────────

// Serve generated audio files to Twilio
app.use("/audio", express.static(AUDIO_DIR));

// Health check — UptimeRobot pings this
app.get("/health", (req, res) => {
  res.json({ status: "ok", bot: "Arjun v2 — Sarvam TTS" });
});

// ── Entry: Twilio calls this when call connects ───────────
app.post("/voice", async (req, res) => {
  const callSid = req.body.CallSid || "unknown";
  clearSession(callSid);

  const greeting = await getArjunReply(
    callSid,
    "A new caller just joined. Greet them warmly as Arjun and ask how you can help them today."
  );
  const audioUrl = await textToSpeech(greeting);
  console.log(`[${callSid}] GREETING → ${greeting.slice(0, 100)}`);

  res.type("text/xml");
  res.send(buildGatherTwiml(audioUrl, greeting, `${PUBLIC_URL}/respond`));
});

// ── Every caller utterance after greeting ─────────────────
app.post("/respond", async (req, res) => {
  const callSid    = req.body.CallSid || "unknown";
  const userSpeech = (req.body.SpeechResult || "").trim();
  const confidence = parseFloat(req.body.Confidence || 0);

  console.log(`[${callSid}] USER (${confidence.toFixed(2)}): "${userSpeech}"`);

  // ── Nothing heard ──────────────────────────────────────
  if (!userSpeech || confidence < 0.25) {
    const nudge =
      "Daya kari aau thare kahanti. Sorry, I did not catch that. Please repeat your question.";
    const audioUrl = await textToSpeech(nudge);
    res.type("text/xml");
    return res.send(buildGatherTwiml(audioUrl, nudge, `${PUBLIC_URL}/respond`));
  }

  // ── Goodbye detection ──────────────────────────────────
  const byeWords = [
    "bye", "goodbye", "thank you", "thanks", "no more", "that's all",
    "ok bye", "nothing else", "dhanyabad", "theek hai", "shukriya",
  ];
  if (byeWords.some((w) => userSpeech.toLowerCase().includes(w))) {
    const farewell = await getArjunReply(
      callSid,
      "The caller said goodbye. Give a warm 2-sentence farewell and invite them to visit DRIEMS campus."
    );
    const audioUrl = await textToSpeech(farewell);
    clearSession(callSid);
    res.type("text/xml");
    return res.send(buildEndTwiml(audioUrl, farewell));
  }

  // ── Normal turn ────────────────────────────────────────
  const reply    = await getArjunReply(callSid, userSpeech);
  const audioUrl = await textToSpeech(reply);
  console.log(`[${callSid}] ARJUN → ${reply.slice(0, 120)}`);

  res.type("text/xml");
  res.send(buildGatherTwiml(audioUrl, reply, `${PUBLIC_URL}/respond`));
});

// ──────────────────────────────────────────────────────────
//  START
// ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Arjun bot running on port ${PORT}`);
});
