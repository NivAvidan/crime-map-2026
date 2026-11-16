// Loads the police CSV + locality coordinates into Oracle. Rebuilds both tables.
import { existsSync, readFileSync } from 'node:fs';
import { getPool, oracledb } from '../db.js';
import { readCsv, FIELDS, GEO_FILE } from './csv.js';

const rows = readCsv();
console.log(`csv: ${rows.length} rows`);

const pool = await getPool();
const conn = await pool.getConnection();

for (const t of ['CRIME_RECORDS', 'LOCALITY_GEO']) {
  try { await conn.execute(`DROP TABLE ${t} PURGE`); } catch (e) { if (e.errorNum !== 942) throw e; }
}
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
for (const stmt of schema) await conn.execute(stmt);

const sql = `INSERT INTO CRIME_RECORDS (${FIELDS.join(',')}) VALUES (${FIELDS.map((_, i) => ':' + (i + 1)).join(',')})`;
const bindDefs = FIELDS.map((f) => f === 'Year'
  ? { type: oracledb.NUMBER }
  : { type: oracledb.STRING, maxSize: 1600 });
const BATCH = 5000;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).map((r) =>
    FIELDS.map((f) => (f === 'Year' ? Number(r[f]) || null : r[f] || null)));
  await conn.executeMany(sql, batch, { bindDefs });
  process.stdout.write(`\rinserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
console.log();

if (existsSync(GEO_FILE)) {
  const geo = Object.entries(JSON.parse(readFileSync(GEO_FILE, 'utf8')))
    .map(([code, g]) => [code, g.name, g.lat, g.lon, g.source]);
  if (geo.length) {
    await conn.executeMany('INSERT INTO LOCALITY_GEO (YeshuvKod, Yeshuv, LAT, LON, SOURCE) VALUES (:1,:2,:3,:4,:5)', geo);
  }
  console.log(`geo: ${geo.length} localities`);
} else {
  console.warn('geo: data/localities-geo.json not found - run "npm run geocode" then re-import');
}

await conn.commit();
const [c] = (await conn.execute(
  `SELECT COUNT(*) N, COUNT(DISTINCT FictiveIDNumber) IDS, COUNT(DISTINCT YeshuvKod) LOCS,
          SUM(CASE WHEN YeshuvKod IS NULL THEN 1 ELSE 0 END) NO_YESHUV FROM CRIME_RECORDS`)).rows;
console.log('oracle:', c);
await conn.close();
await pool.close();
