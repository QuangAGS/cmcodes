/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/MembershipStatusPage.jsx
 * DATETIME    : 2026-11-13T10:00:00+07:00
 * VERSION     : 2.0.0-MULTIHOME-AMEND02-V15-LAT3
 * DESCRIPTION : Màn hình theo dõi trạng thái hồ sơ Multi-Home (C1 & C1-S):
 *               - Hỗ trợ CHO_DUYET, NEEDS_REVISION, TU_CHOI (mở lại),
 *                 TU_CHOI_LAN_CUOI (Hard-lock).
 *               - Nút "Về dòng họ chính" giúp user quay lại họ gốc A (DA_DUYET)
 *                 bất cứ lúc nào qua switchContext.
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { membershipApi } from '../api/membershipApi';
import { getLinkStatusMeta } from '../constants/membershipLabels';

export const MembershipStatusPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeContext, availableClans, switchContext, refreshContext } = useAuth();

  const queryCaseId = searchParams.get('caseId');
  const queryTenantId = searchParams.get('tenantId') || activeContext?.activeTenantId;

  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReopening, setIsReopening] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await membershipApi.getMembershipStatus({
        caseId: queryCaseId,
        tenantId: queryTenantId,
      });
      setStatusData(data?.data || data);
    } catch (err) {
      console.error('Lỗi khi tải trạng thái hồ sơ:', err);
      setError(
        err?.response?.data?.message ||
          'Không thể tải thông tin trạng thái hồ sơ.'
      );
    } finally {
      setLoading(false);
    }
  }, [queryCaseId, queryTenantId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleReopen = async () => {
    const caseId = statusData?.caseId || statusData?.id;
    if (!caseId) {
      alert('Không tìm thấy mã hồ sơ để mở lại.');
      return;
    }
    try {
      setIsReopening(true);
      const res = await membershipApi.reopenCase(caseId);
      const reopenedCaseType = res?.data?.caseType || statusData?.caseType;
      if (typeof refreshContext === 'function') {
        await refreshContext();
      }
      const targetEditRoute =
        reopenedCaseType === 'CLAN_SETUP'
          ? `/membership/setup?caseId=${encodeURIComponent(caseId)}&mode=revision`
          : `/membership/claim?caseId=${encodeURIComponent(caseId)}&mode=revision`;
      navigate(targetEditRoute);
    } catch (err) {
      console.error('Không thể mở lại hồ sơ:', err);
      alert(err?.response?.data?.message || 'Mở lại hồ sơ thất bại.');
    } finally {
      setIsReopening(false);
    }
  };

  const handleBackToDefaultClan = async () => {
    const defaultApprovedClan = (availableClans || []).find(
      (c) => c.status === 'DA_DUYET' && (c.isDefault || c.tenantId !== statusData?.tenantId)
    );
    if (
      defaultApprovedClan &&
      defaultApprovedClan.tenantId !== activeContext?.activeTenantId
    ) {
      await switchContext(defaultApprovedClan.tenantId, '/op');
      return;
    }
    navigate('/op');
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-lg font-medium text-gray-700">
          Đang kiểm tra tiến trình hồ sơ...
        </p>
      </div>
    );
  }

  if (error || !statusData) {
    return (
      <div className="mx-auto my-12 max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h2 className="mb-2 text-xl font-bold text-gray-900">
          {error ? 'Đã xảy ra sự cố' : 'Chưa có hồ sơ chờ duyệt'}
        </h2>
        <p className="mb-6 text-gray-600">
          {error || 'Hiện không có hồ sơ gia nhập hoặc lập dòng họ nào đang chờ xử lý.'}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={loadStatus}
            className="min-h-[48px] rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Thử lại
          </button>
          <button
            type="button"
            onClick={handleBackToDefaultClan}
            className="min-h-[48px] rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-800 hover:bg-gray-200"
          >
            Về dòng họ chính
          </button>
        </div>
      </div>
    );
  }

  const currentStatusCode = statusData?.isFinalRejection
    ? 'TU_CHOI_LAN_CUOI'
    : statusData?.status || 'CHO_DUYET';

  const statusMeta = getLinkStatusMeta(currentStatusCode);
  const isClanSetup = statusData?.caseType === 'CLAN_SETUP';
  const editRoute = isClanSetup
    ? `/membership/setup?caseId=${encodeURIComponent(statusData?.caseId || statusData?.id)}&mode=revision`
    : `/membership/claim?caseId=${encodeURIComponent(statusData?.caseId || statusData?.id)}&mode=revision`;

  return (
    <div className="mx-auto my-10 max-w-2xl rounded-3xl border border-gray-200 bg-white p-6 shadow-lg sm:p-8">
      <div className="border-b border-gray-100 pb-6 text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          {isClanSetup
            ? 'Tiến trình hồ sơ thành lập dòng họ mới'
            : 'Tiến trình hồ sơ gia nhập dòng họ'}
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-900 sm:text-3xl">
          {statusData?.tenantName || 'Dòng họ'}
        </h1>
        <div className="mt-4 inline-flex items-center gap-2">
          <span
            className={`rounded-full border px-4 py-1.5 text-sm font-bold ${statusMeta.badgeClass}`}
          >
            {statusMeta.label}
          </span>
        </div>
      </div>

      <div className="space-y-4 py-6">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-base leading-relaxed text-gray-700">
          {statusMeta.message}
        </div>

        {currentStatusCode === 'NEEDS_REVISION' && statusData?.revisionRequest && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <h3 className="text-base font-bold text-amber-900">
              Lời nhắn từ Ban Quản trị:
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-base font-medium text-amber-950">
              {statusData.revisionRequest}
            </p>
          </div>
        )}

        {(currentStatusCode === 'TU_CHOI' ||
          currentStatusCode === 'TU_CHOI_LAN_CUOI') &&
          statusData?.reviewNote && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h3 className="text-base font-bold text-red-900">Lý do từ chối:</h3>
              <p className="mt-1 whitespace-pre-wrap text-base text-red-800">
                {statusData.reviewNote}
              </p>
            </div>
          )}

        <div className="pt-2 text-center text-xs text-gray-500">
          Hồ sơ nộp ngày:{' '}
          {statusData?.submittedAt
            ? new Date(statusData.submittedAt).toLocaleDateString('vi-VN')
            : 'Mới cập nhật'}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 pt-6">
        {currentStatusCode === 'NEEDS_REVISION' && (
          <button
            type="button"
            onClick={() => navigate(editRoute)}
            className="min-h-[48px] w-full rounded-2xl bg-amber-600 px-6 py-3.5 text-lg font-bold text-white shadow-md hover:bg-amber-700"
          >
            Chỉnh sửa & Bổ sung thông tin ngay
          </button>
        )}

        {currentStatusCode === 'TU_CHOI' && (
          <button
            type="button"
            disabled={isReopening}
            onClick={handleReopen}
            className="min-h-[48px] w-full rounded-2xl bg-blue-600 px-6 py-3.5 text-lg font-bold text-white shadow-md hover:bg-blue-700"
          >
            {isReopening ? 'Đang mở lại hồ sơ...' : 'Nộp lại hồ sơ xác thực mới'}
          </button>
        )}

        {currentStatusCode === 'TU_CHOI_LAN_CUOI' && (
          <div className="rounded-2xl bg-gray-100 p-4 text-center text-sm font-semibold text-gray-700">
            Hồ sơ đã đóng vĩnh viễn. Không thể sửa hoặc nộp lại.
          </div>
        )}

        <button
          type="button"
          onClick={handleBackToDefaultClan}
          className="min-h-[48px] w-full rounded-2xl bg-gray-100 px-6 py-3 font-semibold text-gray-800 hover:bg-gray-200"
        >
          Về dòng họ chính
        </button>
      </div>
    </div>
  );
};