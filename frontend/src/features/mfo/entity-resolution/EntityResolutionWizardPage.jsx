/**
 * PATH       : features/mfo/entity-resolution/EntityResolutionWizardPage.jsx
 * DATETIME   : 2026-11-26T08:00:00+07:00
 * VERSION    : 1.0.0-FE01
 * DESCRIPTION:
 * - Page wrapper cho Entity Resolution Wizard.
 * - Cần bọc bằng AdminProtectedRoute ở App.jsx.
 * - Lấy tenantId từ AuthContext / tenant context.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React from 'react';
import { EntityResolutionWizard } from './EntityResolutionWizard';
// import { useAuth } from '../../../context/AuthContext'; // Điều chỉnh path khi gắn vào repo

export function EntityResolutionWizardPage() {
  // Khi tích hợp vào repo:
  // const { activeContext } = useAuth();
  // const tenantId = activeContext?.tenantId || activeContext?.tenant_id || null;

  // Placeholder an toàn: không truyền tenantId giả
  const tenantId = undefined;

  if (!tenantId) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-sm text-amber-700">
        Chưa có tenantId. Cần nối AuthContext / tenant context trước khi sử dụng Wizard.
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
