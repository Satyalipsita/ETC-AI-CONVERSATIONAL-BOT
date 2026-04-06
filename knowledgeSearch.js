// knowledgeSearch.js
// Intelligent keyword matcher for Priya bot
// Searches knowledge.json and returns the best Odia reply

const knowledge = require('./knowledge.json');

/**
 * Normalize text for keyword matching
 * Handles Odia transliteration, common typos, lowercase
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score a single intent against caller text
 * Returns a number: higher = better match
 */
function scoreIntent(intent, callerText) {
  const normalized = normalize(callerText);
  const words = normalized.split(' ');
  let score = 0;

  for (const keyword of intent.keywords) {
    const kw = normalize(keyword);
    // Exact phrase match scores higher
    if (normalized.includes(kw)) {
      score += kw.includes(' ') ? 3 : 2; // multi-word phrases score 3
    } else {
      // Partial word match
      for (const word of words) {
        if (word.includes(kw) || kw.includes(word)) {
          score += 1;
        }
      }
    }
  }
  return score;
}

/**
 * Find best matching intent for caller's speech
 * @param {string} callerText - Transcribed caller speech (Odia/English)
 * @returns {object|null} - Best matched intent or null if no match found
 */
function findBestMatch(callerText) {
  if (!callerText || callerText.trim().length === 0) return null;

  let bestScore = 0;
  let bestIntent = null;

  for (const intent of knowledge.intents) {
    const score = scoreIntent(intent, callerText);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Minimum score threshold - if too low, return null (let Claude handle it)
  const MINIMUM_SCORE = 1;
  if (bestScore < MINIMUM_SCORE) return null;

  return { intent: bestIntent, score: bestScore };
}

/**
 * Get Odia reply for caller input
 * Returns Odia reply string or null if no match
 */
function getOdiaReply(callerText) {
  const match = findBestMatch(callerText);
  if (!match) return null;
  return match.intent.odia_reply;
}

/**
 * Build enriched system prompt context from knowledge base
 * Injects college facts into Claude system prompt
 */
function buildKnowledgeContext() {
  const meta = knowledge.meta;
  return `
=== DRIEMS POLYTECHNIC - OFFICIAL FACTS (Use ONLY these facts. Never guess.) ===

CONTACT:
- Satya Ranjan Panigrahi Sir, Assistant Professor, ETC Department
- Phone: ${meta.contact_number}
- Website: ${meta.website}
- Admission Portal: ${meta.admission_portal}
- Location: ${meta.location}
- Affiliation: ${meta.affiliation}

FEES (Exact - speak confidently):
- ETC Course Annual Fees: ₹65,000 (payable in 2 easy instalments)
- Hostel Annual Fees: ₹75,000 (1 instalment)
- Hostel INCLUDES: 3 delicious hot meals daily, WiFi, Gym, Swimming Pool

CAMPUS FACILITIES:
- 100+ acres beautiful green campus
- Modern Gym (free for students)
- Swimming Pool (rare in Odisha polytechnics!)
- Huge Playground: Cricket, Football, Badminton, Volleyball
- High-speed WiFi in classrooms and hostel
- 24-hour security, CCTV, separate girls hostel

TRANSPORT (FREE):
- Free college bus from Bhubaneswar
- Free college bus from Cuttack
- Zero transport expense for students

PLACEMENT COMPANIES (Exact names - speak confidently):
- Hitachi, Exicom Telecom, Cummins India, Centum Electronics, Voltas, Tata Power

ETC BRANCH:
- 60 seats (SAMS Odisha)
- Subjects: Electronics, Communication Systems, Digital Electronics, Microprocessor, VLSI Design, Signal Processing
- B.Tech Lateral Entry available after Diploma
- Girls: Safe campus, separate hostel

LANGUAGE RULE:
- Always speak in Odia first
- Be CONFIDENT. Never say "maybe", "I think", "approximately" for facts listed above.
- Use exact numbers. ₹65,000 NOT "around 60,000". Hitachi NOT "some companies".
- Keep replies SHORT for phone call. Max 3-4 sentences.
- End EVERY reply with a follow-up question to keep caller engaged.

=== END OF FACTS ===
`;
}

module.exports = {
  findBestMatch,
  getOdiaReply,
  buildKnowledgeContext,
  knowledge
};
