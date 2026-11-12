import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.js';
import { today } from '../dates.js';

let server, base, token;
const call = async (path, { method = 'GET', body, auth = token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && { Authorization: 'Bearer ' + auth }) },
    body: body && JSON.stringify(body)
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* csv or empty */ }
  return { status: res.status, data, headers: res.headers };
};

before(async () => {
  server = createApp().listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
  const r = await call('/auth/register', { method: 'POST', auth: null, body: { name: 'Tester', email: 't@x.com', password: 'password1' } });
  token = r.data.token;
});
after(() => server.close());

test('health and auth rules', async () => {
  assert.equal((await call('/health', { auth: null })).status, 200);
  assert.equal((await call('/transactions', { auth: null })).status, 401);
  assert.equal((await call('/auth/login', { method: 'POST', auth: null, body: { email: 't@x.com', password: 'wrong' } })).status, 401);
  assert.equal((await call('/auth/register', { method: 'POST', auth: null, body: { name: 'A', email: 't@x.com', password: 'password1' } })).status, 409);
  assert.equal((await call('/auth/register', { method: 'POST', auth: null, body: { name: 'A', email: 'a@x.com', password: 'short' } })).status, 400);
  const demo = await call('/auth/login', { method: 'POST', auth: null, body: { email: 'demo@example.com', password: 'demo1234' } });
  assert.equal(demo.status, 200);
  assert.equal(demo.data.user.role, 'user');
});

test('transaction CRUD + validation', async () => {
  const good = { type: 'expense', amount: 40, category: 'Food', date: '2024-01-10', note: 'lunch' };
  assert.equal((await call('/transactions', { method: 'POST', body: { ...good, amount: -5 } })).status, 400);
  assert.equal((await call('/transactions', { method: 'POST', body: { ...good, category: 'Nope' } })).status, 400);
  assert.equal((await call('/transactions', { method: 'POST', body: { ...good, date: '2024-02-31' } })).status, 400);
  const created = await call('/transactions', { method: 'POST', body: good });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await call('/transactions?from=2024-01-01&to=2024-01-31')).data.length, 1);
  const upd = await call('/transactions/' + id, { method: 'PUT', body: { amount: 50 } });
  assert.equal(upd.data.amount, 50);
  assert.equal((await call('/transactions/' + id)).data.amount, 50);
  assert.equal((await call('/transactions/' + id, { method: 'DELETE' })).status, 204);
  assert.equal((await call('/transactions/' + id)).status, 404);
});

test('recurring expansion + analytics', async () => {
  await call('/transactions', { method: 'POST', body: { type: 'income', amount: 1000, category: 'Salary', date: '2024-01-05', recurring: 'monthly', endDate: '2024-03-31' } });
  await call('/transactions', { method: 'POST', body: { type: 'expense', amount: 100, category: 'Food', date: '2024-02-10' } });
  const q = '?from=2024-01-01&to=2024-03-31';
  assert.deepEqual((await call('/analytics/summary' + q)).data, { from: '2024-01-01', to: '2024-03-31', income: 3000, expense: 100, balance: 2900 });
  const monthly = (await call('/analytics/monthly' + q)).data;
  assert.equal(monthly.length, 3);
  assert.equal(monthly[1].expense, 100);
  const byCat = (await call('/analytics/by-category' + q)).data;
  assert.equal(byCat.length, 1);
  assert.equal(byCat[0].category, 'Food');
});

test('budgets and overspend alerts', async () => {
  assert.equal((await call('/budgets', { method: 'PUT', body: { category: 'Food', amount: 100 } })).status, 200);
  await call('/transactions', { method: 'POST', body: { type: 'expense', amount: 90, category: 'Food', date: today() } });
  let a = (await call('/alerts')).data;
  assert.equal(a.items.find(i => i.category === 'Food').status, 'warning');
  await call('/transactions', { method: 'POST', body: { type: 'expense', amount: 20, category: 'Food', date: today() } });
  a = (await call('/alerts')).data;
  assert.equal(a.alerts[0].status, 'over');
  assert.equal((await call('/alerts?month=bad')).status, 400);
});

test('categories', async () => {
  const list = (await call('/categories')).data;
  const food = list.find(c => c.name === 'Food');
  assert.equal((await call('/categories/' + food.id, { method: 'DELETE' })).status, 409);
  const pets = await call('/categories', { method: 'POST', body: { name: 'Pets' } });
  assert.equal(pets.status, 201);
  assert.equal((await call('/categories', { method: 'POST', body: { name: 'pets' } })).status, 409);
  assert.equal((await call('/categories/' + pets.data.id, { method: 'DELETE' })).status, 204);
});

test('CSV export', async () => {
  const r = await call('/export/csv?from=2024-01-01&to=2024-03-31');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="transactions.csv"/);
  assert.ok(r.data.startsWith('id,date,type,category,amount,note,recurring'));
  assert.equal(r.data.trim().split('\n').length, 5);
});

test('insights and forecast', async () => {
  await call('/transactions', { method: 'POST', body: { type: 'expense', amount: 50, category: 'Food', date: '2024-01-15' } });
  const past = (await call('/insights?month=2024-02')).data;
  assert.equal(past.spent, 100);
  assert.equal(past.previousSpent, 50);
  assert.equal(past.change, 100);
  assert.equal(past.forecast, null);
  assert.ok(past.insights.length >= 2);
  const now = (await call('/insights')).data;
  assert.equal(now.forecast.spentSoFar, 110);
  assert.ok(now.forecast.projected >= 110);
  assert.equal((await call('/insights?month=bad')).status, 400);
});

test('role check, bad JSON, logout', async () => {
  assert.equal((await call('/admin/users')).status, 403);
  const admin = await call('/auth/login', { method: 'POST', auth: null, body: { email: 'admin@example.com', password: 'admin1234' } });
  const users = await call('/admin/users', { auth: admin.data.token });
  assert.equal(users.status, 200);
  assert.ok(users.data.length >= 3);
  const raw = await fetch(base + '/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{oops' });
  assert.equal(raw.status, 400);
  assert.equal((await call('/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await call('/auth/me')).status, 401);
});
