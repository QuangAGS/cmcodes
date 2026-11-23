/**
 * ============================================================================
 * PATH       : frontend/src/features/onboarding/components/ClanNameDuplicateAlert.jsx
 * DATETIME   : 2026-11-23T07:26:00+07:00
 * VERSION    : 1.0.1-ISO29148-UAT-IMP7-NAME-CHECK
 * DESCRIPTION:
 * - [UAT-IMP7] Cảnh báo mềm & gợi ý đặt tên phân biệt khi người dùng nhập
 *   Tên dòng họ trùng hoặc gần giống với dòng họ đã có trên hệ thống:
 *   + Không khóa cứng DB (vì ở Việt Nam có nhiều chi họ trùng tên như "Nguyễn Tộc").
 *   + Hiển thị danh sách dòng họ trùng/gần giống kèm Mã họ (slug), Trạng thái
 *     và Địa bàn gốc để tránh tạo trùng khi dòng họ đã tồn tại.
 *   + Cung cấp nút chuyển nhanh sang luồng Xin gia nhập (MEMBER_JOIN) nếu đúng
 *     là dòng họ của người dùng, hoặc gợi ý bổ sung tên chi phái/địa danh.
 *   + Tuân thủ Elder Doctrine: nút >= 48px, chữ >= 16px, tích hợp ZoneVoiceButton.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React from 'react';
import { AlertTriangle, UserPlus, Loader2 } from 'lucide-react';
import apiClient from '../../../lib/apiClient.js';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';

const STATUS_BADGE = {
  HOAT_DONG: {
    label: 'Đang hoạt động',
    className: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
  CHO_DUYET: {
    label: 'Chờ duyệt thành lập',
    className: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  TAM_NGUNG: {
    label: 'Đang tạm ngưng',
    className: 'bg-amber-100 text-amber-900 border-amber-300',
  },
};

/**
 * Gọi API kiểm tra mềm trùng tên dòng họ (có fallback sang /tenants/search).
 */
export async function fetchSimilarClanNames(rawName) {
  const cleanName = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (cleanName.length < 3) {
    return { query: cleanName, exactMatch: false, count: 0, matches: [] };
  }

  try {
    const res = await apiClient.get('/tenants/check-name', {
      params: { name: cleanName },
      headers: { Authorization: '' },
    });
    const data = res.data?.data || res.data || {};
    if (Array.isArray(data.matches)) {
      return {
        query: cleanName,
        exactMatch: Boolean(data.exactMatch),
        count: data.matches.length,
        matches: data.matches,
      };
    }
  } catch (_) {
    /* Fallback sang /tenants/search nếu backend chưa cập nhật route /check-name */
  }

  try {
    const fallbackRes = await apiClient.get('/tenants/search', {
      params: { q: cleanName },
      headers: { Authorization: '' },
    });
    const rawList = Array.isArray(fallbackRes.data?.data)
      ? fallbackRes.data.data
      : Array.isArray(fallbackRes.data)
        ? fallbackRes.data
        : [];
    const filtered = rawList
      .filter((t) => t && ['HOAT_DONG', 'CHO_DUYET', 'TAM_NGUNG'].includes(t.status))
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug || '',
        status: t.status,
        description: t.description || null,
        originSummary: t.clan_profiles?.origin_summary || null,
      }));
    const norm = cleanName.toLowerCase();
    return {
      query: cleanName,
      exactMatch: filtered.some(
        (m) => String(m.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === norm
      ),
      count: filtered.length,
      matches: filtered,
    };
  } catch (_) {
    return { query: cleanName, exactMatch: false, count: 0, matches: [] };
  }
}

export default function ClanNameDuplicateAlert({
  clanName = '',
  checking = false,
  result = null,
  onSelectJoinExisting,
  disabled = false,
}) {
  const cleanName = String(clanName || '').trim();
  if (checking) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-normal text-slate-600">
        <Loader2 size={18} className="animate-spin text-indigo-600 shrink-0" />
        <span>Đang đối chiếu tên dòng họ trên hệ thống...</span>
      </div>
    );
  }

  const matches = Array.isArray(result?.matches) ? result.matches : [];
  if (!cleanName || cleanName.length < 3 || matches.length === 0) {
    return null;
  }

  const isExact = Boolean(result?.exactMatch);
  const voiceSummary = isExact
    ? `Lưu ý: Tên dòng họ ${cleanName} đã trùng với ${matches.length} dòng họ trên hệ thống. Nếu đây là dòng họ của bác đã được người thân lập trước đó, bác hãy bấm nút Xin gia nhập dòng họ này. Nếu là chi họ khác, bác nên đặt tên phân biệt rõ chi phái hoặc địa danh, ví dụ ${cleanName} Chi 2.`
    : `Lưu ý: Hệ thống tìm thấy ${matches.length} dòng họ có tên tương tự ${cleanName}. Nếu đúng là dòng họ của bác, bác hãy chọn Xin gia nhập. Nếu là chi họ khác, bác nên thêm tên chi phái hoặc địa danh để dễ phân biệt.`;

  return (
    <div
      role="region"
      aria-label="Cảnh báo trùng tên dòng họ"
      data-testid="clan-name-duplicate-alert"
      className="mt-2.5 rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-4 text-amber-950 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-700" />
          <p className="text-base font-bold leading-snug text-amber-950">
            {isExact
              ? `Tên "${cleanName}" đã trùng với ${matches.length} dòng họ trên hệ thống:`
              : `Tìm thấy ${matches.length} dòng họ có tên tương tự "${cleanName}":`}
          </p>
        </div>

        <ZoneVoiceButton
          visible
          text={voiceSummary}
          label="Nghe"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2.5">
        {matches.map((m) => {
          const badge = STATUS_BADGE[m.status] || {
            label: m.status,
            className: 'bg-slate-100 text-slate-800 border-slate-200',
          };
          const locationHint = m.originSummary || m.description || '';

          return (
            <div
              key={m.id}
              className="rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm space-y-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900">{m.name}</p>
                  {m.slug && (
                    <p className="text-sm font-normal text-slate-600">
                      Mã họ: <strong className="font-bold text-slate-900">{m.slug}</strong>
                    </p>
                  )}
                </div>

                <span
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold shrink-0 ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>

              {locationHint && (
                <p className="text-base font-normal text-slate-700 line-clamp-2">
                  Địa bàn / Giới thiệu: <strong className="font-semibold text-slate-900">{locationHint}</strong>
                </p>
              )}

              {typeof onSelectJoinExisting === 'function' && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectJoinExisting(m)}
                  className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 px-4 text-base font-bold text-emerald-950 whitespace-nowrap hover:bg-emerald-100 transition disabled:opacity-50"
                >
                  <UserPlus size={18} className="shrink-0 text-emerald-700" />
                  <span>Đây là họ của tôi — Xin gia nhập</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="rounded-xl border border-amber-200/80 bg-white/80 p-3 text-base font-normal leading-relaxed text-slate-800">
        Nếu đây là <strong className="font-bold text-slate-900">chi họ hoặc dòng họ độc lập khác</strong>, bác vẫn có thể tiếp tục tạo mới, nhưng nên đặt tên phân biệt rõ chi phái hoặc địa danh để bà con dễ tìm kiếm (ví dụ:{' '}
        <strong className="font-bold text-slate-900">{cleanName} - Chi 2</strong> hoặc{' '}
        <strong className="font-bold text-slate-900">{cleanName} Thái Bình</strong>).
      </p>
    </div>
  );
}
