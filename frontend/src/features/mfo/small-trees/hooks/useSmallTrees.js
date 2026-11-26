/**
 * PATH       : features/mfo/small-trees/hooks/useSmallTrees.js
 * DATETIME   : 2026-11-26T08:00:00+07:00
 * VERSION    : 1.0.0-FE02
 * DESCRIPTION:
 * - Hooks cho Small Trees.
 * - Dùng react-query.
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không phỏng đoán.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listSmallTrees,
  listPending,
  getSmallTreeById,
  createSmallTree,
  mergeSmallTree,
  updateSmallTreeStatus,
} from '../api/smallTreesApi';

export function useSmallTreesList(params, options = {}) {
  return useQuery({
    queryKey: ['small-trees', params?.tenant_id, params?.status],
    queryFn: () => listSmallTrees(params),
    enabled: Boolean(params?.tenant_id),
    ...options,
  });
}

export function usePendingSmallTrees(params, options = {}) {
  return useQuery({
    queryKey: ['small-trees-pending', params?.tenant_id],
    queryFn: () => listPending(params),
    enabled: Boolean(params?.tenant_id),
    ...options,
  });
}

export function useSmallTreeById(id, options = {}) {
  return useQuery({
    queryKey: ['small-tree', id],
    queryFn: () => getSmallTreeById(id),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateSmallTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSmallTree,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['small-trees'] });
      queryClient.invalidateQueries({ queryKey: ['small-trees-pending'] });
    },
  });
}

export function useMergeSmallTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => mergeSmallTree(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['small-trees'] });
      queryClient.invalidateQueries({ queryKey: ['small-trees-pending'] });
    },
  });
}

export function useUpdateSmallTreeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => updateSmallTreeStatus(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['small-trees'] });
      queryClient.invalidateQueries({ queryKey: ['small-trees-pending'] });
    },
  });
}
