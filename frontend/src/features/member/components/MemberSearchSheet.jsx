/**
 * ============================================================================
 * PATH       : frontend/src/features/member/components/MemberSearchSheet.jsx
 * DATETIME   : 2026-11-21T09:45:00+07:00
 * VERSION    : 1.2.0-MS-PHASE2-UAT-IMP3
 * DESCRIPTION:
 * - Cửa tìm member dùng chung. Gõ tên → GET q. Cache câu. Làm mới.
 * - [UAT-IMP3 2026-11-21]:
 *   + Trình bày từng kết quả tìm kiếm bằng CollapsibleDetailCard (Dòng 1: Họ tên;
 *     Dòng 2: 3 cột Trạng thái | Nút "Nghe" | Nút "Mở ra"/"Đóng lại"; khi đóng chỉ
 *     hiện 2 dòng).
 *   + Khi mở Card, trình bày bằng KeyValueDetailTable 2 cột (cột 1 label italic,
 *     cột 2 giá trị), bắt buộc đưa thuộc tính members.is_clan vào bảng, và tách
 *     trường ghi chú (note) thành Text Area.
 *   + Không tự đóng PersistentMessageBanner khi tìm kiếm lại; chỉ đóng khi EU bấm "Đã hiểu".
 *   + Đồng bộ style nút bấm (min-h-[48px] h-12 rounded-xl).
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useEffect, useMemo, useState } from 'react';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import KeyValueDetailTable from '../../../components/common/KeyValueDetailTable.jsx';
import { getPhase2UserMessage } from '../../onboarding/constants/phase2MessageCatalog.js';
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

function genderVi(g) {
  const x = String(g || '').toUpperCase();
  if (x === 'NAM' || x === 'MALE') return 'Nam';
  if (x === 'NU' || x === 'NỮ' || x === 'FEMALE') return 'Nữ';
  return 'Khác';
}

function resolveClanRelationText(m) {
  if (!m || m.is_clan !== false) {
    return 'Thành viên trong họ (Nội tộc)';
  }
  const ct = String(m.child_type || '').toUpperCase();
  const g = String(m.gender || '').toUpperCase();
  if (ct === 'CON_DAU' || g === 'NU' || g === 'NỮ' || g === 'FEMALE') {
    return 'Thành viên ngoại tộc (Con dâu)';
  }
  if (ct === 'CON_RE' || g === 'NAM' || g === 'MALE') {
    return 'Thành viên ngoại tộc (Con rể)';
  }
  return 'Thành viên ngoại tộc (Con rể / Con dâu)';
}

function resolveClanStatusShort(m) {
  if (!m || m.is_clan !== false) return 'Nội tộc';
  return 'Ngoại tộc';
}

function speakRow(m) {
  const bits = [
    nameOf(m),
    resolveClanRelationText(m),
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
  onPick,
  filters = {},
  initialQ = '',
}) {
  const spec = MEMBER_SEARCH_PRESETS[preset] || MEMBER_SEARCH_PRESETS.assign;
  const [q, setQ] = useState(initialQ || '');
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);

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
        return;
      }
    }
    setBusy(true);
    try {
      const res = await searchMembers(params);
      const items = unwrapMembers(res);
      writeSearchCache(key, items);
      setHits(items);
    } catch (err) {
      const info = extractApiErrorInfo(err);
      if (info.status === 429) {
        const retryAfter = Number(
          info.details?.retryAfter || info.details?.retry_after || 30
        );
        setRateLimitSeconds(retryAfter > 0 ? retryAfter : 30);
        const msgObj = getPhase2UserMessage('IN_APP_SEARCH_RATE_LIMITED', {
          message: info.message,
        });
        setBannerState({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
        });
      } else {
        setHits([]);
        const msgObj = getPhase2UserMessage(info.code, {
          message: info.message,
        });
        setBannerState({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
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
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <BlockingLoadingOverlay
        isOpen={busy}
        message="Đang tìm kiếm thành viên trên sổ họ..."
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-bold text-slate-800">{spec.title}</span>
        <AudioHelpButton
          text="Bác gõ họ tên thành viên vào ô tìm kiếm bên dưới để tra cứu trên sổ họ. Bấm Mở ra trên từng thẻ kết quả để xem chi tiết và chọn."
          label="Nghe hướng dẫn"
          variant="soft"
        />
      </div>

      {bannerState && (
        <PersistentMessageBanner
          type={bannerState.type}
          title={bannerState.title}
          message={bannerState.message}
          onClose={() => setBannerState(null)}
        />
      )}

      <label className="block">
        <input
          className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
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
        className="mt-2 min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {shown.map((m) => {
            const nm = nameOf(m);
            if (!nm) return null;
            const detailRows = [
              { label: 'Họ và tên', value: nm },
              { label: 'Quan hệ dòng họ', value: resolveClanRelationText(m) },
              { label: 'Giới tính', value: genderVi(m.gender) },
              { label: 'Năm sinh', value: m.birth_year || 'Chưa rõ' },
              { label: 'Tình trạng', value: m.is_alive === false ? 'Đã mất' : 'Còn sống' },
              ...(m.generation != null ? [{ label: 'Đời thứ', value: `Đời ${m.generation}` }] : []),
              ...(m.branch_name ? [{ label: 'Chi / Nhánh', value: m.branch_name }] : []),
            ];
            const detailNotes = m.note ? [{ label: 'Ghi chú', value: m.note }] : [];

            return (
              <CollapsibleDetailCard
                key={m.id}
                title={nm}
                statusLabel={resolveClanStatusShort(m)}
                statusVariant={m.is_clan === false ? 'pending' : 'complete'}
                voiceText={speakRow(m)}
                defaultExpanded={false}
              >
                <div className="space-y-3">
                  <KeyValueDetailTable rows={detailRows} notes={detailNotes} />

                  {typeof onPick === 'function' && (
                    <button
                      type="button"
                      className="min-h-[48px] h-12 w-full rounded-xl bg-emerald-600 px-4 text-base font-bold text-white hover:bg-emerald-700"
                      onClick={() => onPick({ id: m.id, name: nm, member: m })}
                    >
                      Chọn thành viên này
                    </button>
                  )}
                </div>
              </CollapsibleDetailCard>
            );
          })}
        </div>
      ) : null}

      {!busy && q.trim().length >= 2 && !shown.length && !bannerState ? (
        <p className="mt-2 text-base font-normal text-slate-600">
          Không thấy tên này trên sổ. Nhờ Ban quản trị tạo trước.
        </p>
      ) : null}
    </section>
  );
}
