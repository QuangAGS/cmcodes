/**
 * PATH       : src/pages/OpCaseDetailPage.jsx
 * DATETIME   : 2026-08-23T18:10:00+07:00
 * VERSION    : 1.2.0-FOOTER
 * DESCRIPTION:
 * - Chi tiết case OP: BP read-only + trao đổi admin + sticky actions.
 * - Modal: Duyệt (reviewNote) / Trả sửa / Từ chối soft|final.
 * - TenantHeader = tenant của case (không nhánh role).
 * - Route: /admin/approval/op/:caseId
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

import apiClient from '../lib/apiClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { labelEnum } from '../features/onboarding/constants/opFieldLabels.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

const emptyForm = () => ({
  note: '',
  revisionRequest: '',
  finalReject: false,
});

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}

export default function OpCaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };
  const footerNav = resolveFooterNav(user, { pageKey: 'admin-op-detail' });

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      // Dùng reviewable list filter client-side; ưu tiên nếu sau này có GET /cases/:id
      // Phải gồm REJECTED / NEEDS_REVISION — default API chỉ SUBMITTED,UNDER_REVIEW
      const res = await apiClient.get('/onboarding/cases/reviewable', {
        params: {
          process_kind: 'MEMBER_PROMOTE',
          page_size: 100,
          status: 'SUBMITTED,UNDER_REVIEW,NEEDS_REVISION,REJECTED',
        },
      });
      const data = res.data?.data ?? res.data ?? {};
      const items = Array.isArray(data.items) ? data.items : [];
      const found = items.find((x) => x.id === caseId) || null;
      setItem(found);
      if (!found) {
        toast.error('Không tìm thấy hồ sơ trong hàng đợi xét duyệt.');
      }
    } catch (err) {
      console.error('[OpCaseDetailPage] load', err?.response?.data || err);
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Không tải được hồ sơ.'
      );
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ưu tiên tenant của case; bổ sung slogan/icon từ session user nếu list API thiếu
  const headerTenant = useMemo(
    () => resolveTenant(user, item?.tenant),
    [user, item?.tenant]
  );

  const openModal = (mode) => {
    setForm(emptyForm());
    setModal(mode);
  };

  const errMsg = (err) =>
    err?.response?.data?.message ||
    err?.response?.data?.error?.message ||
    null;

  const handleAdminReopen = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/reopen`, {
        note: 'Admin mở lại hồ sơ',
      });
      toast.success('Đã mở lại hồ sơ — member có thể bổ sung và gửi duyệt.');
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      toast.error(errMsg(err) || 'Không mở lại được hồ sơ.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    const note = form.note.trim();
    if (!note) {
      toast.error('Vui lòng nhập ghi chú phê duyệt.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/approve`, {
        reviewNote: note,
      });
      toast.success('Đã phê duyệt hồ sơ.');
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      toast.error(errMsg(err) || 'Không phê duyệt được.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevision = async () => {
    const revisionRequest = form.revisionRequest.trim();
    const note = form.note.trim();
    if (!revisionRequest) {
      toast.error('Vui lòng nhập nội dung yêu cầu bổ sung.');
      return;
    }
    if (!note) {
      toast.error('Vui lòng nhập ghi chú.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/revision`, {
        revisionRequest,
        note,
      });
      toast.success('Đã gửi yêu cầu bổ sung.');
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      toast.error(errMsg(err) || 'Không gửi được yêu cầu.');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    const reason = form.note.trim();
    if (!reason) {
      toast.error('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/reject`, {
        rejectionReason: reason,
        note: reason,
        finalReject: !!form.finalReject,
      });
      toast.success(
        form.finalReject
          ? 'Đã từ chối lần cuối.'
          : 'Đã từ chối (member có thể mở lại).'
      );
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      toast.error(errMsg(err) || 'Không từ chối được.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-10 text-center">
        <p className="text-sm font-bold text-slate-700">Không có dữ liệu hồ sơ.</p>
        <button
          type="button"
          className="mt-4 font-bold text-indigo-700"
          onClick={() => navigate('/admin/approval?process=OP')}
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const p = item.primary || {};

  return (
    <div className="min-h-screen bg-slate-50 pb-36">
      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader
          tenant={headerTenant}
          subtitle={
            item.case_type === 'CLAN_SETUP'
              ? 'Thành lập dòng họ'
              : 'Nhập tộc · MEMBER_PROMOTE'
          }
        />

        <div className="px-4 py-5">
          {footerNav.backTo ? (
            <button
              type="button"
              onClick={() => navigate(footerNav.backTo)}
              className="mb-3 text-sm font-bold text-indigo-700"
            >
              ← Quay lại
            </button>
          ) : null}
          <h1 className="text-xl font-black text-slate-800">
            {p.full_name || 'Hồ sơ thành viên'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {item.user?.phone || item.user?.email || '—'} · {labelEnum('case_status', item.status) || item.status}
          </p>

          {/* BP */}
          <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">
              Hồ sơ cơ sở
            </h2>
            <div className="mt-1">
              <Field label="Họ tên" value={p.full_name} />
              <Field label="Giới tính" value={labelEnum('members_gender', p.gender)} />
              <Field
                label="Ngày sinh"
                value={
                  p.birth_year
                    ? [p.birth_day, p.birth_month, p.birth_year]
                        .filter((x) => x != null)
                        .join('/')
                    : null
                }
              />
              <Field
                label="Đời thứ"
                value={p.generation != null ? String(p.generation) : null}
              />
              <Field label="Trạng thái thành viên" value={labelEnum('members_status', p.status)} />
            </div>
          </section>

          {/* Trao đổi — chỗ admin nhớ yêu cầu */}
          <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">
              Trao đổi / ghi chú
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {item.revision_request ||
                item.review_note ||
                item.rejection_reason ||
                'Chưa có yêu cầu bổ sung hay lý do từ chối trên hồ sơ này.'}
            </p>
            {item.submitted_at ? (
              <p className="mt-2 text-xs text-slate-400">
                Gửi duyệt: {new Date(item.submitted_at).toLocaleString('vi-VN')}
              </p>
            ) : null}
          </section>

          <AppFooterNav
            {...footerNav}
            onLogout={handleLogout}
          />
        </div>

        {/* Sticky actions */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-[480px] flex-col gap-2">
            {item.status !== 'REJECTED' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => openModal('approve')}
                className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                Duyệt
              </button>
            ) : null}
            {item.status === 'REJECTED' ? (
              item.reopenable === true ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAdminReopen}
                  className="w-full rounded-2xl bg-amber-600 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  Cho phép mở lại hồ sơ
                </button>
              ) : (
                <p className="text-center text-xs font-semibold text-rose-600">
                  Từ chối lần cuối — không mở lại được.
                </p>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openModal('revision')}
                  className="rounded-2xl border border-amber-200 bg-amber-50 py-3 text-sm font-bold text-amber-900 disabled:opacity-60"
                >
                  Trả sửa
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openModal('reject')}
                  className="rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-700 disabled:opacity-60"
                >
                  Từ chối
                </button>
              </div>
            )}
          </div>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-[480px] rounded-3xl bg-white p-5 shadow-xl">
              {modal === 'approve' && (
                <>
                  <h2 className="text-base font-black text-slate-800">
                    Phê duyệt
                  </h2>
                  <textarea
                    className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                    rows={3}
                    placeholder="Ghi chú phê duyệt (bắt buộc)"
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleApprove}
                    className="mt-3 w-full rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white"
                  >
                    Xác nhận duyệt
                  </button>
                </>
              )}
              {modal === 'revision' && (
                <>
                  <h2 className="text-base font-black text-slate-800">
                    Yêu cầu bổ sung
                  </h2>
                  <textarea
                    className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                    rows={3}
                    placeholder="Nội dung cần bổ sung (bắt buộc)"
                    value={form.revisionRequest}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        revisionRequest: e.target.value,
                      }))
                    }
                  />
                  <textarea
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                    rows={2}
                    placeholder="Ghi chú (bắt buộc)"
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRevision}
                    className="mt-3 w-full rounded-2xl bg-amber-600 py-3 text-sm font-bold text-white"
                  >
                    Gửi yêu cầu
                  </button>
                </>
              )}
              {modal === 'reject' && (
                <>
                  <h2 className="text-base font-black text-slate-800">
                    Từ chối
                  </h2>
                  <textarea
                    className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                    rows={3}
                    placeholder="Lý do từ chối (bắt buộc)"
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.finalReject}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          finalReject: e.target.checked,
                        }))
                      }
                    />
                    <span>Từ chối lần cuối (không mở lại)</span>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleReject}
                    className="mt-3 w-full rounded-2xl bg-rose-600 py-3 text-sm font-bold text-white"
                  >
                    Xác nhận từ chối
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
                className="mt-2 w-full rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
