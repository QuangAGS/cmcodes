/**
 * PATH       : src/features/member/components/AchievementSection.jsx
 * DATETIME   : 2026-09-07T14:30:00+07:00
 * VERSION    : 1.4.0-ACH-KEEP-DETAIL
 * DESCRIPTION: Giữ nhóm/chi tiết sau Lưu và F5. ≥1 dòng luôn list.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import { MediaPeek, downloadMediaSafe } from '../../../lib/MediaPeek.jsx';
import { toastSpeak } from '../../../lib/toastSpeak.js';
import {
  ACHIEVEMENT_CATEGORIES,
  EMPTY_ACHIEVEMENT,
  achievementFromApi,
  achievementToPayload,
  categoryLabel,
  subLabel,
  subsOfCategory,
} from '../constants/achievementCatalog.js';
import { readAchCatalog, writeAchCatalog } from '../../../lib/profileSection.js';

const inputCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function voiceText(row) {
  const bits = [
    categoryLabel(row.category),
    subLabel(row.category, row.sub_category),
    row.title,
    row.issued_by,
    row.achieved_year ? `Năm ${row.achieved_year}` : '',
    row.description,
  ].filter(Boolean);
  return bits.join('. ') || 'Chưa có thành tích.';
}

function isImage(p) {
  return String(p.mime_type || '').startsWith('image/');
}

export function ProofStrip({ proofs = [], onAdd, onRemove, busy, title = 'Minh chứng', addLabel = 'Thêm minh chứng' }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {proofs.length ? (
        <ul className="space-y-2">
          {proofs.map((p) => (
            <li key={p.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2">
              {p.url && isImage(p) ? (
                <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={p.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                </a>
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                  PDF
                </span>
              )}
              <div className="min-w-0 flex-1">
                <MediaPeek item={p} />
                {p.caption ? (
                  <p className="mt-0.5 text-xs text-slate-500">{p.caption}</p>
                ) : null}
                <div className="mt-1 flex items-center gap-4">
                  <button
                    type="button"
                    className="text-xs font-bold text-indigo-700"
                    onClick={async () => {
                      try {
                        await downloadMediaSafe(p);
                      } catch (e) {
                        toastSpeak('error', e.response?.data?.message || 'Không tải được tệp.');
                      }
                    }}
                  >
                    Tải về
                  </button>
                  {onRemove ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs font-bold text-rose-600 disabled:opacity-60"
                      onClick={() => onRemove(p)}
                    >
                      Xóa
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">Chưa có minh chứng.</p>
      )}
      {onAdd && proofs.length < 5 ? (
        <button
          type="button"
          disabled={busy}
          onClick={onAdd}
          className="w-full rounded-2xl border border-dashed border-indigo-200 py-2 text-xs font-black text-indigo-700 disabled:opacity-60"
        >
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}

export function AchievementEditor({ draft, setDraft, items = [], onSave, onCancel, saving, onAddProof, onRemoveProof, proofBusy, onDelete }) {
  const subs = subsOfCategory(draft.category);
  const [pickList, setPickList] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const saved = readAchCatalog();
    if (draft.id || draft.title) return;
    if (saved.category && saved.sub_category !== '__pick__') {
      setDraft({
        ...EMPTY_ACHIEVEMENT,
        category: saved.category,
        sub_category: saved.sub_category || '',
      });
      setPickList(true);
      return;
    }
    if (draft.sub_category && draft.sub_category !== '__pick__') return;
    if (draft.category && draft.category !== 'KHOA_BANG') return;
    setDraft({ ...EMPTY_ACHIEVEMENT, category: '', sub_category: '__pick__' });
  }, []);

  const catalogReady = draft.category && draft.sub_category !== '__pick__';

  const siblings = (items || []).filter(
    (x) => x.category === draft.category && String(x.sub_category || '') === String(draft.sub_category || ''),
  );

  function bindCatalog(category, sub_category) {
    const sub = sub_category || '';
    const hits = (items || []).filter(
      (x) => x.category === category && String(x.sub_category || '') === sub,
    );
    setDraft({ ...EMPTY_ACHIEVEMENT, category, sub_category: sub });
    setCreating(false);
    if (category && sub !== '__pick__') writeAchCatalog(category, sub);
    else writeAchCatalog('', '');
    setPickList(sub !== '__pick__' && !!category && hits.length >= 1);
  }

  function openRow(row) {
    setCreating(false);
    setPickList(false);
    setDraft({ ...achievementFromApi(row), proofs: row.proofs || [] });
    writeAchCatalog(row.category, row.sub_category || '');
  }

  function startCreate() {
    setCreating(true);
    setPickList(false);
    setDraft({ ...EMPTY_ACHIEVEMENT, category: draft.category, sub_category: draft.sub_category === '__pick__' ? '' : (draft.sub_category || '') });
  }

  return (
    <div className="space-y-3">
      <Field label="Nhóm">
        <select
          className={inputCls}
          value={draft.category}
          onChange={(e) => bindCatalog(e.target.value, '__pick__')}
        >
          <option value="">Chọn nhóm</option>
          {ACHIEVEMENT_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Chi tiết">
        <select
          className={inputCls}
          value={draft.sub_category}
          disabled={!draft.category}
          onChange={(e) => bindCatalog(draft.category, e.target.value)}
        >
          <option value="__pick__">Chọn chi tiết</option>
          <option value="">Chưa phân loại</option>
          {subs.map((s) => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </select>
      </Field>
      {!catalogReady ? null : pickList && siblings.length >= 1 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Có {siblings.length} mục cùng loại. Chọn một dòng để sửa hoặc thêm mới.
          </p>
          <ul className="space-y-2">
            {siblings.map((row) => (
              <li key={row.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <p className="font-bold text-slate-800">{row.title || 'Không tiêu đề'}</p>
                <p className="text-sm text-slate-500">
                  {[row.issued_by, row.achieved_year].filter(Boolean).join(' · ') || '—'}
                </p>
                <div className="mt-2 flex gap-3">
                  <button type="button" className="text-sm font-black text-indigo-700" onClick={() => openRow(row)}>
                    Sửa
                  </button>
                  {onDelete ? (
                    <button type="button" className="text-sm font-black text-rose-600" onClick={() => onDelete(row)}>
                      Xóa
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={startCreate} className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">
            Thêm mục cùng loại
          </button>
        </div>
      ) : (
      <>
      {siblings.length >= 1 && draft.id ? (
        <button
          type="button"
          className="text-sm font-bold text-indigo-700"
          onClick={() => {
            setPickList(true);
            setDraft({ ...EMPTY_ACHIEVEMENT, category: draft.category, sub_category: draft.sub_category || '' });
          }}
        >
          Xem {siblings.length} mục cùng loại
        </button>
      ) : null}
      <Field label="Tiêu đề">
        <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </Field>
      <Field label="Nơi cấp / issued by">
        <input className={inputCls} value={draft.issued_by} onChange={(e) => setDraft({ ...draft, issued_by: e.target.value })} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Ngày">
          <input className={inputCls} inputMode="numeric" value={draft.achieved_day} onChange={(e) => setDraft({ ...draft, achieved_day: e.target.value })} />
        </Field>
        <Field label="Tháng">
          <input className={inputCls} inputMode="numeric" value={draft.achieved_month} onChange={(e) => setDraft({ ...draft, achieved_month: e.target.value })} />
        </Field>
        <Field label="Năm">
          <input className={inputCls} inputMode="numeric" value={draft.achieved_year} onChange={(e) => setDraft({ ...draft, achieved_year: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
        <input type="checkbox" className="h-5 w-5" checked={draft.is_lunar} onChange={(e) => setDraft({ ...draft, is_lunar: e.target.checked })} />
        Ngày âm lịch
      </label>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
        <input type="checkbox" className="h-5 w-5" checked={draft.is_current} onChange={(e) => setDraft({ ...draft, is_current: e.target.checked })} />
        Đang đương nhiệm
      </label>
      {!draft.is_current ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Ngày hết">
            <input className={inputCls} inputMode="numeric" value={draft.ended_day} onChange={(e) => setDraft({ ...draft, ended_day: e.target.value })} />
          </Field>
          <Field label="Tháng hết">
            <input className={inputCls} inputMode="numeric" value={draft.ended_month} onChange={(e) => setDraft({ ...draft, ended_month: e.target.value })} />
          </Field>
          <Field label="Năm hết">
            <input className={inputCls} inputMode="numeric" value={draft.ended_year} onChange={(e) => setDraft({ ...draft, ended_year: e.target.value })} />
          </Field>
        </div>
      ) : null}
      <Field label="Mô tả">
        <textarea className={inputCls} rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </Field>
      {draft.id ? (
        <ProofStrip
          proofs={draft.proofs || []}
          busy={proofBusy}
          onAdd={onAddProof}
          onRemove={onRemoveProof}
        />
      ) : (
        <p className="text-xs text-slate-400">Lưu thành tựu trước, rồi thêm minh chứng.</p>
      )}
      <div className="flex justify-end">
        <ZoneVoiceButton visible text={voiceText(draft)} label="Nghe" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {draft.id ? (
          <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 py-3 text-sm font-black text-slate-600">
            Hủy sửa
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const payload = achievementToPayload(draft);
            writeAchCatalog(payload.category, payload.sub_category || '');
            const ok = await onSave(payload);
            if (ok === false) return;
            setCreating(false);
            setPickList(true);
            setDraft({ ...EMPTY_ACHIEVEMENT, category: payload.category, sub_category: payload.sub_category || '' });
          }}
          className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : draft.id ? 'Lưu sửa' : 'Thêm thành tích'}
        </button>
      </div>
      </>
      )}
    </div>
  );
}

export function AchievementReader({ items, openMap, setOpenMap, onEdit, onCreate, onDelete, onAddProof, onRemoveProof, proofBusyId }) {
  if (!items.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Chưa có thành tích.</p>
        {onCreate ? <button type="button" onClick={onCreate} className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">Thêm</button> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {onCreate ? <button type="button" onClick={onCreate} className="w-full rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700">Thêm thành tích</button> : null}
      {items.map((row) => {
        const open = !!openMap[row.id];
        return (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50/80">
            <div className="flex items-center gap-2 px-3 py-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setOpenMap((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
              >
                <span className="flex-1 truncate text-sm font-black text-slate-800">{row.title || 'Không tên'}</span>
                {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
              </button>
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ZoneVoiceButton visible text={voiceText(row)} label="Nghe" />
              </div>
            </div>
            {open ? (
              <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                <p className="text-sm text-slate-600">{categoryLabel(row.category)} · {subLabel(row.category, row.sub_category) || 'Chưa phân loại'}</p>
                {row.issued_by ? <p className="text-sm text-slate-700">Nơi cấp: {row.issued_by}</p> : null}
                <p className="text-sm text-slate-700">
                  {row.achieved_year}{row.is_lunar ? ' (âm)' : ''}{row.is_current ? ' · đương nhiệm' : row.ended_year ? ` – ${row.ended_year}` : ''}
                </p>
                {row.description ? <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{row.description}</p> : null}
                <ProofStrip
                  proofs={row.proofs || []}
                  busy={proofBusyId === row.id}
                  onAdd={onAddProof ? () => onAddProof(row) : undefined}
                  onRemove={onRemoveProof ? (p) => onRemoveProof(row, p) : undefined}
                />
                {onEdit || onDelete ? (
                <div className="grid grid-cols-2 gap-2">
                  {onEdit ? <button type="button" className="rounded-2xl border border-indigo-200 bg-white py-2 text-sm font-bold text-indigo-700" onClick={() => onEdit(row)}>Sửa</button> : null}
                  {onDelete ? <button type="button" className="rounded-2xl border border-rose-200 bg-white py-2 text-sm font-bold text-rose-700" onClick={() => onDelete(row)}>Xóa</button> : null}
                </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export { EMPTY_ACHIEVEMENT, voiceText };
