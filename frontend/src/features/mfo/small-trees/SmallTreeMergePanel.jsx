/**
 * PATH       : features/mfo/small-trees/SmallTreeMergePanel.jsx
 * DATETIME   : 2026-11-26T08:10:00+07:00
 * VERSION    : 1.0.0-FE02
 * DESCRIPTION:
 * - Panel ghép Small Tree.
 * - Phân quyền: chỉ Admin ghép; Admin hoặc owner được hủy.
 * - Cập nhật trạng thái cục bộ sau thao tác.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ConflictCitationList } from '../components/ConflictCitationList';
import { useMergeSmallTree, useUpdateSmallTreeStatus } from './hooks/useSmallTrees';
import { getStatusLabel } from './constants';

export function SmallTreeMergePanel({ smallTree, isAdmin, currentUserId, onStatusChange }) {
  const [mergeResult, setMergeResult] = useState(null);
  const [localStatus, setLocalStatus] = useState(smallTree?.status);
  const mergeMutation = useMergeSmallTree();
  const statusMutation = useUpdateSmallTreeStatus();

  // Đồng bộ khi smallTree đổi — đặt trước early return để tuân thủ Rules of Hooks
  useEffect(() => {
    setLocalStatus(smallTree?.status);
    setMergeResult(null);
  }, [smallTree?.id, smallTree?.status]);

  if (!smallTree) return null;

  const isOwner = currentUserId && (
    smallTree.owner_user_id === currentUserId ||
    smallTree.ownerUserId === currentUserId
  );

  const canMerge = localStatus === 'CHO_GHEP' && isAdmin;
  const canCancel = localStatus === 'CHO_GHEP' && (isAdmin || isOwner);

  const handleMerge = async () => {
    try {
      const result = await mergeMutation.mutateAsync({
        id: smallTree.id,
        payload: {},
      });
      setMergeResult(result);
      setLocalStatus('DA_GHEP');
      onStatusChange?.('DA_GHEP');
      toast.success('Ghép thành công.');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi ghép.';
      toast.error(msg);
    }
  };

  const handleCancel = async () => {
    try {
      await statusMutation.mutateAsync({
        id: smallTree.id,
        payload: { status: 'HUY' },
      });
      setLocalStatus('HUY');
      onStatusChange?.('HUY');
      toast.success('Đã hủy.');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi hủy.';
      toast.error(msg);
    }
  };

  const conflicts = mergeResult?.potential_conflicts || mergeResult?.conflicts || [];

  return (
    <div className="rounded border border-slate-200 p-4 space-y-3">
      <div className="text-sm">
        <div className="font-medium">ID: {smallTree.id}</div>
        <div>Trạng thái: {getStatusLabel(localStatus)}</div>
      </div>

      <div className="flex gap-2">
        {canMerge && (
          <button
            type="button"
            onClick={handleMerge}
            disabled={mergeMutation.isPending}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {mergeMutation.isPending ? 'Đang ghép...' : 'Ghép'}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={statusMutation.isPending}
            className="rounded bg-slate-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Hủy
          </button>
        )}
      </div>

      {conflicts.length > 0 && <ConflictCitationList conflicts={conflicts} />}
    </div>
  );
}

export default SmallTreeMergePanel;
