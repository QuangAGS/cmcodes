/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/ClaimMemberPage.jsx
 * DATETIME    : 2026-11-10T11:08:00+07:00
 * VERSION     : 1.0.0-CLAIM-MEMBER-WIZARD-ELDER
 * DESCRIPTION : Wizard 3 bước nhận diện người thân (Claim Member) theo chuẩn RP-OP-V2.1:
 *               - Bước 1: Tra cứu và chọn bản ghi thành viên trên cây (MemberSearchSheet).
 *               - Bước 2: Xác thực 3 lớp (Câu hỏi gia mật húy/kỵ, Số điện thoại, Người bảo lãnh).
 *               - Bước 3: Xác nhận tóm tắt hồ sơ và gửi duyệt sang Ban quản trị dòng họ.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:08:00+07:00 (v1.0.0-CLAIM-MEMBER-WIZARD-ELDER):
 *   + Khởi tạo mới theo quy chuẩn QX.
 *   + Tối ưu giao diện người cao tuổi: Nút bấm lớn ≥ 48px, chữ to, hướng dẫn rõ ràng.
 * =============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { membershipApi } from '../api/membershipApi';
import { MemberSearchSheet } from '../../member/components/MemberSearchSheet';

export const ClaimMemberPage = () => {
  const navigate = useNavigate();

  // Quản lý bước hiện tại trong Wizard (1, 2, 3)
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Dữ liệu hồ sơ Claim được người dùng khai báo
  const [claimData, setClaimData] = useState({
    claimed_member_id: null,
    claimed_member_name: '',
    secret_answer_huy: '',    // Lớp 1: Tên húy / ngày giỗ cụ tổ
    phone_confirmation: '',   // Lớp 2: Số điện thoại xác minh
    voucher_name: '',         // Lớp 3: Tên người bảo lãnh trong họ
    relationship_note: '',    // Ghi chú chi tiết quan hệ
  });

  /**
   * Bước 1: Tiếp nhận thành viên được chọn từ MemberSearchSheet
   */
  const handleSelectMember = (selectedMember) => {
    if (!selectedMember) return;
    setClaimData((prev) => ({
      ...prev,
      claimed_member_id: selectedMember.id,
      claimed_member_name: selectedMember.full_name || selectedMember.name,
    }));
    setStep(2);
  };

  /**
   * Cập nhật dữ liệu nhập liệu ở Bước 2
   */
  const handleInputChange = (field, value) => {
    setClaimData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * Bước 2 -> Bước 3: Kiểm tra tính hợp lệ của câu trả lời trước khi sang bước xác nhận
   */
  const handleValidateStep2 = (e) => {
    e.preventDefault();
    if (!claimData.secret_answer_huy.trim()) {
      setErrorMsg('Vui lòng trả lời câu hỏi gia mật để làm căn cứ thẩm định.');
      return;
    }
    setErrorMsg('');
    setStep(3);
  };

  /**
   * Bước 3: Nộp hồ sơ chính thức lên Backend
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

      // Điều hướng ngay sang màn hình theo dõi tiến trình duyệt
      navigate('/membership/status');
    } catch (err) {
      console.error('Lỗi khi nộp hồ sơ nhận người thân:', err);
      setErrorMsg(err?.response?.data?.message || 'Gửi hồ sơ thất bại. Bác vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto my-8 p-6 sm:p-8 bg-white border border-gray-200 rounded-3xl shadow-xl">
      {/* Thanh tiến trình 3 bước (Stepper) */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
        {[
          { num: 1, label: '1. Chọn hồ sơ' },
          { num: 2, label: '2. Xác thực 3 lớp' },
          { num: 3, label: '3. Xác nhận' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <span
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                step === s.num
                  ? 'bg-blue-600 text-white shadow-md'
                  : step > s.num
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {s.num}
            </span>
            <span className={`text-sm font-semibold hidden sm:inline ${step === s.num ? 'text-gray-900' : 'text-gray-500'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl text-red-800 font-medium text-sm">
          {errorMsg}
        </div>
      )}

      {/* BƯỚC 1: TÌM VÀ CHỌN THÀNH VIÊN TRÊN SỔ HỌ */}
      {step === 1 && (
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Bước 1: Tìm tên của Bác / Bạn trên Cây gia phả
          </h2>
          <p className="text-gray-600 mb-6 text-base">
            Nhập họ tên hoặc tên thường gọi để tìm kiếm hồ sơ đã được lưu trữ sẵn trong sổ họ.
          </p>

          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <MemberSearchSheet onSelectMember={handleSelectMember} />
          </div>
        </div>
      )}

      {/* BƯỚC 2: KHAI BÁO XÁC THỰC 3 LỚP */}
      {step === 2 && (
        <form onSubmit={handleValidateStep2} className="space-y-6">
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

            {/* Lớp 1: Trắc nghiệm gia mật */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">
                Lớp 1: Tên húy cụ tổ hoặc ngày giỗ chính của gia đình (*)
              </label>
              <input
                type="text"
                required
                value={claimData.secret_answer_huy}
                onChange={(e) => handleInputChange('secret_answer_huy', e.target.value)}
                placeholder="Ví dụ: Giỗ ngày 15 tháng Giêng..."
                className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>

            {/* Lớp 2: Khớp số điện thoại */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">
                Lớp 2: Số điện thoại liên lạc của Bác / Bạn
              </label>
              <input
                type="tel"
                value={claimData.phone_confirmation}
                onChange={(e) => handleInputChange('phone_confirmation', e.target.value)}
                placeholder="09xxxxxxxx"
                className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>

            {/* Lớp 3: Người bảo lãnh */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">
                Lớp 3: Người thân trong họ biết rõ về Bác / Bạn (Bảo lãnh)
              </label>
              <input
                type="text"
                value={claimData.voucher_name}
                onChange={(e) => handleInputChange('voucher_name', e.target.value)}
                placeholder="Họ tên người bảo lãnh (Bác trưởng chi, anh em...)"
                className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
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

      {/* BƯỚC 3: XÁC NHẬN VÀ NỘP HỒ SƠ */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Bước 3: Xác nhận tóm tắt hồ sơ nhận người thân
            </h2>
            <p className="text-gray-600 text-base mt-1">
              Bác vui lòng đọc lại thông tin trước khi nhấn nút gửi chính thức cho Ban quản trị.
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
              onClick={() => setStep(2)}
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
  );
};