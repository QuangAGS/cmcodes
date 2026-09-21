/**
 * PATH       : frontend/src/features/mfo/components/MemberSearchSheet.jsx
 * DATETIME   : 2026-09-21T10:10:00+07:00
 * VERSION    : 1.0.0-MS
 * DESCRIPTION: Cửa tìm member dùng chung. Gõ tên → GET q. Cache câu. Làm mới.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import {
  searchMembers,
  unwrapMembers,
  cacheKey,
  readSearchCache,
  writeSearchCache,
  clearSearchCache,
} from '../api/memberSearchApi.js';
import { MEMBER_SEARCH_PRESETS } from '../constants/memberSearchPresets.js';

function nameOf(m) {
  return String(m?.full_name || m?.name || '').trim();
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function genderVi(g) {
  const x = String(g || '').toUpperCase();
  if (x === 'NAM' || x === 'MALE') return 'Nam';
  if (x === 'NU' || x === 'NỮ' || x === 'FEMALE') return 'Nữ';
  return 'Khác';
}

function speakRow(m) {
  const bits = [
    nameOf(m),
    `Giới tính ${genderVi(m.gender)}`,
    m.birth_year ? `Năm sinh ${m.birth_year}` : 'Chưa rõ năm sinh',
    m.is_alive === false ? 'Đã mất' : 'Còn sống',
  ];
  if (m.note) bits.push(`Ghi chú: ${m.note}`);
  return bits.join('. ') + '.';
}

export default function MemberSearchSheet({
  preset = 'origin',
  excludeIds = [],
  previewPath,
  onLeaveToPreview,
}) {
  const navigate = useNavigate();
  const spec = MEMBER_SEARCH_PRESETS[preset] || MEMBER_SEARCH_PRESETS.assign;
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);

  const params = useMemo(
    () => ({
      q: q.trim(),
      status: spec.status,
      is_clan: spec.is_clan,
      limit: 20,
    }),
    [q, spec]
  );

  const key = cacheKey(params);

  async function run({ force = false } = {}) {
    const needle = params.q;
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    if (!force) {
      const cached = readSearchCache(key);
      if (cached) {
        setHits(cached);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await searchMembers(params);
      const items = unwrapMembers(res);
      writeSearchCache(key, items);
      setHits(items);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => run({ force: false }), 300);
    return () => clearTimeout(t);
  }, [key]);

  const shown = hits.filter((m) => !excludeIds.includes(m.id));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block">
        <span className="text-sm font-normal text-slate-500">{spec.title}</span>
        <input
          className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-800"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Gõ tên để tìm trên sổ"
        />
      </label>
      <p className="mt-2 text-sm font-normal text-slate-500">{spec.hint}</p>
      <button
        type="button"
        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 bg-white text-base font-bold disabled:opacity-60"
        disabled={busy || q.trim().length < 2}
        onClick={() => {
          clearSearchCache(key);
          run({ force: true });
        }}
      >
        {busy ? 'Đang làm mới…' : 'Làm mới kết quả'}
      </button>

      {shown.length ? (
        <ul className="mt-3 max-h-[20rem] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-2">
          {shown.map((m) => {
            const nm = nameOf(m);
            if (!nm) return null;
            return (
              <li key={m.id}>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-100 px-3 py-2">
                  <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
                      {initials(nm)}
                    </span>
                    <span onClick={(e) => e.stopPropagation()} role="presentation">
                      <ZoneVoiceButton visible text={speakRow(m)} label="Nghe" />
                    </span>
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (typeof onLeaveToPreview === 'function') onLeaveToPreview(q);
                      const path =
                        typeof previewPath === 'function'
                          ? previewPath(m.id)
                          : `/op/mfo/members/${m.id}`;
                      navigate(path);
                    }}
                  >
                    <span className="block text-base font-semibold text-slate-800">{nm}</span>
                    <span className="mt-0.5 block text-sm font-normal text-slate-500">
                      Giới tính: {genderVi(m.gender)} · Năm sinh:{' '}
                      {m.birth_year || 'chưa rõ'} ·{' '}
                      {m.is_alive === false ? 'Đã mất' : 'Còn sống'}
                    </span>
                    {m.note ? (
                      <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm font-normal text-slate-500">
                        Ghi chú: {m.note}
                      </span>
                    ) : null}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!busy && q.trim().length >= 2 && !shown.length ? (
        <p className="mt-2 text-sm font-normal text-slate-500">
          Không thấy tên này trên sổ. Nhờ Ban quản trị tạo trước.
        </p>
      ) : null}
    </section>
  );
}
