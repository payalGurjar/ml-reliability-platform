import fs from 'node:fs';
import { makeScenario } from '../api/_lib/demo-data.js';

const toCsv = (rows) => {
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
};

const base = makeScenario('none');
fs.writeFileSync('public/sample-data/reference_training_window.csv', toCsv(base.reference));
const files = [
  ['none', 'production_no_drift.csv'],
  ['moderate', 'production_moderate_drift.csv'],
  ['significant', 'production_significant_drift.csv'],
];
for (const [key, file] of files) {
  const s = makeScenario(key);
  fs.writeFileSync('public/sample-data/' + file, toCsv(s.current));
}
for (const f of fs.readdirSync('public/sample-data')) {
  console.log(f, (fs.statSync('public/sample-data/' + f).size / 1024).toFixed(0) + ' KB');
}
