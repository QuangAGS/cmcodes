/**
 * PATH       : features/mfo/small-trees/SmallTreesList.jsx
 * DATETIME   : 2026-11-26T08:00:00+07:00
 * VERSION    : 1.0.0-FE02
 * DESCRIPTION:
 * - Danh sách Small Trees với lọc theo trạng thái.
 * - Hỗ trợ lọc CHO_GHEP.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React, { useState } from 'react';
import { getStatusLabel } from './constants';
import { useSmallTreesList, usePendingSmallTrees } from './hooks/useSmallTrees';

export function SmallTreesList({ tenantId, onSelect }) {
  const [filter, setFilter] = useState('ALL');

  const listParams = { tenant_id: tenantId };
  const { data: allData, isLoading: loadingAll } = useSmallTreesList(listParams);
  const { data: pendingData, isLoading: loadingPending } = usePendingSmallTrees(listParams);

  const items = filter === 'CHO_GHEP'
    ? (pendingData?.items || pendingData || [])
    : (allData?.items || allData || []);

  const isLoading = filter === 'CHO_GHEP' ? loadingPending : loadingAll;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Lọc:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="ALL">Tất cả</option>
          <option value="CHO_GHEP">Chờ ghép</option>
        </select>
      </div>

      {isLoading && <div className="text-sm text-slate-500">Đang tải...</div>}

      {!isLoading && items.length === 0 && (
        <div className="text-sm text-slate-500">Không có cây nhỏ.</div>
      )}

      <ul className="divide-y divide-slate-200 border border-slate-200 rounded">
        {items.map((item) => (
          <li
            key={item.id}
            className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
            onClick={() => onSelect?.(item)}
          >
            <div className="font-medium">{item.id}</div>
            <div className="text-slate-600">
              Trạng thái: {getStatusLabel(item.status)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SmallTreesList;
