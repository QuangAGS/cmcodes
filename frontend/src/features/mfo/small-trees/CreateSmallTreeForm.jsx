/**
 * PATH       : features/mfo/small-trees/CreateSmallTreeForm.jsx
 * DATETIME   : 2026-11-26T08:10:00+07:00
 * VERSION    : 1.0.0-FE02
 * DESCRIPTION:
 * - Form tạo Small Tree mới.
 * - tenantId và ownerUserId lấy từ context (truyền qua props).
 * - citation_id do BE gắn khi ghép.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useCreateSmallTree } from './hooks/useSmallTrees';

export function CreateSmallTreeForm({ tenantId, ownerUserId, onCreated }) {
  const [rootMemberId, setRootMemberId] = useState('');
  const createMutation = useCreateSmallTree();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanRoot = rootMemberId.trim();
    if (!cleanRoot) {
      toast.error('Vui lòng nhập rootMemberId.');
      return;
    }
    if (!tenantId || !ownerUserId) {
      toast.error('Thiếu thông tin tenant hoặc người dùng. Vui lòng thử lại.');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        tenantId,
        ownerUserId,
        rootMemberId: cleanRoot,
      });
      toast.success('Đã tạo cây nhỏ.');
      setRootMemberId('');
      onCreated?.(result);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi tạo.';
      toast.error(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-200 p-4">
      <h3 className="text-sm font-medium">Tạo cây nhỏ mới</h3>
      <div>
        <label className="block text-sm text-slate-700">Root Member ID</label>
        <input
          type="text"
          value={rootMemberId}
          onChange={(e) => setRootMemberId(e.target.value)}
          onBlur={(e) => setRootMemberId(e.target.value.trim())}
          placeholder="Nhập ID thành viên gốc"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={createMutation.isPending}
        className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {createMutation.isPending ? 'Đang tạo...' : 'Tạo'}
      </button>
    </form>
  );
}

export default CreateSmallTreeForm;
