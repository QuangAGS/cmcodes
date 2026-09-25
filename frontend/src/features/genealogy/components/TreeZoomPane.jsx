/**
 * PATH       : frontend/src/features/genealogy/components/TreeZoomPane.jsx
 * DATETIME   : 2026-09-22T15:10:00+07:00
 * VERSION    : 1.0.0-ZOOM
 * DESCRIPTION: Khung cây — pinch/kéo + nút +/- / vừa màn. Không CDN D3.
 */

import { useRef, useState } from 'react';

export default function TreeZoomPane({ children }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef(null);
  const pinch = useRef(null);
  const box = useRef(null);
  const inner = useRef(null);

  function clamp(s) {
    return Math.min(2.4, Math.max(0.45, s));
  }

  function onPointerDown(e) {
    if (e.target.closest('button, [data-couple-node], a, input, textarea')) return;
    drag.current = { x: e.clientX - tx, y: e.clientY - ty, id: e.pointerId };
  }
  function onPointerMove(e) {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    setTx(e.clientX - drag.current.x);
    setTy(e.clientY - drag.current.y);
  }
  function onPointerUp() {
    drag.current = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const next = clamp(scale * (e.deltaY < 0 ? 1.08 : 0.92));
    setScale(next);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinch.current = { dist, scale };
      drag.current = null;
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(clamp((pinch.current.scale * dist) / pinch.current.dist));
    }
  }

  function fit() {
    const port = box.current;
    const art = inner.current;
    if (!port || !art) {
      setScale(0.7);
      setTx(0);
      setTy(0);
      return;
    }
    const pw = port.clientWidth - 16;
    const ph = port.clientHeight - 16;
    const cw = Math.max(art.scrollWidth, art.offsetWidth, 1);
    const ch = Math.max(art.scrollHeight, art.offsetHeight, 1);
    const next = clamp(Math.min(pw / cw, ph / ch, 1));
    setScale(next);
    setTx((pw - cw * next) / 2);
    setTy(Math.max(0, (ph - ch * next) / 2));
  }

  return (
    <div className="relative">
      <div className="mb-2 flex justify-center gap-2">
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-xl border border-slate-300 bg-white text-lg font-black"
          onClick={() => setScale((s) => clamp(s * 0.85))}
        >
          −
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"
          onClick={fit}
        >
          Vừa màn
        </button>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-xl border border-slate-300 bg-white text-lg font-black"
          onClick={() => setScale((s) => clamp(s * 1.15))}
        >
          +
        </button>
      </div>
      <div
        ref={box}
        className="h-[58vh] overflow-hidden rounded-2xl border border-slate-200 bg-white touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        <div
          ref={inner}
          className="inline-flex origin-top-left flex-col items-center px-3 py-4"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          {children}
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">
        Hai ngón phóng to. Một ngón kéo. + / − / Vừa màn.
      </p>
    </div>
  );
}
