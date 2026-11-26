/**
 * PATH       : features/mfo/hooks/useCanonicalRedirect.js
 * DATETIME   : 2026-11-26T08:20:00+07:00
 * VERSION    : 1.0.0-FE03
 * DESCRIPTION:
 * - Hook xử lý canonical redirect khi response có _canonicalRedirect.
 * - Chỉ xử lý một lần cho mỗi redirect.to trong cùng phiên.
 * - Nên gắn một lần ở cấp page để tránh toast trùng.
 * 
 * CHANGE LOGS:
 * - FE-03: thêm hook useCanonicalRedirect.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export function useCanonicalRedirect(data, options = {}) {
  const { autoNavigate = false, tenantId } = options;
  const navigate = useNavigate();
  const lastHandledToRef = useRef(null);

  useEffect(() => {
    lastHandledToRef.current = null;
  }, [tenantId]);

  useEffect(() => {
    const redirect = data?._canonicalRedirect;
    if (!redirect?.to) {
      lastHandledToRef.current = null;
      return;
    }
    if (lastHandledToRef.current === redirect.to) return;

    lastHandledToRef.current = redirect.to;

    const message = autoNavigate
      ? 'Hồ sơ này đã được gộp. Đang chuyển đến hồ sơ chuẩn...'
      : 'Hồ sơ này đã được gộp vào hồ sơ chuẩn.';

    toast.info(message);

    if (autoNavigate) {
      navigate(`/members/${redirect.to}/profile`);
    }
  }, [data, navigate, autoNavigate, tenantId]);
}

export default useCanonicalRedirect;
