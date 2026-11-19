/**
 * Chuẩn hóa đọc/ghi namespace cho onboarding_cases.metadata [ARCH-06].
 * Chỉ cho phép 3 khóa chuẩn ở root: staging_cleanup, offline_verifications, referral_history.
 */
const ALLOWED_METADATA_KEYS = Object.freeze([
  'staging_cleanup',
  'offline_verifications',
  'referral_history',
]);

/**
 * @typedef {Object} OnboardingCaseMetadata
 * @property {{ cleanup_status: 'PENDING' | 'CLEANED' | 'FAILED', prefix: string }} [staging_cleanup]
 * @property {Array<{ id: string, endorser_name: string, call_status: 'VERIFIED' | 'UNREACHABLE', notes?: string }>} [offline_verifications]
 * @property {Array<{ referrer_id: string, status: 'DECLINED', decided_at: string }>} [referral_history]
 */

/**
 * Hợp nhất dữ liệu metadata hiện có với patch mới, loại bỏ mọi key lạ ngoài quy chuẩn [ARCH-06].
 * @param {unknown} currentMetadata
 * @param {Partial<OnboardingCaseMetadata>} patch
 * @returns {OnboardingCaseMetadata}
 */
function mergeOnboardingMetadata(currentMetadata, patch = {}) {
  const base =
    currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
      ? currentMetadata
      : {};
  const next = {};

  for (const key of ALLOWED_METADATA_KEYS) {
    if (patch[key] !== undefined) {
      next[key] = patch[key];
    } else if (base[key] !== undefined) {
      next[key] = base[key];
    }
  }
  return next;
}

module.exports = {
  ALLOWED_METADATA_KEYS,
  mergeOnboardingMetadata,
};
