/**
 * ============================================================================
 * PATH       : frontend/src/features/onboarding/components/RulesAgreementModal.jsx
 * DATETIME   : 2026-11-20T06:45:00+07:00
 * VERSION    : 1.0.0-PHASE2-SPRINT-FE3
 * DESCRIPTION:
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-3]:
 *   1. Hộp thoại cam kết nội quy dòng họ (Rules Agreement Modal) [FUNC-11, TC-FE-11].
 *   2. Hiển thị bộ đếm ký tự trực quan `<div>{rules.length}/30000</div>` theo
 *      MAX_RULES_SNAPSHOT_LENGTH (30.000 ký tự). Khi vượt quá 30.000 ký tự,
 *      bộ đếm báo đỏ và nút Submit khóa cứng.
 *   3. Nút Submit bị khóa cứng cho đến khi tích checkbox xác nhận đồng ý nội quy
 *      (kèm inline helper text >= 16px bên dưới nút, cấm dùng tooltip).
 *   4. Tích hợp AudioHelpButton ở đầu modal và ZoneVoiceButton để đọc rõ
 *      nội quy dòng họ cho người cao tuổi [NFR-FE-02, TC-FE-18].
 *   5. Xử lý lỗi 400 RULES_SNAPSHOT_TOO_LONG & 409 CONCURRENT_TRANSACTION_LOCKED
 *      (Keep State) qua PersistentMessageBanner (kèm X-Correlation-Id fallback
 *      "Không có") và BlockingLoadingOverlay [ARCH-01, ARCH-02, ARCH-04].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckSquare, X, AlertCircle } from 'lucide-react';
import apiClient from '../../../lib/apiClient.js';
import { MAX_RULES_SNAPSHOT_LENGTH } from '../constants/onboardingPhase2Contracts.js';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed.js';

/**
 * Component RulesAgreementModal: Modal đọc và ký cam kết nội quy dòng họ.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Trạng thái đóng/mở modal
 * @param {string} [props.clanName='Dòng họ'] - Tên dòng họ hiển thị trên tiêu đề
 * @param {string} [props.caseId=''] - ID hồ sơ onboarding_cases (dùng khi modal tự gọi API)
 * @param {string} [props.initialRules=''] - Nội dung nội quy dòng họ ban đầu
 * @param {boolean} [props.editable=false] - Cho phép nhập/dán nội dung nội quy (phục vụ soạn thảo / kiểm thử TC-FE-11)
 * @param {Function} [props.onClose] - Callback đóng modal
 * @param {Function} [props.onConfirm] - Callback nhận { agreed_rules_snapshot, agreed, length } khi xác nhận
 */
export default function RulesAgreementModal({
  isOpen,
  clanName = 'Dòng họ',
  caseId = '',
  initialRules = '',
  editable = false,
  onClose,
  onConfirm,
}) {
  // Bảo toàn dữ liệu văn bản & trạng thái checkbox khi gặp lỗi 400/409 [ARCH-01]
  const [rules, setRules] = useState(() => String(initialRules || ''));
  const [isAgreed, setIsAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bannerState, setBannerState] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setRules(String(initialRules || ''));
      setIsAgreed(false);
      setBannerState(null);
    }
  }, [isOpen, initialRules]);

  const charCount = rules.length;
  const isOverLimit = charCount > MAX_RULES_SNAPSHOT_LENGTH;
  const isEmptyRules = rules.trim().length === 0;
  const isSubmitDisabled =
    isSubmitting || !isAgreed || isOverLimit || isEmptyRules;

  /**
   * Gửi cam kết nội quy dòng họ (gọi callback onConfirm hoặc API mặc định)
   */
  const handleConfirmSubmit = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (isSubmitDisabled) return;

      setBannerState(null);
      setIsSubmitting(true);

      const payload = {
        agreed_rules_snapshot: rules,
        agreed: true,
        character_count: rules.length,
      };

      try {
        if (typeof onConfirm === 'function') {
          await onConfirm(payload);
        } else if (caseId) {
          await apiClient.post(
            `/onboarding/cases/${encodeURIComponent(caseId)}/rules-agreement`,
            payload
          );
        }
      } catch (err) {
        // [ARCH-01, TC-FE-14] Giữ nguyên nội dung rules và trạng thái checkbox khi lỗi 400 / 409
        const info = extractApiErrorInfo(err);
        setBannerState({
          type: info.status === 409 ? 'warning' : 'error',
          title:
            info.code === 'RULES_SNAPSHOT_TOO_LONG'
              ? 'Nội quy vượt quá 30.000 ký tự'
              : info.status === 409
                ? 'Hồ sơ đang được xử lý đồng thời'
                : 'Không thể lưu cam kết nội quy',
          message: info.message,
          correlationId: info.correlationId,
          actionButton:
            info.status === 409 ? (
              <button
                type="button"
                onClick={() => handleConfirmSubmit()}
                className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-700"
              >
                Thử lại ngay
              </button>
            ) : null,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitDisabled, rules, onConfirm, caseId]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-agreement-modal-title"
    >
      {/* Loading chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={isSubmitting}
        message="Đang ghi nhận cam kết nội quy dòng họ..."
      />

      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        {/* Header Modal + AudioHelpButton [NFR-FE-02, TC-FE-18] */}
        <header className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 bg-emerald-50/80 border-b border-emerald-100">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <ShieldCheck size={24} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-700">
                Cam kết gia phong &amp; Nội quy
              </span>
              <h2
                id="rules-agreement-modal-title"
                className="mt-0.5 text-xl sm:text-2xl font-black text-slate-900 leading-snug"
              >
                Nội quy {clanName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AudioHelpButton
              text={`Hộp thoại đọc và cam kết nội quy ${clanName}. Bác vui lòng đọc kỹ toàn văn nội quy bên dưới, bấm nút Nghe ở góc khung văn bản nếu muốn hệ thống đọc thành tiếng, sau đó tích vào ô Tôi đã đọc và đồng ý tuân thủ nội quy để xác nhận.`}
              label="Nghe hướng dẫn"
              variant="soft"
            />
            {typeof onClose === 'function' && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                aria-label="Đóng hộp thoại nội quy"
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </header>

        {/* Nội dung cuộn */}
        <form
          onSubmit={handleConfirmSubmit}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4"
        >
          {/* Banner thông báo lỗi nghiệp vụ hợp nhất duy nhất (kèm X-Correlation-Id) */}
          {bannerState && (
            <PersistentMessageBanner
              type={bannerState.type}
              title={bannerState.title}
              message={bannerState.message}
              correlationId={bannerState.correlationId}
              actionButton={bannerState.actionButton}
              onClose={() => setBannerState(null)}
            />
          )}

          {/* Vùng hiển thị / nhập nội quy + ZoneVoiceButton + Bộ đếm ký tự <= 30.000 [FUNC-11, TC-FE-11] */}
          <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-black text-slate-800">
                Toàn văn nội quy &amp; quy ước dòng họ
              </span>
              <ZoneVoiceButton
                visible
                text={
                  rules.trim()
                    ? rules.slice(0, 2500)
                    : 'Chưa có nội dung nội quy dòng họ.'
                }
                label="Nghe nội quy"
                disabled={isSubmitting || isEmptyRules}
              />
            </div>

            {editable ? (
              <textarea
                aria-label="Nội dung nội quy dòng họ"
                rows={8}
                disabled={isSubmitting}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Nhập hoặc dán nội dung cam kết nội quy dòng họ (tối đa 30.000 ký tự)..."
                className={`w-full rounded-xl border p-3.5 text-base leading-relaxed text-slate-900 bg-white outline-none transition ${
                  isOverLimit
                    ? 'border-2 border-rose-600 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                }`}
              />
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-label="Nội dung nội quy dòng họ"
                className={`max-h-64 overflow-y-auto rounded-xl border p-4 text-base leading-relaxed whitespace-pre-wrap break-words bg-white ${
                  isOverLimit
                    ? 'border-2 border-rose-600 text-rose-950'
                    : 'border-slate-200 text-slate-800'
                }`}
              >
                {rules || 'Ban Quản trị dòng họ chưa cập nhật văn bản nội quy.'}
              </div>
            )}

            {/* Bộ đếm ký tự chuẩn đặc tả Mục 3.2 [FUNC-11, TC-FE-11]: <div>{rules.length}/30000</div> */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-sm font-semibold text-slate-600">
                Giới hạn lưu trữ bản cam kết: tối đa 30.000 ký tự
              </span>
              <div
                data-testid="rules-char-counter"
                className={`rounded-lg px-3 py-1 font-mono text-base font-black ${
                  isOverLimit
                    ? 'border border-rose-300 bg-rose-100 text-rose-700'
                    : 'bg-slate-200/80 text-slate-800'
                }`}
              >
                {rules.length}/{MAX_RULES_SNAPSHOT_LENGTH}
              </div>
            </div>

            {isOverLimit && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-base font-bold text-rose-700"
              >
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                <span>
                  Nội dung nội quy đang vượt quá giới hạn 30.000 ký tự (dư{' '}
                  {(charCount - MAX_RULES_SNAPSHOT_LENGTH).toLocaleString('vi-VN')}{' '}
                  ký tự). Vui lòng rút gọn trước khi xác nhận.
                </span>
              </div>
            )}
          </div>

          {/* Checkbox xác nhận cam kết bắt buộc [FUNC-11] */}
          <label
            className={`flex items-start gap-3.5 rounded-2xl border-2 p-4 cursor-pointer transition ${
              isAgreed
                ? 'border-emerald-600 bg-emerald-50/80'
                : 'border-slate-300 bg-white hover:border-emerald-400'
            }`}
          >
            <input
              type="checkbox"
              disabled={isSubmitting}
              checked={isAgreed}
              onChange={(e) => setIsAgreed(e.target.checked)}
              className="mt-1 h-6 w-6 shrink-0 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-base font-bold leading-relaxed text-slate-900">
              Tôi đã đọc kỹ, hiểu rõ và tự nguyện cam kết tuân thủ toàn bộ nội
              quy, gia phong của {clanName}.
            </span>
          </label>

          {/* Nút hành động >= 48px + Inline helper text >= 16px (cấm tooltip) */}
          <div className="pt-2 space-y-2">
            <div className="flex flex-col sm:flex-row gap-3">
              {typeof onClose === 'function' && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="min-h-[48px] w-full sm:w-1/3 rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Đóng lại
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-base sm:text-lg font-black text-white shadow-md hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                <CheckSquare size={20} />
                <span>Xác nhận cam kết nội quy</span>
              </button>
            </div>

            {isSubmitDisabled && !isSubmitting && (
              <p className="text-base font-semibold text-slate-700" role="status">
                {isOverLimit
                  ? 'Nút xác nhận đang khóa vì nội dung vượt quá 30.000 ký tự.'
                  : isEmptyRules
                    ? 'Chưa có nội dung nội quy để xác nhận.'
                    : 'Bác vui lòng tích vào ô cam kết ở phía trên để kích hoạt nút xác nhận.'}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
