/**
 * PATH       : features/mfo/entity-resolution/api/entityResolutionApi.js
 * DATETIME   : 2026-11-26T07:40:00+07:00
 * VERSION    : 1.0.0-FE01
 * DESCRIPTION:
 * - API client cho Entity Resolution (preview, merge, wizard-summary).
 * - Dùng apiClient chung.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import { apiClient } from '../../../../lib/apiClient';

export const previewMerge = (payload) =>
  apiClient.post('/entity-resolution/preview', payload).then((r) => r.data);

export const executeMerge = (payload) =>
  apiClient.post('/entity-resolution/merge', payload).then((r) => r.data);

export const getWizardSummary = (params) =>
  apiClient.get('/entity-resolution/wizard-summary', { params }).then((r) => r.data);
