/**
 * PATH       : src/lib/uploadPresigned.js
 * DATETIME   : 2026-09-04T12:05:00+07:00
 * VERSION    : 1.0.0-M10B
 * DESCRIPTION: Client PUT R2 qua presign rồi register. Multipart cũ vẫn dùng được.
 */

import apiClient from './apiClient.js';

export async function uploadViaPresign({
  file,
  entity_type,
  entity_id,
  purpose = 'DOCUMENT',
  caption = '',
  tenant_id,
}) {
  if (!file) throw new Error('Chưa chọn file.');
  const pre = await apiClient.post('/media/presign', {
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    file_size: file.size,
    entity_type,
    entity_id,
    purpose,
    tenant_id,
    caption,
  });
  const ticket = pre.data?.data || pre.data;
  const put = await fetch(ticket.put_url, {
    method: 'PUT',
    headers: ticket.headers || { 'Content-Type': ticket.content_type },
    body: file,
  });
  if (!put.ok) {
    const err = new Error('Không gửi được file lên kho lưu trữ.');
    err.status = put.status;
    throw err;
  }
  const reg = await apiClient.post('/media/register', {
    storage_key: ticket.storage_key,
    file_name: ticket.file_name,
    mime_type: ticket.content_type,
    file_size: ticket.file_size,
    entity_type: ticket.entity_type,
    entity_id: ticket.entity_id,
    purpose: ticket.purpose,
    tenant_id: ticket.tenant_id,
    caption,
  });
  return reg.data?.data || reg.data;
}
