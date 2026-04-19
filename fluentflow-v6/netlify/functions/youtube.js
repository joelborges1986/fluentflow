// netlify/functions/youtube.js
// Busca vídeos no YouTube para embed no player de música

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const YT_KEY = process.env.YOUTUBE_API_KEY;
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!YT_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'YOUTUBE_API_KEY não configurada.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { query } = body;
  if (!query) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'query required' }) };

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query + ' official audio',
      type: 'video',
      maxResults: '3',
      videoCategoryId: '10', // Music category
      key: YT_KEY
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) throw new Error('YouTube API error ' + res.status);
    const data = await res.json();

    const videos = (data.items || []).map(item => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channel: item.snippet?.channelTitle,
      thumbnail: item.snippet?.thumbnails?.medium?.url,
    })).filter(v => v.videoId);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ videos }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

exports.handler = handler;
