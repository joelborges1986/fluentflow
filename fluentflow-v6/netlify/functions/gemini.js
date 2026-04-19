// netlify/functions/gemini.js
// Proxy serverless para Gemini API — chave fica no servidor

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!GEMINI_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GEMINI_API_KEY não configurada no Netlify.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { mode, model, payload } = body;
  const geminiModel = model || 'gemini-2.0-flash';

  if (mode === 'stream') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); return { statusCode: res.status, headers: cors, body: JSON.stringify({ error: e.error?.message || 'Gemini error ' + res.status }) }; }
      const raw = await res.text();
      let fullText = '';
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try { const evt = JSON.parse(data); const chunk = evt.candidates?.[0]?.content?.parts?.[0]?.text; if (chunk) fullText += chunk; } catch {}
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ text: fullText }) };
    } catch (e) { return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) }; }
  }

  if (mode === 'json') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_KEY}`;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); return { statusCode: res.status, headers: cors, body: JSON.stringify({ error: e.error?.message || 'Gemini error ' + res.status }) }; }
      const data = await res.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
    } catch (e) { return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) }; }
  }

  return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'mode deve ser "stream" ou "json"' }) };
};

exports.handler = handler;
