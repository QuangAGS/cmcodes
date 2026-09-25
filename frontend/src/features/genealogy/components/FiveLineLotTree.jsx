/**
 * PATH       : frontend/src/features/genealogy/components/FiveLineLotTree.jsx
 * DATETIME   : 2026-09-21T17:10:00+07:00
 * VERSION    : 1.2.0-D3-LAYOUT
 * DESCRIPTION: Cây 5L kiểu D3 tree — trực hệ đậm, nhánh bên ?. Không CDN d3.
 */

import { mfoLineTitle } from '../../mfo/constants/mfoVoiceHelp.self.js';

const DEPTH = 4;
const W = 360;
const H = 440;
const PAD_X = 24;
const PAD_Y = 36;

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function lineName(lines, originName, depth) {
  const row = lines[depth];
  if (!row) return '';
  if (depth === 0) return originName || '';
  return row.hint || '';
}

function buildModel(lines, originName, k) {
  function node(depth, id, leftmost) {
    const name = leftmost ? lineName(lines, originName, depth) : '';
    const n = {
      id,
      depth,
      leftmost,
      name,
      isSelf: leftmost && Number(k) === depth,
      line: depth,
      children: [],
    };
    if (depth < DEPTH) {
      n.children.push(node(depth + 1, `${id}.1`, leftmost));
      if (leftmost) n.children.push(node(depth + 1, `${id}.2`, false));
    }
    return n;
  }
  return node(0, '0', true);
}

function layout(root) {
  const levels = Array.from({ length: DEPTH + 1 }, () => []);
  function walk(n) {
    levels[n.depth].push(n);
    n.children.forEach(walk);
  }
  walk(root);
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const dy = innerH / DEPTH;
  levels.forEach((row, depth) => {
    const n = row.length;
    row.forEach((node, i) => {
      node.x = PAD_X + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
      node.y = PAD_Y + depth * dy;
    });
  });
  const links = [];
  function edges(n) {
    n.children.forEach((c) => {
      links.push({ source: n, target: c, leftmost: n.leftmost && c.leftmost });
      edges(c);
    });
  }
  edges(root);
  const nodes = [];
  function collect(n) {
    nodes.push(n);
    n.children.forEach(collect);
  }
  collect(root);
  return { nodes, links };
}

function linkPath(s, t) {
  const my = (s.y + t.y) / 2;
  return `M${s.x},${s.y} C${s.x},${my} ${t.x},${my} ${t.x},${t.y}`;
}

export default function FiveLineLotTree({
  lines = [],
  k,
  originName,
  selectedLine,
  onSelect,
}) {
  const root = buildModel(lines, originName, k);
  const { nodes, links } = layout(root);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto block w-full max-w-[420px]"
      role="img"
      aria-label="Cây năm đời trực hệ"
    >
      {links.map((lk, i) => (
        <path
          key={`l-${i}`}
          d={linkPath(lk.source, lk.target)}
          fill="none"
          stroke={lk.leftmost ? '#2b6cb0' : '#cbd5e0'}
          strokeWidth={lk.leftmost ? 3.5 : 2}
        />
      ))}
      {nodes.map((n) => {
        const selected = n.leftmost && selectedLine === n.line;
        const r = n.leftmost ? 26 : 16;
        const letters = initials(n.name);
        const showAvatar = n.leftmost && letters;
        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            style={{ cursor: n.leftmost ? 'pointer' : 'default' }}
            opacity={n.leftmost ? 1 : 0.45}
            onClick={() => {
              if (n.leftmost && typeof onSelect === 'function') onSelect(n.line);
            }}
          >
            {selected ? (
              <circle r={r + 5} fill="none" stroke="#c53030" strokeWidth="2.5" />
            ) : null}
            <circle
              r={r}
              fill={showAvatar ? (n.isSelf ? '#d97706' : '#ffffff') : '#edf2f7'}
              stroke={n.leftmost ? '#2b6cb0' : '#a0aec0'}
              strokeWidth={n.leftmost ? 4 : 2}
              strokeDasharray={n.leftmost ? undefined : '3 3'}
            />
            <text
              textAnchor="middle"
              dy="5"
              fontSize={n.leftmost ? 12 : 16}
              fontWeight="800"
              fill={showAvatar ? (n.isSelf ? '#fff' : '#2b6cb0') : '#4a5568'}
            >
              {showAvatar ? letters : '?'}
            </text>
            {n.leftmost ? (
              <text textAnchor="middle" y={r + 14} fontSize="10" fontWeight="700" fill="#334155">
                {mfoLineTitle(n.line)}
                {n.isSelf ? ' · bạn' : ''}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
