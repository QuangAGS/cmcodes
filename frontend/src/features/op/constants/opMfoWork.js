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
  title: 'Khai năm đời của tôi',
  blurb: 'Xin phép tờ khai tối đa năm đời trực hệ. Bạn phải có mặt trên tờ.',
  listen: 'Việc này là tờ khai năm đời của bạn. Gửi trước, Ban quản trị đồng ý rồi mới được ghi người lên sổ.',
};

export const OP_MFO_STATUS = {
  DRAFT: 'Đang soạn',
  PENDING: 'Chờ duyệt',
  UNDER_REVIEW: 'Đang được xem',
  PLAN_OK: 'Được làm theo tờ đã duyệt',
  NEEDS_REVISION: 'Cần sửa kết quả',
  APPROVED: 'Đã đóng',
  REJECTED: 'Không được duyệt',
  WITHDRAWN: 'Đã rút',
};

export function opMfoStatusLabel(ticket) {
  const st = String(ticket?.status || '').toUpperCase();
  const planOk = Boolean(ticket?.payload?.plan_ok);
  if (st === 'UNDER_REVIEW' && planOk) return OP_MFO_STATUS.PLAN_OK;
  return OP_MFO_STATUS[st] || 'Đang xử lý';
}
