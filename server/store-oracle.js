// Data source: Oracle Database (the target architecture).
import { query } from './db.js';

export const name = 'oracle';

export async function localities() {
  const rows = await query(
    `SELECT c.YeshuvKod, MIN(c.Yeshuv) YESHUV, COUNT(*) RECORDS, MIN(g.LAT) LAT, MIN(g.LON) LON
       FROM CRIME_RECORDS c LEFT JOIN LOCALITY_GEO g ON g.YeshuvKod = c.YeshuvKod
      WHERE c.YeshuvKod IS NOT NULL
      GROUP BY c.YeshuvKod ORDER BY RECORDS DESC`);
  return rows.map((r) => ({ code: r.YESHUVKOD, name: r.YESHUV, records: r.RECORDS, lat: r.LAT, lon: r.LON }));
}

export async function meta() {
  const [r] = await query(
    `SELECT MIN(Year) YEAR_FROM, MAX(Year) YEAR_TO, COUNT(*) RECORDS,
            SUM(CASE WHEN YeshuvKod IS NULL THEN 1 ELSE 0 END) NO_YESHUV FROM CRIME_RECORDS`);
  return { yearFrom: r.YEAR_FROM, yearTo: r.YEAR_TO, records: r.RECORDS, recordsWithoutLocality: r.NO_YESHUV };
}

export async function locality(code) {
  const [r] = await query(
    `SELECT MIN(c.Yeshuv) YESHUV, COUNT(*) RECORDS, COUNT(DISTINCT c.FictiveIDNumber) UNIQUE_IDS,
            MIN(c.Year) YEAR, MIN(g.LAT) LAT, MIN(g.LON) LON
       FROM CRIME_RECORDS c LEFT JOIN LOCALITY_GEO g ON g.YeshuvKod = c.YeshuvKod
      WHERE c.YeshuvKod = :code`, { code });
  if (!r || !r.RECORDS) return null;
  return { code, name: r.YESHUV, year: r.YEAR, records: r.RECORDS, uniqueIds: r.UNIQUE_IDS, lat: r.LAT, lon: r.LON };
}

export async function crime(code, quarter) {
  const b = { code, q: quarter };
  const W = 'WHERE YeshuvKod = :code AND (:q IS NULL OR Quarter = :q)';
  const by = (kod, nm) => query(
    `SELECT ${kod} KOD, ${nm} NAME, COUNT(*) RECORDS FROM CRIME_RECORDS ${W}
      GROUP BY ${kod}, ${nm} ORDER BY RECORDS DESC`, b);

  const [quarters, totals, types, districts, merhavim, stations, areas] = await Promise.all([
    query(`SELECT Quarter, COUNT(*) RECORDS, COUNT(DISTINCT FictiveIDNumber) UNIQUE_IDS
             FROM CRIME_RECORDS WHERE YeshuvKod = :code GROUP BY Quarter ORDER BY Quarter`, { code }),
    query(`SELECT MIN(Yeshuv) YESHUV, MIN(Year) YEAR, COUNT(*) RECORDS, COUNT(DISTINCT FictiveIDNumber) UNIQUE_IDS
             FROM CRIME_RECORDS ${W}`, b),
    query(`SELECT StatisticGroupKod GK, StatisticGroup GN, StatisticTypeKod TK, StatisticType TN, COUNT(*) RECORDS
             FROM CRIME_RECORDS ${W}
            GROUP BY StatisticGroupKod, StatisticGroup, StatisticTypeKod, StatisticType ORDER BY RECORDS DESC`, b),
    by('PoliceDistrictKod', 'PoliceDistrict'),
    by('PoliceMerhavKod', 'PoliceMerhav'),
    by('PoliceStationKod', 'PoliceStation'),
    by('StatisticAreaKod', 'StatisticArea'),
  ]);
  if (!quarters.length) return null;

  const groups = new Map();
  for (const t of types) {
    const key = t.GK ?? '-';
    if (!groups.has(key)) groups.set(key, { code: t.GK, name: t.GN, records: 0, types: [] });
    const g = groups.get(key);
    g.records += t.RECORDS;
    g.types.push({ code: t.TK, name: t.TN, records: t.RECORDS });
  }
  const list = (rows) => rows.filter((r) => r.KOD || r.NAME).map((r) => ({ code: r.KOD, name: r.NAME, records: r.RECORDS }));
  const t = totals[0];
  return {
    code,
    name: t.YESHUV,
    year: t.YEAR,
    quarter: quarter || 'ALL',
    records: t.RECORDS,
    uniqueIds: t.UNIQUE_IDS,
    quarters: quarters.map((r) => ({ quarter: r.QUARTER, records: r.RECORDS, uniqueIds: r.UNIQUE_IDS })),
    groups: [...groups.values()].sort((a, c) => c.records - a.records),
    police: { districts: list(districts), merhavim: list(merhavim), stations: list(stations) },
    statisticAreas: list(areas),
    recordsWithoutStatisticArea: areas.filter((r) => !r.KOD && !r.NAME).reduce((s, r) => s + r.RECORDS, 0),
  };
}
