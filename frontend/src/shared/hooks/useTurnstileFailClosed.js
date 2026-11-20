/**
 * ============================================================================
 * PATH       : frontend/src/shared/hooks/useTurnstileFailClosed.js
 * DATETIME   : 2026-11-20T06:15:00+07:00
 * VERSION    : 1.2.0-phase2-fe1-ssot
 * DESCRIPTION:
 * - Custom React Hook dùng chung (src/shared/hooks) quản lý xác thực
 *   Cloudflare Turnstile theo cơ chế Fail-Closed [NFR-02] cho các API
 *   tra cứu công khai (Public Search & Claim Search).
 * - Đảm bảo tự động retry sau khi vượt CAPTCHA tối đa đúng 1 lần/request,
 *   tự động reset widget khi xác thực CAPTCHA thất bại và không auto-retry API
 *   [Section 0.8, TC-FE-12].
 * - Tương thích đồng thời với lỗi đã chuẩn hóa của apiClient.js (statusCode, code)
 *   và lỗi Axios nguyên bản (response.status, response.data.code).
 * CHANGELOGS:
 * - 2026-11-19T17:00:00+07:00 (v1.0.0): Khởi tạo hook Turnstile Fail-Closed.
 * - 2026-11-20T05:54:00+07:00 (v1.1.0): Chuyển vào src/shared/hooks/, khóa retryCountRef.
 * - 2026-11-20T06:15:00+07:00 (v1.2.0-phase2-fe1-ssot):
 *   + Đồng bộ 100% với SSOT onboardingPhase2Contracts.js & apiClient.js (statusCode/code).
 *   + Bổ sung extractApiErrorInfo() chuẩn hóa correlationId fallback "Không có".
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { PHASE2_ERROR_MAP } from '../../features/onboarding/constants/phase2ErrorMap.js';

/**
 * Giới hạn cứng số lần tự động gọi lại API sau khi hoàn tất CAPTCHA trên mỗi request [Section 0.8].
 */
const MAX_AUTO_RETRY_PER_REQUEST = 1;

/**
 * Thời gian chờ tối đa (ms) để script Cloudflare Turnstile sẵn sàng trên window.
 */
const SDK_POLL_INTERVAL_MS = 150;
const SDK_POLL_MAX_ATTEMPTS = 40; // ~6 giây

export const TURNSTILE_CHALLENGE_CODES = Object.freeze({
  TURNSTILE_REQUIRED: 'TURNSTILE_REQUIRED',
  TURNSTILE_FAILED: 'TURNSTILE_FAILED',
});

/**
 * Trích xuất chuẩn hóa thông tin lỗi từ apiClient.js (normalizedError) hoặc Axios error gốc.
 * Đảm bảo correlationId luôn tuân thủ [ARCH-02] (fallback "Không có").
 *
 * @param {any} error
 * @returns {{ status: number, code: string, message: string, correlationId: string, mappedAction: string|null, details: any }}
 */
export function extractApiErrorInfo(error) {
  const status = Number(
    error?.statusCode || error?.response?.status || 500
  );
  const code = String(
    error?.code || error?.response?.data?.code || 'UNKNOWN_ERROR'
  );
  const correlationId =
    error?.correlationId ||
    error?.response?.headers?.['x-correlation-id'] ||
    error?.response?.data?.correlation_id ||
    'Không có';
  const mapped = PHASE2_ERROR_MAP[code];
  const message =
    mapped?.message ||
    error?.message ||
    error?.response?.data?.message ||
    'Đã xảy ra lỗi kết nối máy chủ. Bác vui lòng thử lại sau.';
  const mappedAction = error?.mappedAction || mapped?.action || null;
  const details = error?.details || error?.response?.data?.details || error?.response?.data || null;

  return {
    status,
    code,
    message,
    correlationId,
    mappedAction,
    details,
  };
}

/**
 * Kiểm tra lỗi HTTP trả về từ Backend có phải là yêu cầu/lỗi Turnstile Fail-Closed hay không [NFR-02].
 *
 * @param {any} error - Đối tượng lỗi từ apiClient hoặc Axios
 * @returns {boolean} true nếu là HTTP 403 với mã TURNSTILE_REQUIRED hoặc TURNSTILE_FAILED
 */
export function isTurnstileChallengeError(error) {
  const { status, code, mappedAction } = extractApiErrorInfo(error);
  return (
    mappedAction === 'show_turnstile' ||
    (status === 403 &&
      (code === TURNSTILE_CHALLENGE_CODES.TURNSTILE_REQUIRED ||
        code === TURNSTILE_CHALLENGE_CODES.TURNSTILE_FAILED))
  );
}

/**
 * Hook useTurnstileFailClosed: Điều phối widget Cloudflare Turnstile theo nguyên tắc Fail-Closed.
 *
 * @param {Object} [options={}]
 * @param {string} [options.siteKey] - Cloudflare Turnstile Site Key (mặc định VITE_TURNSTILE_SITE_KEY)
 * @param {string} [options.theme='light'] - Giao diện widget ('light' | 'dark' | 'auto')
 * @param {string} [options.size='normal'] - Kích thước widget ('normal' | 'compact')
 * @param {Function} [options.onVerifySuccess] - Callback nhận verifiedToken khi người dùng tick xanh thành công
 * @param {Function} [options.onVerifyError] - Callback nhận đối tượng lỗi khi CAPTCHA thất bại hoặc hết hạn
 * @returns {Object} Trạng thái và hàm điều khiển widget Turnstile
 */
export default function useTurnstileFailClosed({
  siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '',
  theme = 'light',
  size = 'normal',
  onVerifySuccess,
  onVerifyError,
} = {}) {
  const [isChallengeVisible, setIsChallengeVisible] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [captchaError, setCaptchaError] = useState(null);
  const [isWidgetReady, setIsWidgetReady] = useState(false);

  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  // Bộ đếm số lần đã auto-retry API trong cùng 1 chu kỳ request (chống infinite loop)
  const retryCountRef = useRef(0);

  const onVerifySuccessRef = useRef(onVerifySuccess);
  const onVerifyErrorRef = useRef(onVerifyError);

  useEffect(() => {
    onVerifySuccessRef.current = onVerifySuccess;
  }, [onVerifySuccess]);

  useEffect(() => {
    onVerifyErrorRef.current = onVerifyError;
  }, [onVerifyError]);

  const removeTurnstileWidget = useCallback(() => {
    if (
      widgetIdRef.current !== null &&
      typeof window !== 'undefined' &&
      window.turnstile &&
      typeof window.turnstile.remove === 'function'
    ) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Bỏ qua lỗi nếu node DOM đã bị dọn trước đó
      }
    }
    widgetIdRef.current = null;
    setIsWidgetReady(false);
  }, []);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    if (
      widgetIdRef.current !== null &&
      typeof window !== 'undefined' &&
      window.turnstile &&
      typeof window.turnstile.reset === 'function'
    ) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        removeTurnstileWidget();
      }
    }
  }, [removeTurnstileWidget]);

  /**
   * Đặt lại ngân sách auto-retry về 0 khi người dùng chủ động thực hiện một lượt tìm kiếm mới
   */
  const resetRetryBudget = useCallback(() => {
    retryCountRef.current = 0;
    setCaptchaError(null);
  }, []);

  /**
   * Kích hoạt hiển thị thử thách Turnstile khi nhận 403 TURNSTILE_REQUIRED / FAILED [NFR-02].
   */
  const triggerChallenge = useCallback(() => {
    setTurnstileToken(null);
    setIsChallengeVisible(true);

    if (widgetIdRef.current !== null) {
      resetTurnstile();
    }
  }, [resetTurnstile]);

  /**
   * Ẩn widget và xóa sạch trạng thái sau khi request nghiệp vụ thành công
   */
  const dismissChallenge = useCallback(() => {
    removeTurnstileWidget();
    setIsChallengeVisible(false);
    setTurnstileToken(null);
    setCaptchaError(null);
    retryCountRef.current = 0;
  }, [removeTurnstileWidget]);

  useEffect(() => {
    if (!isChallengeVisible) {
      removeTurnstileWidget();
      return undefined;
    }

    if (!siteKey) {
      const missingKeyError = {
        code: 'TURNSTILE_SITE_KEY_MISSING',
        message:
          'Thiếu cấu hình khóa bảo mật Cloudflare Turnstile (VITE_TURNSTILE_SITE_KEY). Vui lòng liên hệ Ban Quản trị.',
      };
      setCaptchaError(missingKeyError);
      if (onVerifyErrorRef.current) {
        onVerifyErrorRef.current(missingKeyError);
      }
      return undefined;
    }

    let isCancelled = false;
    let pollAttempts = 0;
    let pollTimer = null;

    const mountWidget = () => {
      if (isCancelled || !containerRef.current) return;
      if (widgetIdRef.current !== null) return;

      if (
        typeof window === 'undefined' ||
        !window.turnstile ||
        typeof window.turnstile.render !== 'function'
      ) {
        pollAttempts += 1;
        if (pollAttempts <= SDK_POLL_MAX_ATTEMPTS) {
          pollTimer = setTimeout(mountWidget, SDK_POLL_INTERVAL_MS);
        } else {
          const sdkError = {
            code: 'TURNSTILE_SDK_UNAVAILABLE',
            message:
              'Không thể tải mô-đun xác minh chống tự động. Vui lòng kiểm tra kết nối mạng và thử lại.',
          };
          setCaptchaError(sdkError);
          if (onVerifyErrorRef.current) {
            onVerifyErrorRef.current(sdkError);
          }
        }
        return;
      }

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          callback: (verifiedToken) => {
            if (isCancelled) return;
            setCaptchaError(null);
            setTurnstileToken(verifiedToken);

            // Chỉ tự động gọi lại API tối đa 1 lần / request [Section 0.8] (TC-FE-12 Scenario 1)
            if (retryCountRef.current < MAX_AUTO_RETRY_PER_REQUEST) {
              retryCountRef.current += 1;
              if (onVerifySuccessRef.current) {
                onVerifySuccessRef.current(verifiedToken);
              }
            }
          },
          'error-callback': (errorCode) => {
            if (isCancelled) return;
            // TC-FE-12 Scenario 2: Báo lỗi, tự động reset widget và KHÔNG auto-retry API
            setTurnstileToken(null);
            const failError = {
              code: TURNSTILE_CHALLENGE_CODES.TURNSTILE_FAILED,
              detailCode: errorCode || 'CHALLENGE_ERROR',
              message:
                PHASE2_ERROR_MAP.TURNSTILE_FAILED?.message ||
                'Xác thực bảo mật Turnstile thất bại. Widget đã được đặt lại, bác vui lòng tích xác nhận lại.',
            };
            setCaptchaError(failError);
            resetTurnstile();
            if (onVerifyErrorRef.current) {
              onVerifyErrorRef.current(failError);
            }
          },
          'expired-callback': () => {
            if (isCancelled) return;
            setTurnstileToken(null);
            const expiredError = {
              code: 'TURNSTILE_TOKEN_EXPIRED',
              message:
                'Mã xác thực bảo mật đã hết hạn. Bác vui lòng tích lại vào ô xác nhận.',
            };
            setCaptchaError(expiredError);
            resetTurnstile();
            if (onVerifyErrorRef.current) {
              onVerifyErrorRef.current(expiredError);
            }
          },
        });
        setIsWidgetReady(true);
      } catch (err) {
        const renderError = {
          code: 'TURNSTILE_RENDER_ERROR',
          message:
            err?.message ||
            'Không thể khởi tạo khung xác minh bảo mật. Bác vui lòng tải lại trang.',
        };
        setCaptchaError(renderError);
        if (onVerifyErrorRef.current) {
          onVerifyErrorRef.current(renderError);
        }
      }
    };

    mountWidget();

    return () => {
      isCancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      removeTurnstileWidget();
    };
  }, [isChallengeVisible, siteKey, theme, size, removeTurnstileWidget, resetTurnstile]);

  return {
    isChallengeVisible,
    isWidgetReady,
    turnstileToken,
    captchaError,
    containerRef,
    triggerChallenge,
    resetTurnstile,
    resetRetryBudget,
    dismissChallenge,
    canAutoRetry: retryCountRef.current < MAX_AUTO_RETRY_PER_REQUEST,
  };
}
