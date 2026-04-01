const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── Claude AI chat endpoint ──────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, system } = req.body;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages
      })
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Google TTS proxy – supports Odia (or) and English (en) ──────
function splitText(str, max) {
  const chunks = [];
  const sentences = str.replace(/([।.!?])\s*/g, '$1|').split('|');
  let current = '';
  for (const s of sentences) {
    if (!s.trim()) continue;
    if ((current + s).length > max) {
      if (current.trim()) chunks.push(current.trim());
      if (s.length > max) {
        const words = s.split(' ');
        let wChunk = '';
        for (const w of words) {
          if ((wChunk + ' ' + w).length > max) {
            if (wChunk.trim()) chunks.push(wChunk.trim());
            wChunk = w;
          } else {
            wChunk += (wChunk ? ' ' : '') + w;
          }
        }
        if (wChunk.trim()) chunks.push(wChunk.trim());
        current = '';
      } else {
        current = s;
      }
    } else {
      current += (current ? ' ' : '') + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}

app.post('/api/tts', async (req, res) => {
  const { text, lang } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text' });

  const googleLang = lang === 'or' ? 'or' : 'en-IN';
  const chunks = splitText(text.trim(), 190);
  const audioBuffers = [];

  try {
    for (const chunk of chunks) {
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${googleLang}&client=tw-ob&ttsspeed=0.9`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/'
        }
      });
      if (!response.ok) throw new Error('Google TTS HTTP ' + response.status);
      const buf = await response.buffer();
      audioBuffers.push(buf);
    }
    const combined = Buffer.concat(audioBuffers);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(combined);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('DRIEMS Bot running on port ' + PORT));
