/**
 * PATH       : frontend/src/features/mfo/components/MfoBusyClock.jsx
 * DATETIME   : 2026-10-22T10:08:00+07:00
 * VERSION    : 1.0.0-BUSY-CLOCK
 * DESCRIPTION: Đồng hồ xoay giữa màn hình khi hệ thống đang xử lý.
 * RULE       : Q1 không đổi nghiệp vụ; Q2 metadata và chú thích.
 *
 * CHANGE LOG:
 * - 2026-10-22T10:08:00+07:00 | 1.0.0 | Chuẩn chờ chung. Không đổi chữ trên nút khác.
 */
import { createPortal } from 'react-dom';

export default function MfoBusyClock({ show }) {
  if (!show) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/20" role="status" aria-live="polite" aria-label="Đang xử lý">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-xl">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
      </div>
    </div>,
    document.body
  );
}
