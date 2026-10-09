/**
 * PATH       : frontend/src/features/mfo/lib/mfoLifecycleMapper.js
 * DATETIME   : 2026-10-09T09:25:00+07:00
 * VERSION    : 2.0.0-LIFECYCLE-MAPPER-SRPF
 * DESCRIPTION:
 * - Mapper giải mã Vòng đời 2 Cổng MFO (Gate 1 PLAN <-> Workbench <-> Gate 2 RESULT).
 * - Chuyển đổi trạng thái ticket/proposal từ Backend thành chế độ UI/UX nhất quán.
 * REFERENCE  : MFO Core Lifecycle 2.0 Architectural Specification
 */

/**
 * Thuật toán giải mã Vòng đời MFO 5L (Lifecycle Resolver)
 * 
 * @param {Object|null} ticket - Bản ghi tờ trình từ Backend API
 * @returns {Object} Cấu hình chế độ giao diện, cờ read-only và trạng thái Active Form (AF)
 */
export function resolveMfoLifecycle(ticket) {
  // 1. Trường hợp Khung mới hoàn toàn (Chưa khởi tạo tờ trình)
  if (!ticket) {
    return {
      stage: 'PLAN',
      mode: 'NEW_CANVAS',
      statusLabel: 'Chưa khởi tạo',
      isReadOnly: false,
      isWorkbench: false,
      canEditCanvas: true,
      canSubmitPlan: true,
      canSubmitResult: false,
      afContext: 'FULL_UNLOCKED', // Mở 100% 3 nút tác vụ trên AF
      badgeClass: 'bg-slate-100 text-slate-700',
    };
  }

  const status = String(ticket.status || 'DRAFT').toUpperCase();
  const payload = ticket.payload || ticket || {};
  
  const planOk = Boolean(payload.plan_ok);
  const resultSubmitted = Boolean(payload.result_submitted);
  const resultOk = Boolean(payload.result_ok);

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 1: THẨM ĐỊNH KHUNG HÌNH HỌC (PLAN - GATE 1)
  // ---------------------------------------------------------------------------
  if (!planOk) {
    // 1.1 Soạn nháp, Yêu cầu sửa lại, hoặc Bị bác bỏ -> Mở lại Canvas chỉnh sửa
    if (status === 'DRAFT' || status === 'NEEDS_REVISION' || status === 'REJECTED') {
      return {
        stage: 'PLAN',
        mode: 'EDIT_CANVAS',
        statusLabel: status === 'NEEDS_REVISION' ? 'Khung yêu cầu sửa lại' : status === 'REJECTED' ? 'Khung không được duyệt' : 'Khung đang soạn',
        isReadOnly: false,
        isWorkbench: false,
        canEditCanvas: true,
        canSubmitPlan: true,
        canSubmitResult: false,
        afContext: 'FULL_UNLOCKED', // Mở 100% 3 nút tác vụ trên AF để sửa theo Bút phê
        badgeClass: status === 'NEEDS_REVISION' ? 'bg-amber-100 text-amber-900 border-amber-300' : status === 'REJECTED' ? 'bg-rose-100 text-rose-900 border-rose-300' : 'bg-indigo-100 text-indigo-900 border-indigo-300',
      };
    }

    // 1.2 Đang chờ thẩm định (SUBMITTED / PENDING / UNDER_REVIEW) -> Đóng băng Read-Only
    return {
      stage: 'PLAN',
      mode: 'VIEW_CANVAS_FROZEN',
      statusLabel: 'Khung chờ duyệt',
      isReadOnly: true,
      isWorkbench: false,
      canEditCanvas: false,
      canSubmitPlan: false,
      canSubmitResult: false,
      afContext: 'DISABLED', // Khóa popup AF
      badgeClass: 'bg-amber-500 text-white',
    };
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN TRUNG GIAN & 2: XƯỞNG THI CÔNG & NGHIỆM THU TỜ KHAI (RESULT - GATE 2)
  // ---------------------------------------------------------------------------

  // 2.1 Đã duyệt Khung (plan_ok = true), Đang mở Xưởng kê khai Workbench
  if (planOk && !resultSubmitted && !resultOk) {
    if (status === 'NEEDS_REVISION') {
      return {
        stage: 'WORKBENCH',
        mode: 'WORKBENCH_ACTIVE',
        statusLabel: 'Tờ khai yêu cầu sửa lại',
        isReadOnly: false,
        isWorkbench: true,
        canEditCanvas: false,
        canSubmitPlan: false,
        canSubmitResult: true,
        afContext: 'WORKBENCH_SMP', // Mở form điền SMP
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      };
    }

    return {
      stage: 'WORKBENCH',
      mode: 'WORKBENCH_ACTIVE',
      statusLabel: 'Khung đã duyệt (Khai tờ khai)',
      isReadOnly: false,
      isWorkbench: true,
      canEditCanvas: false,
      canSubmitPlan: false,
      canSubmitResult: true,
      afContext: 'WORKBENCH_SMP',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }

  // 2.2 Đã nộp Tờ khai Kết quả (result_submitted = true), Chờ Admin Nghiệm thu
  if (planOk && resultSubmitted && !resultOk) {
    return {
      stage: 'RESULT',
      mode: 'RESULT_FROZEN',
      statusLabel: 'Tờ khai chờ duyệt',
      isReadOnly: true,
      isWorkbench: false,
      canEditCanvas: false,
      canSubmitPlan: false,
      canSubmitResult: false,
      afContext: 'DISABLED',
      badgeClass: 'bg-amber-600 text-white',
    };
  }

  // 2.3 Lô đã Nghiệm thu hoàn tất (result_ok = true / APPROVED)
  if (resultOk || status === 'APPROVED') {
    return {
      stage: 'CLOSED',
      mode: 'ARCHIVED',
      statusLabel: 'Tờ khai đã được duyệt',
      isReadOnly: true,
      isWorkbench: false,
      canEditCanvas: false,
      canSubmitPlan: false,
      canSubmitResult: false,
      afContext: 'DISABLED',
      badgeClass: 'bg-blue-600 text-white',
    };
  }

  // Fallback an toàn
  return {
    stage: 'PLAN',
    mode: 'VIEW_CANVAS_FROZEN',
    statusLabel: 'Đóng băng',
    isReadOnly: true,
    isWorkbench: false,
    canEditCanvas: false,
    canSubmitPlan: false,
    canSubmitResult: false,
    afContext: 'DISABLED',
    badgeClass: 'bg-slate-200 text-slate-800',
  };
}