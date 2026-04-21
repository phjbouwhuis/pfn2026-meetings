const { put, list, del } = require('@vercel/blob');

const PREFIX = 'pfn2026_';

// ── Check if Blob is configured ──────────────────────────────
function blobAvailable() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// ── In-memory fallback (persists within a single function instance) ──
// This is NOT reliable for production but prevents crashes if Blob isn't set up
const memStore = {};

async function getData(key) {
  if (!blobAvailable()) {
    return memStore[key] || null;
  }
  try {
    const { blobs } = await list({ prefix: PREFIX + key, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.length === 0) return null;
    // For private blobs, use downloadUrl (includes temporary auth token)
    const downloadUrl = blobs[0].downloadUrl || blobs[0].url;
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
    });
    if (!response.ok) {
      console.error('getData fetch failed:', response.status, response.statusText);
      return memStore[key] || null;
    }
    return await response.json();
  } catch (e) {
    console.error('getData error:', e.message);
    return memStore[key] || null;
  }
}

async function setData(key, value) {
  memStore[key] = value; // Always update memory cache
  if (!blobAvailable()) {
    console.error('BLOB_READ_WRITE_TOKEN not set — data stored in memory only (will be lost on redeploy)');
    return false;
  }
  try {
    // Delete old blob(s) first
    const { blobs } = await list({ prefix: PREFIX + key, token: process.env.BLOB_READ_WRITE_TOKEN });
    for (const blob of blobs) {
      await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
    // Write new blob
    await put(PREFIX + key + '.json', JSON.stringify(value), {
      access: 'private',
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return true;
  } catch (e) {
    console.error('setData error:', e.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (req.method === 'GET') {
      if (action === 'load') {
        const members = await getData('members') || [];
        const meetings = await getData('meetings') || [];
        const emailConfig = await getData('emailConfig') || null;
        return res.status(200).json({
          members,
          meetings,
          emailConfig,
          _blobConnected: blobAvailable(),
        });
      }
      if (action === 'status') {
        return res.status(200).json({
          blobConnected: blobAvailable(),
          hasToken: !!process.env.BLOB_READ_WRITE_TOKEN,
          tokenLength: process.env.BLOB_READ_WRITE_TOKEN ? process.env.BLOB_READ_WRITE_TOKEN.length : 0,
        });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (action === 'save-members') {
        const ok = await setData('members', body.members || []);
        return res.status(200).json({ ok, blobConnected: blobAvailable() });
      }
      if (action === 'save-meetings') {
        const ok = await setData('meetings', body.meetings || []);
        return res.status(200).json({ ok, blobConnected: blobAvailable() });
      }
      if (action === 'save-email') {
        const ok = await setData('emailConfig', body.emailConfig || null);
        return res.status(200).json({ ok, blobConnected: blobAvailable() });
      }
      if (action === 'save-all') {
        await Promise.all([
          setData('members', body.members || []),
          setData('meetings', body.meetings || []),
          body.emailConfig !== undefined ? setData('emailConfig', body.emailConfig) : Promise.resolve(),
        ]);
        return res.status(200).json({ ok: true, blobConnected: blobAvailable() });
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
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
