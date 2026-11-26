/**
 * PATH       : features/mfo/components/ConflictCitationList.jsx
 * DATETIME   : 2026-11-26T07:30:00+07:00
 * VERSION    : 1.0.0-FE04
 * DESCRIPTION:
 * - Component hiển thị danh sách conflict assertion (prefix SYS_CIT::CONFLICT_MERGE::).
 * - Chỉ nhận props, không tự fetch.
 * - Hỗ trợ trạng thái rỗng (trả về null).
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React from 'react';

export function ConflictCitationList({ conflicts = [] }) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="font-medium text-slate-700">Conflict Assertions</h4>
      <ul className="mt-2 space-y-1 text-sm">
        {conflicts.map((c, idx) => (
          <li
            key={`${c.citation_id || c.id || c.source_assertion_id || 'conflict'}-${idx}`}
            className="text-red-700"
          >
            {c.citation_id || 'N/A'} (claimed: {c.claimed_generation ?? 'N/A'})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ConflictCitationList;
