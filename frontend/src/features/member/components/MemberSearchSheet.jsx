/**
 * PATH       : frontend/src/features/member/components/MemberSearchSheet.jsx
 * DATETIME   : 2026-11-20T06:35:00+07:00
 * VERSION    : 1.1.0-MS-PHASE2-SPRINT-FE2
 * DESCRIPTION:
 * - Cửa tìm member dùng chung. Gõ tên → GET q. Cache câu. Làm mới.
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-2]:
 *   + Xử lý HTTP 429 (In-App Search Rate Limit / LRUCache fallback): tạm khóa
 *     ô input tìm kiếm và nút làm mới, hiển thị đồng hồ đếm ngược giây chờ,
 *     giữ nguyên từ khóa đã nhập (Keep State) [NFR-02, ARCH-01].
 *   + Hiển thị thông báo lỗi hợp nhất qua PersistentMessageBanner (kèm Mã tra cứu
 *     X-Correlation-Id fallback "Không có") và BlockingLoadingOverlay [ARCH-02, ARCH-04].
 *   + Hiển thị nhãn ngoại tộc (Con dâu / Con rể) khi m.is_clan === false [ARCH-03].
 *   + Tích hợp AudioHelpButton & ZoneVoiceButton, nút >= 48px, chữ >= 16px [NFR-FE-02].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed.js';
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

function nonClanVi(m) {
  if (!m || m.is_clan !== false) return null;
  const x = String(m.gender || '').toUpperCase();
  if (x === 'NU' || x === 'NỮ' || x === 'FEMALE') return 'Con dâu';
  if (x === 'NAM' || x === 'MALE') return 'Con rể';
  return 'Con rể / Con dâu';
}

function speakRow(m) {
  const relBadge = nonClanVi(m);
  const bits = [
    nameOf(m),
    relBadge ? relBadge : null,
    `Giới tính ${genderVi(m.gender)}`,
    m.birth_year ? `Năm sinh ${m.birth_year}` : 'Chưa rõ năm sinh',
    m.is_alive === false ? 'Đã mất' : 'Còn sống',
  ].filter(Boolean);
  if (m.note) bits.push(`Ghi chú: ${m.note}`);
  return bits.join('. ') + '.';
}

export default function MemberSearchSheet({
  preset = 'origin',
  excludeIds = [],
  previewPath,
  onLeaveToPreview,
  onPick,
  filters = {},
  initialQ = '',
}) {
  const navigate = useNavigate();
  const spec = MEMBER_SEARCH_PRESETS[preset] || MEMBER_SEARCH_PRESETS.assign;
  // [ARCH-01] Giữ nguyên từ khóa q khi dính Rate Limit 429
  const [q, setQ] = useState(initialQ || '');
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState(null); // ID của member đang xem kỹ

  // Trạng thái Phase 2: Rate Limit 429 & PersistentMessageBanner
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [bannerState, setBannerState] = useState(null);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setRateLimitSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSeconds]);

  const params = useMemo(
    () => ({
      q: q.trim(),
      status: filters.status || spec.status,
      is_clan:
        filters.is_clan === true || filters.is_clan === false
          ? filters.is_clan
          : spec.is_clan,
      gender: filters.gender || undefined,
      is_alive:
        filters.is_alive === true || filters.is_alive === false
          ? filters.is_alive
          : undefined,
      limit: 20,
    }),
    [q, spec, filters]
  );

  const key = cacheKey(params);

  async function run({ force = false } = {}) {
    const needle = params.q;
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    if (rateLimitSeconds > 0) {
      return;
    }
    if (!force) {
      const cached = readSearchCache(key);
      if (cached) {
        setHits(cached);
        setBannerState(null);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await searchMembers(params);
      const items = unwrapMembers(res);
      writeSearchCache(key, items);
      setHits(items);
      setBannerState(null);
    } catch (err) {
      const info = extractApiErrorInfo(err);
      if (info.status === 429) {
        const retryAfter = Number(
          info.details?.retryAfter || info.details?.retry_after || 30
        );
        setRateLimitSeconds(retryAfter > 0 ? retryAfter : 30);
        setBannerState({
          type: 'warning',
          title: 'Tạm giới hạn tần suất tìm kiếm',
          message: info.message,
          correlationId: info.correlationId,
        });
      } else {
        setHits([]);
        setBannerState({
          type: 'error',
          title: 'Không thể tìm kiếm thành viên',
          message: info.message,
          correlationId: info.correlationId,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => run({ force: false }), 300);
    return () => clearTimeout(t);
  }, [key]);

  const shown = hits.filter((m) => !excludeIds.includes(m.id));
  const isRateLimited = rateLimitSeconds > 0;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <BlockingLoadingOverlay
        isOpen={busy}
        message="Đang tìm kiếm thành viên trên sổ họ..."
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-bold text-slate-700">{spec.title}</span>
        <AudioHelpButton
          text="Bác gõ họ tên thành viên vào ô tìm kiếm bên dưới để tra cứu trên sổ họ. Nếu tìm quá nhanh, hệ thống sẽ tạm khóa ít giây và hiển thị đồng hồ đếm ngược."
          label="Nghe hướng dẫn"
          variant="soft"
        />
      </div>

      {bannerState && (
        <PersistentMessageBanner
          type={bannerState.type}
          title={bannerState.title}
          message={bannerState.message}
          correlationId={bannerState.correlationId}
          onClose={() => setBannerState(null)}
        />
      )}

      <label className="block">
        <input
          className="min-h-[48px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
          value={q}
          disabled={isRateLimited}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Gõ tên để tìm trên sổ"
        />
      </label>

      {isRateLimited && (
        <p className="mt-2 text-base font-semibold text-amber-800" role="status">
          Ô tìm kiếm tạm khóa do thao tác quá nhanh. Vui lòng thử lại sau {rateLimitSeconds} giây.
        </p>
      )}

      <p className="mt-2 text-base font-normal text-slate-600">{spec.hint}</p>
      <button
        type="button"
        className="mt-2 min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white text-base font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || isRateLimited || q.trim().length < 2}
        onClick={() => {
          clearSearchCache(key);
          run({ force: true });
        }}
      >
        {isRateLimited
          ? `Tạm khóa tìm kiếm (${rateLimitSeconds}s)`
          : busy
            ? 'Đang làm mới…'
            : 'Làm mới kết quả'}
      </button>

      {shown.length ? (
        <ul className="mt-3 max-h-[24rem] space-y-2.5 overflow-y-auto rounded-2xl border border-slate-200 p-2">
          {shown.map((m) => {
            const nm = nameOf(m);
            if (!nm) return null;
            const relBadge = nonClanVi(m);
            return (
              <li key={m.id}>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-100 px-3 py-2.5">
                  <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-base font-black text-indigo-700">
                      {initials(nm)}
                    </span>
                    <span onClick={(e) => e.stopPropagation()} role="presentation">
                      <ZoneVoiceButton visible text={speakRow(m)} label="Nghe" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-slate-900">{nm}</span>
                      {relBadge && (
                        <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-sm font-bold text-indigo-800">
                          {relBadge}
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 block text-base font-normal text-slate-600">
                      Giới tính: {genderVi(m.gender)} · Năm sinh: {m.birth_year || 'chưa rõ'} ·{' '}
                      {m.is_alive === false ? 'Đã mất' : 'Còn sống'}
                    </span>
                    {m.note ? (
                      <span className="mt-0.5 block whitespace-pre-wrap break-words text-base font-normal text-slate-600">
                        Ghi chú: {m.note}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex gap-2 px-1 pb-1">
                  <button
                    type="button"
                    className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white text-base font-bold text-slate-700 hover:bg-slate-50"
                    onClick={() => setPreviewId(previewId === m.id ? null : m.id)}
                  >
                    {previewId === m.id ? 'Thu gọn' : 'Xem kỹ'}
                  </button>
                  {typeof onPick === 'function' ? (
                    <button
                      type="button"
                      className="min-h-[48px] flex-1 rounded-xl bg-indigo-600 text-base font-black text-white hover:bg-indigo-700"
                      onClick={() => onPick({ id: m.id, name: nm, member: m })}
                    >
                      Chọn
                    </button>
                  ) : null}
                </div>

                {previewId === m.id && (
                  <div className="mx-1 mb-2 rounded-xl border border-slate-200 bg-white p-3 text-base text-slate-700 space-y-1">
                    <div>Họ tên: {nm}</div>
                    {relBadge ? <div>Quan hệ: {relBadge}</div> : null}
                    <div>Giới tính: {genderVi(m.gender)}</div>
                    <div>Năm sinh: {m.birth_year || 'chưa rõ'}</div>
                    <div>Tình trạng: {m.is_alive === false ? 'Đã mất' : 'Còn sống'}</div>
                    {m.generation ? <div>Đời: {m.generation}</div> : null}
                    {m.note ? <div className="mt-1 whitespace-pre-wrap">Ghi chú: {m.note}</div> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!busy && q.trim().length >= 2 && !shown.length && !bannerState ? (
        <p className="mt-2 text-base font-normal text-slate-600">
          Không thấy tên này trên sổ. Nhờ Ban quản trị tạo trước.
        </p>
      ) : null}
    </section>
  );
}
