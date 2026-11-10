/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/MembershipStatusPage.jsx
 * DATETIME    : 2026-11-10T11:38:00+07:00
 * VERSION     : 1.1.0-MEMBERSHIP-STATUS-ELDER-TTS
 * DESCRIPTION : Màn hình hiển thị trạng thái duyệt hồ sơ Onboarding / Membership.
 *               Bổ sung trợ lý âm thanh đọc lời nhắn Ban quản trị khi NEEDS_REVISION,
 *               và điều hướng chuẩn mực theo route của hệ thống.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:07:00+07:00 (v1.0.0-MEMBERSHIP-STATUS-CYCLIC):
 *   + Khởi tạo mới theo quy chuẩn QX.
 * - 2026-11-10T11:38:00+07:00 (v1.1.0-MEMBERSHIP-STATUS-ELDER-TTS):
 *   + Tích hợp Elder TTS tự động phát âm thông điệp khi hồ sơ cần bổ sung (NEEDS_REVISION).
 *   + Cập nhật route quay lại '/op' thay vì hardcode '/profile'.
 * =============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { membershipApi } from '../api/membershipApi';
import { getLinkStatusMeta, ELDER_MEMBERSHIP_MESSAGES } from '../constants/membershipLabels';

export const MembershipStatusPage = () => {
  const navigate = useNavigate();
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReopening, setIsReopening] = useState(false);

  /**
   * Tải trạng thái và kích hoạt giọng nói Elder TTS nếu cần
   */
  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await membershipApi.getMembershipStatus();
      setStatusData(data);

      // Kích hoạt giọng nói hỗ trợ nếu trạng thái là NEEDS_REVISION
      if (data?.status === 'NEEDS_REVISION' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(
          ELDER_MEMBERSHIP_MESSAGES.REVISION_PROMPT
        );
        utterance.lang = 'vi-VN';
        window.speechSynthesis.speak(utterance);
      }
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
    if (!statusData?.userId) return;
    try {
      setIsReopening(true);
      await membershipApi.reopenCase(statusData.userId);
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
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-lg font-medium text-gray-700">Đang kiểm tra tiến trình hồ sơ...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-white border border-red-200 rounded-2xl shadow-sm text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Đã xảy ra sự cố</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          onClick={loadStatus}
          className="px-6 py-3 min-h-[48px] bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-100"
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
            <h3 className="text-base font-bold text-amber-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-700" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Lời nhắn từ Ban quản trị dòng họ:
            </h3>
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
          Hồ sơ nộp ngày: {statusData?.submittedAt ? new Date(statusData.submittedAt).toLocaleDateString('vi-VN') : 'Mới cập nhật'}
        </div>
      </div>

      <div className="pt-6 border-t border-gray-100 flex flex-col gap-3">
        {/* Điều hướng sang form Revision truyền kèm caseId */}
        {currentStatusCode === 'NEEDS_REVISION' && (
          <button
            type="button"
            onClick={() => navigate(`/membership/claim?caseId=${statusData?.caseId}&mode=revision`)}
            className="w-full py-3.5 px-6 min-h-[48px] bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl shadow-md focus:ring-4 focus:ring-amber-200 transition-all text-lg"
          >
            Chỉnh sửa & Bổ sung thông tin ngay
          </button>
        )}

        {currentStatusCode === 'TU_CHOI' && (
          <button
            type="button"
            disabled={isReopening}
            onClick={handleReopen}
            className="w-full py-3.5 px-6 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md focus:ring-4 focus:ring-blue-200 transition-all text-lg"
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
          className="w-full py-3 px-6 min-h-[48px] bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-2xl transition-all"
        >
          Về Cổng tác nghiệp (/op)
        </button>
      </div>
    </div>
  );
};