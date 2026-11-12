export const MIN_DATE = '1970-01-01';
export const MAX_DATE = '2100-12-31';
export const today = () => new Date().toISOString().slice(0, 10);
export const isDate = s =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s &&
  s >= MIN_DATE && s <= MAX_DATE;
export const isMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && isDate(s + '-01');
export const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const addMonths = (s, n) => {
  const [y, m, day] = s.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
};
export const monthOf = s => s.slice(0, 7);
export const monthRange = m => [`${m}-01`, addDays(addMonths(`${m}-01`, 1), -1)];

// Expand a stored transaction into dated occurrences inside [from, to].
export function occurrences(tx, from, to) {
  const base = { ...tx, sourceDate: tx.date };
  if (!tx.recurring) return tx.date >= from && tx.date <= to ? [base] : [];
  const end = tx.endDate && tx.endDate < to ? tx.endDate : to;
  const out = [];
  for (let i = 0; i < 6000; i++) {
    const d = tx.recurring === 'weekly' ? addDays(tx.date, 7 * i) : addMonths(tx.date, i);
    if (d > end) break;
    if (d >= from) out.push({ ...base, date: d });
  }
  return out;
}
