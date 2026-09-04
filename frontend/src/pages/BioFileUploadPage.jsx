/**
 * PATH       : src/pages/BioFileUploadPage.jsx
 * DATETIME   : 2026-09-04T06:55:00+07:00
 * VERSION    : 1.0.0-A01-BIO-FILES
 * DESCRIPTION: Trang con upload tư liệu tiểu sử theo chủ đề. Quay /me/profile.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { writeBioTopic, writeProfileSection } from '../lib/profileSection.js';

const LABELS = {
  childhood_summary: 'Thiếu thời',
  education_history: 'Học vấn',
  career_history: 'Nghề nghiệp',
  later_life_summary: 'Về già / giai đoạn sau',
  personality_traits: 'Tính cách',
  notable_quotes: 'Danh ngôn',
};

export default function BioFileUploadPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { topic } = useParams();
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'public',
    backTo: '/me/profile',
    showBack: true,
  });

  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const label = LABELS[topic] || 'Tiểu sử';

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!file) {
      toast.error('Chọn ảnh hoặc PDF.');
      return;
    }
    if (!caption.trim()) {
      toast.error('Nhập mô tả ngắn.');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', caption.trim());
      await apiClient.post(`/me/biography/${topic}/files`, fd);
      toast.success('Đã thêm tư liệu tiểu sử.');
      writeProfileSection('bio_read');
      writeBioTopic(topic);
      navigate('/me/profile', { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không lưu được tư liệu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Tư liệu tiểu sử" />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">Thêm tư liệu</h1>
        <p className="mt-1 text-sm text-slate-500">
          Chủ đề {label} · ảnh hoặc PDF · tối đa 5MB. Bắt buộc mô tả.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">File</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
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
              placeholder="Ví dụ: Ảnh lớp 5, năm 1978"
            />
            <p className="mt-1 text-xs text-slate-400">{caption.length}/255</p>
          </label>
        </div>
        <button
          type="submit"
          disabled={saving || !file || !caption.trim()}
          className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
        >
          {saving ? 'Đang tải...' : 'Lưu tư liệu'}
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
