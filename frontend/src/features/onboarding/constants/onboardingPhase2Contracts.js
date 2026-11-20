/**
 * ============================================================================
 * PATH       : src/features/onboarding/constants/onboardingPhase2Contracts.js
 * DATETIME   : 2026-11-20T07:40:00+07:00
 * VERSION    : 1.5.0-ISO29148-UAT-BUG1-FIX
 * DESCRIPTION: Hợp đồng dữ liệu Phase 2 đồng bộ với AMEND-RP-OP-2026-03-BASELINE v7.0.
 * CHANGELOGS:
 * - 2026-11-19T16:30:00+07:00 (v1.4.0-ISO29148): Khởi tạo hằng số hợp đồng Phase 2.
 * - 2026-11-20T07:40:00+07:00 (v1.5.0-ISO29148-UAT-BUG1-FIX):
 *   + Fix UAT Bug 1: Bổ sung export PHASE2_ERROR_CODES đồng bộ với phase2ErrorMap.js
 *     và useTurnstileFailClosed.js để ngăn lỗi ESM SyntaxError khi khởi động Vite.
 *   + Bảo toàn 100% toàn bộ hằng số và hàm sanitizeOnboardingMetadata hiện có (Q2).
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

export const CLAIM_MODES = Object.freeze({
  CREATE_NEW: 'CREATE_NEW',
  CLAIM_EXISTING: 'CLAIM_EXISTING',
});

export const REFERRAL_STATUSES = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

export const BENEFICIARY_CONSENT_STATUSES = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
});

export const PHASE2_ERROR_CODES = Object.freeze({
  RULES_SNAPSHOT_TOO_LONG: 'RULES_SNAPSHOT_TOO_LONG',
  REFERRER_COOLDOWN_ACTIVE: 'REFERRER_COOLDOWN_ACTIVE',
  REFERRER_DECEASED: 'REFERRER_DECEASED',
  INVALID_BENEFICIARY_TOKEN: 'INVALID_BENEFICIARY_TOKEN',
  TURNSTILE_REQUIRED: 'TURNSTILE_REQUIRED',
  TURNSTILE_FAILED: 'TURNSTILE_FAILED',
  CLAIM_HOPPING_DETECTED: 'CLAIM_HOPPING_DETECTED',
  CONCURRENT_TRANSACTION_LOCKED: 'CONCURRENT_TRANSACTION_LOCKED',
  ALREADY_LINKED_TO_TENANT: 'ALREADY_LINKED_TO_TENANT',
  BENEFICIARY_TOKEN_EXPIRED: 'BENEFICIARY_TOKEN_EXPIRED',
  ONBOARDING_CASE_TERMINAL_TOKEN_GONE: 'ONBOARDING_CASE_TERMINAL_TOKEN_GONE',
  ONBOARDING_QA_LOCKED: 'ONBOARDING_QA_LOCKED',
  PUBLIC_SEARCH_RATE_LIMITED: 'PUBLIC_SEARCH_RATE_LIMITED',
  CLAIM_SEARCH_RATE_LIMITED: 'CLAIM_SEARCH_RATE_LIMITED',
  IN_APP_SEARCH_RATE_LIMITED: 'IN_APP_SEARCH_RATE_LIMITED',
});

export const ALLOWED_METADATA_KEYS = Object.freeze([
  'staging_cleanup',
  'offline_verifications',
  'referral_history',
]);

export const MAX_RULES_SNAPSHOT_LENGTH = 30000;
export const MAX_QA_ATTEMPTS = 3;
export const REFERRER_COOLDOWN_DAYS = 7;
export const CLAIM_HOPPING_WINDOW_DAYS = 90;

/**
 * [ARCH-06] Lọc và chuẩn hóa metadata theo đúng 3 khóa gốc được Backend cấp phép.
 * @param {unknown} rawMetadata
 * @returns {{
 *   staging_cleanup?: { cleanup_status: 'PENDING'|'CLEANED'|'FAILED', prefix: string },
 *   offline_verifications?: Array<{ id: string, endorser_name: string, call_status: 'VERIFIED'|'UNREACHABLE', notes?: string }>,
 *   referral_history?: Array<{ referrer_id: string, status: 'DECLINED', decided_at: string }>
 * }}
 */
export function sanitizeOnboardingMetadata(rawMetadata) {
  const base =
    rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? rawMetadata
      : {};
  const clean = {};
  for (const key of ALLOWED_METADATA_KEYS) {
    if (base[key] !== undefined) {
      clean[key] = base[key];
    }
  }
  return clean;
}
