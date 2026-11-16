import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chatRoute } from './chat.js';
import { caseRoute, newsRoute } from './make.js';

// DATA_SOURCE=oracle (target architecture) | csv (in-memory, no database needed).
// When unset: Oracle if a connection is configured (DB_CONNECT), otherwise the CSV.
const source = process.env.DATA_SOURCE || (process.env.DB_CONNECT ? 'oracle' : 'csv');
const store = await import(source === 'csv' ? './store-csv.js' : './store-oracle.js');

const app = express();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const notFound = (res, code) => res.status(404).json({ error: 'no data for locality', code });

// GET /api/meta — file-level facts (year, totals, records without a locality).
app.get('/api/meta', wrap(async (req, res) => res.json({ ...(await store.meta()), dataSource: store.name })));

// GET /api/localities — every locality found in the data, with coordinates when known.
app.get('/api/localities', wrap(async (req, res) => res.json(await store.localities())));

// GET /api/localities/:code — locality details by YeshuvKod.
app.get('/api/localities/:code', wrap(async (req, res) => {
  const r = await store.locality(req.params.code);
  return r ? res.json(r) : notFound(res, req.params.code);
}));

// GET /api/localities/:code/crime[?quarter=Q1] — aggregated crime data for one locality.
app.get('/api/localities/:code/crime', wrap(async (req, res) => {
  const quarter = req.query.quarter || null;
  if (quarter && !/^Q[1-4]$/.test(quarter)) return res.status(400).json({ error: 'quarter must be Q1..Q4' });
  const r = await store.crime(req.params.code, quarter);
  return r ? res.json(r) : notFound(res, req.params.code);
}));

// POST /api/chat — chat with the OpenAI crime-research agent (streams plain text).
app.post('/api/chat', express.json({ limit: '200kb' }), wrap(chatRoute(store)));

// Chat actions that run Make.com automations.
app.post('/api/make/case', express.json({ limit: '50kb' }), wrap(async (req, res) => caseRoute(req, res)));
app.post('/api/make/news', express.json({ limit: '50kb' }), wrap(async (req, res) => newsRoute(req, res)));

// Serve the built React app, when present.
const dist = fileURLToPath(new URL('../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile('index.html', { root: dist }));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error', detail: err.message });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`CrimeMap API on http://localhost:${port} (data source: ${store.name})`));
