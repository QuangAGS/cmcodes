/**
 * PATH       : src/pages/DocumentUploadPage.jsx
 * DATETIME   : 2026-09-03T19:50:00+07:00
 * VERSION    : 1.1.0-A01-DOCS-MEDIA
 * DESCRIPTION: Upload tài liệu khác. Ảnh, PDF, Office, zip, mp3/wav, mp4/webm. Caption bắt buộc.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toastSpeak } from '../lib/toastSpeak.js';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import { compressImageFile } from '../lib/compressImage.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { memberIdFromSearch, profileHome } from '../lib/profileTarget.js';
import { writeProfileSection } from '../lib/profileSection.js';

const ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
].join(',');

export default function DocumentUploadPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const targetId = memberIdFromSearch(params);
  const home = profileHome(targetId);
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'public',
    backTo: home,
    showBack: true,
  });

  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!file) {
      toastSpeak('error', 'Chọn file.');
      return;
    }
    if (!caption.trim()) {
      toastSpeak('error', 'Nhập mô tả ngắn.');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      const packed = await compressImageFile(file, { maxEdge: 1600, quality: 0.82 });
      fd.append('file', packed);
      fd.append('caption', caption.trim());
      if (targetId) fd.append('member_id', targetId);
      await apiClient.post('/me/documents', fd, { params: targetId ? { member_id: targetId } : {} });
      toastSpeak('ok', 'Đã lưu tài liệu.');
      writeProfileSection('docs');
      navigate(home, { replace: true });
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || e.message || 'Không lưu được tài liệu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Tài liệu khác" />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">Thêm tài liệu</h1>
        <p className="mt-1 text-sm text-slate-500">Ảnh, PDF, Office, zip, mp3/wav, mp4/webm · mỗi file ≤ 10MB · tổng ≤ 30MB. Bắt buộc mô tả.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">File</span>
            <input
              type="file"
              accept={ACCEPT}
              className="w-full text-sm"
              onChange={(e) => setFile((e.target.files && e.target.files[0]) || null)}
            />
            {file ? <p className="mt-1 truncate text-xs text-slate-500">{file.name}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Mô tả ngắn</span>
            <textarea
              rows={3}
              maxLength={255}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400"
              placeholder="Ví dụ: Nhật ký giỗ tổ 2026"
            />
            <p className="mt-1 text-xs text-slate-400">{caption.length}/255</p>
          </label>
        </div>
        <button
          type="submit"
          disabled={saving || !file || !caption.trim()}
          className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
        >
          {saving ? 'Đang tải...' : 'Lưu tài liệu'}
        </button>
      </form>
      <div className="px-4 pb-6">
        <AppFooterNav
          {...footerNav}
          onLogout={() => {
            logout();
            navigate('/auth', { replace: true });
          }}
        />
      </div>
    </div>
  );
}
