/**
 * PATH       : src/lib/compressImage.js
 * DATETIME   : 2026-09-04T11:25:00+07:00
 * VERSION    : 1.1.0-M09
 * DESCRIPTION: Nén/resize ảnh client. HEIC/HEIF → JPEG/WebP nếu máy decode được.
 *              Không lưu HEIC. Không JPEG→PNG.
 */

const SKIP = /^(application|audio|video|image\/gif|image\/svg)/i;

export function isHeicLike(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return (
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    mime === 'image/heic-sequence' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

export function isRasterImage(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (isHeicLike(file)) return true;
  return /^image\/(jpeg|jpg|png|webp)$/i.test(mime);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('NO_DECODE'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || null), mime, quality);
  });
}

function rename(original, ext) {
  const base = String(original || 'image').replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

export async function compressImageFile(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  if (!file || typeof file === 'string') return file;
  const mime = String(file.type || '').toLowerCase();
  const heic = isHeicLike(file);
  if (!heic && (!mime.startsWith('image/') || SKIP.test(mime))) return file;

  try {
    const img = await loadImage(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) {
      if (heic) throw new Error('NO_DECODE');
      return file;
    }

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);

    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    let outMime = 'image/webp';
    let ext = 'webp';
    if (!blob || blob.size === 0) {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      outMime = 'image/jpeg';
      ext = 'jpg';
    }
    if (!blob) {
      if (heic) throw new Error('NO_DECODE');
      return file;
    }
    if (!heic && blob.size >= file.size && scale === 1 && mime === outMime) return file;
    return new File([blob], rename(file.name, ext), { type: outMime, lastModified: Date.now() });
  } catch (e) {
    if (heic) {
      const err = new Error(
        'Máy này không đọc được ảnh HEIC. Trên iPhone: Cài đặt → Camera → Định dạng → Tương thích nhất, hoặc chọn ảnh JPEG.'
      );
      err.code = 'HEIC_UNSUPPORTED';
      throw err;
    }
    return file;
  }
}

export async function canvasToPhotoBlob(canvas, { quality = 0.86 } = {}) {
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  if (blob && blob.size) return { blob, mime: 'image/webp', name: 'avatar.webp' };
  blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (blob && blob.size) return { blob, mime: 'image/jpeg', name: 'avatar.jpg' };
  throw new Error('toBlob failed');
}
