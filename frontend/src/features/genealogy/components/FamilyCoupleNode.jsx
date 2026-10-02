/**
 * PATH       : frontend/src/features/genealogy/components/FamilyCoupleNode.jsx
 * DATETIME   : 2026-09-29T15:00:00+07:00
 * VERSION    : 18.0.0-ANCHOR-DATA-ATTRS
 * DESCRIPTION: Đánh dấu data-lane, data-clan, data-member-id lên Avatar Nội tộc để hỗ trợ vẽ đường nối Node-to-Node.
 * REFERENCE  : SSOT BFA-Branch-Family-Doctrine-v1.3.1.md
 */

import React from 'react';
import ReactDOM from 'react-dom';

export default function FamilyCoupleNode({
  husband = {},
  wife = {},
  lineIndex = 0,
  selected = false,
  isUb = false,
  leftDetail = {},
  rightDetail = {},
  actions = [],
  onSelect,
  onClose,
}) {
  function renderAvatar(person) {
    const isClan = person?.is_clan !== false;
    const memberId = person?.id || person?.member_id || '';
    const fatherId = person?.father_id || '';
    const motherId = person?.mother_id || '';

    // Data attributes giúp SVG Connector bắt chính xác tọa độ DOM
    const anchorAttrs = {
      'data-lane': lineIndex,
      'data-clan': isClan ? 'true' : 'false',
      'data-member-id': memberId,
      'data-father-id': fatherId,
      'data-mother-id': motherId,
    };

    if (person?.is_xt) {
      return (
        <span {...anchorAttrs} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 border border-amber-300 font-black text-amber-700 text-xs shadow-xs">
          XT
        </span>
      );
    }
    if (person?.is_kd) {
      return (
        <span {...anchorAttrs} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 border border-slate-300 font-black text-slate-600 text-xs">
          KD
        </span>
      );
    }
    if (!person?.full_name || person.full_name === 'Còn rỗng' || isUb) {
      return (
        <span {...anchorAttrs} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200 font-black text-slate-400 text-sm">
          ?
        </span>
      );
    }
    const initials = String(person.full_name)
      .trim()
      .split(' ')
      .pop()
      ?.[0]?.toUpperCase() || '?';
    return (
      <span {...anchorAttrs} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 border border-indigo-200 font-bold text-indigo-700 text-xs">
        {initials}
      </span>
    );
  }

  function formatGender(gender) {
    if (!gender) return '—';
    const g = String(gender).toUpperCase().trim();
    if (g === 'NAM') return 'Nam';
    if (g === 'NU') return 'Nữ';
    if (g === 'KHAC') return 'Khác';
    return gender;
  }

  function formatMeta(person, detail) {
    if (!person && !detail) return 'Chưa rõ';
    const genderText = formatGender(person?.gender);
    const gender = genderText !== '—' ? genderText : '';
    const year = detail?.birth_year ? `${detail.birth_year}` : '';
    const status = detail?.is_alive === true ? 'Còn sống' : detail?.is_alive === false ? 'Đã mất' : '';
    return [gender, year, status].filter(Boolean).join(' · ');
  }

  const leftGenVal = leftDetail?.generation !== undefined && leftDetail?.generation !== null && String(leftDetail?.generation).trim() !== ''
    ? leftDetail.generation
    : (husband?.generation !== undefined && husband?.generation !== null && String(husband?.generation).trim() !== '' ? husband.generation : null);

  const rightGenVal = rightDetail?.generation !== undefined && rightDetail?.generation !== null && String(rightDetail?.generation).trim() !== ''
    ? rightDetail.generation
    : (wife?.generation !== undefined && wife?.generation !== null && String(wife?.generation).trim() !== '' ? wife.generation : null);

  const leftGen = leftGenVal !== null ? `Đời: ${leftGenVal}` : 'Đời: ?';
  const rightGen = rightGenVal !== null ? `Đời: ${rightGenVal}` : 'Đời: ?';

  const safeActions = Array.isArray(actions) ? actions : [];

  return (
    <div className="relative inline-block select-none">
      <div
        onClick={onSelect}
        className={`w-[280px] min-h-[110px] rounded-2xl p-2.5 transition-all cursor-pointer border flex flex-col justify-between shadow-xs ${
          selected
            ? 'border-indigo-600 bg-indigo-50/90 ring-2 ring-indigo-400/50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1.5">
          <div className="flex flex-1 items-start gap-2 min-w-0">
            {renderAvatar(husband)}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 break-words whitespace-normal leading-tight">
                {husband?.full_name || 'Còn rỗng'}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                {husband?.is_clan !== false ? 'Nội tộc' : 'Ngoại tộc'}
              </p>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 shrink-0 self-center" />

          <div className="flex flex-1 items-start gap-2 min-w-0">
            {renderAvatar(wife)}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 break-words whitespace-normal leading-tight">
                {wife?.full_name || '—'}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                {wife?.full_name ? 'Phối ngẫu' : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-600 px-1 pt-1 font-semibold">
          <span>{formatGender(husband?.gender)}</span>
          <span>{wife?.full_name ? formatGender(wife?.gender) : '—'}</span>
        </div>
      </div>

      {selected &&
        safeActions.length > 0 &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              onClose && onClose();
            }}
          >
            <div
              className="w-full max-w-[360px] rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                <span className="text-sm font-bold text-slate-800">Thông tin & Thao tác</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose && onClose();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 mb-3 text-[11px] border border-slate-100">
                <div className="flex flex-col gap-0.5">
                  <p className="font-bold text-indigo-900 break-words whitespace-normal leading-tight">
                    {husband?.full_name || 'Còn rỗng'}
                  </p>
                  <p className="text-slate-600 mt-1">{formatMeta(husband, leftDetail)}</p>
                  <p className="font-semibold text-slate-500">{leftGen}</p>
                </div>

                <div className="flex flex-col gap-0.5 border-l border-slate-200 pl-3">
                  <p className="font-bold text-slate-800 break-words whitespace-normal leading-tight">
                    {wife?.full_name || 'Chưa có'}
                  </p>
                  <p className="text-slate-600 mt-1">{formatMeta(wife, rightDetail)}</p>
                  <p className="font-semibold text-slate-500">{rightGen}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {safeActions.map((act, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!!act.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!act.disabled && typeof act.onClick === 'function') {
                        act.onClick();
                      }
                    }}
                    className={`flex h-12 items-center justify-center rounded-2xl px-2 text-center text-xs font-bold transition-all active:scale-95 ${
                      act.disabled
                        ? 'bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed'
                        : act.variant === 'danger'
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : act.variant === 'primary'
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}