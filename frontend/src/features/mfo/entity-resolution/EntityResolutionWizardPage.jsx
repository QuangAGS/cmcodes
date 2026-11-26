/**
 * PATH       : features/mfo/entity-resolution/EntityResolutionWizardPage.jsx
 * DATETIME   : 2026-11-26T09:10:00+07:00
 * VERSION    : 1.1.0-FE01-INTEGRATED
 * DESCRIPTION:
 * - Page Entity Resolution Wizard đã nối AuthContext.
 * - Lấy tenantId từ activeContext.activeTenantId.
 * CHANGE LOGS:
 * - FE-01: thêm page EntityResolutionWizardPage.
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { EntityResolutionWizard } from './EntityResolutionWizard';

export function EntityResolutionWizardPage() {
  const { activeContext, loading } = useAuth();
  const tenantId = activeContext?.activeTenantId || null;

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Đang tải...</div>;
  }

  if (!tenantId) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-sm text-amber-700">
        Chưa chọn dòng họ. Vui lòng chọn dòng họ trước khi sử dụng Wizard.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <EntityResolutionWizard key={tenantId} tenantId={tenantId} />
    </div>
  );
}

export default EntityResolutionWizardPage;
