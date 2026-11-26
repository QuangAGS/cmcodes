/**
 * PATH       : features/mfo/components/CanonicalRedirectBanner.jsx
 * DATETIME   : 2026-11-26T08:20:00+07:00
 * VERSION    : 1.0.0-FE03
 * DESCRIPTION:
 * - Banner hiển thị khi có canonical redirect (thay vì tự động điều hướng).
 * - Người dùng bấm nút để chuyển đến hồ sơ chuẩn.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

export function CanonicalRedirectBanner({ redirect }) {
  const navigate = useNavigate();

  if (!redirect?.to) return null;

  return (
    <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 flex items-center justify-between">
      <span>Hồ sơ này đã được gộp vào hồ sơ chuẩn.</span>
      <button
        type="button"
        onClick={() => navigate(`/members/${redirect.to}/profile`)}
        className="ml-3 rounded bg-blue-600 px-3 py-1 text-xs text-white"
      >
        Xem hồ sơ chuẩn
      </button>
    </div>
  );
}

export default CanonicalRedirectBanner;
