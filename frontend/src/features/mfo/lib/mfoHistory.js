/**
 * PATH       : frontend/src/features/mfo/lib/mfoHistory.js
 * DATETIME   : 2026-10-13T15:24:00+07:00
 * VERSION    : 1.0.0-LAT4
 * DESCRIPTION: Chuẩn hóa lịch sử thật; không dùng payload hiện tại để giả bản cũ.
 * RULE       : Q1 bảo tồn ngoài lịch sử; Q2 metadata và chú thích thời gian.
 */
import { diffDraftAgainstInit } from './mfoDiffEngine.js';
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Gộp source phẳng/nested cho /op và admin, không mutate nguồn.
 */
export function historySource(plan) {
  const nested = plan?.payload || {};
  return {
    ...plan,
    ...nested,
    submission_history: nested.submission_history || plan?.submission_history || [],
    review_rounds: nested.review_rounds || plan?.review_rounds || []
  };
}
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Ưu tiên lịch sử chụp thật; legacy rounds chỉ dùng dữ liệu riêng của round.
 */
export function historyEntries(plan) {
  const source = historySource(plan);
  if (source.submission_history.length) return source.submission_history.map((entry, index) => ({
    ...entry,
    id: entry.id || `entry:${index}`,
    title: `Lần trình ${entry.attempt_no || index + 1} — ${entry.gate === 'RESULT' ? 'Tờ khai' : 'Nhánh phả hệ'}`
  }));
  return (source.review_rounds || []).map((round, index) => ({
    id: `legacy:${index}`,
    gate: round.gate || 'PLAN',
    attempt_no: round.attempt_no || index + 1,
    title: `Lần trình ${round.attempt_no || index + 1} — ${round.gate === 'RESULT' ? 'Tờ khai' : 'Nhánh phả hệ'}`,
    submitted_at: round.submitted_at || null,
    reviewed_at: round.reviewed_at || null,
    outcome: round.outcome || null,
    admin_note: round.global_admin_note || round.admin_note || null,
    review_scs: round.review_scs || [],
    summary: round.init_scs || round.diff_summary || [],
    snapshot: round.snapshot || (round.graph_snapshot ? {
      graph_snapshot: round.graph_snapshot,
      canvas_delta: round.canvas_delta || {},
      smp_staging_data: round.smp_staging_data || {},
      lines: round.lines || []
    } : null)
  }));
}
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Tóm tắt theo đời từ đúng snapshot/summary của lần trình, không lấy từ plan hiện tại.
 */
export function historySummary(entry) {
  const snapshot = entry?.snapshot;
  if (!snapshot) {
    const summary = entry?.summary || [];
    return [0, 1, 2, 3, 4].map(depth => {
      const row = summary.find((item, index) => Number(item.depth ?? index) === depth);
      return `Đời ${depth}: ${row?.text || row?.summary_text || 'Không có dữ liệu tóm tắt được lưu.'}`;
    });
  }
  if (entry.gate !== 'RESULT') return diffDraftAgainstInit(snapshot).map((row, depth) => `Đời ${depth}: ${row.text}`);
  const rows = [[], [], [], [], []],
    nodes = snapshot.graph_snapshot?.nodes || [],
    staging = snapshot.smp_staging_data || {},
    delta = snapshot.canvas_delta || {};
  (delta.draft_children || []).forEach(child => {
    const depth = Number(child.depth);
    if (rows[depth]) rows[depth].push(staging[child.id]?.full_name || child.label || 'Chưa có hồ sơ');
  });
  (delta.draft_spouses || []).forEach(spouse => {
    const owner = nodes.find(node => node.id === spouse.owner_node_id);
    const depth = Number(owner?.data?.depth);
    if (rows[depth]) rows[depth].push(`Hôn phối: ${staging[spouse.union_id]?.full_name || spouse.partner_name || 'Chưa có hồ sơ'}`);
  });
  return rows.map((values, depth) => `Đời ${depth}: ${values.length ? values.join('. ') + '.' : 'Không thêm gì.'}`);
}
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Sao chép snapshot xem riêng; tuyệt đối không trả snapshot hiện tại khi thiếu bản cũ.
 */
export function previewSnapshot(entry) {
  const snapshot = entry?.snapshot?.graph_snapshot;
  return snapshot && Array.isArray(snapshot.nodes) ? JSON.parse(JSON.stringify(snapshot)) : null;
}
