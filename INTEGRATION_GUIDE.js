// ============================================================
// HOW TO INTEGRATE knowledge.json + knowledgeSearch.js
// INTO YOUR EXISTING server.js (Arjun/Priya Bot)
// ============================================================
//
// STEP 1: Copy these 2 files to your GitHub repo root:
//   - knowledge.json
//   - knowledgeSearch.js
//
// STEP 2: In your server.js, add this import at the top:

const { buildKnowledgeContext, getOdiaReply } = require('./knowledgeSearch');

// STEP 3: Find where you build your Claude system prompt.
// It probably looks something like this:
//
//   const systemPrompt = `You are Priya, DRIEMS admissions assistant...`
//
// REPLACE that line with:

const systemPrompt = `
You are Priya — the confident, warm, Odia-speaking AI Admission Assistant 
for DRIEMS Polytechnic ETC Branch.

${buildKnowledgeContext()}

SPEAKING STYLE FOR PHONE CALLS:
- Speak in Odia (transliterated). Short sentences. Max 3-4 lines per reply.
- Be direct and confident. You have all the facts above.
- Never say "I am not sure", "maybe", "I think". You KNOW these facts.
- Sound like a helpful senior student, not a robot.
- After answering, always ask "Aau kana janibaku chahanti?" (What else do you want to know?)
- If caller asks for a teacher, say: "Satya Sir ku call karanti: 7978900914"
`;

// STEP 4: Find your Claude API call section.
// Before sending to Claude, try the fast local match first:
//
// REPLACE your existing Claude call with this pattern:

async function getPriyaResponse(callerSpeech, conversationHistory) {
  
  // FAST PATH: Try local knowledge base first
  const localReply = getOdiaReply(callerSpeech);
  if (localReply && conversationHistory.length <= 2) {
    // For simple first-time questions, use instant local reply
    // This cuts latency from ~2000ms to ~50ms
    console.log('[PRIYA] Using local knowledge match - fast path');
    return localReply;
  }

  // FULL PATH: Send to Claude with knowledge context injected
  console.log('[PRIYA] Sending to Claude with knowledge context');
  
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',   // fast model for low latency
    max_tokens: 300,                        // keep replies short for phone
    system: systemPrompt,
    messages: [
      ...conversationHistory,
      { role: 'user', content: callerSpeech }
    ]
  });

  return response.content[0].text;
}

// ============================================================
// LATENCY OPTIMIZATION TIPS (reduce delay in Priya's speech)
// ============================================================
//
// 1. Use claude-haiku (fastest Claude model) ✅ already above
// 2. Keep max_tokens at 300 or less ✅ already above
// 3. Use local knowledge match for common questions ✅ above
// 4. Pre-warm your Render server (set health check ping)
// 5. For Sarvam TTS: use meera, od-IN, and keep text under 100 chars per chunk
//    - Split long bot replies into 2 short TTS calls if needed
//
// EXAMPLE Sarvam TTS call with short text:
//
// const ttsResponse = await axios.post('https://api.sarvam.ai/text-to-speech', {
//   inputs: [reply.substring(0, 200)],    // never send more than 200 chars at once
//   target_language_code: 'od-IN',
//   speaker: 'meera',
//   pace: 1.1,                            // slightly faster = more confident sound
//   loudness: 1.5                         // louder = more assertive
// }, { headers: { 'API-Subscription-Key': process.env.SARVAM_API_KEY } });

// ============================================================
// CONFIDENT ODIA TONE — Add to system prompt if still hesitant
// ============================================================
//
// Add this line inside your systemPrompt:
//
// "Uttara debare kabhi 'maybe', 'probably', 'I think', 'I am not sure' 
//  use naka. Tuma facts jaanuchi — confident, spashta, aau direct bol."
