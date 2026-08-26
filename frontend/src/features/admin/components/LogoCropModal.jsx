/**
 * PATH       : src/features/admin/components/LogoCropModal.jsx
 * DATETIME   : 2026-08-25T22:10:00+07:00
 * VERSION    : 2.3.1-ZOOM-CENTER
 * DESCRIPTION:
 * - Contain khi zoom=1: thấy cả ảnh, kéo được X và Y.
 * - Zoom 0.5–3: thu nhỏ + phóng to, giữ tỷ lệ gốc.
 * - Ảnh nhỏ hơn khung: trượt tự do trong khung; lớn hơn: pan vùng thừa.
 * - Nền ô caro (PNG/GIF trong suốt).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

const OUT = 512;
const Z_MIN = 0.5;
const Z_MAX = 3;

/** Slider 0–100: giữa (50) = zoom 1; trái = thu nhỏ; phải = phóng to */
function sliderToZoom(s) {
  const v = Number(s);
  if (v <= 50) {
    return Z_MIN + (1 - Z_MIN) * (v / 50);
  }
  return 1 + (Z_MAX - 1) * ((v - 50) / 50);
}

function zoomToSlider(z) {
  const v = Number(z);
  if (v <= 1) {
    return (50 * (v - Z_MIN)) / (1 - Z_MIN);
  }
  return 50 + (50 * (v - 1)) / (Z_MAX - 1);
}


function getViewSize() {
  if (typeof window === 'undefined') return 200;
  const w = window.innerWidth || 360;
  return Math.max(180, Math.min(220, Math.floor(w * 0.55)));
}

export default function LogoCropModal({ file, onCancel, onConfirm }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  const [url, setUrl] = useState(null);
  const [view, setView] = useState(getViewSize);
  const [nw, setNw] = useState(0);
  const [nh, setNh] = useState(0);
  /** base = kích thước hiển thị khi zoom=1 (contain: fit trong khung) */
  const [baseW, setBaseW] = useState(0);
  const [baseH, setBaseH] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onResize = () => setView(getViewSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setZoom(1);
    setTx(0);
    setTy(0);
    setNw(0);
    setNh(0);
    setBaseW(0);
    setBaseH(0);
    setReady(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  /**
   * CONTAIN: scale = min(view/nw, view/nh)
   * → cả ảnh nằm trong khung khi zoom=1; luôn đúng tỷ lệ.
   */
  const computeContain = useCallback((natW, natH, box) => {
    const s = Math.min(box / natW, box / natH);
    return { bw: natW * s, bh: natH * s };
  }, []);

  /**
   * Ảnh lớn hơn khung: pan trong [box-d, 0]
   * Ảnh nhỏ hơn khung: trượt trong [0, box-d]
   */
  const clamp = useCallback((x, y, z, bw, bh, box) => {
    const dw = bw * z;
    const dh = bh * z;

    let minX;
    let maxX;
    if (dw >= box) {
      minX = box - dw;
      maxX = 0;
    } else {
      minX = 0;
      maxX = box - dw;
    }

    let minY;
    let maxY;
    if (dh >= box) {
      minY = box - dh;
      maxY = 0;
    } else {
      minY = 0;
      maxY = box - dh;
    }

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  const applyLayout = useCallback(
    (natW, natH, box, z) => {
      const { bw, bh } = computeContain(natW, natH, box);
      setBaseW(bw);
      setBaseH(bh);
      const cx = (box - bw * z) / 2;
      const cy = (box - bh * z) / 2;
      const c = clamp(cx, cy, z, bw, bh, box);
      setTx(c.x);
      setTy(c.y);
      setReady(true);
    },
    [computeContain, clamp]
  );

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNw(w);
    setNh(h);
    setZoom(1);
    applyLayout(w, h, view, 1);
  };

  useEffect(() => {
    if (!nw || !nh) return;
    applyLayout(nw, nh, view, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!ready || !baseW) return;
    const c = clamp(tx, ty, zoom, baseW, baseH, view);
    setTx(c.x);
    setTy(c.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      tx0: tx,
      ty0: ty,
    };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.x0;
    const dy = e.clientY - dragRef.current.y0;
    const c = clamp(
      dragRef.current.tx0 + dx,
      dragRef.current.ty0 + dy,
      zoom,
      baseW,
      baseH,
      view
    );
    setTx(c.x);
    setTy(c.y);
  };

  const onPointerUp = (e) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !ready || !nw) return;
    setBusy(true);
    try {
      const dispW = baseW * zoom;
      const ratio = nw / dispW;
      // Vùng crop = cả khung view; phần ngoài ảnh → nền trắng
      const sx = -tx * ratio;
      const sy = -ty * ratio;
      const sSide = view * ratio;

      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sSide, sSide, 0, 0, OUT, OUT);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/png',
          0.92
        );
      });
      onConfirm?.(blob);
    } catch (err) {
      console.error('[LogoCropModal]', err);
      onCancel?.();
    } finally {
      setBusy(false);
    }
  };

  if (!file || !url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-[340px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
          <h2 className="text-sm font-black text-slate-800">Chỉnh khung logo</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="px-3 pt-2 text-xs leading-relaxed text-slate-600">
          Zoom <strong>0.5×–3×</strong> (thu nhỏ / phóng to). Kéo ảnh{' '}
          <strong>mọi hướng</strong> kể cả khi chưa phóng to. Phần trong khung
          vuông là logo.
        </p>

        <div className="flex flex-col items-center px-3 py-3">
          <div
            className="relative touch-none overflow-hidden rounded-xl border border-slate-200"
            style={{
              width: view,
              height: view,
              touchAction: 'none',
              backgroundColor: '#ffffff',
              backgroundImage:
                'linear-gradient(45deg, #e8e8e8 25%, transparent 25%),' +
                'linear-gradient(-45deg, #e8e8e8 25%, transparent 25%),' +
                'linear-gradient(45deg, transparent 75%, #e8e8e8 75%),' +
                'linear-gradient(-45deg, transparent 75%, #e8e8e8 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="absolute left-0 top-0 max-w-none select-none"
              style={{
                width: baseW || undefined,
                height: baseH || undefined,
                transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
                transformOrigin: '0 0',
                cursor: 'grab',
              }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-indigo-400/80 ring-inset" />
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 pb-1">
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={() =>
              setZoom((z) =>
                Math.max(Z_MIN, +sliderToZoom(zoomToSlider(z) - 5).toFixed(2))
              )
            }
            aria-label="Thu nhỏ"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="relative min-w-0 flex-1 pt-3">
            {/* Mốc giữa = ảnh gốc (1×) */}
            <div className="pointer-events-none absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-indigo-500" />
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={zoomToSlider(zoom)}
              onChange={(e) =>
                setZoom(+sliderToZoom(e.target.value).toFixed(2))
              }
              className="h-2.5 w-full accent-indigo-600"
              aria-label="Thu phóng — giữa là ảnh gốc"
            />
            <div className="mt-0.5 flex justify-between text-[9px] font-medium text-slate-400">
              <span>{Z_MIN}×</span>
              <span className="font-bold text-indigo-600">gốc 1×</span>
              <span>{Z_MAX}×</span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={() =>
              setZoom((z) =>
                Math.min(Z_MAX, +sliderToZoom(zoomToSlider(z) + 5).toFixed(2))
              )
            }
            aria-label="Phóng to"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <p className="pb-1 text-center text-[10px] text-slate-400">
          Zoom {zoom.toFixed(2)}×
          {Math.abs(zoom - 1) < 0.02 ? ' · ảnh gốc' : ''}
        </p>

        <div className="flex gap-2 border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border-2 border-slate-200 py-3.5 text-sm font-bold text-slate-700"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={handleConfirm}
            className="flex-[1.3] rounded-2xl bg-indigo-600 py-3.5 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? 'Đang xử lý…' : 'Dùng ảnh này'}
          </button>
        </div>
      </div>
    </div>
  );
}
