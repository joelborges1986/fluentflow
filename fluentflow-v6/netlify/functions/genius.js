// netlify/functions/genius.js
// Busca músicas e letras via Genius API

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const GENIUS_KEY = process.env.GENIUS_API_KEY;
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!GENIUS_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GENIUS_API_KEY não configurada.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { action, query, songId } = body;

  // ── Search songs ──
  if (action === 'search') {
    try {
      const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}&per_page=5`, {
        headers: { 'Authorization': `Bearer ${GENIUS_KEY}` }
      });
      if (!res.ok) throw new Error('Genius search error ' + res.status);
      const data = await res.json();
      const hits = (data.response?.hits || [])
        .filter(h => h.type === 'song')
        .map(h => ({
          id: h.result.id,
          title: h.result.title,
          artist: h.result.primary_artist?.name,
          thumbnail: h.result.song_art_image_thumbnail_url,
          url: h.result.url,
          youtubeId: null // will be fetched separately
        }));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ hits }) };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── Get song detail + lyrics excerpt ──
  if (action === 'song') {
    try {
      const res = await fetch(`https://api.genius.com/songs/${songId}?text_format=plain`, {
        headers: { 'Authorization': `Bearer ${GENIUS_KEY}` }
      });
      if (!res.ok) throw new Error('Genius song error ' + res.status);
      const data = await res.json();
      const song = data.response?.song;

      // Genius doesn't serve full lyrics via API (copyright) — we return metadata
      // The app will use Gemini to create exercises based on the song info + search
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          id: song.id,
          title: song.title,
          artist: song.primary_artist?.name,
          album: song.album?.name,
          releaseDate: song.release_date_for_display,
          description: song.description?.plain?.slice(0, 500),
          thumbnail: song.song_art_image_url,
          url: song.url,
          youtubeUrl: song.media?.find(m => m.provider === 'youtube')?.url || null,
          youtubeId: extractYoutubeId(song.media?.find(m => m.provider === 'youtube')?.url),
        })
      };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'action must be "search" or "song"' }) };
};

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
  return m ? m[1] : null;
}

exports.handler = handler;
