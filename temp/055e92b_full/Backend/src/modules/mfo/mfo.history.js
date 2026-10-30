/**
 * PATH       : Backend/src/modules/mfo/mfo.history.js
 * DATETIME   : 2026-10-13T15:24:00+07:00
 * VERSION    : 1.0.0-LAT4
 * DESCRIPTION: Lưu snapshot theo lần trình ở payload, trong transaction SRPF hiện có.
 * RULE       : Q1 bảo tồn ngoài lịch sử; Q2 metadata và chú thích thời gian.
 */
'use strict';

/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Sao chép dữ liệu JSON, không giữ tham chiếu đến payload/cây đang sửa.
 */
function copyJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Lưu đúng nội dung lúc SUBMIT; history cũ được giữ, không lấy snapshot mới đắp lên lần cũ.
 */
function recordSubmission(payload, gate, actor, now = new Date()) {
  const root = payload || {};
  const layer = root.business_layer || root;
  const history = copyJson(root.submission_history || []) || [];
  // <2026-10-13T15:24:00+07:00> Giữ legacy đã lưu; snapshot chỉ lấy từ round, không lấy payload hiện tại.
  if (!history.length) {
    (root.review_rounds || []).forEach((round, index) => history.push({
      id: `PLAN:legacy:${index}`,
      gate: 'PLAN',
      attempt_no: round.attempt_no || index + 1,
      submitted_at: round.submitted_at || null,
      reviewed_at: round.reviewed_at || null,
      outcome: round.outcome || null,
      admin_note: round.global_admin_note || round.admin_note || null,
      review_scs: copyJson(round.review_scs || []),
      summary: copyJson(round.init_scs || round.diff_summary || []),
      snapshot: copyJson(round.snapshot || null),
      legacy: true
    }));
  }
  const attempt = history.filter(entry => entry.gate === gate).length + 1;
  const entry = {
    id: `${gate}:${attempt}`,
    gate,
    attempt_no: attempt,
    submitted_at: now.toISOString(),
    requester_user_id: actor?.actor_id || actor?.user_id || null,
    outcome: gate === 'PLAN' ? 'PENDING' : 'UNDER_REVIEW',
    reviewed_at: null,
    reviewer_user_id: null,
    admin_note: null,
    review_scs: [],
    snapshot: copyJson({
      graph_snapshot: layer.graph_snapshot || root.graph_snapshot || root.ui_render_snapshot_layer?.graph_snapshot || null,
      canvas_delta: layer.canvas_delta || root.canvas_delta || {},
      lines: layer.lines || root.lines || [],
      smp_staging_data: layer.smp_staging_data || root.smp_staging_data || {},
      init_scs: layer.init_scs || root.init_scs || root.diff_summary || [],
      target_member_id: layer.target_member_id || root.target_member_id || null,
      selected_canvas_depth: layer.selected_canvas_depth ?? root.selected_canvas_depth ?? root.k ?? null
    })
  };
  history.push(entry);
  return history;
}
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Cập nhật quyết định cho lần trình đang mở, không thay snapshot đã chụp hoặc trạng thái process.
 */
function recordReview(payload, gate, outcome, actor, incoming = {}, now = new Date()) {
  const history = copyJson(payload?.submission_history || []) || [];
  let index = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].gate === gate && !history[i].reviewed_at) {
      index = i;
      break;
    }
  }
  if (index < 0) return history;
  const prepared = incoming.prepared_payload || {};
  const note = incoming.revision_request || incoming.reason || incoming.admin_note || incoming.note || prepared.admin_note || null;
  history[index] = {
    ...history[index],
    outcome,
    reviewed_at: now.toISOString(),
    reviewer_user_id: actor?.actor_id || actor?.user_id || null,
    admin_note: note,
    review_scs: copyJson(incoming.review_scs || prepared.review_scs || [])
  };
  return history;
}
module.exports = {
  recordSubmission,
  recordReview
};
