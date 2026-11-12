import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, addUser, seed, verifyPassword } from './store.js';
import { MIN_DATE, MAX_DATE, addMonths, isDate, isMonth, monthOf, monthRange, occurrences, today } from './dates.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = m => new HttpError(400, m);
const SESSION_MS = 24 * 3600 * 1000;
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const clean = ({ userId, ...t }) => t;
const money = n => Math.round(n * 100) / 100;
const str = v => (typeof v === 'string' ? v : '');
const body = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

export function createApp() {
  const db = createStore();
  seed(db);
  const fails = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // ---------- middleware ----------
  const auth = (req, res, next) => {
    const m = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
    const s = m && db.sessions.get(m[1]);
    if (s && s.expires < Date.now()) db.sessions.delete(m[1]);
    const user = s && s.expires >= Date.now() ? db.users.find(u => u.id === s.userId) : null;
    if (!user) throw new HttpError(401, 'Login required: send header "Authorization: Bearer <token>"');
    req.user = user; req.token = m[1];
    next();
  };
  const requireRole = r => (req, res, next) => {
    if (req.user.role !== r) throw new HttpError(403, 'Forbidden: ' + r + ' role required');
    next();
  };

  // ---------- helpers ----------
  const myCats = req => db.categories.filter(c => c.userId === req.user.id);
  const findCat = (req, name) => myCats(req).find(c => c.name.toLowerCase() === str(name).trim().toLowerCase());
  const getRange = query => {
    const from = str(query.from) || MIN_DATE;
    const to = str(query.to) || monthRange(monthOf(today()))[1];
    if (!isDate(from) || !isDate(to)) throw bad(`from/to must be YYYY-MM-DD between ${MIN_DATE} and ${MAX_DATE}`);
    if (from > to) throw bad('from must not be after to');
    return [from, to];
  };
  const getType = (v, fallback = '') => {
    const t = str(v) || fallback;
    if (t && !['income', 'expense'].includes(t)) throw bad('type must be income or expense');
    return t;
  };
  const txs = (req, from, to, type = '', category = '') =>
    db.transactions.filter(t => t.userId === req.user.id)
      .flatMap(t => occurrences(t, from, to))
      .filter(t => (!type || t.type === type) && (!category || t.category === category))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const total = list => money(list.reduce((s, t) => s + t.amount, 0));
  const findTx = req => {
    const t = db.transactions.find(x => x.id === Number(req.params.id) && x.userId === req.user.id);
    if (!t) throw new HttpError(404, 'Transaction not found');
    return t;
  };
  const validateTx = (b, req) => {
    if (!['income', 'expense'].includes(b.type)) throw bad('type must be income or expense');
    if (typeof b.amount !== 'number' || !Number.isFinite(b.amount) || b.amount <= 0 || b.amount > 1e9)
      throw bad('amount must be a positive number');
    const cat = findCat(req, b.category);
    if (!cat) throw bad('category does not exist (create it first via POST /api/categories)');
    if (!isDate(b.date)) throw bad(`date must be YYYY-MM-DD between ${MIN_DATE} and ${MAX_DATE}`);
    const note = b.note == null ? '' : b.note;
    if (typeof note !== 'string' || note.length > 200) throw bad('note must be a string up to 200 characters');
    const recurring = b.recurring || null;
    if (recurring && !['weekly', 'monthly'].includes(recurring)) throw bad('recurring must be weekly, monthly or null');
    const endDate = recurring && b.endDate ? b.endDate : null;
    if (endDate && (!isDate(endDate) || endDate < b.date)) throw bad('endDate must be a valid date on/after date');
    return { type: b.type, amount: money(b.amount), category: cat.name, date: b.date, note: note.trim(), recurring, endDate };
  };
  const budgetStatus = (req, month) => {
    const [from, to] = monthRange(month);
    const exp = txs(req, from, to, 'expense');
    return db.budgets.filter(b => b.userId === req.user.id).map(b => {
      const spent = total(b.category === 'ALL' ? exp : exp.filter(t => t.category === b.category));
      const percent = Math.round((spent / b.amount) * 1000) / 10;
      return { category: b.category, budget: b.amount, spent, remaining: money(b.amount - spent), percent,
        status: percent > 100 ? 'over' : percent >= 80 ? 'warning' : 'ok' };
    });
  };
  const issueToken = user => {
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_MS });
    return { token, user: pub(user) };
  };

  // ---------- auth ----------
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/register', (req, res) => {
    const b = body(req);
    const name = str(b.name).trim(), email = str(b.email).trim().toLowerCase(), password = str(b.password);
    if (!name || name.length > 50) throw bad('name is required (max 50 characters)');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) throw bad('valid email is required');
    if (password.length < 8 || password.length > 100) throw bad('password must be 8-100 characters');
    if (db.users.some(u => u.email === email)) throw new HttpError(409, 'Email already registered');
    res.status(201).json(issueToken(addUser(db, { name, email, password })));
  });

  app.post('/api/auth/login', (req, res) => {
    const b = body(req);
    const email = str(b.email).trim().toLowerCase(), password = str(b.password);
    const f = fails.get(email);
    const recent = f && Date.now() - f.at < 60000;
    if (recent && f.count >= 5) throw new HttpError(429, 'Too many failed attempts, try again in a minute');
    const user = db.users.find(u => u.email === email);
    if (!user || !verifyPassword(password, user.pw)) {
      fails.set(email, { count: (recent ? f.count : 0) + 1, at: Date.now() });
      throw new HttpError(401, 'Invalid email or password');
    }
    fails.delete(email);
    res.json(issueToken(user));
  });

  app.post('/api/auth/logout', auth, (req, res) => { db.sessions.delete(req.token); res.status(204).end(); });
  app.get('/api/auth/me', auth, (req, res) => res.json(pub(req.user)));

  // ---------- categories ----------
  app.get('/api/categories', auth, (req, res) => res.json(myCats(req).map(({ id, name }) => ({ id, name }))));
  app.post('/api/categories', auth, (req, res) => {
    const name = str(body(req).name).trim();
    if (!name || name.length > 30) throw bad('name is required (max 30 characters)');
    if (findCat(req, name)) throw new HttpError(409, 'Category already exists');
    const c = { id: db.id(), userId: req.user.id, name };
    db.categories.push(c);
    res.status(201).json({ id: c.id, name: c.name });
  });
  app.delete('/api/categories/:id', auth, (req, res) => {
    const i = db.categories.findIndex(c => c.id === Number(req.params.id) && c.userId === req.user.id);
    if (i < 0) throw new HttpError(404, 'Category not found');
    const name = db.categories[i].name;
    if (db.transactions.some(t => t.userId === req.user.id && t.category === name) ||
        db.budgets.some(b => b.userId === req.user.id && b.category === name))
      throw new HttpError(409, 'Category is used by transactions or budgets');
    db.categories.splice(i, 1);
    res.status(204).end();
  });

  // ---------- transactions ----------
  app.get('/api/transactions', auth, (req, res) => {
    const [from, to] = getRange(req.query);
    const cat = str(req.query.category) ? findCat(req, req.query.category) : null;
    if (str(req.query.category) && !cat) return res.json([]);
    res.json(txs(req, from, to, getType(req.query.type), cat ? cat.name : '').map(clean));
  });
  app.post('/api/transactions', auth, (req, res) => {
    const t = { id: db.id(), userId: req.user.id, ...validateTx(body(req), req) };
    db.transactions.push(t);
    res.status(201).json(clean(t));
  });
  app.get('/api/transactions/:id', auth, (req, res) => res.json(clean(findTx(req))));
  app.put('/api/transactions/:id', auth, (req, res) => {
    const t = findTx(req);
    Object.assign(t, validateTx({ ...t, ...body(req) }, req));
    res.json(clean(t));
  });
  app.delete('/api/transactions/:id', auth, (req, res) => {
    const t = findTx(req);
    db.transactions.splice(db.transactions.indexOf(t), 1);
    res.status(204).end();
  });

  // ---------- analytics ----------
  app.get('/api/analytics/summary', auth, (req, res) => {
    const [from, to] = getRange(req.query);
    const all = txs(req, from, to);
    const income = total(all.filter(t => t.type === 'income'));
    const expense = total(all.filter(t => t.type === 'expense'));
    res.json({ from, to, income, expense, balance: money(income - expense) });
  });
  app.get('/api/analytics/by-category', auth, (req, res) => {
    const [from, to] = getRange(req.query);
    const list = txs(req, from, to, getType(req.query.type, 'expense'));
    const grand = total(list);
    const map = new Map();
    list.forEach(t => map.set(t.category, (map.get(t.category) || 0) + t.amount));
    res.json([...map].map(([category, v]) => ({ category, total: money(v), percent: grand ? Math.round((v / grand) * 1000) / 10 : 0 }))
      .sort((a, b) => b.total - a.total));
  });
  app.get('/api/analytics/monthly', auth, (req, res) => {
    const [from, to] = getRange(req.query);
    const map = new Map();
    txs(req, from, to).forEach(t => {
      const m = monthOf(t.date);
      const o = map.get(m) || { month: m, income: 0, expense: 0 };
      o[t.type] += t.amount;
      map.set(m, o);
    });
    res.json([...map.values()].sort((a, b) => a.month.localeCompare(b.month))
      .map(o => ({ ...o, income: money(o.income), expense: money(o.expense) })));
  });

  // ---------- budgets & alerts ----------
  app.get('/api/budgets', auth, (req, res) =>
    res.json(db.budgets.filter(b => b.userId === req.user.id).map(({ category, amount }) => ({ category, amount }))));
  app.put('/api/budgets', auth, (req, res) => {
    const b = body(req);
    const cat = b.category === 'ALL' ? { name: 'ALL' } : findCat(req, b.category);
    if (!cat) throw bad('category must be "ALL" or an existing category');
    if (typeof b.amount !== 'number' || !(b.amount > 0) || b.amount > 1e9) throw bad('amount must be a positive number');
    let row = db.budgets.find(x => x.userId === req.user.id && x.category === cat.name);
    if (!row) { row = { userId: req.user.id, category: cat.name }; db.budgets.push(row); }
    row.amount = money(b.amount);
    res.json({ category: row.category, amount: row.amount });
  });
  app.delete('/api/budgets/:category', auth, (req, res) => {
    const i = db.budgets.findIndex(x => x.userId === req.user.id && x.category.toLowerCase() === req.params.category.toLowerCase());
    if (i < 0) throw new HttpError(404, 'Budget not found');
    db.budgets.splice(i, 1);
    res.status(204).end();
  });
  app.get('/api/alerts', auth, (req, res) => {
    const month = str(req.query.month) || monthOf(today());
    if (!isMonth(month)) throw bad('month must be YYYY-MM');
    const items = budgetStatus(req, month);
    res.json({ month, items, alerts: items.filter(i => i.status !== 'ok') });
  });

  // ---------- insights & forecast ----------
  const inr = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  app.get('/api/insights', auth, (req, res) => {
    const month = str(req.query.month) || monthOf(today());
    if (!isMonth(month)) throw bad('month must be YYYY-MM');
    const [from, to] = monthRange(month);
    const [pf, pt] = monthRange(monthOf(addMonths(from, -1)));
    const cur = txs(req, from, to, 'expense'), old = txs(req, pf, pt, 'expense');
    const sumBy = l => l.reduce((m, t) => ((m[t.category] = (m[t.category] || 0) + t.amount), m), {});
    const c = sumBy(cur), o = sumBy(old);
    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
    const spent = total(cur), previousSpent = total(old), income = total(txs(req, from, to, 'income'));
    const change = pct(spent, previousSpent);
    const savingsRate = income ? Math.round(((income - spent) / income) * 1000) / 10 : null;
    const categories = [...new Set([...Object.keys(c), ...Object.keys(o)])]
      .map(k => ({ category: k, current: money(c[k] || 0), previous: money(o[k] || 0), change: pct(c[k] || 0, o[k] || 0) }))
      .sort((a, b) => b.current - a.current);
    const topExpenses = [...cur].sort((a, b) => b.amount - a.amount).slice(0, 3).map(clean);
    let forecast = null;
    const t0 = today();
    if (t0 >= from && t0 <= to) {
      const day = Number(t0.slice(8)), days = Number(to.slice(8));
      const upto = cur.filter(t => t.date <= t0), future = cur.filter(t => t.date > t0);
      const variable = total(upto.filter(t => !t.recurring));
      const projected = money(total(upto) + (variable / day) * (days - day) + total(future));
      const all = db.budgets.find(b => b.userId === req.user.id && b.category === 'ALL');
      forecast = { daysElapsed: day, daysInMonth: days, spentSoFar: total(upto), projected,
        budget: all ? all.amount : null, willExceed: all ? projected > all.amount : null };
    }
    const insights = [];
    if (change != null) insights.push(`Spending is ${Math.abs(change)}% ${change > 0 ? 'higher' : 'lower'} than last month (${inr(previousSpent)} → ${inr(spent)}).`);
    const rise = categories.filter(x => x.change != null && x.change > 0 && x.current - x.previous >= 100).sort((a, b) => b.change - a.change)[0];
    if (rise) insights.push(`${rise.category} is up ${rise.change}% (${inr(rise.previous)} → ${inr(rise.current)}).`);
    if (categories[0] && spent) insights.push(`${categories[0].category} is your biggest expense at ${Math.round((categories[0].current / spent) * 100)}% of spending.`);
    if (savingsRate != null) insights.push(savingsRate >= 0 ? `You are saving ${savingsRate}% of your income this month.` : `You are spending ${Math.abs(savingsRate)}% more than you earn this month.`);
    if (forecast) insights.push(`At this pace you will spend about ${inr(forecast.projected)} this month` +
      (forecast.budget ? (forecast.willExceed ? `, exceeding your ${inr(forecast.budget)} budget.` : `, within your ${inr(forecast.budget)} budget.`) : '.'));
    if (!insights.length) insights.push('Add some transactions to see insights.');
    res.json({ month, spent, previousSpent, change, income, savingsRate, categories, topExpenses, forecast, insights });
  });

  // ---------- CSV export ----------
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // block spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  app.get('/api/export/csv', auth, (req, res) => {
    const [from, to] = getRange(req.query);
    const rows = txs(req, from, to, getType(req.query.type));
    const lines = [['id', 'date', 'type', 'category', 'amount', 'note', 'recurring'].join(',')]
      .concat(rows.map(t => [t.id, t.date, t.type, t.category, t.amount.toFixed(2), t.note, t.recurring || ''].map(cell).join(',')));
    res.attachment('transactions.csv');
    res.send(lines.join('\n') + '\n');
  });

  // ---------- admin ----------
  app.get('/api/admin/users', auth, requireRole('admin'), (req, res) =>
    res.json(db.users.map(u => ({ ...pub(u), transactions: db.transactions.filter(t => t.userId === u.id).length }))));

  // ---------- fallbacks ----------
  app.use('/api', () => { throw new HttpError(404, 'Route not found'); });
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Body too large' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}
