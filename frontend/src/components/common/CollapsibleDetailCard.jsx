/**
 * ============================================================================
 * PATH       : src/components/common/CollapsibleDetailCard.jsx
 * DATETIME   : 2026-11-21T11:20:00+07:00
 * VERSION    : 1.2.0-ISO29148-UAT-IMP4
 * DESCRIPTION:
 * - Card chuẩn hóa theo UAT-IMP3 & UAT-IMP4:
 *   + Dòng 1: Tiêu đề (Title) chiếm trọn chiều ngang.
 *   + Dòng 2: Chia 3 cột tối ưu cho mobile 375px (grid-cols-[48px_1fr_1fr]):
 *       * Cột 1 (48px x 48px): Biểu tượng trạng thái hoàn thành của toàn bộ Card
 *         (✓ xanh lá đậm khi 'complete', ◌ vòng tròn nét đứt hổ phách khi chưa xong),
 *         tránh cắt chữ trên màn hình nhỏ [UAT-IMP4 Mục 1].
 *       * Cột 2 (1fr): Nút "Nghe" (ZoneVoiceButton, h-12 rounded-xl).
 *       * Cột 3 (1fr): Nút "Mở ra" / "Đóng lại" (h-12 rounded-xl).
 *   + Khi "Đóng lại": Chỉ hiển thị đúng Dòng 1 & Dòng 2 để tiết kiệm diện tích.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-21T09:45:00+07:00 (v1.1.0-ISO29148-UAT-IMP3): Khởi tạo Card 2 dòng / 3 cột.
 * - 2026-11-21T11:20:00+07:00 (v1.2.0-ISO29148-UAT-IMP4):
 *   + Thay text ở Cột 1 Dòng 2 bằng ô biểu tượng trạng thái chuẩn 48px x 48px
 *     (CheckCircle2 / CircleDashed) kèm title & aria-label đầy đủ.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, CircleDashed } from 'lucide-react';
import ZoneVoiceButton from '../../features/elder-doctrine/components/ZoneVoiceButton.jsx';

export default function CollapsibleDetailCard({
  title,
  statusLabel = 'Chưa hoàn chỉnh',
  statusVariant = 'default',
  voiceText = '',
  expanded,
  defaultExpanded = false,
  onToggle,
  disabled = false,
  className = '',
  children,
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = typeof expanded === 'boolean';
  const isExpanded = isControlled ? expanded : internalExpanded;

  const handleToggle = () => {
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    if (typeof onToggle === 'function') {
      onToggle(next);
    }
  };

  const isComplete = statusVariant === 'complete';
  const resolvedAriaStatus =
    statusLabel || (isComplete ? 'Đã hoàn chỉnh' : 'Chưa hoàn chỉnh');

  const statusIconStyles = isComplete
    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
    : statusVariant === 'pending'
      ? 'border-amber-300 bg-amber-50 text-amber-600'
      : 'border-slate-300 bg-slate-50 text-slate-500';

  return (
    <div
      className={`rounded-2xl border-2 bg-white shadow-sm transition-colors ${
        isExpanded ? 'border-emerald-300' : 'border-slate-200'
      } ${className}`}
    >
      <div className="p-4 space-y-3">
        {/* Dòng 1: Tiêu đề (Title) */}
        <h3 className="w-full text-lg font-bold leading-snug text-slate-900 break-words">
          {title}
        </h3>

        {/* Dòng 2: 3 cột — Cột 1: Icon trạng thái (48x48) | Cột 2: Nút Nghe | Cột 3: Mở ra / Đóng lại */}
        <div className="grid grid-cols-[48px_1fr_1fr] gap-2.5 items-center">
          {/* Cột 1: Biểu tượng trạng thái toàn bộ Card */}
          <div
            role="img"
            aria-label={resolvedAriaStatus}
            title={resolvedAriaStatus}
            className={`min-h-[48px] h-12 w-12 rounded-xl border-2 flex items-center justify-center shrink-0 transition-colors ${statusIconStyles}`}
          >
            {isComplete ? (
              <CheckCircle2 size={24} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <CircleDashed size={24} strokeWidth={2.2} aria-hidden="true" />
            )}
          </div>

          {/* Cột 2: Nút Nghe */}
          <div className="flex justify-center min-w-0">
            <ZoneVoiceButton
              visible
              text={voiceText || (typeof title === 'string' ? title : '')}
              label="Nghe"
              disabled={disabled || !voiceText}
              className="w-full justify-center"
            />
          </div>

          {/* Cột 3: Nút Mở ra / Đóng lại */}
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 text-base font-bold text-slate-800 whitespace-nowrap transition hover:bg-slate-100"
          >
            <span>{isExpanded ? 'Đóng lại' : 'Mở ra'}</span>
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Khi "Đóng lại": chỉ hiện Dòng 1 & Dòng 2; khi "Mở ra": hiển thị chi tiết */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
