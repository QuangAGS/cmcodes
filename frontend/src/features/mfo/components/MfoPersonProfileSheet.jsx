/**
 * PATH       : frontend/src/features/mfo/components/MfoPersonProfileSheet.jsx
 * DATETIME   : 2026-10-17T07:46:00+07:00
 * VERSION    : 3.0.3-READ-RELATION
 * DESCRIPTION: Hồ sơ dạng lớp nổi trên cây; controlled, không suy nội tộc, không nhập phả hệ.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích có thời gian.
 *
 * CHANGE LOG:
 * - 2026-10-13T14:57:00+07:00 | 3.0.2 | Hồ sơ chỉ nhập SMP, không nhập phả hệ.
 * - 2026-10-17T07:46:00+07:00 | 3.0.3 | Hiện dòng chỉ đọc về người sinh và thứ tự con.
 */
import { createPortal } from 'react-dom';
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Hiển thị hồ sơ đã chọn; nhiều cá nhân cùng ô được chọn trong lớp này, không rời cây.
 */
export default function MfoPersonProfileSheet({
  item,
  choices = [],
  value = {},
  onPick,
  onChange,
  onSave,
  onClose,
  busy,
  readOnly,
  relationNote
}) {
  if (!item && !choices.length) return null;
  const field = 'mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2';
  /**
   * <2026-10-13T14:57:00+07:00>
   * Mục đích: Cập nhật một trường tới state parent để tên ô thay đổi ngay khi gõ.
   */
  function set(key, valueNext) {
    onChange({
      ...value,
      [key]: valueNext
    });
  }
  /**
   * <2026-10-13T14:57:00+07:00>
   * Mục đích: Select boolean có lựa chọn rỗng; không gắn mặc định true/false.
   */
  function boolSelect(key, label, yes, no) {
    return <label className="block text-sm font-semibold">{label}<select className={field} disabled={busy || readOnly} value={typeof value[key] === 'boolean' ? String(value[key]) : ''} onChange={e => set(key, e.target.value === '' ? null : e.target.value === 'true')}><option value="">Bấm để chọn</option><option value="true">{yes}</option><option value="false">{no}</option></select></label>;
  }
  /**
   * <2026-10-13T14:57:00+07:00>
   * Mục đích: Render form mobile-first trên cây; alarm hiện có z=80 nằm trên sheet z=70.
   */
  return createPortal(<div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="mfo-profile-title">
    <section className="max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
      <h2 id="mfo-profile-title" className="text-lg font-bold">{item ? 'Hồ sơ người này' : 'Chọn hồ sơ người này'}</h2>
      {!item ? choices.map(choice => <button key={choice.key} type="button" className="mt-2 min-h-12 w-full rounded-xl border px-3 text-left" onClick={() => onPick(choice)}>{choice.label || (choice.kind === 'spouse' ? 'Hôn phối' : 'Người xin thêm')}</button>) : <div className="mt-3 space-y-3">
        <label className="block text-sm font-semibold">Họ tên<input autoFocus className={field} disabled={busy || readOnly} value={value.full_name || ''} onChange={e => set('full_name', e.target.value)} /></label>
        <label className="block text-sm font-semibold">Giới tính<select className={field} disabled={busy || readOnly} value={value.gender || ''} onChange={e => set('gender', e.target.value)}><option value="">Bấm để chọn</option><option value="NAM">Nam</option><option value="NU">Nữ</option></select></label>
        {boolSelect('is_alive', 'Còn sống hay đã mất?', 'Còn sống', 'Đã mất')}
        {boolSelect('is_clan', 'Người này có phải nội tộc không?', 'Có', 'Không')}
        {relationNote ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{relationNote}</p> : null}
        {item.kind === 'child' ? <label className="block text-sm font-semibold">Loại con<select className={field} disabled={busy || readOnly} value={value.child_type || ''} onChange={e => set('child_type', e.target.value)}><option value="">Bấm để chọn</option><option value="CON_DE">Con đẻ</option><option value="CON_NUOI">Con nuôi</option><option value="CON_RE">Con rể</option><option value="CON_DAU">Con dâu</option></select></label> : null}
        {['birth', ...(value.is_alive === false ? ['death'] : [])].map(prefix => <fieldset key={prefix} className="rounded-xl border border-slate-200 p-2"><legend className="text-sm font-semibold">{prefix === 'birth' ? 'Ngày sinh' : 'Ngày mất'} (không bắt buộc)</legend><div className="grid grid-cols-3 gap-2">{[['day', 'Ngày', 31], ['month', 'Tháng', 12], ['year', 'Năm', 3000]].map(([part, label, max]) => <label key={part} className="text-xs">{label}<input type="number" min="1" max={max} className={field} disabled={busy || readOnly} value={value[`${prefix}_${part}`] ?? ''} onChange={e => set(`${prefix}_${part}`, e.target.value === '' ? null : Number(e.target.value))} /></label>)}</div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || readOnly} checked={value[`is_${prefix}_lunar`] === true} onChange={e => set(`is_${prefix}_lunar`, e.target.checked)} />Âm lịch</label></fieldset>)}
        {value.is_alive === false ? <label className="block text-sm font-semibold">Ghi chú mất<textarea className={field} disabled={busy || readOnly} value={value.death_note || ''} onChange={e => set('death_note', e.target.value)} /></label> : null}
        <label className="block text-sm font-semibold">Ghi chú<textarea className={field} disabled={busy || readOnly} value={value.note || ''} onChange={e => set('note', e.target.value)} /></label>
      </div>}
      {item && !readOnly ? <button type="button" disabled={busy} onClick={onSave} className="mt-4 min-h-12 w-full rounded-xl bg-indigo-700 font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu tờ khai'}</button> : null}
      <button type="button" disabled={busy} onClick={onClose} className="mt-2 min-h-12 w-full rounded-xl border font-semibold">Đóng</button>
    </section></div>, document.body);
}
