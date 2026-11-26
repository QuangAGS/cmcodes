/**
 * PATH       : features/mfo/small-trees/api/smallTreesApi.js
 * DATETIME   : 2026-11-26T08:00:00+07:00
 * VERSION    : 1.0.0-FE02
 * DESCRIPTION:
 * - API client cho Small Trees (list, pending, create, merge, status, get by id).
 * - Dùng apiClient chung.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import { apiClient } from '../../../../lib/apiClient';

export const listSmallTrees = (params) =>
  apiClient.get('/small-trees', { params }).then((r) => r.data);

export const listPending = (params) =>
  apiClient.get('/small-trees/pending-merge', { params }).then((r) => r.data);

export const getSmallTreeById = (id) =>
  apiClient.get(`/small-trees/${id}`).then((r) => r.data);

export const createSmallTree = (payload) =>
  apiClient.post('/small-trees', payload).then((r) => r.data);

export const mergeSmallTree = (id, payload) =>
  apiClient.post(`/small-trees/${id}/merge`, payload).then((r) => r.data);

export const updateSmallTreeStatus = (id, payload) =>
  apiClient.patch(`/small-trees/${id}/status`, payload).then((r) => r.data);
