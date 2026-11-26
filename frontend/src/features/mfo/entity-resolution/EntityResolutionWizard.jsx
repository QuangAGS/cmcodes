/**
 * PATH       : features/mfo/entity-resolution/EntityResolutionWizard.jsx
 * DATETIME   : 2026-11-26T07:40:00+07:00
 * VERSION    : 1.0.0-FE01
 * DESCRIPTION:
 * - Component chính cho Admin Wizard Entity Resolution.
 * - Cho phép chọn 2 member, preview, hiển thị soft warning + conflict, thực thi merge.
 * - Dùng component FE-04.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationOffsetWarning } from '../components/GenerationOffsetWarning';
import { ConflictCitationList } from '../components/ConflictCitationList';
import { usePreviewMerge, useExecuteMerge, useWizardSummary } from './hooks/useEntityResolution';

export function EntityResolutionWizard({ tenantId }) {
  const [sourceMemberId, setSourceMemberId] = useState('');
  const [targetMemberId, setTargetMemberId] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [previewedPair, setPreviewedPair] = useState(null);

  const previewMutation = usePreviewMerge();
  const mergeMutation = useExecuteMerge();
  const queryClient = useQueryClient();

  const summaryParams = sourceMemberId && targetMemberId
    ? { tenant_id: tenantId, source_member_id: sourceMemberId, target_member_id: targetMemberId }
    : null;

  const { data: summary } = useWizardSummary(summaryParams);

  const handlePreview = async () => {
    const cleanSource = sourceMemberId.trim();
    const cleanTarget = targetMemberId.trim();

    if (!cleanSource || !cleanTarget) {
      toast.error('Vui lòng chọn đủ 2 thành viên.');
      return;
    }
    if (cleanSource === cleanTarget) {
      toast.error('Không thể tự gộp một thực thể vào chính nó.');
      return;
    }

    // Đồng bộ state đã trim
    if (cleanSource !== sourceMemberId) setSourceMemberId(cleanSource);
    if (cleanTarget !== targetMemberId) setTargetMemberId(cleanTarget);

    try {
      const result = await previewMutation.mutateAsync({
        tenantId,
        sourceMemberId: cleanSource,
        targetMemberId: cleanTarget,
      });
      setPreviewResult(result);
      setPreviewedPair({ source: cleanSource, target: cleanTarget });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi preview.';
      toast.error(msg);
    }
  };

  const handleMerge = async () => {
    const cleanSource = sourceMemberId.trim();
    const cleanTarget = targetMemberId.trim();

    if (!previewResult?.can_merge) {
      toast.error('Không thể merge theo kết quả preview.');
      return;
    }
    if (
      !previewedPair ||
      previewedPair.source !== cleanSource ||
      previewedPair.target !== cleanTarget
    ) {
      toast.error('Đã thay đổi thành viên. Vui lòng Preview lại trước khi gộp.');
      return;
    }

    try {
      await mergeMutation.mutateAsync({
        tenantId,
        sourceMemberId: cleanSource,
        targetMemberId: cleanTarget,
      });
      toast.success('Gộp thành công.');
      setPreviewResult(null);
      setPreviewedPair(null);
      setSourceMemberId('');
      setTargetMemberId('');
      queryClient.invalidateQueries({ queryKey: ['wizard-summary'] });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi merge.';
      toast.error(msg);
    }
  };

  const softWarning = previewResult?.soft_warning;
  const conflicts = previewResult?.potential_conflicts || [];

  // Reset preview khi tenantId đổi
  useEffect(() => {
    setPreviewResult(null);
    setPreviewedPair(null);
  }, [tenantId]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Gộp hồ sơ trùng (Entity Resolution)</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Thành viên nguồn (Source)</label>
          <input
            type="text"
            value={sourceMemberId}
            onChange={(e) => {
              setSourceMemberId(e.target.value);
              setPreviewResult(null);
              setPreviewedPair(null);
            }}
            onBlur={(e) => setSourceMemberId(e.target.value.trim())}
            placeholder="Nhập ID thành viên nguồn"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Thành viên đích (Target)</label>
          <input
            type="text"
            value={targetMemberId}
            onChange={(e) => {
              setTargetMemberId(e.target.value);
              setPreviewResult(null);
              setPreviewedPair(null);
            }}
            onBlur={(e) => setTargetMemberId(e.target.value.trim())}
            placeholder="Nhập ID thành viên đích"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewMutation.isPending}
          className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {previewMutation.isPending ? 'Đang preview...' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={handleMerge}
          disabled={!previewResult?.can_merge || mergeMutation.isPending}
          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {mergeMutation.isPending ? 'Đang gộp...' : 'Xác nhận gộp'}
        </button>
      </div>

      {summary && (
        <div className="text-sm text-slate-600 rounded border border-slate-200 p-3">
          <div className="font-medium">Wizard Summary</div>
          <div>Can merge: {String(summary.can_merge ?? 'N/A')}</div>
          <div>Soft warning: {String(summary.soft_warning_only ?? 'N/A')}</div>
        </div>
      )}

      {previewResult && (
        <div className="rounded border border-slate-200 p-4 space-y-3">
          <div className="text-sm">
            Có thể gộp: <strong>{previewResult.can_merge ? 'Có' : 'Không'}</strong>
          </div>

          <GenerationOffsetWarning
            offset={softWarning?.root_generation_offset}
            sourceTitle={softWarning?.source_title}
          />

          <ConflictCitationList conflicts={conflicts} />
        </div>
      )}
    </div>
  );
}

export default EntityResolutionWizard;
