/**
 * PATH       : src/pages/OpBaseProfilePage.jsx
 * DATETIME   : 2026-08-16T23:05:00+07:00
 * VERSION    : 0.1.0-FE-OP-B1-skeleton
 * DESCRIPTION:
 * - Skeleton /op/base-profile — placeholder trước BaseProfileForm (B1 UI).
 * - Q1: không đụng RP forms.
 */

import { useNavigate } from 'react-router-dom';

export default function OpBaseProfilePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8">
      <div className="mx-auto w-full max-w-[480px]">
        <h1 className="text-center text-2xl font-black text-slate-800">
          Hồ sơ cơ sở
        </h1>
        <p className="mt-3 text-center text-sm text-slate-500">
          Form điền thông tin cơ bản sẽ có ở bước tiếp theo (B1 UI). Hiện chỉ
          kiểm tra route và quyền vào trang.
        </p>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => navigate('/op')}
            className="flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 active:scale-[0.98]"
          >
            Quay lại công việc hồ sơ
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-600 active:scale-[0.98]"
          >
            Trang chủ
          </button>
        </div>
      </div>
    </div>
  );
}