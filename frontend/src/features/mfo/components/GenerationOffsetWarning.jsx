/**
 * PATH       : features/mfo/components/GenerationOffsetWarning.jsx
 * DATETIME   : 2026-11-26T10:20:00+07:00
 * VERSION    : 1.1.0-FE04
 * DESCRIPTION:
 * - Component hiển thị cảnh báo mềm khi root_generation_offset !== 0.
 * - Chỉ nhận props, không tự fetch.
 * - Không tự gắn DISPUTED.
 * CHANGE LOGS:
 * - FE-04: thêm component GenerationOffsetWarning.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React from 'react';

export function GenerationOffsetWarning({ offset, sourceTitle }) {
  if (typeof offset === 'boolean') return null;
  const numOffset = Number(offset);
  if (!Number.isFinite(numOffset) || numOffset === 0) return null;

  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
      <strong>Cảnh báo mềm:</strong> Nguồn &ldquo;{sourceTitle || 'N/A'}&rdquo; có root_generation_offset = {numOffset}. Chỉ hiển thị cảnh báo, không tự gắn DISPUTED.
    </div>
  );
}

export default GenerationOffsetWarning;
