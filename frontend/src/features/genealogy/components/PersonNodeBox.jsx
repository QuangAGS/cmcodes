/**
 * PATH       : frontend/src/features/genealogy/components/PersonNodeBox.jsx
 * DATETIME   : 2026-09-21T16:40:00+07:00
 * VERSION    : 1.0.0-5L
 * DESCRIPTION: Hộp một người trên cây. Dùng lại cho tờ 5L và cây phả hệ.
 */

export default function PersonNodeBox({
  title,
  name,
  caption,
  selected = false,
  isSelf = false,
  onSelect,
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-3xl border px-4 py-3 text-left shadow-sm ${
        selected
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-base font-black text-slate-800">{title}</p>
      <p className="mt-1 text-base font-semibold text-slate-800">
        {name || 'Chưa chọn'}
      </p>
      {caption ? (
        <p className="mt-1 text-sm font-normal text-slate-500">{caption}</p>
      ) : null}
      {isSelf ? (
        <p className="mt-2 text-sm font-semibold text-amber-800">Đây là bạn</p>
      ) : null}
    </button>
  );
}
