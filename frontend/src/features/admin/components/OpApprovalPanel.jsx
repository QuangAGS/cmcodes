/**
 * PATH       : src/features/admin/components/OpApprovalPanel.jsx
 * DATETIME   : 2026-11-20T07:20:00+07:00
 * VERSION    : 2.2.0-PHASE2-SPRINT-FE4
 * DESCRIPTION:
 * - List OP (MEMBER_PROMOTE): search + lifecycle chips + 1 CTA "Xem & xử lý".
 * - Pattern gần AdminUserApproval; không 3 nút trên mỗi card.
 * - Detail: /admin/approval/op/:caseId (OpCaseDetailPage).
 * - Shell: TenantHeader + AppFooterNav.
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-4]:
 *   + Bắt 400 REFERRER_DECEASED: hiển thị PersistentMessageBanner (dạng modal)
 *     "Hồ sơ lùi về NEEDS_REVISION" và gọi lại API refetch (load()) [FUNC-02, TC-FE-02].
 *   + Hiển thị huy hiệu Khóa QA (3 lần sai) trên thẻ hồ sơ bị khóa QA [FUNC-03].
 *   + Bổ sung nhóm lọc EXPIRED / CANCELLED để Admin kiểm tra hồ sơ đã dọn R2 [ARCH-05].
 *   + Tích hợp PersistentMessageBanner (kèm X-Correlation-Id), BlockingLoadingOverlay,
 *     AudioHelpButton và ZoneVoiceButton [ARCH-02, ARCH-04, NFR-FE-02, TC-FE-18].
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-23T18:10:00+07:00 (v2.1.1-HEADER): Danh sách OP & chips vòng đời.
 * - 2026-11-20T07:20:00+07:00 (v2.2.0-PHASE2-SPRINT-FE4): Triển khai Sprint FE-4.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, ShieldAlert, Lock } from 'lucide-react';

import apiClient from '../../../lib/apiClient.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import TenantHeader from '../../../components/shell/TenantHeader.jsx';
import AppFooterNav from '../../../components/shell/AppFooterNav.jsx';
import { resolveFooterNav } from '../../../lib/resolveFooterNav.js';
import AudioHelpButton from '../../../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../../../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import { ADMIN_APPROVAL_OP_HELP } from '../constants/adminMessages.js';
import { resolveTenant } from '../../../lib/resolveTenant.js';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed.js';

/** status query gửi BE — "Tất cả" = hàng đợi admin + các trạng thái kết thúc nháp */
const LIFECYCLE = [
  {
    id: 'QUEUE',
    label: 'Chờ xử lý',
    statusCsv: 'SUBMITTED,UNDER_REVIEW',
  },
  {
    id: 'REVISION',
    label: 'Trả sửa',
    statusCsv: 'NEEDS_REVISION',
  },
  {
    id: 'REJECTED',
    label: 'Từ chối (mở lại)',
    statusCsv: 'REJECTED',
  },
  {
    id: 'TERMINAL',
    label: 'Hết hạn / Hủy',
    statusCsv: 'EXPIRED,CANCELLED',
  },
  {
    id: 'ALL',
    label: 'Tất cả',
    statusCsv: 'SUBMITTED,UNDER_REVIEW,NEEDS_REVISION,REJECTED,EXPIRED,CANCELLED',
  },
];

const STATUS_LABEL = {
  SUBMITTED: 'Chờ xem xét',
  UNDER_REVIEW: 'Đang xem xét',
  NEEDS_REVISION: 'Cần bổ sung',
  REJECTED: 'Đã từ chối',
  EXPIRED: 'Hết hạn',
  CANCELLED: 'Đã hủy',
};

export default function OpApprovalPanel({ onReferrerDeceasedDetected }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const footerNav = resolveFooterNav(user, { pageKey: 'admin-approval' });
  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [lifecycle, setLifecycle] = useState('QUEUE');
  const [bannerState, setBannerState] = useState(null);

  const sessionTenant = useMemo(() => resolveTenant(user), [user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const chip = LIFECYCLE.find((c) => c.id === lifecycle) || LIFECYCLE[0];
      const res = await apiClient.get('/onboarding/cases/reviewable', {
        params: {
          process_kind: 'MEMBER_PROMOTE',
          page_size: 50,
          status: chip.statusCsv,
        },
      });
      const data = res.data?.data ?? res.data ?? {};
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error('[OpApprovalPanel] list', err?.response?.data || err);
      const info = extractApiErrorInfo(err);

      // [FUNC-02, TC-FE-02] Bắt 400 REFERRER_DECEASED -> Banner modal + gọi lại API refetch
      if (info.status === 400 && info.code === 'REFERRER_DECEASED') {
        setBannerState({
          type: 'warning',
          mode: 'modal',
          title: 'Hồ sơ lùi về NEEDS_REVISION',
          message: `Hồ sơ lùi về NEEDS_REVISION. ${info.message}`,
          correlationId: info.correlationId,
        });
        if (typeof onReferrerDeceasedDetected === 'function') {
          onReferrerDeceasedDetected(info);
        }
      } else {
        setBannerState({
          type: 'error',
          mode: 'inline',
          title: 'Không tải được danh sách hồ sơ',
          message: info.message,
          correlationId: info.correlationId,
          actionButton: (
            <button
              type="button"
              onClick={() => load()}
              className="min-h-[48px] rounded-xl bg-indigo-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ),
        });
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lifecycle, onReferrerDeceasedDetected]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = items;
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((it) => {
      const blob = [
        it.primary?.full_name,
        it.user?.phone,
        it.user?.email,
        it.tenant?.name,
        it.case_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(s);
    });
  }, [items, q]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Vòng quay chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={loading}
        message="Đang tải danh sách hồ sơ thành viên..."
      />

      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader
          tenant={sessionTenant}
          subtitle="Phê duyệt thành viên · OP"
        />

        <div className="px-4 py-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <ZoneVoiceButton
              visible
              text="Danh sách hồ sơ thành viên chờ xét duyệt. Bác có thể lọc theo trạng thái và bấm Xem và xử lý trên từng hồ sơ."
              label="Nghe vùng"
            />
            <AudioHelpButton text={ADMIN_APPROVAL_OP_HELP} />
          </div>

          {/* Banner thông báo nghiệp vụ hợp nhất (inline hoặc modal 400 REFERRER_DECEASED) */}
          {bannerState && (
            <PersistentMessageBanner
              type={bannerState.type}
              mode={bannerState.mode}
              title={bannerState.title}
              message={bannerState.message}
              correlationId={bannerState.correlationId}
              actionButton={bannerState.actionButton}
              onClose={() => setBannerState(null)}
            />
          )}

          <div>
            <h1 className="text-center text-xl sm:text-2xl font-black tracking-tight text-slate-800">
              Phê duyệt thành viên
            </h1>
            <p className="mt-1 text-center text-base text-slate-600">
              Chọn hồ sơ để xem chi tiết rồi quyết định.
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tên, SĐT, email, dòng họ…"
              className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-indigo-500"
            />
          </div>

          {/* Lifecycle chips */}
          <div className="flex flex-wrap gap-2">
            {LIFECYCLE.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setLifecycle(c.id)}
                className={`min-h-[48px] rounded-full px-3.5 py-2 text-base font-bold ${
                  lifecycle === c.id
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="min-h-[48px] ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-base font-bold text-slate-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          <div className="space-y-3">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-slate-400" />
                <h3 className="mt-4 text-base font-black text-slate-900">
                  Không có hồ sơ phù hợp
                </h3>
                <p className="mt-1 text-base text-slate-600">
                  Đổi bộ lọc hoặc làm mới danh sách.
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                const isQaLocked = Boolean(
                  item.qa_locked === true ||
                    item.qaLocked === true ||
                    item.metadata?.qa_locked === true
                );

                return (
                  <article
                    key={item.id}
                    className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-slate-900">
                          {item.primary?.full_name || 'Chưa có tên'}
                        </p>
                        <p className="mt-0.5 text-base font-semibold text-slate-600">
                          {item.user?.phone || item.user?.email || '—'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-black uppercase text-amber-800">
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </div>

                    {/* Huy hiệu Khóa QA (3 lần sai) [FUNC-03] */}
                    {isQaLocked && (
                      <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-100 px-3 py-1 text-sm font-black text-amber-950">
                        <Lock size={14} />
                        <span>Khóa QA (3 lần sai) - Chờ duyệt thủ công</span>
                      </div>
                    )}

                    <p className="text-base text-slate-600">
                      {item.case_type === 'CLAN_SETUP'
                        ? 'Thành lập dòng họ'
                        : 'Nhập tộc'}
                      {item.primary?.generation != null
                        ? ` · Đời ${item.primary.generation}`
                        : ''}
                      {item.primary?.birth_year
                        ? ` · Sinh ${item.primary.birth_year}`
                        : ''}
                    </p>
                    {item.tenant?.name ? (
                      <p className="truncate text-sm text-slate-500">
                        {item.tenant.name}
                      </p>
                    ) : null}

                    {/* 1 CTA >= 48px */}
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/approval/op/${item.id}`)
                      }
                      className="min-h-[48px] mt-2 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-base font-bold text-white hover:bg-indigo-700"
                    >
                      Xem &amp; xử lý
                    </button>
                  </article>
                );
              })
            )}
          </div>

          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    </div>
  );
}
