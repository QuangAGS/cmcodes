/**
 * PATH       : features/mfo/entity-resolution/hooks/useEntityResolution.js
 * DATETIME   : 2026-11-26T07:40:00+07:00
 * VERSION    : 1.0.0-FE01
 * DESCRIPTION:
 * - Hooks cho Entity Resolution (preview, merge).
 * - Dùng react-query.
 * 
 * CHANGE LOGS:
 * - FE-01: thêm hooks useEntityResolution. 
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { previewMerge, executeMerge, getWizardSummary } from '../api/entityResolutionApi';

export function usePreviewMerge() {
  return useMutation({ mutationFn: previewMerge });
}

export function useExecuteMerge() {
  return useMutation({ mutationFn: executeMerge });
}

export function useWizardSummary(params, options = {}) {
  return useQuery({
    queryKey: [
      'wizard-summary',
      params?.tenant_id,
      params?.source_member_id,
      params?.target_member_id,
    ],
    queryFn: () => getWizardSummary(params),
    enabled: Boolean(
      params?.tenant_id &&
      params?.source_member_id &&
      params?.target_member_id
    ),
    ...options,
  });
}
