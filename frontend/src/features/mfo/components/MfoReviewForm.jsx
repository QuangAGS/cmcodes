/**
 * PATH       : frontend/src/features/mfo/components/MfoReviewForm.jsx
 * DATETIME   : 2026-10-29T08:03:00+07:00 
 * VERSION    : 1.1.3-Change "Đời gốc trên sổ" - Của 1&2.
 * DESCRIPTION: Mỗi đời có thay đổi thì mở chi tiết từ staging.
 *
 * CHANGE LOG:
 * - 2026-10-29T08:03:00+07:00 1.1.3-Change "Đời gốc trên sổ" - Của 1&2:
 *    1. Đổi nhãn "Đời gốc trên sổ" thành "Đời cao nhất trong nhánh theo sổ họ" (cho phép sửa lại
 *       giá trị số).
 *    2. Lấy Default value tự động theo members.generation của thành viên $M$ (Target Member) 
 *       được gán làm mốc từ sổ họ.Thêm một checkbox bên cạnh (default value = false). 
 *    3. Bắt buộc checkbox này phải được tích chọn (true) thì nút "Duyệt nhánh phả hệ" mới được
 *        kích hoạt (enable).
 * - 2026-10-18T15:24:00+07:00 | 1.1.2 | Mỗi nút chỉ hiện trạng thái của chính nó.
 * - 2026-10-15T11:35:00+07:00 | 1.1.0 | Mỗi đời mở chi tiết từ staging.
 * - 2026-10-17T09:40:00+07:00 | 1.1.1 | Đời gốc sau bút phê, rộng bốn số. Nút Duyệt hiện Đang duyệt.
 */
import { useState } from 'react';

function dateOf(row, prefix) {
  const day = row?.[`${prefix}_day`];
  const month = row?.[`${prefix}_month`];
  const year = row?.[`${prefix}_year`];
  if (!day && !month && !year) return '';
  return [day, month, year].filter(Boolean).join('/');
}

function rowsForDepth(delta, staging, nodes, depth) {
  const children = (delta?.draft_children || []).filter((row) => Number(row.depth) === depth);
  const nodeDepth = Object.fromEntries((nodes || []).map((node) => [node.id, Number(node?.data?.depth)]));
  const spouses = (delta?.draft_spouses || []).filter((row) => nodeDepth[row.owner_node_id] === depth);
  return [
    ...children.map((row) => ({ kind: 'Con', key: row.id, data: staging?.[row.id] || {} })),
    ...spouses.map((row) => ({ kind: 'Vợ hoặc chồng', key: row.union_id, data: staging?.[row.union_id] || {} })),
  ].filter((row) => Object.keys(row.data).length);
}

export default function MfoReviewForm({
  generation,
  onGeneration,
  isGenConfirmed = false,          // 2026-10-29T08:03:00+07:00 1.1.3-Change "Đời gốc trên sổ" - Của 1&2
  onGenConfirmedChange,            // 2026-10-29T08:03:00+07:00 1.1.3-Change "Đời gốc trên sổ" - Của 1&2
  items,
  delta,
  nodes,
  staging,
  decisions,
  notes,
  overall,
  onDecision,
  onNote,
  onOverall,
  canApprove,
  busy,
  busyAction,
  onApprove,
  onReturn,
  onReject,
  showReject,
}) {
  const [open, setOpen] = useState({ 0: true });
  const [detail, setDetail] = useState({});

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <h2 className="text-sm font-black text-slate-900">Thẩm định</h2>
      {items.map((item) => {
        const accepted = decisions[item.item_id] === 'ACCEPT';
        const rows = rowsForDepth(delta, staging, nodes, item.depth);
        const changed = item.summary_text && item.summary_text !== 'Không thêm gì.';
        return (
          <article key={item.item_id} className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <button type="button" className="flex min-h-12 w-full items-center justify-between bg-slate-50 px-3 text-left font-bold" onClick={() => setOpen((old) => ({ ...old, [item.depth]: !old[item.depth] }))}>
              <span>Đời {item.depth}</span>
              <span className="text-sm">{open[item.depth] ? 'Thu lại' : 'Mở ra'}</span>
            </button>
            {open[item.depth] ? (
              <>
                <div className="px-3 py-2 text-sm">
                  <p className="font-bold">Người trình đã làm</p>
                  <p>{item.summary_text}</p>
                  {changed && rows.length ? (
                    <button type="button" className="mt-1 font-bold text-indigo-700" onClick={() => setDetail((old) => ({ ...old, [item.depth]: !old[item.depth] }))}>Xem chi tiết</button>
                  ) : null}
                  {detail[item.depth] ? rows.map((row) => (
                    <dl key={row.key} className="mt-2 grid grid-cols-[110px_1fr] gap-1 text-sm">
                      <dt className="text-slate-500">Loại</dt><dd>{row.kind}</dd>
                      <dt className="text-slate-500">Họ tên</dt><dd>{row.data.full_name || 'Khuyết danh'}</dd>
                      <dt className="text-slate-500">Giới tính</dt><dd>{row.data.gender || 'Chưa rõ'}</dd>
                      <dt className="text-slate-500">Nội tộc</dt><dd>{row.data.is_clan === true ? 'Có' : row.data.is_clan === false ? 'Không' : 'Chưa rõ'}</dd>
                      <dt className="text-slate-500">Còn sống</dt><dd>{row.data.is_alive === false ? 'Đã mất' : 'Còn'}</dd>
                      <dt className="text-slate-500">Ngày sinh</dt><dd>{dateOf(row.data, 'birth') || 'Không có'}</dd>
                      <dt className="text-slate-500">Ngày mất</dt><dd>{dateOf(row.data, 'death') || 'Không có'}</dd>
                      <dt className="text-slate-500">Ghi chú</dt><dd>{row.data.note || row.data.death_note || 'Không có'}</dd>
                    </dl>
                  )) : null}
                </div>
                <div className="border-t bg-slate-50 px-3 py-2">
                  <label className="flex min-h-11 items-center gap-2 font-bold">
                    <input type="checkbox" checked={accepted} onChange={(event) => onDecision(item.item_id, event.target.checked ? 'ACCEPT' : 'REJECT')} />
                    Duyệt đời này
                  </label>
                  <textarea className="mt-2 w-full rounded-xl border p-2 text-sm" rows={2} placeholder="Ý kiến đời này, có thể để trống" value={notes[item.item_id] || ''} onChange={(event) => onNote(item.item_id, event.target.value)} />
                </div>
              </>
            ) : null}
          </article>
        );
      })}
      <div className="mt-3">
        <p className="font-bold">Bút phê tổng thể</p>
        <textarea className="mt-1 w-full rounded-xl border p-2 text-sm" rows={3} placeholder="Bắt buộc. Tóm tắt quyết định cả hồ sơ." value={overall} onChange={(event) => onOverall(event.target.value)} />
      </div>
      {/* 2026-10-17T09:40:00+07:00 Muc dich: Doi goc cung hang, rong bon so. Ly do: de ngay tren nut duyet. */}
      {/* 2026-10-29: Đổi tên thành Đời cao nhất trong nhánh theo sổ họ, thêm checkbox xác nhận */}
      {onGeneration ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-black uppercase text-amber-950 tracking-tight">
              Đời cao nhất trong nhánh theo sổ họ
            </span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="9999"
                inputMode="numeric"
                className="w-20 rounded-xl border border-amber-300 bg-white p-2 text-center text-sm font-black text-amber-950 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
                value={generation || ''}
                onChange={(event) => onGeneration(event.target.value)}
                disabled={busy}
              />
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={Boolean(isGenConfirmed)}
                  onChange={(e) => onGenConfirmedChange && onGenConfirmedChange(e.target.checked)}
                  disabled={busy || !generation}
                />
                <span>Xác nhận</span>
              </label>
            </div>
          </div>
          {!isGenConfirmed && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-800 italic">
              * Tích chọn "Xác nhận" để mở nút Duyệt.
            </p>
          )}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        {/* 2026-10-18T15:24:00+07:00 Muc dich: Moi nut hien dung viec cua no. Ly do: Tra sua lam nut Duyet hien Dang duyet. */}
        <button type="button" disabled={!canApprove || busy} className="min-h-12 flex-1 rounded-2xl bg-indigo-600 font-black text-white disabled:bg-slate-400" onClick={onApprove}>{String(busyAction || '').startsWith('APPROVE') ? 'Đang duyệt…' : 'Duyệt'}</button>
        <button type="button" disabled={busy} className="min-h-12 flex-1 rounded-2xl border font-bold" onClick={onReturn}>{String(busyAction || '').startsWith('RETURN') ? 'Đang trả sửa…' : 'Trả sửa'}</button>
        {showReject ? <button type="button" disabled={busy} className="min-h-12 flex-1 rounded-2xl border border-rose-200 font-bold text-rose-700" onClick={onReject}>{String(busyAction || '').startsWith('REJECT') ? 'Đang xử lý…' : 'Không duyệt'}</button> : null}
      </div>
    </section>
  );
}
