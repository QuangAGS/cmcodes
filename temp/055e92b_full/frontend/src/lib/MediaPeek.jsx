/**
 * PATH       : src/lib/MediaPeek.jsx
 * DATETIME   : 2026-09-04T07:55:00+07:00
 * VERSION    : 1.1.0-M05
 * DESCRIPTION: Bấm tên file → xem/nghe tại chỗ. Tải về / Xóa do cha đặt dưới caption.
 */

import { useState } from 'react';
import { toastSpeak } from './toastSpeak.js';
import { downloadMedia } from './downloadMedia.js';

function mimeOf(item) {
  return String(item?.mime_type || '').toLowerCase();
}

export function canPreviewInBrowser(mime) {
  const m = String(mime || '').toLowerCase();
  return (
    m.startsWith('image/') ||
    m.startsWith('audio/') ||
    m.startsWith('video/') ||
    m === 'application/pdf'
  );
}

export async function downloadMediaSafe(item) {
  await downloadMedia(item.id, item.file_name);
}

export function MediaPeek({ item }) {
  const [play, setPlay] = useState(false);
  const mime = mimeOf(item);
  const audio = mime.startsWith('audio/');
  const video = mime.startsWith('video/');

  async function onOpen() {
    if ((audio || video) && item.url) {
      setPlay(true);
      return;
    }
    if (canPreviewInBrowser(mime) && item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await downloadMedia(item.id, item.file_name);
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không mở được tệp.');
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="block w-full truncate text-left text-xs font-semibold text-indigo-700"
        onClick={onOpen}
      >
        {item.file_name || 'Tệp'}
      </button>
      {play && audio && item.url ? (
        <audio className="mt-2 w-full" controls autoPlay src={item.url} />
      ) : null}
      {play && video && item.url ? (
        <video className="mt-2 w-full rounded-lg" controls autoPlay src={item.url} />
      ) : null}
    </div>
  );
}
