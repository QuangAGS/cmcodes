/**
 * PATH       : src/pages/OpCaseDetailPage.jsx
 * DATETIME   : 2026-11-20T07:18:00+07:00
 * VERSION    : 1.4.0-PHASE2-SPRINT-FE4
 * DESCRIPTION:
 * - Chi tiết case OP (MEMBER_PROMOTE): BP read-only + trao đổi admin + sticky actions.
 * - Modal: Duyệt (reviewNote) / Trả sửa / Từ chối soft|final (xác nhận 2 bước).
 * - TenantHeader = tenant của case (không nhánh role).
 * - Route: /admin/approval/op/:caseId
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-4]:
 *   + Ẩn liên kết tệp tạm R2 khi hồ sơ EXPIRED hoặc CANCELLED, thay thế bằng
 *     "Tệp minh chứng nháp đã được dọn dẹp (Tệp nháp đã bị xóa)." [ARCH-05, TC-FE-16].
 *   + Hiển thị Checksum Nội quy & trạng thái cam kết nội quy [FUNC-11].
 *   + Cảnh báo Khóa QA (3 lần sai) & nút Mở khóa QA 1 lần/case [FUNC-03, FUNC-08].
 *   + Bắt 400 REFERRER_DECEASED: hiện PersistentMessageBanner dạng modal
 *     "Hồ sơ lùi về NEEDS_REVISION" và gọi lại API refetch (load()) [FUNC-02, TC-FE-02].
 *   + Bắt 409 CONCURRENT_TRANSACTION_LOCKED: giữ nguyên dữ liệu trong modal form
 *     (Keep State) và hiện nút "Thử lại ngay" [ARCH-01, ARCH-04, TC-FE-14].
 *   + Gắn AudioHelpButton và ZoneVoiceButton cho Admin [NFR-FE-02, TC-FE-18].
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-23T18:10:00+07:00 (v1.2.0-FOOTER): Hoàn thiện modal 4 hành động OP.
 * - 2026-11-13T11:20:00+07:00 (v1.3.0-MULTIHOME-AMEND02-V15-LAT4):
 *   + Thêm nhãn loại hồ sơ OP và xác nhận 2 bước khi chọn Từ chối lần cuối.
 * - 2026-11-20T07:18:00+07:00 (v1.4.0-PHASE2-SPRINT-FE4):
 *   + Triển khai đầy đủ các tiêu chí Sprint FE-4 ISO 29148.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, ExternalLink, Lock, ShieldCheck } from 'lucide-react';

import apiClient from '../lib/apiClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { labelEnum } from '../features/onboarding/constants/opFieldLabels.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import PersistentMessageBanner from '../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../components/common/BlockingLoadingOverlay.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import { extractApiErrorInfo } from '../shared/hooks/useTurnstileFailClosed.js';

const emptyForm = () => ({
  note: '',
  revisionRequest: '',
  finalReject: false,
  confirmFinalStep2: false,
});

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2 text-base">
      <span className="text-slate-600">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

/**
 * Tính mã kiểm tra toàn vẹn (checksum hiển thị) cho bản cam kết nội quy [FUNC-11]
 */
function resolveRulesChecksum(item) {
  const meta =
    item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const explicitChecksum =
    item?.agreed_rules_checksum ||
    item?.rules_checksum ||
    meta.agreed_rules_checksum ||
    meta.rules_checksum ||
    '';
  if (explicitChecksum) {
    return String(explicitChecksum);
  }
  const snapshot =
    item?.agreed_rules_snapshot ||
    meta.agreed_rules_snapshot ||
    '';
  if (!snapshot) return '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < snapshot.length; i += 1) {
    hash ^= snapshot.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `FNV1A-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')} (${snapshot.length} ký tự)`;
}

/**
 * Trích xuất danh sách tệp minh chứng nháp R2 trên hồ sơ [ARCH-05]
 */
function extractStagingFiles(item) {
  const meta =
    item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const rp =
    meta.registration_profile && typeof meta.registration_profile === 'object'
      ? meta.registration_profile
      : {};
  const rawList = [
    ...(Array.isArray(item?.media) ? item.media : []),
    ...(Array.isArray(item?.attachments) ? item.attachments : []),
    ...(Array.isArray(meta.staging_files) ? meta.staging_files : []),
    ...(Array.isArray(rp.proof_documents) ? rp.proof_documents : []),
  ];
  return rawList.filter(Boolean);
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
  const [bannerState, setBannerState] = useState(null);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await apiClient.get('/onboarding/cases/reviewable', {
        params: {
          process_kind: 'MEMBER_PROMOTE',
          page_size: 100,
          status: 'SUBMITTED,UNDER_REVIEW,NEEDS_REVISION,REJECTED,EXPIRED,CANCELLED',
        },
      });
      const data = res.data?.data ?? res.data ?? {};
      const items = Array.isArray(data.items) ? data.items : [];
      const found = items.find((x) => x.id === caseId) || null;
      setItem(found);
      if (!found) {
        setBannerState({
          type: 'warning',
          mode: 'inline',
          title: 'Không tìm thấy hồ sơ',
          message: 'Không tìm thấy hồ sơ trong hàng đợi xét duyệt.',
          correlationId: res.data?._correlationId || 'Không có',
        });
      }
    } catch (err) {
      console.error('[OpCaseDetailPage] load', err?.response?.data || err);
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Không tải được chi tiết hồ sơ',
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
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const headerTenant = useMemo(
    () => resolveTenant(user, item?.tenant),
    [user, item?.tenant]
  );

  const openModal = (mode) => {
    setForm(emptyForm());
    setBannerState(null);
    setModal(mode);
  };

  /**
   * [FUNC-03, FUNC-08] Mở khóa QA (chỉ gọi được tối đa 1 lần/case)
   */
  const handleUnlockQa = async () => {
    if (!caseId || busy) return;
    setBusy(true);
    setBannerState(null);
    try {
      const res = await apiClient.post(`/onboarding/cases/${caseId}/unlock-qa`, {
        note: 'Ban Quản trị mở khóa câu hỏi bảo mật',
      });
      setBannerState({
        type: 'success',
        mode: 'inline',
        title: 'Đã mở khóa câu hỏi bảo mật (QA)',
        message:
          'Người xin gia nhập đã được cấp lại quyền trả lời câu hỏi bảo mật (lượt mở khóa duy nhất của hồ sơ).',
        correlationId: res?.data?._correlationId || 'Không có',
      });
      await load();
    } catch (err) {
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title: 'Không thể mở khóa QA',
        message: info.message,
        correlationId: info.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAdminReopen = async () => {
    setBusy(true);
    setBannerState(null);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/reopen`, {
        note: 'Admin mở lại hồ sơ',
      });
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title: 'Không mở lại được hồ sơ',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleAdminReopen()}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    const note = form.note.trim();
    if (!note) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Thiếu ghi chú phê duyệt',
        message: 'Vui lòng nhập ghi chú phê duyệt trước khi xác nhận.',
        correlationId: 'Không có',
      });
      return;
    }
    setBusy(true);
    setBannerState(null);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/approve`, {
        reviewNote: note,
      });
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      const info = extractApiErrorInfo(err);

      // [FUNC-02, TC-FE-02] 400 REFERRER_DECEASED:
      // Hiện PersistentMessageBanner (dạng modal) "Hồ sơ lùi về NEEDS_REVISION" & gọi lại API refetch
      if (info.status === 400 && info.code === 'REFERRER_DECEASED') {
        setModal(null);
        setBannerState({
          type: 'warning',
          mode: 'modal',
          title: 'Hồ sơ lùi về NEEDS_REVISION',
          message: `Hồ sơ lùi về NEEDS_REVISION. ${info.message}`,
          correlationId: info.correlationId,
        });
        await load();
        return;
      }

      // [ARCH-01, ARCH-04, TC-FE-14] 409 CONCURRENT_TRANSACTION_LOCKED:
      // Giữ nguyên form modal (note), tắt loading và hiện nút "Thử lại ngay"
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không phê duyệt được hồ sơ',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleApprove()}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRevision = async () => {
    const revisionRequest = form.revisionRequest.trim();
    const note = form.note.trim();
    if (!revisionRequest) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Thiếu nội dung yêu cầu bổ sung',
        message: 'Vui lòng nhập nội dung yêu cầu bổ sung.',
        correlationId: 'Không có',
      });
      return;
    }
    if (!note) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Thiếu ghi chú',
        message: 'Vui lòng nhập ghi chú.',
        correlationId: 'Không có',
      });
      return;
    }
    setBusy(true);
    setBannerState(null);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/revision`, {
        revisionRequest,
        note,
      });
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      // [ARCH-01, TC-FE-14] Keep State: giữ nguyên revisionRequest và note trong form
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không gửi được yêu cầu bổ sung',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleRevision()}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    const reason = form.note.trim();
    if (!reason) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Thiếu lý do từ chối',
        message: 'Vui lòng nhập lý do từ chối.',
        correlationId: 'Không có',
      });
      return;
    }
    if (form.finalReject && !form.confirmFinalStep2) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Chưa xác nhận bước 2',
        message: 'Vui lòng tích xác nhận bước 2 cho quyết định từ chối lần cuối.',
        correlationId: 'Không có',
      });
      return;
    }
    setBusy(true);
    setBannerState(null);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/reject`, {
        rejectionReason: reason,
        note: reason,
        finalReject: !!form.finalReject,
      });
      navigate('/admin/approval?process=OP', { replace: true });
    } catch (err) {
      // [ARCH-01, TC-FE-14] Keep State: giữ nguyên lý do từ chối và checkbox finalReject
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không từ chối được hồ sơ',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleReject()}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <BlockingLoadingOverlay
          isOpen
          message="Đang tải chi tiết hồ sơ xét duyệt..."
        />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-10 text-center space-y-4">
        {bannerState && (
          <PersistentMessageBanner
            type={bannerState.type}
            mode={bannerState.mode}
            title={bannerState.title}
            message={bannerState.message}
            correlationId={bannerState.correlationId}
            actionButton={bannerState.actionButton}
          />
        )}
        <p className="text-base font-bold text-slate-700">Không có dữ liệu hồ sơ.</p>
        <button
          type="button"
          className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-indigo-600 text-base font-bold text-white"
          onClick={() => navigate('/admin/approval?process=OP')}
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const p = item.primary || {};
  const normalizedStatus = String(item.status || '').toUpperCase();
  // [ARCH-05, TC-FE-16] Ẩn liên kết tệp tạm R2 khi hồ sơ EXPIRED hoặc CANCELLED
  const isTerminalCleanedCase =
    normalizedStatus === 'EXPIRED' || normalizedStatus === 'CANCELLED';
  const stagingFiles = extractStagingFiles(item);
  const rulesChecksum = resolveRulesChecksum(item);
  const isQaLocked = Boolean(
    item.qa_locked === true ||
      item.qaLocked === true ||
      item.metadata?.qa_locked === true
  );
  const qaUnlockUsed = Number(
    item.qa_unlock_count || item.metadata?.qa_unlock_count || 0
  ) >= 1;

  return (
    <div className="min-h-screen bg-slate-50 pb-40">
      {/* Vòng quay chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={busy}
        message="Đang xử lý quyết định xét duyệt hồ sơ..."
      />

      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader
          tenant={headerTenant}
          subtitle={
            item.case_type === 'CLAN_SETUP'
              ? 'Thành lập dòng họ'
              : 'Nhập tộc · MEMBER_PROMOTE'
          }
        />

        <div className="px-4 py-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            {footerNav.backTo ? (
              <button
                type="button"
                onClick={() => navigate(footerNav.backTo)}
                className="min-h-[48px] px-3 text-base font-bold text-indigo-700"
              >
                ← Quay lại
              </button>
            ) : (
              <span />
            )}
            <AudioHelpButton
              text={`Trang chi tiết xét duyệt hồ sơ của ${p.full_name || 'thành viên'}. Bác có thể kiểm tra thông tin cơ sở, mã kiểm tra cam kết nội quy, tệp minh chứng đính kèm và bấm Duyệt, Trả sửa hoặc Từ chối ở thanh cuối màn hình.`}
              label="Nghe hướng dẫn"
              variant="soft"
            />
          </div>

          {/* Banner thông báo nghiệp vụ hợp nhất (inline hoặc modal khi 400 REFERRER_DECEASED) */}
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
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">
              {p.full_name || 'Hồ sơ thành viên'}
            </h1>
            <p className="mt-1 text-base text-slate-600">
              {item.user?.phone || item.user?.email || '—'} ·{' '}
              {labelEnum('case_status', item.status) || item.status}
            </p>
          </div>

          {/* Cảnh báo Khóa QA (3 lần sai) & Nút Mở khóa QA 1 lần/case [FUNC-03, FUNC-08] */}
          {isQaLocked && (
            <section
              role="status"
              data-testid="admin-op-qa-locked-alert"
              className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-base font-black text-amber-950">
                  <Lock size={18} className="text-amber-700" />
                  Khóa QA (3 lần sai) - Chờ duyệt thủ công
                </span>
                <ZoneVoiceButton
                  visible
                  text="Hồ sơ này đã bị khóa câu hỏi bảo mật tự động do trả lời sai 3 lần. Quản trị viên có thể duyệt thủ công hoặc mở khóa QA tối đa 1 lần."
                  label="Nghe"
                />
              </div>
              {!isTerminalCleanedCase && (
                <div>
                  <button
                    type="button"
                    disabled={busy || qaUnlockUsed}
                    onClick={handleUnlockQa}
                    className="min-h-[48px] w-full rounded-2xl bg-amber-700 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-800 disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {qaUnlockUsed
                      ? 'Đã mở khóa QA (Hết lượt)'
                      : 'Mở khóa QA cho thành viên (1 lần)'}
                  </button>
                  {qaUnlockUsed && (
                    <p className="mt-1.5 text-base font-medium text-amber-900">
                      Hồ sơ đã sử dụng lượt mở khóa QA duy nhất.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* BP */}
          <section className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-600">
                Hồ sơ cơ sở
              </h2>
              <ZoneVoiceButton
                visible
                text={`Họ tên: ${p.full_name || 'chưa rõ'}. Giới tính: ${labelEnum('members_gender', p.gender) || 'chưa rõ'}. Đời thứ: ${p.generation ?? 'chưa rõ'}.`}
                label="Nghe"
              />
            </div>
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

          {/* [FUNC-11] Checksum & Cam kết Nội quy dòng họ */}
          <section
            data-testid="rules-checksum-section"
            className="rounded-3xl border border-slate-200 bg-white p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-600">
                <ShieldCheck size={16} className="text-emerald-600" />
                Cam kết nội quy &amp; Checksum
              </h2>
              <ZoneVoiceButton
                visible
                text={
                  rulesChecksum
                    ? `Thành viên đã ký cam kết nội quy dòng họ. Mã kiểm tra toàn vẹn Checksum là ${rulesChecksum}.`
                    : 'Hồ sơ chưa ghi nhận bản cam kết nội quy dòng họ.'
                }
                label="Nghe"
              />
            </div>
            {rulesChecksum ? (
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-3 space-y-1">
                <p className="text-base font-bold text-emerald-950">
                  Đã xác nhận cam kết nội quy
                </p>
                <p className="font-mono text-sm text-emerald-900 break-all">
                  Checksum Nội quy: {rulesChecksum}
                </p>
              </div>
            ) : (
              <p className="text-base text-slate-600">
                Chưa có dữ liệu cam kết nội quy trên hồ sơ này.
              </p>
            )}
          </section>

          {/* [ARCH-05, TC-FE-16] Tệp minh chứng tạm R2: Ẩn link khi EXPIRED / CANCELLED */}
          <section
            data-testid="r2-staging-files-section"
            className="rounded-3xl border border-slate-200 bg-white p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-600">
                <FileText size={16} className="text-indigo-600" />
                Tệp minh chứng đính kèm
              </h2>
              <ZoneVoiceButton
                visible
                text={
                  isTerminalCleanedCase
                    ? 'Hồ sơ đã hết hạn hoặc đã hủy. Tệp minh chứng nháp đã được dọn dẹp.'
                    : stagingFiles.length > 0
                      ? `Có ${stagingFiles.length} tệp minh chứng đính kèm.`
                      : 'Không có tệp minh chứng đính kèm.'
                }
                label="Nghe"
              />
            </div>

            {isTerminalCleanedCase ? (
              <div
                role="status"
                data-testid="r2-cleaned-notice"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-base font-bold text-amber-950"
              >
                Tệp minh chứng nháp đã được dọn dẹp (Tệp nháp đã bị xóa).
              </div>
            ) : stagingFiles.length > 0 ? (
              <ul className="space-y-2">
                {stagingFiles.map((file, index) => {
                  const fileUrl = file.url || file.read_url || file.download_url || '#';
                  const fileName =
                    file.caption || file.file_name || file.name || `Tệp minh chứng #${index + 1}`;
                  return (
                    <li
                      key={file.id || index}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5"
                    >
                      <span className="truncate text-base font-semibold text-slate-800">
                        {fileName}
                      </span>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[48px] shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-base font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        <span>Tải tệp</span>
                        <ExternalLink size={16} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-base text-slate-600">
                Không có tệp minh chứng nháp nào được đính kèm.
              </p>
            )}
          </section>

          {/* Trao đổi */}
          <section className="rounded-3xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-600">
              Trao đổi / ghi chú
            </h2>
            <p className="mt-2 text-base text-slate-700">
              {item.revision_request ||
                item.review_note ||
                item.rejection_reason ||
                'Chưa có yêu cầu bổ sung hay lý do từ chối trên hồ sơ này.'}
            </p>
            {item.submitted_at ? (
              <p className="mt-2 text-sm text-slate-500">
                Gửi duyệt: {new Date(item.submitted_at).toLocaleString('vi-VN')}
              </p>
            ) : null}
          </section>

          <AppFooterNav
            {...footerNav}
            onLogout={handleLogout}
          />
        </div>

        {/* Sticky actions (Ẩn nếu hồ sơ đã EXPIRED hoặc CANCELLED) */}
        {!isTerminalCleanedCase && (
          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
            <div className="mx-auto flex max-w-[480px] flex-col gap-2">
              {item.status !== 'REJECTED' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openModal('approve')}
                  className="min-h-[48px] w-full rounded-2xl bg-indigo-600 py-3 text-base font-bold text-white disabled:opacity-60"
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
                    className="min-h-[48px] w-full rounded-2xl bg-amber-600 py-3 text-base font-bold text-white disabled:opacity-60"
                  >
                    Cho phép mở lại hồ sơ
                  </button>
                ) : (
                  <p className="text-center text-base font-semibold text-rose-600">
                    Từ chối lần cuối — không mở lại được.
                  </p>
                )
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openModal('revision')}
                    className="min-h-[48px] rounded-2xl border border-amber-200 bg-amber-50 py-3 text-base font-bold text-amber-900 disabled:opacity-60"
                  >
                    Trả sửa
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openModal('reject')}
                    className="min-h-[48px] rounded-2xl border border-rose-200 bg-rose-50 py-3 text-base font-bold text-rose-700 disabled:opacity-60"
                  >
                    Từ chối
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-[480px] rounded-3xl bg-white p-5 shadow-xl space-y-3">
              {bannerState && bannerState.mode !== 'modal' && (
                <PersistentMessageBanner
                  type={bannerState.type}
                  title={bannerState.title}
                  message={bannerState.message}
                  correlationId={bannerState.correlationId}
                  actionButton={bannerState.actionButton}
                  onClose={() => setBannerState(null)}
                />
              )}

              {modal === 'approve' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-black text-slate-800">
                      Phê duyệt
                    </h2>
                    <ZoneVoiceButton
                      visible
                      text="Nhập ghi chú phê duyệt rồi bấm Xác nhận duyệt."
                      label="Nghe"
                    />
                  </div>
                  <textarea
                    className="w-full rounded-2xl border border-slate-300 px-3.5 py-3 text-base"
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
                    className="min-h-[48px] w-full rounded-2xl bg-indigo-600 py-3 text-base font-bold text-white"
                  >
                    Xác nhận duyệt
                  </button>
                </>
              )}
              {modal === 'revision' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-black text-slate-800">
                      Yêu cầu bổ sung
                    </h2>
                    <ZoneVoiceButton
                      visible
                      text="Nhập nội dung cần thành viên bổ sung và ghi chú quản trị, sau đó bấm Gửi yêu cầu."
                      label="Nghe"
                    />
                  </div>
                  <textarea
                    className="w-full rounded-2xl border border-slate-300 px-3.5 py-3 text-base"
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
                    className="w-full rounded-2xl border border-slate-300 px-3.5 py-3 text-base"
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
                    className="min-h-[48px] w-full rounded-2xl bg-amber-600 py-3 text-base font-bold text-white"
                  >
                    Gửi yêu cầu
                  </button>
                </>
              )}
              {modal === 'reject' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-black text-slate-800">
                      Từ chối
                    </h2>
                    <ZoneVoiceButton
                      visible
                      text="Nhập lý do từ chối hồ sơ. Nếu chọn từ chối lần cuối, bác cần tích thêm ô xác nhận bước 2."
                      label="Nghe"
                    />
                  </div>
                  <textarea
                    className="w-full rounded-2xl border border-slate-300 px-3.5 py-3 text-base"
                    rows={3}
                    placeholder="Lý do từ chối (bắt buộc)"
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 text-base font-semibold text-rose-800">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={form.finalReject}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            finalReject: e.target.checked,
                            confirmFinalStep2: false,
                          }))
                        }
                      />
                      <span>Từ chối lần cuối (khóa vĩnh viễn, không mở lại)</span>
                    </label>
                    {form.finalReject && (
                      <label className="ml-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-base font-bold text-rose-900">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          checked={form.confirmFinalStep2}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              confirmFinalStep2: e.target.checked,
                            }))
                          }
                        />
                        <span>
                          Bước 2: Tôi xác nhận quyết định từ chối vĩnh viễn là không thể hoàn tác.
                        </span>
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleReject}
                    className="min-h-[48px] w-full rounded-2xl bg-rose-600 py-3 text-base font-bold text-white"
                  >
                    Xác nhận từ chối
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBannerState(null);
                  setModal(null);
                }}
                className="min-h-[48px] w-full rounded-2xl border border-slate-300 py-3 text-base font-semibold text-slate-700"
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
