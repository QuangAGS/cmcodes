/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/MembershipStatusPage.jsx
 * DATETIME    : 2026-11-10T15:55:00+07:00
 * VERSION     : 1.2.0-MEMBERSHIP-STATUS-REOPEN-CASEID
 * DESCRIPTION : Màn hình hiển thị trạng thái duyệt hồ sơ Membership / Onboarding.
 *               Sửa reopenCase truyền đúng caseId thay vì userId.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:38:00+07:00 (v1.1.0-MEMBERSHIP-STATUS-ELDER-TTS):
 *   + Thêm TTS cho NEEDS_REVISION.
 * - 2026-11-10T15:55:00+07:00 (v1.2.0-MEMBERSHIP-STATUS-REOPEN-CASEID):
 *   + Sửa handleReopen gọi membershipApi.reopenCase(statusData.caseId).
 *   + Chuẩn hóa QX.
 * =============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { membershipApi } from '../api/membershipApi';
import { getLinkStatusMeta } from '../constants/membershipLabels';

export const MembershipStatusPage = () => {
  const navigate = useNavigate();
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReopening, setIsReopening] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await membershipApi.getMembershipStatus();
      // Hỗ trợ cả shape { data: {...} } và shape phẳng
      setStatusData(data?.data || data);
    } catch (err) {
      console.error('Lỗi khi tải trạng thái hồ sơ:', err);
      setError(err?.response?.data?.message || 'Không thể tải thông tin trạng thái hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleReopen = async () => {
    const caseId = statusData?.caseId || statusData?.id;
    if (!caseId) {
      alert('Không tìm thấy mã hồ sơ để mở lại.');
      return;
    }
    try {
      setIsReopening(true);
      await membershipApi.reopenCase(caseId);
      await loadStatus();
    } catch (err) {
      console.error('Không thể mở lại hồ sơ:', err);
      alert(err?.response?.data?.message || 'Mở lại hồ sơ thất bại.');
    } finally {
      setIsReopening(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-lg font-medium text-gray-700">Đang kiểm tra tiến trình hồ sơ...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-white border border-red-200 rounded-2xl shadow-sm text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Đã xảy ra sự cố</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          type="button"
          onClick={loadStatus}
          className="px-6 py-3 min-h-[48px] bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const currentStatusCode = statusData?.isFinalRejection
    ? 'TU_CHOI_LAN_CUOI'
    : statusData?.status || 'CHO_DUYET';

  const statusMeta = getLinkStatusMeta(currentStatusCode);

  return (
    <div className="max-w-2xl mx-auto my-10 p-6 sm:p-8 bg-white border border-gray-200 rounded-3xl shadow-lg">
      <div className="text-center pb-6 border-b border-gray-100">
        <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Tiến trình hồ sơ gia nhập dòng họ
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-2">
          {statusData?.tenantName || 'Dòng họ'}
        </h1>
        <div className="mt-4 inline-flex items-center gap-2">
          <span className={`px-4 py-1.5 rounded-full text-sm font-bold border ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      <div className="py-6 space-y-4">
        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-base text-gray-700 leading-relaxed">
          {statusMeta.message}
        </div>

        {currentStatusCode === 'NEEDS_REVISION' && statusData?.revisionRequest && (
          <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl">
            <h3 className="text-base font-bold text-amber-900">Lời nhắn từ Ban quản trị dòng họ:</h3>
            <p className="mt-2 text-base text-amber-950 font-medium whitespace-pre-wrap">
              {statusData.revisionRequest}
            </p>
          </div>
        )}

        {(currentStatusCode === 'TU_CHOI' || currentStatusCode === 'TU_CHOI_LAN_CUOI') && statusData?.reviewNote && (
          <div className="p-5 bg-red-50 border border-red-200 rounded-2xl">
            <h3 className="text-base font-bold text-red-900">Lý do từ chối:</h3>
            <p className="mt-1 text-base text-red-800 whitespace-pre-wrap">{statusData.reviewNote}</p>
          </div>
        )}

        <div className="text-xs text-gray-500 text-center pt-2">
          Hồ sơ nộp ngày:{' '}
          {statusData?.submittedAt
            ? new Date(statusData.submittedAt).toLocaleDateString('vi-VN')
            : 'Mới cập nhật'}
        </div>
      </div>

      <div className="pt-6 border-t border-gray-100 flex flex-col gap-3">
        {currentStatusCode === 'NEEDS_REVISION' && (
          <button
            type="button"
            onClick={() =>
              navigate(`/membership/claim?caseId=${statusData?.caseId || statusData?.id}&mode=revision`)
            }
            className="w-full py-3.5 px-6 min-h-[48px] bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl shadow-md text-lg"
          >
            Chỉnh sửa & Bổ sung thông tin ngay
          </button>
        )}

        {currentStatusCode === 'TU_CHOI' && (
          <button
            type="button"
            disabled={isReopening}
            onClick={handleReopen}
            className="w-full py-3.5 px-6 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md text-lg"
          >
            {isReopening ? 'Đang tạo hồ sơ...' : 'Nộp lại hồ sơ xác thực mới'}
          </button>
        )}

        {currentStatusCode === 'TU_CHOI_LAN_CUOI' && (
          <div className="p-4 bg-gray-100 rounded-2xl text-center text-sm font-semibold text-gray-700">
            Hồ sơ đã đóng vĩnh viễn. Vui lòng liên hệ trực tiếp Ban liên lạc dòng họ nếu có thắc mắc.
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/op')}
          className="w-full py-3 px-6 min-h-[48px] bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-2xl"
        >
          Về trang tác nghiệp
        </button>
      </div>
    </div>
  );
};
