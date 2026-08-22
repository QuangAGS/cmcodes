/**
 * PATH       : src/features/admin/components/OpApprovalPanel.jsx
 * DATETIME   : 2026-08-18T17:45:00+07:00
 * VERSION    : 1.0.0-FE-OP-B2
 * DESCRIPTION:
 * - Danh sách + Duyệt/Từ chối hồ sơ OP (MEMBER_PROMOTE).
 * - API: GET /onboarding/cases/reviewable, POST .../approve | .../reject.
 * - Q1: không dùng UserApprovalForm / auth process-approval.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, RefreshCw, ShieldAlert } from 'lucide-react';

import apiClient from '../../../lib/apiClient.js';

const CASE_STATUS_LABEL = {
  SUBMITTED: 'Chờ xem xét',
  UNDER_REVIEW: 'Đang xem xét',
  NEEDS_REVISION: 'Cần bổ sung',
};

export default function OpApprovalPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/onboarding/cases/reviewable', {
        params: { process_kind: 'MEMBER_PROMOTE' },
      });
      const data = res.data?.data ?? res.data ?? {};
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error('[OpApprovalPanel] list', err?.response?.data || err);
      toast.error(
        err?.response?.data?.message ||
          'Không tải được danh sách hồ sơ xét duyệt.'
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (item) => {
    setBusyId(item.id);
    try {
      await apiClient.post(`/onboarding/cases/${item.id}/approve`, {});
      toast.success(
        item.case_type === 'CLAN_SETUP'
          ? 'Đã duyệt thành lập dòng họ.'
          : 'Đã duyệt thành viên chính thức.'
      );
      await load();
    } catch (err) {
      console.error('[OpApprovalPanel] approve', err?.response?.data || err);
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Không phê duyệt được hồ sơ.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await apiClient.post(`/onboarding/cases/${rejectTarget.id}/reject`, {
        rejectionReason: reason,
      });
      toast.success('Đã từ chối hồ sơ.');
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (err) {
      console.error('[OpApprovalPanel] reject', err?.response?.data || err);
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Không từ chối được hồ sơ.'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6">
      <div className="mx-auto w-full max-w-[480px] px-4">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-600 hover:text-indigo-600"
        >
          <ChevronLeft size={16} /> Quay lại công việc quản trị
        </button>

        <header className="mb-6 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-indigo-600">
            Onboarding
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-800">
            Phê duyệt MEMBER_JOIN (OP)
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-600">
            Duyệt thành viên dự bị thành thành viên chính thức.
          </p>
        </header>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
            <p className="mt-3 text-sm font-bold text-slate-600">Đang tải hồ sơ…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-4 text-sm font-black text-slate-900">
              Không có hồ sơ chờ duyệt
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Khi thành viên gửi duyệt, hồ sơ sẽ hiện tại đây.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const busy = busyId === item.id;
              return (
                <li
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-black text-slate-800">
                        {item.primary?.full_name || 'Chưa có tên'}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {item.user?.phone || item.user?.email || '—'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700">
                      {CASE_STATUS_LABEL[item.status] || item.status}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    {item.case_type === 'CLAN_SETUP'
                      ? 'Thành lập dòng họ'
                      : 'Nhập tộc'}
                    {item.primary?.generation
                      ? ` · Đời ${item.primary.generation}`
                      : ''}
                    {item.primary?.birth_year
                      ? ` · Sinh ${item.primary.birth_year}`
                      : ''}
                  </p>
                  {item.tenant?.name ? (
                    <p className="mt-1 text-xs text-slate-400">{item.tenant.name}</p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleApprove(item)}
                      className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy ? 'Đang xử lý…' : 'Duyệt'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectReason('');
                      }}
                      className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 disabled:opacity-60"
                    >
                      Từ chối
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {rejectTarget ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-[480px] rounded-3xl bg-white p-5 shadow-xl">
              <h2 className="text-base font-black text-slate-800">Từ chối hồ sơ</h2>
              <p className="mt-1 text-sm text-slate-600">
                {rejectTarget.primary?.full_name || 'Thành viên'}
              </p>
              <textarea
                className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-400"
                rows={4}
                placeholder="Lý do từ chối (bắt buộc)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleRejectConfirm}
                  disabled={busyId === rejectTarget.id}
                  className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  Xác nhận từ chối
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectTarget(null);
                    setRejectReason('');
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
