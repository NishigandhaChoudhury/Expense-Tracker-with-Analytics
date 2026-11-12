import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { api, download } from './api.js';
import { BarChart, PieChart } from './Charts.jsx';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const fmt = n => inr.format(Number(n));
const ICONS = { Dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', Transactions: 'M4 7h16M4 12h16M4 17h10', Budgets: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 7v5l3 3', Insights: 'M3 17l6-6 4 4 8-8M15 7h6v6', Categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', Admin: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z' };
const Icon = ({ name }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>;
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayStr().slice(0, 7);
const qs = o => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? '?' + s : '';
};

function useApi(path, dep) {
  const [s, setS] = useState({ data: null, error: '' });
  useEffect(() => {
    let live = true;
    api(path).then(data => live && setS({ data, error: '' })).catch(e => live && setS({ data: null, error: e.message }));
    return () => { live = false; };
  }, [path, dep]);
  return s;
}

const Err = ({ children }) => (children ? <p className="error">{children}</p> : null);

function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: 'demo@example.com', password: 'demo1234' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    setErr('');
    try { mode === 'login' ? await login(f.email, f.password) : await register(f.name, f.email, f.password); }
    catch (x) { setErr(x.message); }
  };
  return (
    <form className="card auth" onSubmit={submit}>
      <div className="brand"><span className="logo">₹</span>Expense<b>Tracker</b></div>
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      {mode === 'register' && <input placeholder="Name" value={f.name} onChange={set('name')} required />}
      <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
      <input type="password" placeholder="Password (min 8)" value={f.password} onChange={set('password')} required />
      <Err>{err}</Err>
      <button>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
        {mode === 'login' ? 'New here? Register' : 'Have an account? Log in'}
      </a>
      <p className="muted">Demo: demo@example.com / demo1234 &middot; Admin: admin@example.com / admin1234</p>
    </form>
  );
}

function Dashboard({ range, version }) {
  const q = qs(range);
  const sum = useApi('/analytics/summary' + q, version);
  const cat = useApi('/analytics/by-category' + q, version);
  const mon = useApi('/analytics/monthly' + q, version);
  const al = useApi('/alerts?month=' + thisMonth(), version);
  const [err, setErr] = useState('');
  return (
    <>
      <Err>{sum.error || cat.error || mon.error || err}</Err>
      {al.data && al.data.alerts.map(a => (
        <div key={a.category} className={'alert ' + a.status}>
          {a.status === 'over' ? 'Over budget' : 'Nearing budget'} &ndash; {a.category === 'ALL' ? 'Total' : a.category}: {fmt(a.spent)} of {fmt(a.budget)} ({a.percent}%)
        </div>
      ))}
      {sum.data && (
        <div className="cards">
          <div className="card stat in"><span>Income</span><b>{fmt(sum.data.income)}</b></div>
          <div className="card stat out"><span>Expenses</span><b>{fmt(sum.data.expense)}</b></div>
          <div className="card stat bal"><span>Balance</span><b>{fmt(sum.data.balance)}</b></div>
        </div>
      )}
      <div className="grid">
        <div className="card"><h3>Income vs expenses by month</h3>
          {mon.data && <BarChart data={mon.data.map(m => ({ label: m.month, a: m.income, b: m.expense }))} />}</div>
        <div className="card"><h3>Spending by category</h3>
          {cat.data && <PieChart data={cat.data.map(c => ({ label: c.category, value: c.total }))} />}</div>
      </div>
      <button onClick={() => download('/export/csv' + q, 'transactions.csv').catch(e => setErr(e.message))}>Export CSV</button>
    </>
  );
}

const emptyForm = () => ({ type: 'expense', amount: '', category: '', date: todayStr(), note: '', recurring: '', endDate: '' });

function Transactions({ range, version, bump }) {
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState({ type: '', category: '' });
  const [err, setErr] = useState('');
  const cats = useApi('/categories', version);
  const list = useApi('/transactions' + qs({ ...range, ...filter }), version);
  const set = k => e => setForm({ ...form, [k]: e.target.value });

  const save = async e => {
    e.preventDefault();
    setErr('');
    const body = { ...form, amount: Number(form.amount), recurring: form.recurring || null, endDate: form.recurring && form.endDate ? form.endDate : null };
    try {
      await api(editId ? '/transactions/' + editId : '/transactions', { method: editId ? 'PUT' : 'POST', body });
      setForm(emptyForm()); setEditId(null); bump();
    } catch (x) { setErr(x.message); }
  };
  const edit = t => {
    setEditId(t.id);
    setForm({ type: t.type, amount: t.amount, category: t.category, date: t.sourceDate, note: t.note, recurring: t.recurring || '', endDate: t.endDate || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async t => {
    if (!confirm(t.recurring ? 'Delete this recurring transaction and all its occurrences?' : 'Delete this transaction?')) return;
    try { await api('/transactions/' + t.id, { method: 'DELETE' }); bump(); } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <form className="card form" onSubmit={save}>
        <h3>{editId ? 'Edit transaction' : 'Add transaction'}</h3>
        <select value={form.type} onChange={set('type')}><option value="expense">Expense</option><option value="income">Income</option></select>
        <input type="number" step="0.01" min="0.01" placeholder="Amount" value={form.amount} onChange={set('amount')} required />
        <select value={form.category} onChange={set('category')} required>
          <option value="" disabled>Category…</option>
          {cats.data && cats.data.map(c => <option key={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={form.date} onChange={set('date')} required />
        <input placeholder="Note" maxLength={200} value={form.note} onChange={set('note')} />
        <select value={form.recurring} onChange={set('recurring')}>
          <option value="">One-off</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
        {form.recurring && <label>Ends <input type="date" value={form.endDate} min={form.date} onChange={set('endDate')} /></label>}
        <button>{editId ? 'Update' : 'Add'}</button>
        {editId && <button type="button" className="ghost" onClick={() => { setEditId(null); setForm(emptyForm()); }}>Cancel</button>}
        <Err>{err}</Err>
      </form>
      <div className="filters">
        <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })}>
          <option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option>
        </select>
        <select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}>
          <option value="">All categories</option>
          {cats.data && cats.data.map(c => <option key={c.id}>{c.name}</option>)}
        </select>
      </div>
      <Err>{list.error}</Err>
      <div className="card scroll">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th><th /></tr></thead>
          <tbody>
            {list.data && list.data.map(t => (
              <tr key={t.id + t.date}>
                <td>{t.date}</td>
                <td>{t.category}{t.recurring && <span className="tag">↻ {t.recurring}</span>}</td>
                <td>{t.note}</td>
                <td className={'amt ' + (t.type === 'income' ? 'pos' : 'neg')}>{t.type === 'income' ? '+' : '-'}{fmt(t.amount)}</td>
                <td className="actions"><button className="ghost" onClick={() => edit(t)}>Edit</button><button className="ghost" onClick={() => remove(t)}>Delete</button></td>
              </tr>
            ))}
            {list.data && !list.data.length && <tr><td colSpan="5" className="muted">No transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Budgets({ version, bump }) {
  const [month, setMonth] = useState(thisMonth());
  const [form, setForm] = useState({ category: 'ALL', amount: '' });
  const [err, setErr] = useState('');
  const al = useApi('/alerts?month=' + month, version);
  const cats = useApi('/categories', version);
  const save = async e => {
    e.preventDefault();
    setErr('');
    try { await api('/budgets', { method: 'PUT', body: { category: form.category, amount: Number(form.amount) } }); setForm({ ...form, amount: '' }); bump(); }
    catch (x) { setErr(x.message); }
  };
  const remove = async c => {
    try { await api('/budgets/' + encodeURIComponent(c), { method: 'DELETE' }); bump(); } catch (x) { setErr(x.message); }
  };
  return (
    <>
      <form className="card form" onSubmit={save}>
        <h3>Set monthly budget</h3>
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          <option value="ALL">Total (all expenses)</option>
          {cats.data && cats.data.map(c => <option key={c.id}>{c.name}</option>)}
        </select>
        <input type="number" step="0.01" min="0.01" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
        <button>Save</button>
        <Err>{err || al.error}</Err>
      </form>
      <label className="filters">Month <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>
      {al.data && al.data.items.map(i => (
        <div className="card" key={i.category}>
          <div className="row"><b>{i.category === 'ALL' ? 'Total' : i.category}</b>
            <span>{fmt(i.spent)} / {fmt(i.budget)} ({i.percent}%)</span>
            <button className="ghost" onClick={() => remove(i.category)}>Remove</button></div>
          <div className="bar"><div className={'fill ' + i.status} style={{ width: Math.min(i.percent, 100) + '%' }} /></div>
        </div>
      ))}
      {al.data && !al.data.items.length && <p className="muted">No budgets yet</p>}
    </>
  );
}

function Categories({ version, bump }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const cats = useApi('/categories', version);
  const add = async e => {
    e.preventDefault();
    setErr('');
    try { await api('/categories', { method: 'POST', body: { name } }); setName(''); bump(); } catch (x) { setErr(x.message); }
  };
  const remove = async c => { setErr(''); try { await api('/categories/' + c.id, { method: 'DELETE' }); bump(); } catch (x) { setErr(x.message); } };
  return (
    <>
      <form className="card form" onSubmit={add}>
        <input placeholder="New category" maxLength={30} value={name} onChange={e => setName(e.target.value)} required />
        <button>Add</button>
      </form>
      <Err>{err || cats.error}</Err>
      <div className="card">
        {cats.data && cats.data.map(c => (
          <div className="row" key={c.id}>{c.name}<button className="ghost" onClick={() => remove(c)}>Delete</button></div>
        ))}
      </div>
    </>
  );
}

function Insights({ version }) {
  const [month, setMonth] = useState(thisMonth());
  const d = useApi('/insights?month=' + month, version);
  const x = d.data;
  const f = x && x.forecast;
  const base = f ? Math.max(f.projected, f.budget || 0, 1) : 1;
  return (
    <>
      <label className="filters">Month <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label>
      <Err>{d.error}</Err>
      {x && (
        <>
          <div className="cards">
            <div className="card stat out"><span>Spent</span><b>{fmt(x.spent)}</b>
              <small className="muted">{x.change == null ? 'No data for last month' : `${x.change > 0 ? '▲' : '▼'} ${Math.abs(x.change)}% vs last month`}</small></div>
            <div className="card stat in"><span>Income</span><b>{fmt(x.income)}</b></div>
            <div className="card stat bal"><span>Savings rate</span><b>{x.savingsRate == null ? '—' : x.savingsRate + '%'}</b></div>
          </div>
          {f && (
            <div className="card">
              <h3>Month-end forecast</h3>
              <div className="row"><span>Spent so far (day {f.daysElapsed} of {f.daysInMonth})</span><b>{fmt(f.spentSoFar)}</b></div>
              <div className="bar"><div className="fill" style={{ width: (f.spentSoFar / base) * 100 + '%' }} /></div>
              <div className="row"><span>Projected total</span><b className={f.willExceed ? 'neg' : ''}>{fmt(f.projected)}</b></div>
              <div className="bar"><div className={'fill ' + (f.willExceed ? 'over' : '')} style={{ width: (f.projected / base) * 100 + '%' }} /></div>
              {f.budget && <p className="muted">Monthly budget: {fmt(f.budget)} &middot; {f.willExceed ? 'projected to exceed' : 'on track'}</p>}
            </div>
          )}
          <div className="card"><h3>Key insights</h3><ul className="insights">{x.insights.map(i => <li key={i}>{i}</li>)}</ul></div>
          <div className="grid">
            <div className="card scroll">
              <table>
                <thead><tr><th>Category</th><th>Last month</th><th>This month</th><th>Change</th></tr></thead>
                <tbody>{x.categories.map(c => (
                  <tr key={c.category}><td>{c.category}</td><td>{fmt(c.previous)}</td><td>{fmt(c.current)}</td>
                    <td className={c.change > 0 ? 'neg' : 'pos'}>{c.change == null ? '—' : (c.change > 0 ? '▲ ' : '▼ ') + Math.abs(c.change) + '%'}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="card"><h3>Top expenses</h3>
              {x.topExpenses.map(t => <div className="row" key={t.id + t.date}><span>{t.note || t.category}<br /><small className="muted">{t.date}</small></span><b>{fmt(t.amount)}</b></div>)}
              {!x.topExpenses.length && <p className="muted">No expenses</p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Admin({ version }) {
  const users = useApi('/admin/users', version);
  return (
    <div className="card scroll">
      <Err>{users.error}</Err>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Transactions</th></tr></thead>
        <tbody>{users.data && users.data.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.transactions}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function App() {
  const { user, ready, logout } = useAuth();
  const [tab, setTab] = useState('Dashboard');
  const [range, setRange] = useState({ from: '', to: '' });
  const [version, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  if (!ready) return <p className="muted">Loading…</p>;
  if (!user) return <Login />;
  const tabs = ['Dashboard', 'Transactions', 'Budgets', 'Insights', 'Categories', ...(user.role === 'admin' ? ['Admin'] : [])];
  const props = { range, version, bump };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="logo">₹</span>Expense<b>Tracker</b></div>
        <nav>{tabs.map(t => <button key={t} className={t === tab ? 'nav active' : 'nav'} onClick={() => setTab(t)}><Icon name={t} />{t}</button>)}</nav>
        <div className="user">
          <div className="avatar">{user.name[0]}</div>
          <div><b>{user.name}</b><small>{user.role}</small></div>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main>
        <div className="top">
          <h2>{tab}</h2>
          {(tab === 'Dashboard' || tab === 'Transactions') && (
            <div className="filters">
              <label>From <input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
              <label>To <input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
              <button className="ghost" onClick={() => setRange({ from: '', to: '' })}>Clear</button>
            </div>
          )}
        </div>
        {tab === 'Dashboard' && <Dashboard {...props} />}
        {tab === 'Transactions' && <Transactions {...props} />}
        {tab === 'Budgets' && <Budgets {...props} />}
        {tab === 'Insights' && <Insights {...props} />}
        {tab === 'Categories' && <Categories {...props} />}
        {tab === 'Admin' && <Admin {...props} />}
      </main>
    </div>
  );
}
