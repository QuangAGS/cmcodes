/**
 * PATH       : src/features/member/components/AchievementSection.jsx
 * DATETIME   : 2026-09-01T08:00:00+07:00
 * VERSION    : 1.0.0-A01-ACH
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import {
  ACHIEVEMENT_CATEGORIES,
  EMPTY_ACHIEVEMENT,
  achievementToPayload,
  categoryLabel,
  subLabel,
  subsOfCategory,
} from '../constants/achievementCatalog.js';

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

export function AchievementEditor({ draft, setDraft, onSave, onCancel, saving }) {
  const subs = subsOfCategory(draft.category);
  return (
    <div className="space-y-3">
      <Field label="Nhóm">
        <select
          className={inputCls}
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value, sub_category: '' })}
        >
          {ACHIEVEMENT_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Chi tiết">
        <select
          className={inputCls}
          value={draft.sub_category}
          onChange={(e) => setDraft({ ...draft, sub_category: e.target.value })}
        >
          <option value="">— Chưa phân loại —</option>
          {subs.map((s) => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </select>
      </Field>
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
        <button type="button" disabled={saving} onClick={() => onSave(achievementToPayload(draft))} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white disabled:opacity-60">
          {saving ? 'Đang lưu...' : draft.id ? 'Lưu sửa' : 'Thêm thành tích'}
        </button>
      </div>
    </div>
  );
}

export function AchievementReader({ items, openMap, setOpenMap, onEdit, onCreate, onDelete }) {
  if (!items.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Chưa có thành tích.</p>
        <button type="button" onClick={onCreate} className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">Thêm</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={onCreate} className="w-full rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700">Thêm thành tích</button>
      {items.map((row) => {
        const open = !!openMap[row.id];
        const preview = [row.title, row.achieved_year].filter(Boolean).join(' · ');
        return (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50/80">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-3 text-left"
              onClick={() => setOpenMap((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
            >
              <span className="flex-1 text-sm font-black text-slate-800">{row.title || 'Không tên'}</span>
              <span className="max-w-[40%] truncate text-xs text-slate-500">{preview}</span>
              {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>
            {open ? (
              <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                <div className="flex justify-end">
                  <ZoneVoiceButton visible text={voiceText(row)} label="Nghe" />
                </div>
                <p className="text-sm text-slate-600">{categoryLabel(row.category)} · {subLabel(row.category, row.sub_category) || 'Chưa phân loại'}</p>
                {row.issued_by ? <p className="text-sm text-slate-700">Nơi cấp: {row.issued_by}</p> : null}
                <p className="text-sm text-slate-700">
                  {row.achieved_year}{row.is_lunar ? ' (âm)' : ''}{row.is_current ? ' · đương nhiệm' : row.ended_year ? ` – ${row.ended_year}` : ''}
                </p>
                {row.description ? <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{row.description}</p> : null}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="rounded-2xl border border-indigo-200 bg-white py-2 text-sm font-bold text-indigo-700" onClick={() => onEdit(row)}>Sửa</button>
                  <button type="button" className="rounded-2xl border border-rose-200 bg-white py-2 text-sm font-bold text-rose-700" onClick={() => onDelete(row)}>Xóa</button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export { EMPTY_ACHIEVEMENT };
