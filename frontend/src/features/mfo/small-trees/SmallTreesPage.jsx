/**
 * PATH       : features/mfo/small-trees/SmallTreesPage.jsx
 * DATETIME   : 2026-11-26T09:10:00+07:00
 * VERSION    : 1.1.0-FE02-INTEGRATED
 * DESCRIPTION:
 * - Page Small Trees đã nối AuthContext.
 * - Lấy tenantId, ownerUserId, isAdmin, currentUserId từ context.
 * CHANGE LOGS:
 * - FE-02: thêm SmallTreesPage.
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { CreateSmallTreeForm } from './CreateSmallTreeForm';
import { SmallTreesList } from './SmallTreesList';
import { SmallTreeMergePanel } from './SmallTreeMergePanel';

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

export function SmallTreesPage() {
  const { user, activeContext, loading } = useAuth();
  const [selected, setSelected] = useState(null);

  const tenantId = activeContext?.activeTenantId || null;

  useEffect(() => {
    setSelected(null);
  }, [tenantId]);
  const currentUserId = user?.id || null;
  const ownerUserId = currentUserId;
  const role = String(activeContext?.roleInTenant || user?.role || 'USER').toUpperCase();
  const isAdmin = ADMIN_ROLES.has(role);

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Đang tải...</div>;
  }

  if (!tenantId) {
    return (
      <div className="max-w-4xl mx-auto p-4 text-sm text-amber-700">
        Chưa chọn dòng họ. Vui lòng chọn dòng họ trước khi sử dụng.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Quản lý cây nhỏ</h1>

      <CreateSmallTreeForm
        tenantId={tenantId}
        ownerUserId={ownerUserId}
        onCreated={() => setSelected(null)}
      />

      <SmallTreesList tenantId={tenantId} onSelect={setSelected} />

      {selected && (
        <SmallTreeMergePanel
          smallTree={selected}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onStatusChange={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default SmallTreesPage;
