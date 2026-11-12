import crypto from 'node:crypto';
import { addDays, addMonths, monthOf, today } from './dates.js';

export const DEFAULT_CATEGORIES = ['Salary', 'Food', 'Rent', 'Transport', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'];

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') };
}
export function verifyPassword(pw, { salt, hash }) {
  return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 32), Buffer.from(hash, 'hex'));
}

export function createStore() {
  const db = { users: [], categories: [], transactions: [], budgets: [], sessions: new Map(), seq: 0 };
  db.id = () => ++db.seq;
  return db;
}

export function addUser(db, { name, email, password, role = 'user' }) {
  const user = { id: db.id(), name, email, role, pw: hashPassword(password) };
  db.users.push(user);
  DEFAULT_CATEGORIES.forEach(n => db.categories.push({ id: db.id(), userId: user.id, name: n }));
  return user;
}

export function seed(db) {
  addUser(db, { name: 'Admin', email: 'admin@example.com', password: 'admin1234', role: 'admin' });
  const u = addUser(db, { name: 'Demo User', email: 'demo@example.com', password: 'demo1234' });
  const m0 = monthOf(today()) + '-01';
  const start = addMonths(m0, -2);
  const add = (type, amount, category, date, note = '', recurring = null) =>
    db.transactions.push({ id: db.id(), userId: u.id, type, amount, category, date, note, recurring, endDate: null });
  add('income', 85000, 'Salary', start, 'Monthly salary', 'monthly');
  add('income', 12000, 'Other', addDays(start, 12), 'Freelance');
  add('expense', 22000, 'Rent', addDays(start, 1), 'Apartment rent', 'monthly');
  add('expense', 649, 'Entertainment', addDays(start, 4), 'Streaming', 'monthly');
  for (let i = 0; i < 3; i++) {
    const ms = addMonths(m0, -i);
    [[3, 'Food', 1850, 'Groceries'], [8, 'Transport', 1200, 'Metro pass'], [11, 'Food', 2400, 'Groceries'],
     [14, 'Utilities', 2100, 'Electricity'], [18, 'Health', 850, 'Pharmacy'], [21, 'Shopping', 3499, 'Clothes'],
     [24, 'Food', 1650, 'Dinner out']].forEach(([d, c, a, n]) => {
      const date = addDays(ms, d);
      if (date <= today()) add('expense', a, c, date, n);
    });
  }
  db.budgets.push({ userId: u.id, category: 'ALL', amount: 50000 }, { userId: u.id, category: 'Food', amount: 8000 });
}
