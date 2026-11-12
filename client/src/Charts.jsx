const short = n => (n >= 1e5 ? +(n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : Math.round(n));
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
export const COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export function BarChart({ data, width = 560, height = 250 }) {
  if (!data.length) return <p className="muted">No data</p>;
  const pad = { l: 52, r: 10, t: 14, b: 44 };
  const max = Math.max(...data.flatMap(d => [d.a, d.b]), 1);
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const gw = iw / data.length, bw = Math.min(28, gw / 3);
  const y = v => pad.t + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="Income and expenses by month">
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" />
          <text x={pad.l - 6} y={y(max * t) + 4} textAnchor="end" fontSize="10" fill="#6b7280">{short(max * t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = pad.l + gw * i + gw / 2;
        return (
          <g key={d.label}>
            <rect x={cx - bw - 1} y={y(d.a)} width={bw} height={pad.t + ih - y(d.a)} fill="#14b8a6"><title>{`${d.label} income: ${inr(d.a)}`}</title></rect>
            <rect x={cx + 1} y={y(d.b)} width={bw} height={pad.t + ih - y(d.b)} fill="#f43f5e"><title>{`${d.label} expenses: ${inr(d.b)}`}</title></rect>
            <text x={cx} y={height - 24} textAnchor="middle" fontSize="11" fill="#374151">{d.label}</text>
          </g>
        );
      })}
      <rect x={pad.l} y={height - 12} width="10" height="10" fill="#14b8a6" /><text x={pad.l + 14} y={height - 3} fontSize="11">Income</text>
      <rect x={pad.l + 70} y={height - 12} width="10" height="10" fill="#f43f5e" /><text x={pad.l + 84} y={height - 3} fontSize="11">Expenses</text>
    </svg>
  );
}

export function PieChart({ data, size = 200 }) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  if (!sum) return <p className="muted">No data</p>;
  const r = size / 2 - 4, c = size / 2;
  let a0 = -Math.PI / 2;
  const pt = a => [c + r * Math.cos(a), c + r * Math.sin(a)];
  const slices = data.map((d, i) => {
    const frac = d.value / sum, a1 = a0 + frac * 2 * Math.PI;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const path = frac >= 0.9999 ? null : `M${c},${c} L${x0},${y0} A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x1},${y1} Z`;
    a0 = a1;
    return { ...d, i, path, frac };
  });
  return (
    <div className="pie">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Spending by category">
        {slices.map(s => s.path
          ? <path key={s.label} d={s.path} fill={COLORS[s.i % COLORS.length]} stroke="#fff"><title>{`${s.label}: ${inr(s.value)}`}</title></path>
          : <circle key={s.label} cx={c} cy={c} r={r} fill={COLORS[s.i % COLORS.length]} />)}
      </svg>
      <ul className="legend">
        {slices.map(s => (
          <li key={s.label}><i style={{ background: COLORS[s.i % COLORS.length] }} />{s.label} <b>{(s.frac * 100).toFixed(1)}%</b></li>
        ))}
      </ul>
    </div>
  );
}
