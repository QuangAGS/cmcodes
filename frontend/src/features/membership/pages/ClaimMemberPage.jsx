/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/ClaimMemberPage.jsx
 * DATETIME    : 2026-11-10T11:40:00+07:00
 * VERSION     : 1.1.0-CLAIM-MEMBER-WIZARD-AMEND-FULL
 * DESCRIPTION : Trang đăng ký thành viên & nhận người thân hoàn chỉnh theo AMEND-RP-OP-2026-01-V1.1:
 *               1. Xử lý mode Revision (?caseId=&mode=revision) khi case bị NEEDS_REVISION.
 *               2. Kịch bản Clan-joint Case 1 (EM): Wizard 3 bước nhận hồ sơ đã có trên cây.
 *               3. Kịch bản Clan-joint Case 2 (No EM): Biểu mẫu 21 trường RegistrationProfileForm
 *                  để khai báo thành viên mới hoàn toàn.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:08:00+07:00 (v1.0.0-CLAIM-MEMBER-WIZARD-ELDER):
 *   + Khởi tạo mới theo quy chuẩn QX.
 * - 2026-11-10T11:40:00+07:00 (v1.1.0-CLAIM-MEMBER-WIZARD-AMEND-FULL):
 *   + Xử lý useSearchParams cho chế độ revision (NEEDS_REVISION).
 *   + Tích hợp RegistrationProfileForm cho Case 2 (No EM) và Revision.
 *   + Cho phép chuyển đổi giữa "Đã có tên trên cây" và "Chưa có tên (Tạo mới)".
 * =============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { membershipApi } from '../api/membershipApi';
import { MemberSearchSheet } from '../../member/components/MemberSearchSheet';
import { RegistrationProfileForm } from '../components/RegistrationProfileForm';
import { ELDER_MEMBERSHIP_MESSAGES } from '../constants/membershipLabels';

export const ClaimMemberPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const caseId = searchParams.get('caseId');
  const isRevisionMode = searchParams.get('mode') === 'revision';

  // Chế độ lựa chọn: 'CLAIM_EM' (Đã có tên trên cây) hoặc 'CREATE_NO_EM' (Chưa có tên, tạo mới)
  const [entryMode, setEntryMode] = useState('CLAIM_EM');

  // Quản lý bước cho luồng Claim (1: Chọn, 2: Xác thực 3 lớp, 3: Xác nhận)
  const [claimStep, setClaimStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');

  // Dữ liệu cho luồng Claim (Case 1)
  const [claimData, setClaimData] = useState({
    claimed_member_id: null,
    claimed_member_name: '',
    secret_answer_huy: '',
    phone_confirmation: '',
    voucher_name: '',
    relationship_note: '',
  });

  /**
   * Nếu ở chế độ Revision -> Lấy nội dung yêu cầu sửa đổi từ Backend
   */
  useEffect(() => {
    if (isRevisionMode && caseId) {
      membershipApi.getMembershipStatus()
        .then((data) => {
          if (data?.revisionRequest) {
            setRevisionFeedback(data.revisionRequest);
          }
        })
        .catch((err) => console.error('Không thể nạp thông tin revision:', err));
    }
  }, [isRevisionMode, caseId]);

  /**
   * Xử lý nộp hồ sơ ở chế độ REVISION (SMOKE-3.2)
   */
  const handleRevisionSubmit = async (payload21F) => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await membershipApi.submitRevision(caseId, payload21F);
      navigate('/membership/status');
    } catch (err) {
      console.error('Lỗi khi nộp hồ sơ bổ sung:', err);
      setErrorMsg(err?.response?.data?.message || 'Nộp hồ sơ bổ sung thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Xử lý nộp hồ sơ ở chế độ Case 2: No EM (Tạo member mới từ JSON 21 trường)
   */
  const handleNoEmSubmit = async (payload21F) => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      // Gửi payload 21 trường không có claimed_member_id
      await membershipApi.submitClaim(payload21F);
      navigate('/membership/status');
    } catch (err) {
      console.error('Lỗi khi nộp hồ sơ tạo mới thành viên:', err);
      setErrorMsg(err?.response?.data?.message || 'Nộp hồ sơ thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Bước 1 Claim: Chọn bản ghi thành viên từ MemberSearchSheet
   */
  const handleSelectMember = (selectedMember) => {
    if (!selectedMember) return;
    setClaimData((prev) => ({
      ...prev,
      claimed_member_id: selectedMember.id,
      claimed_member_name: selectedMember.full_name || selectedMember.name,
    }));
    setClaimStep(2);
  };

  /**
   * Bước 3 Claim: Nộp hồ sơ nhận người thân (Case 1)
   */
  const handleSubmitClaim = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');

      await membershipApi.submitClaim({
        claimed_member_id: claimData.claimed_member_id,
        secretAnswers: {
          huy_name: claimData.secret_answer_huy,
        },
        phoneVerify: claimData.phone_confirmation,
        voucherInfo: claimData.voucher_name,
        note: claimData.relationship_note,
      });

      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(ELDER_MEMBERSHIP_MESSAGES.CLAIM_SUBMITTED);
        utterance.lang = 'vi-VN';
        window.speechSynthesis.speak(utterance);
      }

      navigate('/membership/status');
    } catch (err) {
      console.error('Lỗi khi nộp hồ sơ Claim:', err);
      setErrorMsg(err?.response?.data?.message || 'Gửi hồ sơ duyệt thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // GIAO DIỆN KHI Ở CHẾ ĐỘ REVISION (YÊU CẦU SỬA ĐỔI)
  // =========================================================================
  if (isRevisionMode) {
    return (
      <div className="max-w-4xl mx-auto my-8 p-6 sm:p-8 bg-white border border-gray-200 rounded-3xl shadow-xl">
        <div className="mb-6 pb-4 border-b">
          <span className="text-sm font-bold text-amber-600 uppercase">Chỉnh sửa hồ sơ</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
            Bổ sung thông tin phả hệ theo yêu cầu
          </h1>
        </div>

        <RegistrationProfileForm
          mode="REVISION"
          revisionFeedback={revisionFeedback}
          isSubmitting={isSubmitting}
          onSubmit={handleRevisionSubmit}
        />
      </div>
    );
  }

  // =========================================================================
  // GIAO DIỆN ĐĂNG KÝ MỚI (CHỌN GIỮA CLAIM CÓ EM VÀ TẠO MỚI NO EM)
  // =========================================================================
  return (
    <div className="max-w-3xl mx-auto my-8 p-6 sm:p-8 bg-white border border-gray-200 rounded-3xl shadow-xl">
      {/* Tab chuyển đổi kịch bản (Case 1 vs Case 2 theo AMEND) */}
      <div className="flex border-b border-gray-200 mb-8">
        <button
          type="button"
          onClick={() => setEntryMode('CLAIM_EM')}
          className={`flex-1 py-4 text-center font-bold text-base sm:text-lg border-b-4 transition-all ${
            entryMode === 'CLAIM_EM'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          1. Tôi đã có tên trong sổ họ (Nhận hồ sơ)
        </button>
        <button
          type="button"
          onClick={() => setEntryMode('CREATE_NO_EM')}
          className={`flex-1 py-4 text-center font-bold text-base sm:text-lg border-b-4 transition-all ${
            entryMode === 'CREATE_NO_EM'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          2. Tôi là thành viên mới (Chưa có tên)
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl text-red-800 font-bold text-base">
          {errorMsg}
        </div>
      )}

      {/* KỊCH BẢN 2: CHƯA CÓ TÊN (NO EM) -> NHẬP FORM 21 TRƯỜNG */}
      {entryMode === 'CREATE_NO_EM' && (
        <div>
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Khai báo hồ sơ thành viên mới
            </h2>
            <p className="text-gray-600 mt-1 text-base">
              Bác vui lòng điền đầy đủ thông tin để Ban quản trị dòng họ đối soát và đưa vào cây gia phả.
            </p>
          </div>

          <RegistrationProfileForm
            mode="CREATE"
            isSubmitting={isSubmitting}
            onSubmit={handleNoEmSubmit}
          />
        </div>
      )}

      {/* KỊCH BẢN 1: ĐÃ CÓ TÊN (CLAIM EM) -> WIZARD 3 BƯỚC */}
      {entryMode === 'CLAIM_EM' && (
        <div>
          {/* Stepper */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
            {[
              { num: 1, label: '1. Chọn hồ sơ' },
              { num: 2, label: '2. Xác thực 3 lớp' },
              { num: 3, label: '3. Xác nhận' },
            ].map((s) => (
              <div key={s.num} className="flex items-center gap-2">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    claimStep === s.num
                      ? 'bg-blue-600 text-white shadow-md'
                      : claimStep > s.num
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {s.num}
                </span>
                <span className={`text-sm font-semibold hidden sm:inline ${claimStep === s.num ? 'text-gray-900' : 'text-gray-500'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Bước 1: Tra cứu hồ sơ */}
          {claimStep === 1 && (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Bước 1: Tìm tên của Bác / Bạn trên Cây gia phả
              </h2>
              <p className="text-gray-600 mb-6 text-base">
                Nhập họ tên để tra cứu hồ sơ thành viên đã được lưu trữ trong sổ họ.
              </p>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
                <MemberSearchSheet onSelectMember={handleSelectMember} />
              </div>
            </div>
          )}

          {/* Bước 2: Khai báo xác thực 3 lớp */}
          {claimStep === 2 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!claimData.secret_answer_huy.trim()) {
                  setErrorMsg('Vui lòng trả lời câu hỏi gia mật để làm căn cứ thẩm định.');
                  return;
                }
                setErrorMsg('');
                setClaimStep(3);
              }}
              className="space-y-6"
            >
              <div>
                <span className="text-sm font-bold text-blue-600 uppercase">Hồ sơ đã chọn</span>
                <h2 className="text-2xl font-extrabold text-gray-900 mt-1">
                  {claimData.claimed_member_name}
                </h2>
              </div>

              <div className="p-5 bg-blue-50 border border-blue-200 rounded-2xl space-y-4">
                <h3 className="text-base font-bold text-blue-950">
                  Khai báo thông tin xác minh (3 Lớp)
                </h3>

                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-1">
                    Lớp 1: Tên húy cụ tổ hoặc ngày giỗ chính của gia đình (*)
                  </label>
                  <input
                    type="text"
                    required
                    value={claimData.secret_answer_huy}
                    onChange={(e) => setClaimData((p) => ({ ...p, secret_answer_huy: e.target.value }))}
                    placeholder="Ví dụ: Giỗ ngày 15 tháng Giêng..."
                    className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-1">
                    Lớp 2: Số điện thoại liên lạc của Bác / Bạn
                  </label>
                  <input
                    type="tel"
                    value={claimData.phone_confirmation}
                    onChange={(e) => setClaimData((p) => ({ ...p, phone_confirmation: e.target.value }))}
                    placeholder="09xxxxxxxx"
                    className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-1">
                    Lớp 3: Người thân trong họ biết rõ về Bác / Bạn (Bảo lãnh)
                  </label>
                  <input
                    type="text"
                    value={claimData.voucher_name}
                    onChange={(e) => setClaimData((p) => ({ ...p, voucher_name: e.target.value }))}
                    placeholder="Họ tên người bảo lãnh (Bác trưởng chi, anh em...)"
                    className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setClaimStep(1)}
                  className="w-1/3 py-3 px-4 min-h-[48px] bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-2xl"
                >
                  Chọn lại
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 px-4 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md"
                >
                  Tiếp tục kiểm tra
                </button>
              </div>
            </form>
          )}

          {/* Bước 3: Xác nhận */}
          {claimStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Bước 3: Xác nhận tóm tắt hồ sơ nhận người thân
                </h2>
                <p className="text-gray-600 text-base mt-1">
                  Bác vui lòng đọc lại thông tin trước khi nhấn nút gửi chính thức.
                </p>
              </div>

              <div className="p-6 bg-gray-50 border-2 border-gray-200 rounded-3xl space-y-4">
                <div className="flex justify-between border-b pb-3">
                  <span className="text-gray-600">Thành viên nhận:</span>
                  <span className="font-extrabold text-gray-900 text-lg">{claimData.claimed_member_name}</span>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <span className="text-gray-600">Thông tin gia mật:</span>
                  <span className="font-bold text-gray-800">{claimData.secret_answer_huy}</span>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <span className="text-gray-600">Số điện thoại:</span>
                  <span className="font-bold text-gray-800">{claimData.phone_confirmation || '(Chưa điền)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Người bảo lãnh:</span>
                  <span className="font-bold text-gray-800">{claimData.voucher_name || '(Không có)'}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setClaimStep(2)}
                  className="w-1/3 py-3.5 px-4 min-h-[48px] bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-2xl"
                >
                  Sửa lại
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmitClaim}
                  className="w-2/3 py-3.5 px-4 min-h-[48px] bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-2xl shadow-lg text-lg flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Đang gửi hồ sơ...' : 'Gửi hồ sơ duyệt ngay'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};