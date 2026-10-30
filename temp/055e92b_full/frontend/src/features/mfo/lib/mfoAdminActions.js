/**
 * PATH       : frontend/src/features/mfo/lib/mfoAdminActions.js
 * DATETIME   : 2026-10-13T17:07:00+07:00
 * VERSION    : 1.0.0-LAT5
 * DESCRIPTION: Quyền duyệt theo flags của tờ đang chọn, không theo tab UI.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích thời gian.
 */
/**
 * <2026-10-13T17:07:00+07:00>
 * Mục đích: Đọc flags ở response phẳng hoặc payload, false không bị thay bởi fallback.
 */
export function adminGate(plan) {
  const payload=plan?.payload || {};
  const planOk=plan?.plan_ok ?? payload.plan_ok ?? payload.business_layer?.plan_ok;
  return planOk===true ? 'RESULT' : 'PLAN';
}
/**
 * <2026-10-13T17:07:00+07:00>
 * Mục đích: Chỉ tờ đang chờ review mới bật quyết định; tờ ghi sổ/đóng không thao tác được.
 */
export function canAdminReview(plan, expectedGate = adminGate(plan)) {
  if (!plan || adminGate(plan)!==expectedGate) return false;
  const payload=plan.payload || {};
  if (plan.result_ok===true || payload.result_ok===true) return false;
  const status=String(plan.status || '').toUpperCase();
  if(expectedGate==='PLAN')return status==='PENDING' || status==='UNDER_REVIEW';
  return status==='UNDER_REVIEW' && (plan.result_submitted ?? payload.result_submitted)===true;
}
