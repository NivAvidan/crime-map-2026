import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

export const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));
export const GEO_FILE = DATA_DIR + 'localities-geo.json';

// The 19 source fields, in file order. Names are kept exactly as in the police CSV.
export const FIELDS = [
  'FictiveIDNumber', 'Year', 'Quarter', 'YeshuvKod', 'Yeshuv',
  'PoliceDistrictKod', 'PoliceDistrict', 'PoliceMerhavKod', 'PoliceMerhav',
  'PoliceStationKod', 'PoliceStation', 'municipalKod', 'municipalName',
  'StatisticAreaKod', 'StatisticArea', 'StatisticGroupKod', 'StatisticGroup',
  'StatisticTypeKod', 'StatisticType',
];

/** Reads the police CSV (Windows-1255 or UTF-8) into an array of row objects. */
export function readCsv(path = process.argv[2] || DATA_DIR + 'crime-2025.csv') {
  const buf = readFileSync(path);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1255').decode(buf);
  }
  const rows = parse(text, { columns: true, bom: true, skip_empty_lines: true, trim: true });
  const missing = FIELDS.filter((f) => !(f in rows[0]));
  if (missing.length) throw new Error('CSV is missing expected columns: ' + missing.join(', '));
  return rows;
}

export const norm = (s) =>
  (s || '').replace(/[\s\-־–'"׳״().*]/g, '').replace(/יי/g, 'י').replace(/וו/g, 'ו');
