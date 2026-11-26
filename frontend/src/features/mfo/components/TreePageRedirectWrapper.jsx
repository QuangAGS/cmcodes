/**
 * PATH       : features/mfo/components/TreePageRedirectWrapper.jsx
 * DATETIME   : 2026-11-26T10:44:00+07:00
 * VERSION    : 1.0.0-FE03-INTEGRATED
 * DESCRIPTION:
 * - Gắn MemberCanonicalRedirectNotice một lần tại cấp TreePage.
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { MemberCanonicalRedirectNotice } from './MemberCanonicalRedirectNotice';

export function TreePageRedirectWrapper({ memberData, autoNavigate = false }) {
  const { activeContext } = useAuth();
  const tenantId = activeContext?.activeTenantId || null;

  return (
    <MemberCanonicalRedirectNotice
      data={memberData}
      tenantId={tenantId}
      autoNavigate={autoNavigate}
    />
  );
}

export default TreePageRedirectWrapper;
