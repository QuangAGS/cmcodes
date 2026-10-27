/**
 * PATH       : frontend/src/features/mfo/components/MfoHistoryChain.jsx
 * DATETIME   : 2026-10-27T14:56:00+07:00
 * VERSION    : 1.4.1-LIST-REFRESH
 * DESCRIPTION:
 * - Vá lỗi tự động gán chữ "Duyệt" khi Lần trình Cửa 2 đang ở trạng thái chờ duyệt.
 * - Loại bỏ fallback || 'Duyệt', hiển thị chính xác "Chưa có ý kiến." đối với lần trình chưa có bút phê.
 * - DRAFT không còn bị gọi là tờ khai.
 *
 * CHANGE LOG:
 * - 2026-10-23T09:58:00+07:00 | Thêm: DRAFT luôn là nhánh đang soạn. Bỏ: result_ok một mình thành đã ghi sổ. Lý do: chờ duyệt và đang soạn bị lẫn.
 * - 2026-10-23T09:31:00+07:00 | Đã ghi sổ chỉ khi APPROVED và result_ok. Bỏ: result_ok một mình. Lý do: DRAFT bị hiện Đã ghi sổ.
 * - 2026-10-17T18:05:00+07:00 | 1.4.1 | Nút Làm mới cạnh danh sách bước.
 * - 2026-10-14T15:35:00+07:00 | 3.2.0 | Không gán chữ Duyệt khi tờ khai chưa có bút phê.
 * - 2026-10-16T07:08:00+07:00 | 3.2.1 | stageName và historySteps chỉ mở tờ khai khi nhánh đã duyệt.
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Giữ nguyên mọi hàm xuất (sourceOf, frameLines, resultLines, stageName, historySteps, stepSummary, currentSummary) và props/state handler.
 * - Q2 (Code Format): Đầy đủ metadata docstring và chú thích thời gian <2026-10-14T15:35:00+07:00> từng khối logic.
 */

import { diffDraftAgainstInit } from '../lib/mfoDiffEngine.js';
import { useEffect, useState } from 'react';
import { historyEntries, historySummary, previewSnapshot } from '../lib/mfoHistory.js';
import MfoHistoryPreview from './MfoHistoryPreview.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';

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

/** <2026-10-13T15:24:00+07:00> Mục đích: Giữ xử lý stageName; phần thay đổi giới hạn lịch sử lát 4. */
/** <2026-10-16T07:08:00+07:00> Mục đích: DRAFT vẫn là nhánh đang soạn. Lý do: plan_ok đúng không được biến nhánh chưa duyệt thành tờ khai. */
export function stageName(plan) {
  const payload = sourceOf(plan);
  const st = String(plan?.status || '').toUpperCase();
  const planOk = Boolean(payload.plan_ok);
  const resultSubmitted = Boolean(payload.result_submitted);
  const resultOk = Boolean(payload.result_ok);
  const gate2Open = planOk && st === 'APPROVED';
  // <2026-10-23T09:31:00+07:00> Mục đích: DRAFT không thành đã ghi sổ. Lý do: result_ok sót.
  if (st === 'DRAFT') return 'Nhánh phả hệ đang soạn';
  if (resultOk && st === 'APPROVED') return 'Đã ghi sổ';
  if (gate2Open && st === 'REJECTED') return 'Tờ khai không được duyệt';
  // <2026-10-23T11:53:00+07:00> Mục đích: Tờ khai trả sửa vẫn là tờ khai. Lý do: trả sửa hạ result_submitted nên hiện nhầm nhánh.
  if (planOk && st === 'NEEDS_REVISION') return 'Tờ khai cần sửa';
  if (planOk && resultSubmitted) return 'Tờ khai chờ duyệt';
  if (gate2Open) return 'Tờ khai đang soạn';
  if (st === 'NEEDS_REVISION') return 'Nhánh phả hệ cần sửa';
  if (st === 'REJECTED') return 'Nhánh phả hệ không được duyệt';
  if (st === 'PENDING' || st === 'UNDER_REVIEW') return 'Nhánh phả hệ chờ phê duyệt';
  if (st === 'DRAFT') return 'Nhánh phả hệ đang soạn';
  return 'Nhánh phả hệ đang soạn';
}

/** <2026-10-13T15:24:00+07:00> Mục đích: Giữ xử lý historySteps; phần thay đổi giới hạn lịch sử lát 4. */
export function historySteps(plan) {
  const payload = sourceOf(plan);
  const st = String(plan?.status || '').toUpperCase();
  const planOk = Boolean(payload.plan_ok);
  const steps = [{ id: 'frame', title: 'Nhánh phả hệ đang soạn' }];
  if (st !== 'DRAFT') steps.push({ id: 'frame-review', title: 'Nhánh phả hệ chờ phê duyệt' });
  if (!planOk && st === 'NEEDS_REVISION') steps.push({ id: 'frame-fix', title: 'Nhánh phả hệ cần sửa' });
  if (!planOk && st === 'REJECTED') steps.push({ id: 'frame-no', title: 'Nhánh phả hệ không được duyệt' });
  if (planOk) steps.push({ id: 'frame-ok', title: 'Nhánh phả hệ đã duyệt' });
  if (planOk) steps.push({ id: 'result-draft', title: 'Tờ khai đang soạn' });
  if (planOk && st === 'NEEDS_REVISION') steps.push({ id: 'result-fix', title: 'Tờ khai cần sửa' });
  if (planOk && payload.result_submitted && (st === 'PENDING' || st === 'UNDER_REVIEW')) steps.push({ id: 'result-review', title: 'Tờ khai chờ duyệt' });
  if (planOk && st === 'REJECTED') steps.push({ id: 'result-no', title: 'Tờ khai không được duyệt' });
  if (payload.result_ok && st === 'APPROVED') steps.push({ id: 'result-ok', title: 'Đã ghi sổ' });
  return steps;
}

/** <2026-10-13T15:24:00+07:00> Mục đích: Giữ xử lý stepSummary; phần thay đổi giới hạn lịch sử lát 4. */
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

/** <2026-10-13T15:24:00+07:00> Mục đích: Giữ xử lý currentSummary; phần thay đổi giới hạn lịch sử lát 4. */
export function currentSummary(plan) {
  const steps = historySteps(plan);
  return stepSummary(plan, steps[steps.length - 1]?.id || 'frame');
}

/**
 * <2026-10-14T15:35:00+07:00>
 * Purpose: Card mặc định thu; quy chuẩn từ ngữ toggler "Mở ra" / "Thu lại"; đóng khung in đậm "Ý kiến ban quản trị".
 */
export default function MfoHistoryChain({ plan, open, onToggle, onReload }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState(null);
  const expanded = open ?? internalOpen;
  const entries = historyEntries(plan);
  const identity = plan?.ticket_id || plan?.id || '';

  useEffect(() => {
    setSelected('');
    setPreview(null);
    setInternalOpen(false);
  }, [identity]);

  const picked = entries.find((entry) => entry.id === selected);

  function showEntry(entry) {
    const graph = previewSnapshot(entry);
    if (graph) {
      setPreview({
        title: entry.title,
        snapshot: { ...graph, smp_staging_data: entry.snapshot?.smp_staging_data || {} },
      });
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between px-3 text-left"
        aria-expanded={expanded}
        onClick={() => (onToggle ? onToggle() : setInternalOpen((v) => !v))}
      >
        <span className="text-sm font-bold text-slate-800">Lịch sử công việc</span>
        <span className="text-sm font-bold text-slate-700">{expanded ? 'Thu lại' : 'Mở ra'}</span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t p-3 text-sm text-slate-800">
          {/* 2026-10-17T18:09:00+07:00 Muc dich: Nut Lam moi canh danh sach. Ly do: ban truoc dong nham khung ngoai. */}
          <div className="flex items-center gap-2">
          <select
            className="min-h-12 min-w-0 flex-1 rounded-xl border px-3 font-medium"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              if (!event.target.value) onReload?.();
            }}
          >
            <option value="">Bấm để chọn</option>
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
          <button type="button" className="min-h-12 shrink-0 rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold" onClick={() => onReload?.()}>Làm mới</button>
          </div>

          {!entries.length ? <p className="text-slate-500 font-medium">Chưa có lần trình được lưu.</p> : null}

          {(picked ? [picked] : entries).map((entry) => {
            const scsNotes = (entry.review_scs || []).filter((row) => row.admin_note || row.note);

            return (
              <article key={entry.id} className="space-y-2.5 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold text-slate-900">{entry.title}</h3>
                {entry.submitted_at ? (
                  <p className="text-xs font-semibold text-slate-500">
                    {new Date(entry.submitted_at).toLocaleString('vi-VN')}
                  </p>
                ) : null}

                {/* Tóm tắt theo Đời */}
                <div className="space-y-1">
                  <AudioHelpButton text={historySummary(entry).join('. ')} label="Nghe" />
                  {historySummary(entry).map((line, index) => (
                    <p key={index} className="text-slate-800 font-medium">
                      {line}
                    </p>
                  ))}
                </div>

                {/* <2026-10-14T15:35:00+07:00> PHÂN LẬP Ý KIẾN BAN QUẢN TRỊ: LOẠI BỎ FALLBACK 'Duyệt', HIỂN THỊ CHÍNH XÁC 'Chưa có ý kiến.' NẾU ĐANG CHỜ DUYỆT */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-1">
                  <p className="font-bold text-indigo-950">
                    Ý kiến ban quản trị: <span className="font-black text-indigo-900">{entry.admin_note || 'Chưa có ý kiến.'}</span>
                  </p>

                  {scsNotes.map((row, index) => (
                    <p key={index} className="text-sm font-bold text-indigo-900">
                      {row.depth != null ? `Đời ${row.depth}: ` : ''}
                      <span className="font-black">{row.admin_note || row.note}</span>
                    </p>
                  ))}
                </div>

                {/* Nút Xem lại snapshot */}
                <button
                  type="button"
                  disabled={!previewSnapshot(entry)}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  onClick={() => showEntry(entry)}
                >
                  Xem lại
                </button>

                {!previewSnapshot(entry) ? (
                  <p className="text-xs text-slate-500">Lần trình này chưa có snapshot được lưu để xem lại.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {preview ? (
        <MfoHistoryPreview snapshot={preview.snapshot} title={preview.title} onClose={() => setPreview(null)} />
      ) : null}
    </section>
  );
}