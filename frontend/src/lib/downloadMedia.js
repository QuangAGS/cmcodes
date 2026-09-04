/**
 * PATH       : src/lib/downloadMedia.js
 * DATETIME   : 2026-09-03T19:17:00+07:00
 * VERSION    : 1.0.0-M01
 * DESCRIPTION:
 * - Tải file qua BE /media/:id/download (Bearer).
 * - Đặt tên local = file_name Unicode — không mở URL R2.
 */

import apiClient from './apiClient.js';

export async function downloadMedia(id, fileName) {
  if (!id) throw new Error('Thiếu media id.');
  const res = await apiClient.get(`/media/${id}/download`, {
    responseType: 'blob',
    timeout: 120000,
  });
  const blob = res.data;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}
