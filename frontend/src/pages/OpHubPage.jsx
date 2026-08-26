/**
 * PATH       : src/pages/OpHubPage.jsx
 * DATETIME   : 2026-08-24T10:45:00+07:00
 * VERSION    : 1.5.0-FOOTER
 * DESCRIPTION:
 * - Hub /op dong: mac dinh chi viec can quan tam; toggle Hien ca viec da xong.
 * - TenantHeader + AppFooterNav.
 * - Elder: tach voice — huong dan / yeu cau admin / trang thai (chi khi bam).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';

import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';

import {
  labelFields,
  labelEnum,
} from '../features/onboarding/constants/opFieldLabels.js';
import {
  OP_HUB_AUDIO_HELP,
  OP_HUB_WELCOME,
  buildProcessStatusMessage,
} from '../features/onboarding/constants/opMessages.js';
import {
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
  OP_WORK_ITEMS,
  OP_WORK_ITEM_IDS,
} from '../features/onboarding/constants/opWorkItems.js';

const SHOW_ALL_KEY = 'op_hub_show_all_work';

function getSubtitle(user, primary) {
  return (
    user?.phone ||
    user?.email ||
    primary?.full_name ||
    user?.name ||
    'Thành viên'
  );
}

function isActionableStatus(status) {
  return [
    'DRAFT',
    'NEEDS_REVISION',
    'SUBMITTED',
    'UNDER_REVIEW',
    'REJECTED',
  ].includes(status);
}

function statusBadgeForItem(itemId, data) {
  if (itemId !== OP_WORK_ITEM_IDS.BASE_PROFILE) return '—';
  const st = data?.case?.status;
  if (st === 'NEEDS_REVISION') return 'Cần bổ sung theo yêu cầu';
  if (st === 'REJECTED') {
    return data?.case?.reopenable
      ? 'Bị từ chối — chờ ban quản trị mở lại'
      : 'Bị từ chối lần cuối';
  }
  if (st === 'SUBMITTED' || st === 'UNDER_REVIEW') return 'Đang chờ duyệt';
  if (st === 'APPROVED') return 'Đã duyệt';
  if (data?.completeness?.complete) return 'Đã đủ thông tin bắt buộc';
  return 'Cần bổ sung';
}

function howToGuidanceText(completeness, missingLabels) {
  if (completeness?.complete) {
    return 'Hồ sơ cơ bản đã đủ thông tin bắt buộc. Bạn có thể xem lại hoặc chỉnh sửa rồi gửi duyệt nếu chưa gửi.';
  }
  const missing =
    missingLabels?.length > 0
      ? `Còn thiếu: ${missingLabels.join(', ')}. `
      : '';
  return `${missing}Bấm Thực hiện để điền họ tên, giới tính, ngày sinh và đời thứ mấy. Có thể Lưu nháp rồi Gửi duyệt khi đã đủ.`;
}

function shortStatusLine(caseStatus, profileComplete, adminNotes) {
  if (caseStatus === 'NEEDS_REVISION') {
    return adminNotes.revision_request
      ? 'Ban quản trị yêu cầu bổ sung (chi tiết bên dưới).'
      : 'Ban quản trị yêu cầu bổ sung hồ sơ.';
  }
  if (caseStatus === 'REJECTED') {
    return adminNotes.reopenable
      ? 'Hồ sơ bị từ chối tạm thời — vui lòng chờ ban quản trị mở lại.'
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
  const [showAll, setShowAll] = useState(() => {
    try {
      return localStorage.getItem(SHOW_ALL_KEY) === '1';
    } catch {
      return false;
    }
  });

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
  const footerNav = resolveFooterNav(user, { pageKey: 'op-hub' });

  const toggleShowAll = () => {
    setShowAll((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_ALL_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const caseStatus = data?.case?.status ?? null;
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

  const processMessage = useMemo(
    () => buildProcessStatusMessage(caseStatus, profileComplete, adminNotes),
    [caseStatus, profileComplete, adminNotes]
  );

  const howToText = useMemo(
    () => howToGuidanceText(data?.completeness, missingLabels),
    [data?.completeness, missingLabels]
  );

  const sessionTenant = useMemo(
    () => resolveTenant(user, data?.tenant),
    [user, data?.tenant]
  );

  const subtitle = getSubtitle(user, data?.primary);
  const shortLine = shortStatusLine(caseStatus, profileComplete, adminNotes);
  const canOpenForm =
    caseStatus === 'DRAFT' || caseStatus === 'NEEDS_REVISION';

  const visibleItems = useMemo(() => {
    if (showAll) return OP_WORK_ITEMS;
    if (!caseStatus || isActionableStatus(caseStatus)) {
      return OP_WORK_ITEMS.filter(
        (it) => it.id === OP_WORK_ITEM_IDS.BASE_PROFILE
      );
    }
    return [];
  }, [showAll, caseStatus]);

  const allDone =
    !loadError &&
    caseStatus === 'APPROVED' &&
    !showAll &&
    visibleItems.length === 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans text-slate-500">
        Đang tải danh mục công việc...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader tenant={sessionTenant} subtitle={subtitle} />

        <div className="px-4 py-6">
          <header className="mb-4 text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-800">
              Danh mục loại công việc
            </h1>
          </header>

          <div className="mb-4 space-y-3">
            <AudioHelpButton
              text={OP_HUB_AUDIO_HELP}
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

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={showAll}
                onChange={toggleShowAll}
              />
              Hiện cả việc đã xong
            </label>
          </div>

          {allDone ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <p className="text-sm font-bold text-emerald-900">
                Bạn đã hoàn thành các việc onboarding cần thiết.
              </p>
              <div className="mt-3 flex justify-center">
                <ZoneVoiceButton
                  visible
                  text="Bạn đã hoàn thành các việc onboarding cần thiết. Bạn có thể về trang chủ hoặc xem cây gia phả."
                  label="Nghe trạng thái"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {visibleItems.map((item) => {
              const expanded = expandedId === item.id;
              const isBp = item.id === OP_WORK_ITEM_IDS.BASE_PROFILE;
              const badge = statusBadgeForItem(item.id, data);
              const doneOnly = isBp && caseStatus === 'APPROVED' && showAll;

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

                  {expanded && isBp && (
                    <div className="space-y-3 border-t border-indigo-100/80 px-5 pb-5 pt-3">
                      <ZoneVoiceButton
                        visible
                        text={howToText}
                        label="Nghe hướng dẫn thực hiện"
                      />

                      {shortLine ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-700">
                            {shortLine}
                          </p>
                          <ZoneVoiceButton
                            visible
                            text={processMessage || shortLine}
                            label="Nghe trạng thái hồ sơ"
                          />
                        </div>
                      ) : null}

                      {caseStatus === 'NEEDS_REVISION' &&
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
                            <div className="mt-2">
                              <ZoneVoiceButton
                                visible
                                text={[
                                  adminNotes.revision_request,
                                  adminNotes.review_note
                                    ? `Ghi chú: ${adminNotes.review_note}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join('. ')}
                                label="Nghe yêu cầu quản trị"
                              />
                            </div>
                          </div>
                        )}

                      {caseStatus === 'REJECTED' &&
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
                            <div className="mt-2">
                              <ZoneVoiceButton
                                visible
                                text={adminNotes.rejection_reason}
                                label="Nghe lý do từ chối"
                              />
                            </div>
                          </div>
                        )}

                      {caseStatus === 'DRAFT' &&
                        !profileComplete &&
                        missingLabels.length > 0 && (
                          <p className="text-xs text-slate-500">
                            Còn thiếu: {missingLabels.join(', ')}.
                          </p>
                        )}

                      {canOpenForm && item.path && !doneOnly && (
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

          {caseStatusLabel && !loadError ? (
            <p className="mt-4 px-1 text-center text-xs font-medium text-slate-400">
              Trạng thái: {caseStatusLabel}
            </p>
          ) : null}

          <AppFooterNav
            {...footerNav}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </div>
  );
}
