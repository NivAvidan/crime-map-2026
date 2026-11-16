// Data source: the police CSV held in memory (no database). Same output shapes as store-oracle.js.
import { existsSync, readFileSync } from 'node:fs';
import { readCsv, DATA_DIR, GEO_FILE } from './scripts/csv.js';

export const name = 'csv';

const rows = readCsv(DATA_DIR + 'crime-2025.csv');
const geo = existsSync(GEO_FILE) ? JSON.parse(readFileSync(GEO_FILE, 'utf8')) : {};
const byCode = new Map();
for (const r of rows) {
  if (!r.YeshuvKod) continue;
  if (!byCode.has(r.YeshuvKod)) byCode.set(r.YeshuvKod, []);
  byCode.get(r.YeshuvKod).push(r);
}
const uniq = (list) => new Set(list.map((r) => r.FictiveIDNumber)).size;
const years = rows.map((r) => Number(r.Year)).filter(Boolean);
const YEAR_FROM = Math.min(...years), YEAR_TO = Math.max(...years);

export async function localities() {
  return [...byCode].map(([code, list]) => ({
    code, name: list[0].Yeshuv, records: list.length,
    lat: geo[code]?.lat ?? null, lon: geo[code]?.lon ?? null,
  })).sort((a, b) => b.records - a.records);
}

export async function meta() {
  return {
    yearFrom: YEAR_FROM, yearTo: YEAR_TO, records: rows.length,
    recordsWithoutLocality: rows.filter((r) => !r.YeshuvKod).length,
  };
}

export async function locality(code) {
  const list = byCode.get(code);
  if (!list) return null;
  return {
    code, name: list[0].Yeshuv, year: Number(list[0].Year), records: list.length, uniqueIds: uniq(list),
    lat: geo[code]?.lat ?? null, lon: geo[code]?.lon ?? null,
  };
}

function countBy(list, kod, nm) {
  const m = new Map();
  for (const r of list) {
    const key = r[kod] + '|' + r[nm];
    const e = m.get(key) || { code: r[kod] || null, name: r[nm] || null, records: 0 };
    e.records++;
    m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.records - a.records);
}

export async function crime(code, quarter) {
  const all = byCode.get(code);
  if (!all) return null;
  const list = quarter ? all.filter((r) => r.Quarter === quarter) : all;

  const groups = new Map();
  for (const r of list) {
    const gk = r.StatisticGroupKod || '-';
    if (!groups.has(gk)) groups.set(gk, { code: r.StatisticGroupKod || null, name: r.StatisticGroup || null, records: 0, types: new Map() });
    const g = groups.get(gk);
    g.records++;
    const tk = r.StatisticTypeKod + '|' + r.StatisticType;
    const t = g.types.get(tk) || { code: r.StatisticTypeKod || null, name: r.StatisticType || null, records: 0 };
    t.records++;
    g.types.set(tk, t);
  }
  const named = (items) => items.filter((x) => x.code || x.name);
  const areas = countBy(list, 'StatisticAreaKod', 'StatisticArea');
  return {
    code,
    name: all[0].Yeshuv,
    year: Number(all[0].Year),
    quarter: quarter || 'ALL',
    records: list.length,
    uniqueIds: uniq(list),
    quarters: ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => {
      const ql = all.filter((r) => r.Quarter === q);
      return { quarter: q, records: ql.length, uniqueIds: uniq(ql) };
    }).filter((q) => q.records),
    groups: [...groups.values()]
      .map((g) => ({ ...g, types: [...g.types.values()].sort((a, b) => b.records - a.records) }))
      .sort((a, b) => b.records - a.records),
    police: {
      districts: named(countBy(list, 'PoliceDistrictKod', 'PoliceDistrict')),
      merhavim: named(countBy(list, 'PoliceMerhavKod', 'PoliceMerhav')),
      stations: named(countBy(list, 'PoliceStationKod', 'PoliceStation')),
    },
    statisticAreas: named(areas),
    recordsWithoutStatisticArea: areas.filter((x) => !x.code && !x.name).reduce((s, x) => s + x.records, 0),
  };
}
