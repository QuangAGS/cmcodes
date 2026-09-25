/**
 * PATH       : frontend/src/features/genealogy/components/FamilyCoupleNode.jsx
 * DATETIME   : 2026-09-22T10:05:00+07:00
 * VERSION    : 1.3.0-MOBILE-TAP
 * DESCRIPTION: Cặp Chồng|Vợ. Mobile: chạm mở card, ✕ / chạm ngoài đóng.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function genderLabel(person) {
  const g = String(person?.gender || '').toUpperCase();
  if (g === 'NAM' || g === 'MALE') return 'Nam';
  if (g === 'NU' || g === 'NỮ' || g === 'FEMALE') return 'Nữ';
  if (g === 'KHAC' || g === 'OTHER') return 'Khác';
  return '';
}

function PersonDot({ person }) {
  const name = String(person?.full_name || person?.name || '').trim();
  const empty = !name;
  const label = genderLabel(person);
  const male = label === 'Nam';
  const female = label === 'Nữ';
  return (
    <div className="flex w-[6.4rem] flex-col items-center">
      <span
        className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-sm font-black ${
          empty
            ? 'border-2 border-dashed border-slate-200 bg-slate-50 text-transparent'
            : male
              ? 'border-[3px] border-blue-700 bg-white text-blue-700 shadow'
              : female
                ? 'border-[3px] border-pink-600 bg-white text-pink-600 shadow'
                : 'border-[3px] border-slate-400 bg-white text-slate-600 shadow'
        }`}
      >
        {person?.avatar_url ? (
          <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : empty ? (
          ''
        ) : (
          initials(name)
        )}
      </span>
      <span className="mt-1 text-[10px] font-semibold text-slate-500">{label || '—'}</span>
      <span className="w-full whitespace-normal break-words text-center text-[11px] font-bold leading-tight text-slate-800">
        {empty ? '' : name}
      </span>
    </div>
  );
}

export default function FamilyCoupleNode({
  husband,
  wife,
  selected = false,
  onSelect,
  onClose,
  onToggleExpand,
  canExpand = false,
  expanded = false,
  summary = [],
  actions = [],
  title = 'Gia đình',
}) {
  const [pos, setPos] = useState({ top: 8, left: 8 });
  const boxRef = useRef(null);
  const cardRef = useRef(null);
  const open = selected;
  const hName = String(husband?.full_name || husband?.name || '').trim();
  const wName = String(wife?.full_name || wife?.name || '').trim();

  function place() {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cardW = Math.min(280, window.innerWidth - 16);
    const cardH = 240;
    let left = r.left + r.width / 2 - cardW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - cardW - 8));
    let top = r.top - cardH - 8;
    if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - cardH - 8);
    setPos({ top, left, width: cardW });
  }

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    function onDoc(e) {
      const t = e.target;
      if (boxRef.current?.contains(t)) return;
      if (cardRef.current?.contains(t)) return;
      onClose?.();
    }
    const t = window.setTimeout(() => document.addEventListener('click', onDoc), 80);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('click', onDoc);
    };
  }, [open, onClose]);

  const card = open ? (
    <div
      ref={cardRef}
      className="fixed z-[80] rounded-xl border border-slate-300 bg-white text-left shadow-xl"
      style={{ top: pos.top, left: pos.left, width: pos.width || 280 }}
    >
      <div className="relative rounded-t-xl bg-slate-100 px-3 py-2 pr-10">
        <p className="text-xs font-black text-blue-700">{title}</p>
        <button
          type="button"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-black text-slate-700"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          aria-label="Đóng"
        >
          ✕
        </button>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] font-semibold text-slate-500">{genderLabel(husband) || 'Người 1'}</p>
            <p className="text-sm font-bold leading-tight text-slate-800">{hName || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500">{genderLabel(wife) || 'Người 2'}</p>
            <p className="text-sm font-bold leading-tight text-slate-800">{wName || '—'}</p>
          </div>
        </div>
        {summary.length ? (
          <ul className="mt-1 space-y-0.5">
            {summary
              .filter((s) => !String(s).startsWith('Người:') && !String(s).startsWith('Vợ/chồng:'))
              .map((s) => (
                <li key={s} className="text-xs font-semibold text-slate-700">
                  {s}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2">
        <p className="col-span-2 text-[10px] font-semibold text-slate-500">CÁC THAO TÁC CÓ THỂ CHỌN</p>
        {actions.map((act) => {
          const danger = /xóa|xoá/i.test(act.label);
          return (
            <button
              key={act.label}
              type="button"
              className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${
                danger
                  ? 'col-span-2 border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                act.onClick?.();
                onClose?.();
              }}
            >
              {act.label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={boxRef}
      data-couple-node="1"
      className={`relative inline-flex w-fit flex-col items-center rounded-2xl border bg-white px-2 py-2 shadow-sm ${
        selected ? 'border-red-500' : 'border-slate-200'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex min-h-[4.5rem] w-fit items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
      >
        <PersonDot person={husband} />
        <span className="mb-6 h-0.5 w-5 shrink-0 bg-red-500" aria-hidden="true" />
        <PersonDot person={wife} />
      </button>
      {canExpand ? (
        <button
          type="button"
          className="mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-700 text-sm font-black text-blue-700"
          onClick={onToggleExpand}
        >
          {expanded ? '−' : '+'}
        </button>
      ) : null}
      {typeof document !== 'undefined' && card ? createPortal(card, document.body) : null}
    </div>
  );
}
