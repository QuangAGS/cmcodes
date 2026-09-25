/**
 * PATH       : frontend/src/features/op/constants/opMfoWork.js
 * DATETIME   : 2026-09-20T10:50:00+07:00
 * VERSION    : 1.0.0-C1
 * DESCRIPTION: Tầng 2 — mục việc /op cho MFO SELF.
 *              Orchestrator chữ catalog + trạng thái việc.
 *              Không chứa hint từng dòng 5L.
 */

export const OP_MFO_WORK = {
  key: 'mfo-plan-self',
  path: '/op/mfo/plans/new',
  listPath: '/op/mfo/plans',
  title: 'Tạo khung dự kiến',
  blurb: 'Tạo khung tối đa năm đời trực hệ. Bạn phải có mặt trên khung. Duyệt khung xong mới mở tờ khai.',
  listen: 'Việc này là tạo khung dự kiến năm đời. Trình khung, Ban quản trị duyệt khung, rồi mới mở tờ khai theo khung.',
};

export const OP_MFO_STATUS = {
  DRAFT: 'Đang tạo khung dự kiến',
  PENDING: 'Chờ duyệt khung',
  UNDER_REVIEW: 'Chờ duyệt khung',
  PLAN_OK: 'Khung đã duyệt',
  RESULT_WAIT: 'Chờ duyệt tờ khai',
  NEEDS_REVISION: 'Cần sửa kết quả khai báo',
  APPROVED: 'Tờ khai đã duyệt',
  REJECTED: 'Khung bị từ chối',
  REJECTED_RESULT: 'Tờ khai bị từ chối',
  WITHDRAWN: 'Đã rút',
};

export function opMfoStatusLabel(ticket) {
  const st = String(ticket?.status || '').toUpperCase();
  let p = ticket?.payload;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = {};
    }
  }
  const planOk = Boolean(ticket?.plan_ok || p?.plan_ok);
  const resultOk = Boolean(ticket?.result_ok || p?.result_ok);
  const submitted = Boolean(ticket?.result_submitted || p?.result_submitted);
  if (st === 'NEEDS_REVISION') return OP_MFO_STATUS.NEEDS_REVISION;
  if (st === 'REJECTED' && planOk) return OP_MFO_STATUS.REJECTED_RESULT;
  if (st === 'APPROVED' || resultOk) return OP_MFO_STATUS.APPROVED;
  if (planOk && submitted && !resultOk) return OP_MFO_STATUS.RESULT_WAIT;
  if (planOk && !resultOk) return OP_MFO_STATUS.PLAN_OK;
  return OP_MFO_STATUS[st] || 'Đang xử lý';
}
