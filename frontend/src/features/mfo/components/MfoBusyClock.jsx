/**
 * PATH       : frontend/src/features/mfo/components/MfoBusyClock.jsx
 * DATETIME   : 2026-10-23T09:31:00+07:00
 * VERSION    : 1.0.0-TOP-SPIN
 * DESCRIPTION: Vòng quay trên cùng khi hệ thống đang bận. Nút giữ nguyên chữ.
 *
 * CHANGE LOG:
 * - 2026-10-23T09:31:00+07:00 | 1.0.0 | Thêm vòng quay trên cùng. Lý do: chữ Đang xử lý đang hiện nhầm lên nút Duyệt.
 */
import { Loader2 } from 'lucide-react';

export default function MfoBusyClock({ show }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100000] flex justify-center">
      <div className="flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        <span className="text-sm font-bold text-indigo-900">Hệ thống đang xử lý</span>
      </div>
    </div>
  );
}
