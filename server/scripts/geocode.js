// Builds data/localities-geo.json: YeshuvKod -> coordinates, from OpenStreetMap.
// The police file has no coordinates, so this is the external geographic layer.
// Only locality names are sent out. Results are cached; rerun to fill gaps.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readCsv, norm, GEO_FILE } from './csv.js';

const UA = { 'User-Agent': 'locality-geocoder/1.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const localities = new Map();
for (const r of readCsv()) if (r.YeshuvKod && r.Yeshuv) localities.set(r.YeshuvKod, r.Yeshuv);

const geo = existsSync(GEO_FILE) ? JSON.parse(readFileSync(GEO_FILE, 'utf8')) : {};
const save = () => writeFileSync(GEO_FILE, JSON.stringify(geo, null, 1));

// 1) One Overpass request for every named place in the region.
const RANK = { city: 4, town: 3, village: 2, hamlet: 1 };
try {
  const q = '[out:json][timeout:90];node[place~"^(city|town|village|hamlet)$"](29.4,34.2,33.4,35.95);out;';
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: UA, body: new URLSearchParams({ data: q }),
  });
  const { elements } = await res.json();
  const byName = new Map();
  for (const e of elements) {
    for (const name of [e.tags['name:he'], e.tags.name, e.tags.alt_name]) {
      if (!name) continue;
      const k = norm(name), prev = byName.get(k);
      if (!prev || RANK[e.tags.place] > RANK[prev.tags.place]) byName.set(k, e);
    }
  }
  for (const [code, name] of localities) {
    const e = byName.get(norm(name));
    if (e && !geo[code]) geo[code] = { name, lat: e.lat, lon: e.lon, source: 'osm-overpass' };
  }
  save();
  console.log(`overpass: ${elements.length} places, matched ${Object.keys(geo).length}/${localities.size}`);
} catch (e) {
  console.warn('overpass failed:', e.message);
}

// 2) Nominatim (1 req/sec) for whatever is still missing.
for (const [code, name] of localities) {
  if (geo[code]) continue;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il,ps&accept-language=he&q=' +
      encodeURIComponent(name.replace(/[*]/g, ''));
    const [hit] = await (await fetch(url, { headers: UA })).json();
    if (hit) geo[code] = { name, lat: +hit.lat, lon: +hit.lon, source: 'osm-nominatim' };
    else console.warn('no match:', code, name);
  } catch (e) {
    console.warn('nominatim failed:', name, e.message);
  }
  save();
  await sleep(1100);
}
console.log(`done: ${Object.keys(geo).length}/${localities.size} localities located -> ${GEO_FILE}`);
