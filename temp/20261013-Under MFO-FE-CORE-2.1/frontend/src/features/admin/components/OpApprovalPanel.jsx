/**
 * PATH       : src/features/admin/components/OpApprovalPanel.jsx
 * DATETIME   : 2026-08-23T18:10:00+07:00
 * VERSION    : 2.1.1-HEADER
 * DESCRIPTION:
 * - List OP (MEMBER_PROMOTE): search + lifecycle chips + 1 CTA "Xem & xử lý".
 * - Pattern gần AdminUserApproval; không 3 nút trên mỗi card.
 * - Detail: /admin/approval/op/:caseId (OpCaseDetailPage).
 * - Shell: TenantHeader + AppFooterNav.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw, Search, ShieldAlert } from 'lucide-react';

import apiClient from '../../../lib/apiClient.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import TenantHeader from '../../../components/shell/TenantHeader.jsx';
import AppFooterNav from '../../../components/shell/AppFooterNav.jsx';
import { resolveFooterNav } from '../../../lib/resolveFooterNav.js';
import AudioHelpButton from '../../../features/elder-doctrine/components/AudioHelpButton.jsx';
import { ADMIN_APPROVAL_OP_HELP } from '../constants/adminMessages.js';
import { resolveTenant } from '../../../lib/resolveTenant.js';

/** status query gửi BE — "Tất cả" = hàng đợi admin, không phải mọi status DB */
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
    id: 'ALL',
    label: 'Tất cả',
    statusCsv: 'SUBMITTED,UNDER_REVIEW,NEEDS_REVISION,REJECTED',
  },
];

const STATUS_LABEL = {
  SUBMITTED: 'Chờ xem xét',
  UNDER_REVIEW: 'Đang xem xét',
  NEEDS_REVISION: 'Cần bổ sung',
  REJECTED: 'Đã từ chối',
};

export default function OpApprovalPanel() {
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
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Không tải được danh sách hồ sơ.'
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lifecycle]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = items;
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
      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader
          tenant={sessionTenant}
          subtitle="Phê duyệt thành viên · OP"
        />

        <div className="px-4 py-5">
          <div className="mb-2 flex justify-end">
            <AudioHelpButton text={ADMIN_APPROVAL_OP_HELP} />
          </div>
          <h1 className="text-center text-xl font-black tracking-tight text-slate-800">
            Phê duyệt thành viên
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            Chọn hồ sơ để xem chi tiết rồi quyết định.
          </p>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tên, SĐT, email, dòng họ…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* Lifecycle chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            {LIFECYCLE.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setLifecycle(c.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  lifecycle === c.id
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
                <p className="mt-3 text-sm font-bold text-slate-600">Đang tải…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-slate-400" />
                <h3 className="mt-4 text-sm font-black text-slate-900">
                  Không có hồ sơ phù hợp
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Đổi bộ lọc hoặc làm mới danh sách.
                </p>
              </div>
            ) : (
              filtered.map((item) => (
                <article
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-800">
                        {item.primary?.full_name || 'Chưa có tên'}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {item.user?.phone || item.user?.email || '—'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700">
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
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
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {item.tenant.name}
                    </p>
                  ) : null}

                  {/* 1 CTA — không 3 nút */}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/admin/approval/op/${item.id}`)
                    }
                    className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white"
                  >
                    Xem &amp; xử lý
                  </button>
                </article>
              ))
            )}
          </div>

          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    </div>
  );
}
