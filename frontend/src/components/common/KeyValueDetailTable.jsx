/**
 * ============================================================================
 * PATH       : src/components/common/KeyValueDetailTable.jsx
 * DATETIME   : 2026-11-21T09:45:00+07:00
 * VERSION    : 1.1.0-ISO29148-UAT-IMP3
 * DESCRIPTION:
 * - Bảng trình bày chi tiết 2 cột chuẩn UAT-IMP3 (Mục 2b):
 *   + Cột 1: Label định dạng chữ in nghiêng (italic).
 *   + Cột 2: Giá trị (value) rõ nét, cỡ chữ >= 16px.
 *   + Các trường văn bản dài (Notes / ghi chú) tách riêng thành Text Area.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */
import React from 'react';

export default function KeyValueDetailTable({ rows = [], notes = [] }) {
  const validRows = (rows || []).filter(
    (r) => r && r.label && r.value !== undefined && r.value !== null && r.value !== ''
  );
  const validNotes = (notes || []).filter(
    (n) => n && n.value !== undefined && n.value !== null && String(n.value).trim() !== ''
  );

  if (validRows.length === 0 && validNotes.length === 0) return null;

  return (
    <div className="space-y-3">
      {validRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left">
            <tbody>
              {validRows.map((row, idx) => (
                <tr
                  key={`${row.label}-${idx}`}
                  className={idx !== validRows.length - 1 ? 'border-b border-slate-100' : ''}
                >
                  <td className="w-2/5 min-w-[120px] bg-slate-50/70 px-3.5 py-2.5 align-top text-base font-normal italic text-slate-600">
                    {row.label}
                  </td>
                  <td className="px-3.5 py-2.5 align-top text-base font-semibold text-slate-900 break-words">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {validNotes.map((note, idx) => (
        <div key={`${note.label || 'note'}-${idx}`} className="space-y-1.5">
          {note.label && (
            <label className="block text-base italic text-slate-600">
              {note.label}
            </label>
          )}
          <textarea
            readOnly
            rows={3}
            value={String(note.value)}
            className="min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-normal leading-relaxed text-slate-800 outline-none"
          />
        </div>
      ))}
    </div>
  );
}
