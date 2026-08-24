/**
 * PATH       : src/pages/OpHubPage.jsx
 * DATETIME   : 2026-08-23T17:05:00+07:00
 * VERSION    : 1.2.0-FE-OP-B3-UX
 * DESCRIPTION:
 * - Hub /op: Danh mục loại công việc (member DU_BI / hasOpen).
 * - UX: thông báo admin (revision / reject) nằm TRONG card nhóm việc BP.
 * - Text hướng dẫn dài chỉ phát qua ZoneVoiceButton (tiết kiệm diện tích).
 * - Banner trang tối giản; AudioHelp toàn trang giữ nguyên.
 * - Soft-reject: nút Mở lại trong card BP.
 * - Q1: không đụng RP / admin.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';

import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';

import {
  labelFields,
  labelEnum,
} from '../features/onboarding/constants/opFieldLabels.js';
import {
  OP_HUB_AUDIO_HELP,
  OP_HUB_WELCOME,
  buildProcessStatusMessage,
  buildBaseProfileGuidance,
  OP_BASE_PROFILE_TOAST,
} from '../features/onboarding/constants/opMessages.js';
import {
  OP_WORK_ITEMS,
  OP_WORK_ITEM_IDS,
} from '../features/onboarding/constants/opWorkItems.js';

function getSubtitle(user, primary) {
  return (
    user?.phone ||
    user?.email ||
    primary?.full_name ||
    user?.name ||
    'Thành viên'
  );
}

/** Badge ngắn trên hàng tiêu đề card (luôn thấy, kể cả khi thu gọn) */
function statusBadgeForItem(itemId, data) {
  if (itemId !== OP_WORK_ITEM_IDS.BASE_PROFILE) return '—';
  const st = data?.case?.status;
  if (st === 'NEEDS_REVISION') return 'Cần bổ sung theo yêu cầu';
  if (st === 'REJECTED') {
    return data?.case?.reopenable ? 'Bị từ chối — có thể mở lại' : 'Bị từ chối';
  }
  if (st === 'SUBMITTED' || st === 'UNDER_REVIEW') return 'Đang chờ duyệt';
  if (st === 'APPROVED') return 'Đã duyệt';
  if (data?.completeness?.complete) return 'Đã đủ thông tin bắt buộc';
  return 'Cần bổ sung';
}

/** 1 dòng tóm tắt trong card khi mở — không phải đoạn dài */
function shortStatusLine(caseStatus, profileComplete, adminNotes) {
  if (caseStatus === 'NEEDS_REVISION') {
    return adminNotes.revision_request
      ? 'Ban quản trị yêu cầu bổ sung (chi tiết bên dưới).'
      : 'Ban quản trị yêu cầu bổ sung hồ sơ.';
  }
  if (caseStatus === 'REJECTED') {
    return adminNotes.reopenable
      ? 'Hồ sơ bị từ chối — bạn có thể mở lại.'
      : 'Hồ sơ bị từ chối lần cuối.';
  }
  if (caseStatus === 'SUBMITTED' || caseStatus === 'UNDER_REVIEW') {
    return 'Đang chờ ban quản trị xem xét.';
  }
  if (caseStatus === 'DRAFT') {
    return profileComplete
      ? 'Đã đủ thông tin bắt buộc — có thể gửi duyệt.'
      : 'Chưa đủ thông tin bắt buộc.';
  }
  if (caseStatus === 'APPROVED') return 'Đã được duyệt.';
  return '';
}

export default function OpHubPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expandedId, setExpandedId] = useState(OP_WORK_ITEM_IDS.BASE_PROFILE);
  const [reopenBusy, setReopenBusy] = useState(false);

  const fetchMyOp = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.get('/onboarding/my-op');
      const payload = res.data?.data ?? res.data ?? null;
      setData(payload);
    } catch (err) {
      setData(null);
      setLoadError(
        err?.response?.status === 401
          ? 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
          : 'Không tải được danh mục công việc. Vui lòng thử lại.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyOp();
  }, [fetchMyOp]);

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  const caseStatus = data?.case?.status ?? null;
  const caseId = data?.case?.id ?? null;
  const profileComplete = data?.completeness?.complete === true;
  const missingKeys = data?.completeness?.missingFields || [];
  const missingLabels = useMemo(
    () => labelFields(missingKeys, 'members'),
    [missingKeys]
  );

  const adminNotes = useMemo(
    () => ({
      revision_request: data?.case?.revision_request ?? null,
      review_note: data?.case?.review_note ?? null,
      rejection_reason: data?.case?.rejection_reason ?? null,
      reopenable: data?.case?.reopenable === true,
    }),
    [data?.case]
  );

  const caseStatusLabel = caseStatus
    ? labelEnum('case_status', caseStatus)
    : '';

  /** Full text chỉ để ZoneVoiceButton đọc — không render dài trên UI */
  const baseProfileVoiceText = useMemo(() => {
    const process = buildProcessStatusMessage(
      caseStatus,
      profileComplete,
      adminNotes
    );
    const guidance = buildBaseProfileGuidance(
      data?.completeness,
      missingLabels,
      caseStatusLabel || caseStatus,
      adminNotes
    );
    return [process, guidance].filter(Boolean).join(' ');
  }, [
    caseStatus,
    profileComplete,
    adminNotes,
    data?.completeness,
    missingLabels,
    caseStatusLabel,
  ]);

  const audioHelpText = useMemo(() => {
    if (adminNotes.revision_request) {
      return `${OP_HUB_AUDIO_HELP} Có yêu cầu bổ sung từ ban quản trị trong mục Hồ sơ cơ sở.`;
    }
    if (adminNotes.rejection_reason) {
      return `${OP_HUB_AUDIO_HELP} Hồ sơ có quyết định từ chối — xem trong mục Hồ sơ cơ sở.`;
    }
    return OP_HUB_AUDIO_HELP;
  }, [adminNotes.revision_request, adminNotes.rejection_reason]);

  const subtitle = getSubtitle(user, data?.primary);
  const shortLine = shortStatusLine(caseStatus, profileComplete, adminNotes);

  const canOpenForm =
    caseStatus !== 'SUBMITTED' &&
    caseStatus !== 'UNDER_REVIEW' &&
    !(caseStatus === 'REJECTED' && !adminNotes.reopenable) &&
    caseStatus !== 'APPROVED';

  const handleReopen = async () => {
    if (!caseId || reopenBusy) return;
    setReopenBusy(true);
    try {
      await apiClient.post(`/onboarding/cases/${caseId}/reopen`, {});
      toast.success(OP_BASE_PROFILE_TOAST.reopened);
      await fetchMyOp();
    } catch (err) {
      console.error('[OpHubPage] reopen', err?.response?.data || err);
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          OP_BASE_PROFILE_TOAST.reopenFailed
      );
    } finally {
      setReopenBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans text-slate-500">
        Đang tải danh mục công việc...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-[480px]">
        <header className="mb-5 text-center">
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Danh mục loại công việc
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{subtitle}</span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 text-sm font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            Đăng xuất
          </button>
        </header>

        <div className="mb-5 space-y-3">
          <AudioHelpButton
            text={audioHelpText}
            label="Nghe hướng dẫn trang"
            size="md"
          />

          {loadError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-medium text-rose-800">
              {loadError}
            </p>
          ) : (
            <p className="px-1 text-center text-sm text-slate-600">
              {OP_HUB_WELCOME}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {OP_WORK_ITEMS.map((item) => {
            const expanded = expandedId === item.id;
            const isBp = item.id === OP_WORK_ITEM_IDS.BASE_PROFILE;
            const badge = statusBadgeForItem(item.id, data);

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-3xl border shadow-sm ${
                  item.primary
                    ? 'border-indigo-200 bg-indigo-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === item.id ? null : item.id
                    )
                  }
                  className="flex w-full items-center gap-3 p-5 text-left transition active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800">{item.title}</div>
                    <div className="mt-0.5 text-sm text-slate-500">{badge}</div>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                  )}
                </button>

                {expanded && (
                  <div className="space-y-3 border-t border-indigo-100/80 px-5 pb-5 pt-3">
                    {isBp && shortLine ? (
                      <p className="text-sm font-medium text-slate-700">
                        {shortLine}
                      </p>
                    ) : null}

                    {isBp &&
                      caseStatus === 'NEEDS_REVISION' &&
                      adminNotes.revision_request && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left">
                          <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
                            Yêu cầu từ ban quản trị
                          </p>
                          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-amber-950">
                            {adminNotes.revision_request}
                          </p>
                          {adminNotes.review_note ? (
                            <p className="mt-1.5 text-xs text-amber-800/80">
                              Ghi chú: {adminNotes.review_note}
                            </p>
                          ) : null}
                        </div>
                      )}

                    {isBp &&
                      caseStatus === 'REJECTED' &&
                      adminNotes.rejection_reason && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-left">
                          <p className="text-[10px] font-black uppercase tracking-wide text-rose-800">
                            {adminNotes.reopenable
                              ? 'Lý do từ chối'
                              : 'Từ chối lần cuối'}
                          </p>
                          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-rose-950">
                            {adminNotes.rejection_reason}
                          </p>
                        </div>
                      )}

                    {isBp &&
                      caseStatus === 'DRAFT' &&
                      !profileComplete &&
                      missingLabels.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Còn thiếu: {missingLabels.join(', ')}.
                        </p>
                      )}

                    {isBp && baseProfileVoiceText ? (
                      <ZoneVoiceButton
                        visible
                        text={baseProfileVoiceText}
                        label="Nghe hướng dẫn việc này"
                      />
                    ) : null}

                    {isBp &&
                      caseStatus === 'REJECTED' &&
                      adminNotes.reopenable && (
                        <button
                          type="button"
                          disabled={reopenBusy}
                          onClick={handleReopen}
                          className="w-full rounded-2xl bg-rose-600 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {reopenBusy
                            ? 'Đang mở lại…'
                            : 'Mở lại hồ sơ để bổ sung'}
                        </button>
                      )}

                    {isBp && canOpenForm && item.path && (
                      <Link
                        to={item.path}
                        className="flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98]"
                      >
                        Thực hiện
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 space-y-3 pb-6 text-center text-sm">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="font-semibold text-slate-500 underline-offset-2 hover:underline"
          >
            Trang chủ
          </button>
          <div>
            <button
              type="button"
              onClick={handleLogout}
              className="font-semibold text-slate-400 underline-offset-2 hover:underline"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
