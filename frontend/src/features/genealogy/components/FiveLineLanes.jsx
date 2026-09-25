/**
 * PATH       : frontend/src/features/genealogy/components/FiveLineLanes.jsx
 * DATETIME   : 2026-09-22T11:30:00+07:00
 * VERSION    : 1.0.0-LANES
 * DESCRIPTION: 5 lane màu · nhãn đời góc trái · quạt nối cha/mẹ → số con.
 */

export const LANE_TONE = [
  { bg: 'bg-amber-50', bar: 'bg-amber-400', ink: 'text-amber-900', stroke: '#d97706' },
  { bg: 'bg-sky-50', bar: 'bg-sky-400', ink: 'text-sky-900', stroke: '#0284c7' },
  { bg: 'bg-emerald-50', bar: 'bg-emerald-400', ink: 'text-emerald-900', stroke: '#059669' },
  { bg: 'bg-violet-50', bar: 'bg-violet-400', ink: 'text-violet-900', stroke: '#7c3aed' },
  { bg: 'bg-rose-50', bar: 'bg-rose-400', ink: 'text-rose-900', stroke: '#e11d48' },
];

export function laneCaption(line, k, showYou) {
  const base = line === 0 ? 'Đời gốc' : `Đời ${line}`;
  const you = showYou && Number(k) === line && k !== '' && k != null;
  return you ? `${base} · bạn` : base;
}

export function FanConnector({ count = 1, color = '#0284c7' }) {
  const n = Math.max(1, Number(count) || 1);
  const w = Math.max(120, n * 88);
  const h = 36;
  const mid = w / 2;
  const gap = n === 1 ? 0 : (w - 24) / (n - 1);
  const xs = Array.from({ length: n }, (_, i) => (n === 1 ? mid : 12 + i * gap));
  return (
    <svg
      className="mx-auto block"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      <line x1={mid} y1="0" x2={mid} y2="12" stroke={color} strokeWidth="2.5" />
      {n > 1 ? (
        <line x1={xs[0]} y1="12" x2={xs[n - 1]} y2="12" stroke={color} strokeWidth="2.5" />
      ) : null}
      {xs.map((x) => (
        <line key={x} x1={x} y1="12" x2={x} y2={h} stroke={color} strokeWidth="2.5" />
      ))}
    </svg>
  );
}

export function LaneShell({ line, k, showYou = false, children }) {
  const tone = LANE_TONE[line] || LANE_TONE[0];
  return (
    <div className="flex w-max max-w-none items-stretch self-center">
      <div
        className={`flex w-7 shrink-0 items-end justify-center rounded-l-2xl ${tone.bar} py-3`}
      >
        <span
          className={`text-[10px] font-black tracking-wide text-white`}
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {laneCaption(line, k, showYou)}
        </span>
      </div>
      <div className={`min-w-0 flex-1 rounded-r-2xl ${tone.bg} px-2 py-3`}>{children}</div>
    </div>
  );
}
