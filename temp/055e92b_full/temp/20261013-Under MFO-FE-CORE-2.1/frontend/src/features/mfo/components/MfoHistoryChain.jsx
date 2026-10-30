/**
 * PATH       : frontend/src/features/mfo/components/MfoHistoryChain.jsx
 * DATETIME   : 2026-10-12T08:25:00+07:00
 * VERSION    : 1.1.0-SAME-SOURCE
 * DESCRIPTION: Tóm tắt theo đời. Đọc payload lồng hoặc chi tiết phẳng từ getDraftPayload.
 */
import { diffDraftAgainstInit } from '../lib/mfoDiffEngine.js';

/**
 * <2026-10-12T08:25:00+07:00>
 * Purpose: Gộp nguồn. Admin truyền chi tiết phẳng, /op truyền plan.payload.
 */
function sourceOf(plan) {
  const nested = plan?.payload && typeof plan.payload === 'object' ? plan.payload : {};
  return {
    ...nested,
    canvas_delta: nested.canvas_delta || plan?.canvas_delta || {},
    graph_snapshot: nested.graph_snapshot || plan?.graph_snapshot || null,
    init_scs: nested.init_scs || plan?.init_scs || null,
    diff_summary: nested.diff_summary || plan?.diff_summary || null,
    smp_staging_data: nested.smp_staging_data || plan?.smp_staging_data || {},
    plan_ok: nested.plan_ok ?? plan?.plan_ok,
    result_submitted: nested.result_submitted ?? plan?.result_submitted,
    result_ok: nested.result_ok ?? plan?.result_ok,
    approver_note: nested.approver_note || plan?.approver_note || null,
    reject_reason: nested.reject_reason || plan?.reject_reason || null,
    lines: nested.lines || plan?.lines || [],
  };
}

/**
 * <2026-10-12T08:25:00+07:00>
 * Purpose: Tóm tắt khung theo đời, cùng engine với cửa 1.
 */
function frameLines(plan) {
  const payload = sourceOf(plan);
  const hasLive = payload.canvas_delta || payload.graph_snapshot;
  if (hasLive || !payload.init_scs) {
    return diffDraftAgainstInit(payload).map((block, idx) => `Đời ${idx}: ${block.text || 'Không thêm gì.'}`);
  }
  return (payload.init_scs || []).map((item, idx) => `Đời ${idx}: ${item.text || item.summary_text || 'Không thêm gì.'}`);
}

/**
 * <2026-10-12T08:25:00+07:00>
 * Purpose: Tóm tắt tờ khai theo đời từ staging.
 */
function resultLines(plan) {
  const payload = sourceOf(plan);
  const delta = payload.canvas_delta || {};
  const staging = payload.smp_staging_data || {};
  const nodes = Array.isArray(payload.graph_snapshot?.nodes) ? payload.graph_snapshot.nodes : [];
  const nameOf = (nodeId) => nodes.find((n) => n.id === nodeId)?.data?.clanName || '';
  const byDepth = [0, 1, 2, 3, 4].map(() => []);
  (delta.draft_spouses || []).forEach((row) => {
    const depth = Number(nodes.find((n) => n.id === row.owner_node_id)?.data?.depth ?? 0);
    const smp = staging[row.union_id];
    const owner = nameOf(row.owner_node_id) || 'Người trên khung';
    byDepth[depth]?.push(`${owner}: hồ sơ hôn phối ${smp?.full_name ? `đã ghi (${smp.full_name})` : 'chưa ghi'}`);
  });
  (delta.draft_children || []).forEach((row) => {
    const depth = Number(row.depth || 0);
    const smp = staging[row.id];
    const parent = nameOf(row.parent_node_id) || 'người đời trên';
    byDepth[depth]?.push(`Con của ${parent}: ${smp?.full_name ? `đã ghi (${smp.full_name})` : 'chưa ghi hồ sơ'}`);
  });
  return byDepth.map((items, idx) => `Đời ${idx}: ${items.length ? items.join('. ') + '.' : 'Không thêm gì.'}`);
}

export function stageName(plan) {
  const payload = sourceOf(plan);
  const st = String(plan?.status || '').toUpperCase();
  const planOk = Boolean(payload.plan_ok);
  const resultSubmitted = Boolean(payload.result_submitted);
  const resultOk = Boolean(payload.result_ok);
  if (resultOk) return 'Tờ khai đã duyệt';
  if (planOk && st === 'REJECTED') return 'Tờ khai không được duyệt';
  if (planOk && st === 'NEEDS_REVISION') return 'Tờ khai cần sửa';
  if (planOk && resultSubmitted) return 'Tờ khai chờ duyệt';
  if (planOk) return 'Tờ khai đang soạn';
  if (st === 'NEEDS_REVISION') return 'Khung cần sửa';
  if (st === 'REJECTED') return 'Khung không được duyệt';
  if (st === 'PENDING' || st === 'UNDER_REVIEW') return 'Khung chờ phê duyệt';
  if (st === 'DRAFT') return 'Khung đang soạn';
  return 'Khung dự kiến';
}

export function historySteps(plan) {
  const payload = sourceOf(plan);
  const steps = [{ id: 'frame', title: 'Khung đang soạn' }];
  const st = String(plan?.status || '').toUpperCase();
  if (payload.plan_ok || ['PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'REJECTED'].includes(st)) {
    steps.push({ id: 'frame-review', title: 'Khung chờ phê duyệt' });
  }
  if (payload.plan_ok) steps.push({ id: 'frame-ok', title: 'Khung đã duyệt' });
  if (payload.plan_ok) steps.push({ id: 'result-draft', title: 'Tờ khai đang soạn' });
  if (payload.result_submitted) steps.push({ id: 'result-review', title: 'Tờ khai chờ duyệt' });
  if (payload.result_ok) steps.push({ id: 'result-ok', title: 'Tờ khai đã duyệt' });
  return steps;
}

export function stepSummary(plan, stepId) {
  const payload = sourceOf(plan);
  if (stepId === 'frame' || stepId === 'frame-review') return frameLines(plan);
  if (stepId === 'frame-ok') return [...frameLines(plan), `Bút phê khung: ${payload.approver_note || plan?.admin_note || 'Chưa có ý kiến.'}`];
  if (stepId === 'result-draft' || stepId === 'result-review' || stepId === 'result-ok') {
    const lines = resultLines(plan);
    if (stepId === 'result-ok') lines.push('Tờ khai đã duyệt và đã ghi sổ.');
    if (stepId === 'result-review' && payload.reject_reason) lines.push(`Bút phê tờ khai: ${payload.reject_reason}`);
    return lines;
  }
  return ['Chưa có nội dung.'];
}

export function currentSummary(plan) {
  const steps = historySteps(plan);
  return stepSummary(plan, steps[steps.length - 1]?.id || 'frame');
}

export default function MfoHistoryChain({ plan }) {
  return (
    <div className="space-y-1 text-sm text-slate-800">
      {currentSummary(plan).map((line, idx) => <p key={idx}>{line}</p>)}
    </div>
  );
}
