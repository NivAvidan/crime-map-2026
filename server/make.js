// Chat actions backed by Make.com automations. The webhook URLs stay on the server (.env).
//   POST /api/make/case  { city, description }  -> automation 1: manual case documentation
//   POST /api/make/news  { city }               -> automation 2: crime news
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function callHook(url, payload, res) {
  if (!url) return res.status(503).json({ error: 'webhook is not configured' });
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(170_000),
    });
  } catch (e) {
    console.error('make webhook error', e.message);
    return res.status(504).json({ error: 'automation did not respond' });
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    console.error('make webhook status', upstream.status, text.slice(0, 300));
    return res.status(502).json({ error: 'automation failed', status: upstream.status });
  }
  let reply = text;
  try { reply = JSON.parse(text); } catch { /* plain text reply */ }
  res.json({ ok: true, reply });
}

export const caseRoute = (req, res) => {
  const city = clean(req.body?.city, 200), description = clean(req.body?.description, 5000);
  if (!city || !description) return res.status(400).json({ error: 'city and description are required' });
  return callHook(process.env.MAKE_CASE_WEBHOOK, { city, description }, res);
};

export const newsRoute = (req, res) => {
  const city = clean(req.body?.city, 200);
  if (!city) return res.status(400).json({ error: 'city is required' });
  return callHook(process.env.MAKE_NEWS_WEBHOOK, { city }, res);
};
