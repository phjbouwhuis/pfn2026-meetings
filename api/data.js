const { put, list, head, del } = require('@vercel/blob');

// Simple server-side JSON store using Vercel Blob
const BLOB_PREFIX = 'pfn2026_';

async function getData(key) {
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX + key });
    if (blobs.length === 0) return null;
    const response = await fetch(blobs[0].url);
    return await response.json();
  } catch (e) {
    console.error('getData error:', e);
    return null;
  }
}

async function setData(key, value) {
  try {
    // Delete old blob(s) first
    const { blobs } = await list({ prefix: BLOB_PREFIX + key });
    for (const blob of blobs) {
      await del(blob.url);
    }
    // Write new blob
    await put(BLOB_PREFIX + key + '.json', JSON.stringify(value), {
      access: 'public',
      contentType: 'application/json',
    });
    return true;
  } catch (e) {
    console.error('setData error:', e);
    return false;
  }
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (req.method === 'GET') {
      // GET /api/data?action=load
      if (action === 'load') {
        const members = await getData('members') || [];
        const meetings = await getData('meetings') || [];
        const emailConfig = await getData('emailConfig') || null;
        return res.status(200).json({ members, meetings, emailConfig });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (action === 'save-members') {
        await setData('members', body.members || []);
        return res.status(200).json({ ok: true });
      }
      if (action === 'save-meetings') {
        await setData('meetings', body.meetings || []);
        return res.status(200).json({ ok: true });
      }
      if (action === 'save-email') {
        await setData('emailConfig', body.emailConfig || null);
        return res.status(200).json({ ok: true });
      }
      if (action === 'save-all') {
        await Promise.all([
          setData('members', body.members || []),
          setData('meetings', body.meetings || []),
          body.emailConfig !== undefined ? setData('emailConfig', body.emailConfig) : Promise.resolve(),
        ]);
        return res.status(200).json({ ok: true });
      }
      if (action === 'reset') {
        await Promise.all([
          setData('members', []),
          setData('meetings', []),
          setData('emailConfig', null),
        ]);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
