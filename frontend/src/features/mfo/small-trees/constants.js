/**
 * PATH       : features/mfo/small-trees/constants.js
 * DATETIME   : 2026-11-26T08:00:00+07:00
 * VERSION    : 1.0.0-FE02
 * DESCRIPTION:
 * - Nhãn hiển thị tiếng Việt cho trạng thái Small Trees.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

export const SMALL_TREE_STATUS_LABELS = {
  CHO_GHEP: 'Chờ ghép',
  DA_GHEP: 'Đã ghép',
  HUY: 'Đã hủy',
};

export function getStatusLabel(status) {
  return SMALL_TREE_STATUS_LABELS[status] || status || 'N/A';
}
