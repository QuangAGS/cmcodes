/**
 * ============================================================================
 * PATH       : frontend/src/pages/BeneficiaryConsentPage.jsx
 * DATETIME   : 2026-11-20T06:50:00+07:00
 * VERSION    : 1.0.0-PHASE2-SPRINT-FE3
 * DESCRIPTION:
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-3]:
 *   1. Trang xác nhận đồng thuận của Người được khai hộ (Beneficiary UC-03)
 *      thông qua liên kết 1 lần dùng (Magic Link token) [FUNC-01].
 *   2. Xử lý HTTP 410 Gone (BENEFICIARY_TOKEN_EXPIRED / ONBOARDING_CASE_TERMINAL_TOKEN_GONE)
 *      hoặc trạng thái hồ sơ kết thúc (APPROVED, REJECTED, CANCELLED, EXPIRED):
 *      hiển thị màn hình "Liên kết đã hết hiệu lực" và ẩn hoàn toàn mọi nút
 *      bấm xác nhận/từ chối [FUNC-10, TC-FE-01, TC-FE-10].
 *   3. Xử lý HTTP 400 INVALID_BENEFICIARY_TOKEN: hiển thị màn hình báo mã
 *      không hợp lệ hoặc đã sử dụng trước đó [FUNC-01].
 *   4. Xử lý HTTP 409 CONCURRENT_TRANSACTION_LOCKED: giữ nguyên ghi chú/lựa chọn
 *      của người thụ hưởng và hiển thị nút "Thử lại ngay" [ARCH-01, TC-FE-14].
 *   5. Tích hợp AudioHelpButton ở đầu trang, ZoneVoiceButton tại từng khối thông
 *      tin, PersistentMessageBanner (kèm X-Correlation-Id fallback "Không có")
 *      và BlockingLoadingOverlay [ARCH-02, ARCH-04, NFR-FE-02, TC-FE-18].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Home,
} from 'lucide-react';
import apiClient from '../lib/apiClient.js';
import { BENEFICIARY_CONSENT_STATUSES } from '../features/onboarding/constants/onboardingPhase2Contracts.js';
import PersistentMessageBanner from '../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../components/common/BlockingLoadingOverlay.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import { extractApiErrorInfo } from '../shared/hooks/useTurnstileFailClosed.js';

const TERMINAL_CASE_STATUSES = new Set([
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);

/**
 * Trang BeneficiaryConsentPage: Người thụ hưởng xác nhận hoặc từ chối hồ sơ khai hộ.
 */
export default function BeneficiaryConsentPage() {
  const { token: paramToken } = useParams();
  const [searchParams] = useSearchParams();
  const token = String(paramToken || searchParams.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [consentInfo, setConsentInfo] = useState(null);

  // Các trạng thái đặc biệt của liên kết 1 lần dùng
  const [isExpiredGone, setIsExpiredGone] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [completedDecision, setCompletedDecision] = useState(null);

  // Giữ nguyên ghi chú của người thụ hưởng khi gặp lỗi 409 LCK [ARCH-01]
  const [responseNote, setResponseNote] = useState('');
  const [bannerState, setBannerState] = useState(null);

  /**
   * Tải thông tin chi tiết yêu cầu đồng thuận từ token trên URL
   */
  const fetchConsentDetail = useCallback(async () => {
    if (!token) {
      setIsInvalidToken(true);
      setLoading(false);
      setBannerState({
        type: 'error',
        title: 'Liên kết xác nhận không hợp lệ',
        message:
          'Không tìm thấy mã xác nhận đồng thuận trong đường dẫn. Bác vui lòng mở lại đúng liên kết trong tin nhắn hoặc email.',
        correlationId: 'Không có',
      });
      return;
    }

    setLoading(true);
    setBannerState(null);

    try {
      const res = await apiClient.get(
        '/public/onboarding/beneficiary-consent',
        {
          params: { token },
          headers: { Authorization: '' },
        }
      );
      const data = res.data?.data ?? res.data ?? {};
      const caseStatus = String(
        data.case_status || data.caseStatus || ''
      ).toUpperCase();
      const consentStatus = String(
        data.consent_status || data.consentStatus || ''
      ).toUpperCase();

      // [FUNC-10, TC-FE-01] Nếu hồ sơ đã đạt trạng thái kết thúc hoặc token đã EXPIRED -> coi như hết hiệu lực
      if (
        TERMINAL_CASE_STATUSES.has(caseStatus) ||
        consentStatus === BENEFICIARY_CONSENT_STATUSES.EXPIRED
      ) {
        setIsExpiredGone(true);
        setConsentInfo(null);
        setBannerState({
          type: 'warning',
          title: 'Liên kết đã hết hiệu lực',
          message:
            'Liên kết xác nhận đồng thuận này đã hết thời hạn hoặc hồ sơ đã được xử lý xong.',
          correlationId: res.data?._correlationId || 'Không có',
        });
        return;
      }

      if (consentStatus === BENEFICIARY_CONSENT_STATUSES.CONFIRMED) {
        setCompletedDecision(BENEFICIARY_CONSENT_STATUSES.CONFIRMED);
      }

      setConsentInfo(data);
    } catch (err) {
      const info = extractApiErrorInfo(err);

      // 1. HTTP 410 Gone [FUNC-10, TC-FE-01, TC-FE-10]: "Liên kết đã hết hiệu lực", ẩn mọi nút bấm
      if (
        info.status === 410 ||
        info.code === 'BENEFICIARY_TOKEN_EXPIRED' ||
        info.code === 'ONBOARDING_CASE_TERMINAL_TOKEN_GONE'
      ) {
        setIsExpiredGone(true);
        setConsentInfo(null);
        setBannerState({
          type: 'warning',
          title: 'Liên kết đã hết hiệu lực',
          message: info.message,
          correlationId: info.correlationId,
        });
        return;
      }

      // 2. HTTP 400 INVALID_BENEFICIARY_TOKEN [FUNC-01]: Mã không hợp lệ hoặc đã dùng
      if (
        info.status === 400 ||
        info.code === 'INVALID_BENEFICIARY_TOKEN'
      ) {
        setIsInvalidToken(true);
        setConsentInfo(null);
        setBannerState({
          type: 'error',
          title: 'Mã xác nhận không hợp lệ hoặc đã sử dụng',
          message: info.message,
          correlationId: info.correlationId,
        });
        return;
      }

      setBannerState({
        type: 'error',
        title: 'Không thể tải thông tin xác nhận',
        message: info.message,
        correlationId: info.correlationId,
        actionButton: (
          <button
            type="button"
            onClick={() => fetchConsentDetail()}
            className="min-h-[48px] rounded-xl bg-blue-600 px-4 py-2.5 text-base font-bold text-white hover:bg-blue-700"
          >
            Thử lại ngay
          </button>
        ),
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConsentDetail();
  }, [fetchConsentDetail]);

  /**
   * Gửi quyết định đồng thuận (CONFIRMED) hoặc từ chối (DECLINED) của người được khai hộ
   */
  const handleDecision = async (decision) => {
    if (!token || submitting || isExpiredGone || isInvalidToken) return;

    setSubmitting(true);
    setBannerState(null);

    try {
      const res = await apiClient.post(
        '/public/onboarding/beneficiary-consent/decide',
        {
          token,
          decision,
          note: responseNote.trim() || undefined,
        },
        {
          headers: { Authorization: '' },
        }
      );

      const correlationId =
        res.data?._correlationId || res.data?.correlationId || 'Không có';

      setCompletedDecision(decision);
      setBannerState({
        type: 'success',
        title:
          decision === BENEFICIARY_CONSENT_STATUSES.CONFIRMED
            ? 'Đã xác nhận đồng thuận thành công'
            : 'Đã ghi nhận phản hồi từ chối',
        message:
          decision === BENEFICIARY_CONSENT_STATUSES.CONFIRMED
            ? 'Cảm ơn bác đã xác nhận. Hệ thống đã ghi nhận sự đồng thuận của bác và chuyển hồ sơ tới bước xét duyệt tiếp theo.'
            : 'Hệ thống đã ghi nhận ý kiến không đồng ý của bác và tạm dừng hồ sơ khai hộ này.',
        correlationId,
      });
    } catch (err) {
      const info = extractApiErrorInfo(err);

      // Xử lý 410 Gone ngay tại lúc bấm nút nếu hồ sơ vừa chuyển sang trạng thái kết thúc
      if (
        info.status === 410 ||
        info.code === 'BENEFICIARY_TOKEN_EXPIRED' ||
        info.code === 'ONBOARDING_CASE_TERMINAL_TOKEN_GONE'
      ) {
        setIsExpiredGone(true);
        setConsentInfo(null);
        setBannerState({
          type: 'warning',
          title: 'Liên kết đã hết hiệu lực',
          message: info.message,
          correlationId: info.correlationId,
        });
        return;
      }

      if (
        info.status === 400 ||
        info.code === 'INVALID_BENEFICIARY_TOKEN'
      ) {
        setIsInvalidToken(true);
        setConsentInfo(null);
        setBannerState({
          type: 'error',
          title: 'Mã xác nhận không hợp lệ hoặc đã sử dụng',
          message: info.message,
          correlationId: info.correlationId,
        });
        return;
      }

      // [ARCH-01, TC-FE-14] 409 CONCURRENT_TRANSACTION_LOCKED: giữ nguyên ghi chú, hiện nút Thử lại
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không thể gửi xác nhận đồng thuận',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleDecision(decision)}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-700"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const clanName =
    consentInfo?.clan_name || consentInfo?.tenantName || 'Dòng họ';
  const proxyName =
    consentInfo?.proxy_applicant_name ||
    consentInfo?.guardianName ||
    'Người khai hộ';
  const beneficiaryName =
    consentInfo?.beneficiary_name ||
    consentInfo?.memberName ||
    'Bác';

  return (
    <main className="min-h-screen bg-slate-100 py-6 px-3 sm:px-6 text-slate-900">
      {/* Vòng quay chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={loading || submitting}
        message={
          loading
            ? 'Đang kiểm tra tính hợp lệ của liên kết đồng thuận...'
            : 'Đang ghi nhận phản hồi đồng thuận của bác...'
        }
      />

      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-xl space-y-6">
        {/* Header + AudioHelpButton [NFR-FE-02, TC-FE-18] */}
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <ShieldCheck size={26} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-blue-700">
                Xác nhận đồng thuận người thụ hưởng
              </span>
              <h1 className="mt-1 text-2xl font-black text-slate-900 leading-tight">
                Đồng thuận khai hộ hồ sơ gia phả
              </h1>
            </div>
          </div>

          <AudioHelpButton
            text="Trang xác nhận đồng thuận của người được khai hộ. Khi có người thân đứng ra khai hộ hồ sơ gia phả thay cho bác, hệ thống gửi liên kết này để hỏi ý kiến xác nhận của chính bác. Bác hãy kiểm tra thông tin người khai hộ và bấm Đồng ý xác nhận nếu đúng sự thật."
            label="Nghe hướng dẫn"
            variant="soft"
          />
        </header>

        {/* Banner thông báo nghiệp vụ hợp nhất duy nhất (hiển thị X-Correlation-Id) [ARCH-02] */}
        {bannerState && (
          <PersistentMessageBanner
            type={bannerState.type}
            title={bannerState.title}
            message={bannerState.message}
            correlationId={bannerState.correlationId}
            actionButton={bannerState.actionButton}
          />
        )}

        {/* TRẠNG THÁI 1: HTTP 410 GONE -> "Liên kết đã hết hiệu lực", ẨN MỌI NÚT BẤM [FUNC-10, TC-FE-01] */}
        {!loading && isExpiredGone && (
          <section
            data-testid="beneficiary-token-expired-view"
            className="rounded-3xl border-2 border-amber-300 bg-amber-50/80 p-6 text-center space-y-3"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <Clock size={30} />
            </div>
            <h2 className="text-2xl font-black text-amber-950">
              Liên kết đã hết hiệu lực
            </h2>
            <p className="text-base font-medium leading-relaxed text-amber-900">
              Hồ sơ gia nhập đã hoàn tất xử lý hoặc liên kết xác nhận 1 lần dùng
              này đã hết thời hạn. Mọi thao tác trên liên kết này đã được đóng
              tự động để bảo vệ an toàn thông tin.
            </p>
          </section>
        )}

        {/* TRẠNG THÁI 2: HTTP 400 INVALID TOKEN -> Báo mã không hợp lệ hoặc đã dùng [FUNC-01] */}
        {!loading && !isExpiredGone && isInvalidToken && (
          <section
            data-testid="beneficiary-token-invalid-view"
            className="rounded-3xl border-2 border-rose-300 bg-rose-50/80 p-6 text-center space-y-4"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <XCircle size={30} />
            </div>
            <h2 className="text-2xl font-black text-rose-950">
              Mã xác nhận không hợp lệ hoặc đã được sử dụng
            </h2>
            <p className="text-base font-medium leading-relaxed text-rose-900">
              Đường dẫn xác nhận này không tồn tại hoặc đã được xác nhận trước
              đó. Bác có thể quay về trang chủ Gia Phả Số.
            </p>
            <div className="pt-2">
              <Link
                to="/"
                className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-base font-bold text-white hover:bg-slate-800"
              >
                <Home size={18} />
                <span>Về trang chủ</span>
              </Link>
            </div>
          </section>
        )}

        {/* TRẠNG THÁI 3: ĐÃ HOÀN TẤT XÁC NHẬN / TỪ CHỐI TRONG PHIÊN */}
        {!loading && !isExpiredGone && !isInvalidToken && completedDecision && (
          <section
            data-testid="beneficiary-consent-completed-view"
            className="rounded-3xl border-2 border-emerald-300 bg-emerald-50/80 p-6 text-center space-y-4"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={30} />
            </div>
            <h2 className="text-2xl font-black text-emerald-950">
              {completedDecision === BENEFICIARY_CONSENT_STATUSES.CONFIRMED
                ? 'Bác đã xác nhận đồng thuận thành công'
                : 'Hệ thống đã ghi nhận phản hồi từ chối của bác'}
            </h2>
            <p className="text-base font-medium leading-relaxed text-emerald-900">
              Liên kết một lần dùng này đã hoàn thành nhiệm vụ. Bác có thể đóng
              trang hoặc quay về trang chủ.
            </p>
            <div className="pt-2">
              <Link
                to="/"
                className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3 text-base font-bold text-white hover:bg-emerald-800"
              >
                <Home size={18} />
                <span>Về trang chủ</span>
              </Link>
            </div>
          </section>
        )}

        {/* TRẠNG THÁI 4: HIỂN THỊ THÔNG TIN HỒ SƠ KHAI HỘ & NÚT XÁC NHẬN ĐỒNG THUẬN */}
        {!loading &&
          !isExpiredGone &&
          !isInvalidToken &&
          !completedDecision &&
          consentInfo && (
            <div className="space-y-5">
              {/* Khối thông tin hồ sơ được khai hộ + ZoneVoiceButton [NFR-FE-02] */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-base font-black text-slate-800">
                    <UserCheck size={20} className="text-blue-600" />
                    <span>Thông tin yêu cầu khai hộ</span>
                  </div>
                  <ZoneVoiceButton
                    visible
                    text={`Ông hoặc bà ${proxyName} đang đứng ra khai hộ hồ sơ gia nhập dòng họ ${clanName} cho ${beneficiaryName}. Nếu bác đồng ý cho người này khai hộ và quản lý hồ sơ thay mình, hãy bấm nút Đồng ý xác nhận bên dưới.`}
                    label="Nghe nội dung"
                  />
                </div>

                <dl className="space-y-2.5 text-base">
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-200 pb-2">
                    <dt className="text-slate-600">Dòng họ tham gia:</dt>
                    <dd className="font-black text-slate-950">{clanName}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-200 pb-2">
                    <dt className="text-slate-600">Người đứng ra khai hộ:</dt>
                    <dd className="font-black text-slate-950">{proxyName}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-200 pb-2">
                    <dt className="text-slate-600">Người được khai hộ:</dt>
                    <dd className="font-black text-slate-950">
                      {beneficiaryName}
                    </dd>
                  </div>
                  {consentInfo.relationship_label && (
                    <div className="flex flex-col sm:flex-row sm:justify-between">
                      <dt className="text-slate-600">Mối quan hệ khai báo:</dt>
                      <dd className="font-bold text-slate-900">
                        {consentInfo.relationship_label}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Ô ghi chú phản hồi tùy chọn kèm ZoneVoiceButton */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="beneficiary-consent-note"
                    className="text-base font-bold text-slate-800"
                  >
                    Lời nhắn phản hồi (không bắt buộc)
                  </label>
                  <ZoneVoiceButton
                    visible
                    text="Nếu có lời nhắn gửi Ban Quản trị hoặc người khai hộ, bác nhập vào ô bên dưới."
                    label="Nghe"
                  />
                </div>
                <textarea
                  id="beneficiary-consent-note"
                  rows={2}
                  disabled={submitting}
                  value={responseNote}
                  onChange={(e) => setResponseNote(e.target.value)}
                  placeholder="Ví dụ: Tôi đồng ý để cháu Nguyễn Văn B khai hộ thông tin..."
                  className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </section>

              {/* Hai nút quyết định >= 48px */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    handleDecision(BENEFICIARY_CONSENT_STATUSES.CONFIRMED)
                  }
                  className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-base sm:text-lg font-black text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 size={20} />
                  <span>Đồng ý xác nhận khai hộ</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDecision('DECLINED')}
                  className="min-h-[48px] sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-300 bg-rose-50 px-5 py-3.5 text-base font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                >
                  <XCircle size={20} />
                  <span>Không đồng ý</span>
                </button>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}
