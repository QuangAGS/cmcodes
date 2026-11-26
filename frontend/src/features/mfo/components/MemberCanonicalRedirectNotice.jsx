/**
 * PATH       : features/mfo/components/MemberCanonicalRedirectNotice.jsx
 * DATETIME   : 2026-11-26T10:20:00+07:00
 * VERSION    : 1.0.0-FE03-INTEGRATED
 * DESCRIPTION:
 * - Helper gắn một lần ở cấp page đọc member để xử lý toast và hiển thị banner canonical redirect.
 * - Dùng cho MemberProfilePage, TreePage, OpMfoMemberPreviewPage, ...
 *CHANGE LOGS:
 * - FE-03: thêm component MemberCanonicalRedirectNotice.
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React from 'react';
import { useCanonicalRedirect } from '../hooks/useCanonicalRedirect';
import { CanonicalRedirectBanner } from './CanonicalRedirectBanner';

export function MemberCanonicalRedirectNotice({ data, tenantId, autoNavigate = false }) {
  useCanonicalRedirect(data, { autoNavigate, tenantId });
  const redirect = data?._canonicalRedirect;

  if (!redirect?.to) return null;

  return <CanonicalRedirectBanner redirect={redirect} />;
}

export default MemberCanonicalRedirectNotice;
