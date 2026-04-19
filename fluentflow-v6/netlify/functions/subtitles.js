// netlify/functions/subtitles.js
// Busca diálogos reais de séries via SubDL API (substituto do OpenSubtitles)
// Documentação: https://subdl.com/api-doc

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const SUBDL_KEY = process.env.SUBDL_API_KEY;
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!SUBDL_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUBDL_API_KEY não configurada.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { action, query, url: subtitleUrl } = body;

  // ── Search episodes ──
  if (action === 'search') {
    try {
      const params = new URLSearchParams({
        api_key: SUBDL_KEY,
        film_name: query,
        type: 'tv',
        languages: 'EN',
        subs_per_page: '5'
      });
      const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${params}`);
      if (!res.ok) throw new Error('SubDL search error ' + res.status);
      const data = await res.json();

      if (!data.status || !data.subtitles?.length) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ results: [] }) };
      }

      const results = data.subtitles.slice(0, 5).map(s => ({
        name: s.name,
        releaseName: s.release_name,
        lang: s.lang,
        season: s.season,
        episode: s.episode,
        downloadUrl: s.url ? `https://dl.subdl.com${s.url}` : null,
        showInfo: data.results?.[0] || {}
      })).filter(r => r.downloadUrl);

      return { statusCode: 200, headers: cors, body: JSON.stringify({ results, showInfo: data.results?.[0] }) };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── Download subtitle ZIP and extract SRT dialogue ──
  if (action === 'download') {
    if (!subtitleUrl) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'url required' }) };
    try {
      // SubDL returns a ZIP file — fetch it
      const res = await fetch(subtitleUrl, {
        headers: { 'User-Agent': 'FluentFlow/6.0' }
      });
      if (!res.ok) throw new Error('Download error ' + res.status);

      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Extract SRT content from ZIP (find the SRT file inside)
      const srtContent = extractSRTFromZip(bytes);
      if (!srtContent) throw new Error('No SRT found in ZIP');

      // Parse SRT into dialogue lines
      const lines = parseSRT(srtContent);
      const excerpt = extractExcerpt(lines, 10);

      return { statusCode: 200, headers: cors, body: JSON.stringify({ excerpt, totalLines: lines.length }) };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'action must be "search" or "download"' }) };
};

// Simple ZIP parser to extract first .srt file
function extractSRTFromZip(bytes) {
  // Find PK signature (local file header)
  let i = 0;
  while (i < bytes.length - 30) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
      const fnameLen = bytes[i+26] | (bytes[i+27] << 8);
      const extraLen = bytes[i+28] | (bytes[i+29] << 8);
      const compSize = bytes[i+18] | (bytes[i+19] << 8) | (bytes[i+20] << 16) | (bytes[i+21] << 24);
      const nameStart = i + 30;
      const fname = String.fromCharCode(...bytes.slice(nameStart, nameStart + fnameLen));
      const dataStart = nameStart + fnameLen + extraLen;

      if (fname.toLowerCase().endsWith('.srt') && compSize > 0) {
        // Try to read as uncompressed (method 0) or return raw bytes
        const data = bytes.slice(dataStart, dataStart + compSize);
        try {
          return new TextDecoder('utf-8').decode(data);
        } catch {
          return new TextDecoder('latin1').decode(data);
        }
      }
      i = dataStart + compSize;
    } else {
      i++;
    }
  }
  return null;
}

function parseSRT(srt) {
  const blocks = srt.trim().split(/\n\n+/);
  const lines = [];
  for (const block of blocks) {
    const parts = block.split('\n');
    if (parts.length < 3) continue;
    const text = parts.slice(2).join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .replace(/^\d+$/, '')
      .trim();
    if (text && text.length > 3 && text.length < 200 && !/^\d{2}:\d{2}/.test(text)) {
      lines.push(text);
    }
  }
  return lines;
}

function extractExcerpt(lines, count) {
  if (lines.length <= count) return lines;
  let bestStart = 0, bestScore = 0;
  for (let i = 0; i < lines.length - count; i++) {
    const slice = lines.slice(i, i + count);
    const score = slice.filter(l =>
      l.length > 5 && l.length < 100 &&
      !l.startsWith('[') && !l.startsWith('(') &&
      !/^\d/.test(l)
    ).length;
    if (score > bestScore) { bestScore = score; bestStart = i; }
  }
  return lines.slice(bestStart, bestStart + count);
}

exports.handler = handler;
