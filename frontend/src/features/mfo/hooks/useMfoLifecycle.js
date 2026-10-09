/**
 * PATH       : frontend/src/features/mfo/hooks/useMfoLifecycle.js
 * DATETIME   : 2026-10-09T09:30:00+07:00
 * VERSION    : 2.0.0-USE-MFO-LIFECYCLE-HOOK
 * DESCRIPTION:
 * - Custom Hook React quản lý Vòng đời Tờ trình MFO 5L tập trung.
 * - Tự động tính toán Ma trận Trạng thái, Cờ isReadOnly, cờ hasCanvasChanges.
 * - Khống chế hành vi Nút bấm và Active Form Portal (AF) theo SRPF Lifecycle.
 * REFERENCE  : MFO Core Lifecycle 2.0 Architectural Specification
 */

import { useMemo } from 'react';
import { resolveMfoLifecycle } from '../lib/mfoLifecycleMapper.js';
import { diffDraftAgainstInit } from '../lib/mfoDiffEngine.js';

/**
 * Custom Hook useMfoLifecycle
 * 
 * @param {Object} params
 * @param {Object|null} params.ticket - Bản ghi tờ trình MFO đang chọn
 * @param {Object} [params.currentPayload] - Payload đang chỉnh sửa trên Canvas/Form
 * @param {boolean} [params.isUserMutated] - Cờ đánh dấu người dùng đã thao tác trên Canvas
 * @returns {Object} Bộ cờ và trạng thái phục vụ Render UI
 */
export function useMfoLifecycle({ ticket = null, currentPayload = null, isUserMutated = false } = {}) {
  // 1. Giải mã Vòng đời từ Mapper
  const lifecycle = useMemo(() => {
    return resolveMfoLifecycle(ticket);
  }, [ticket]);

  // 2. Tính toán cờ kiểm tra biến động chống nộp hồ sơ rỗng (hasCanvasChanges)
  const hasCanvasChanges = useMemo(() => {
    if (lifecycle.isReadOnly) return false;
    if (isUserMutated) return true;
    if (currentPayload?.target_member_id) return true;

    if (!currentPayload) return false;

    try {
      const diffs = diffDraftAgainstInit(currentPayload);
      return diffs.some((d) => d.text && d.text !== 'Không thêm gì.');
    } catch {
      return false;
    }
  }, [lifecycle.isReadOnly, isUserMutated, currentPayload]);

  // 3. Khống chế nút Lưu nháp và Trình Khung 5L
  const canClickSaveDraft = useMemo(() => {
    return !lifecycle.isReadOnly && hasCanvasChanges;
  }, [lifecycle.isReadOnly, hasCanvasChanges]);

  const canClickSubmitPlan = useMemo(() => {
    return !lifecycle.isReadOnly && lifecycle.canSubmitPlan && hasCanvasChanges;
  }, [lifecycle.isReadOnly, lifecycle.canSubmitPlan, hasCanvasChanges]);

  const canClickSubmitResult = useMemo(() => {
    return !lifecycle.isReadOnly && lifecycle.canSubmitResult;
  }, [lifecycle.isReadOnly, lifecycle.canSubmitResult]);

  return {
    ...lifecycle,
    hasCanvasChanges,
    canClickSaveDraft,
    canClickSubmitPlan,
    canClickSubmitResult,
  };
}

export default useMfoLifecycle;