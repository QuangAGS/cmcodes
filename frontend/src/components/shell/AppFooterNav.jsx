/**
 * PATH       : src/components/shell/AppFooterNav.jsx
 * DATETIME   : 2026-08-23T18:05:00+07:00
 * VERSION    : 1.0.0-SHELL
 * DESCRIPTION:
 * - Footer chuẩn: Quay lại | Hub | Thoát (đăng xuất).
 * - Không thay CTA nghiệp vụ; đặt dưới main / không che sticky actions.
 */

export default function AppFooterNav({
  onBack,
  backLabel = 'Quay lại',
  onHub,
  hubLabel = 'Danh mục việc',
  onExit,
  exitLabel = 'Đăng xuất',
  className = '',
}) {
  return (
    <nav
      className={`mt-8 border-t border-slate-200 pt-4 ${className}`}
      aria-label="Điều hướng trang"
    >
      <div className="flex flex-col gap-2 text-center text-sm">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="font-bold text-indigo-700 underline-offset-2 hover:underline"
          >
            {backLabel}
          </button>
        ) : null}
        {onHub ? (
          <button
            type="button"
            onClick={onHub}
            className="font-semibold text-slate-600 underline-offset-2 hover:underline"
          >
            {hubLabel}
          </button>
        ) : null}
        {onExit ? (
          <button
            type="button"
            onClick={onExit}
            className="font-semibold text-slate-400 underline-offset-2 hover:underline"
          >
            {exitLabel}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
