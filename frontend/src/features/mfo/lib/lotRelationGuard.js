/**
 * PATH       : frontend/src/features/mfo/lib/lotRelationGuard.js
 * DATETIME   : 2026-09-21T20:00:00+07:00
 * VERSION    : 1.0.0-D-GUARD
 * DESCRIPTION: Chặn xếp sai vai trên tờ 5L. ADMIN vẫn xác đời lúc duyệt.
 */

export function relationError({ candidate, parent, origin, role }) {
  if (!candidate?.id) return '';
  if (origin?.id && candidate.id === origin.id && role !== 'origin') {
    return 'Không chọn đời gốc làm con hoặc anh/em trên tờ này.';
  }
  if (parent?.id && candidate.id === parent.id) {
    return 'Không chọn cùng một người làm cha và con.';
  }
  if (role === 'child' && parent) {
    if (parent.father_id === candidate.id || parent.mother_id === candidate.id) {
      return 'Người này đã là cha/mẹ trên sổ — không xếp xuống đời con.';
    }
    const py = Number(parent.birth_year);
    const cy = Number(candidate.birth_year);
    if (Number.isFinite(py) && Number.isFinite(cy) && cy < py) {
      return 'Năm sinh con không thể trước năm sinh cha/mẹ.';
    }
    const pg = Number(parent.generation);
    const cg = Number(candidate.generation);
    if (Number.isFinite(pg) && Number.isFinite(cg) && cg <= pg) {
      return 'Đời trên sổ không khớp: con phải sau cha/mẹ. Ban quản trị xác đời khi duyệt.';
    }
  }
  if (role === 'sibling' && parent) {
    const py = Number(parent.birth_year);
    const cy = Number(candidate.birth_year);
    if (Number.isFinite(py) && Number.isFinite(cy) && Math.abs(cy - py) > 60) {
      return 'Năm sinh anh/em lệch quá xa — kiểm tra lại người.';
    }
  }
  return '';
}
