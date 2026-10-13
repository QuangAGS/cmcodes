/**
 * PATH       : frontend/src/features/mfo/lib/mfoDraftStore.js
 * DATETIME   : 2026-10-09T12:35:00+07:00
 * VERSION    : 6.0.0-SRPF-STAGING-CLEANUP
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn 100% ranh giới lưu trữ Staging) & Q2 (Code Format & Chú thích đầy đủ).
 * - Loại bỏ toàn bộ logic lưu trữ nháp đồ thị dưới localStorage ở Client (saveLotDraft, getLotDraft, listLotDrafts)[cite: 38].
 * - Mọi bản nháp DRAFT nay được lưu trữ Staging 100% trên Database Server qua API saveDraft (bảng proposals)[cite: 27].
 * - Giữ lại duy nhất hàm clearPickCache() và clearMfoClientOnLogin() để dọn dẹp sessionStorage khi đăng xuất/chuyển phiên[cite: 38].
 * CHANGELOG  :
 * - 2026-10-09: Tối giản hóa mfoDraftStore, xóa bỏ hoàn toàn storage nháp client cũ[cite: 38].
 */

/**
 * Xóa sạch toàn bộ cache phiên chọn người (mốc M, dòng chọn, vai trò) trên sessionStorage
 */
export function clearPickCache() {
  const MFO_CACHE_KEYS = [
    'mfo.originPick',
    'mfo.linePick',
    'mfo.spousePick',
    'mfo.siblingPick',
    'mfo.assignLine',
    'mfo.pickRole',
    'mfo.siblingIndex',
    'mfo.planDraft',
    'mfo.memberBook',
  ];

  MFO_CACHE_KEYS.forEach((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore storage exception */
    }
  });
}

/**
 * Xử lý dọn dẹp bộ nhớ đệm client khi người dùng đăng nhập hoặc chuyển đổi tài khoản
 */
export function clearMfoClientOnLogin() {
  clearPickCache();
  try {
    localStorage.removeItem('mfo.lotDraftActive');
  } catch {
    /* ignore storage exception */
  }
}

export default {
  clearPickCache,
  clearMfoClientOnLogin,
};