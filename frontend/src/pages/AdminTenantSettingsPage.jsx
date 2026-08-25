/**
 * PATH       : src/pages/AdminTenantSettingsPage.jsx
 * DATETIME   : 2026-08-25T19:55:00+07:00
 * VERSION    : 1.1.0-LOGO-MEDIA
 * DESCRIPTION:
 * - Cài đặt dòng họ: name, slogan, description, logo file (R2 private).
 * - KHÔNG lưu presigned URL vào tenants.logo_url (varchar 255 + hết hạn).
 * - Logo: media purpose=LOGO + is_primary; preview qua GET /media/:id/url.
 * - logo_icon optional (Lucide) — có thể bỏ chọn khi dùng ảnh.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Landmark,
  Home,
  TreePine,
  UsersRound,
  GitFork,
  Crown,
  ShieldCheck,
  Settings,
  Loader2,
  ArrowLeft,
  Save,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import {
  fetchTenantLogo,
  isHttpUrl,
} from '../lib/tenantLogo.js';

const ICON_OPTIONS = [
  { key: 'Landmark', Icon: Landmark, label: 'Cột mốc' },
  { key: 'Home', Icon: Home, label: 'Nhà' },
  { key: 'TreePine', Icon: TreePine, label: 'Cây' },
  { key: 'UsersRound', Icon: UsersRound, label: 'Cộng đồng' },
  { key: 'GitFork', Icon: GitFork, label: 'Nhánh' },
  { key: 'Crown', Icon: Crown, label: 'Vương' },
  { key: 'ShieldCheck', Icon: ShieldCheck, label: 'Khiên' },
  { key: 'Settings', Icon: Settings, label: 'Cài đặt' },
];

export default function AdminTenantSettingsPage() {
  const { user, setTenantLogoUrl, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const queryTenantId =
    searchParams.get('tenantId') || searchParams.get('tenant_id');
  const tenantId =
    (isSystemAdmin && queryTenantId) ||
    user?.tenantId ||
    user?.tenant_id ||
    user?.tenant?.id ||
    null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [description, setDescription] = useState('');
  const [logoIcon, setLogoIcon] = useState(null);
  /** Chỉ URL http(s) để <img> — không bao giờ gán uuid thô */
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [logoMediaId, setLogoMediaId] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q =
        isSystemAdmin && queryTenantId
          ? `?tenant_id=${encodeURIComponent(queryTenantId)}`
          : '';
      const res = await apiClient.get(`/tenants/me${q}`);
      const d = res.data?.data || res.data;
      setName(d.name || '');
      setSlogan(d.slogan || '');
      setDescription(d.description || '');
      setLogoIcon(d.logo_icon || null);
      setStatus(d.status || null);

      // logo_url trên tenant chỉ dùng nếu đã là http(s) hợp lệ (legacy)
      if (isHttpUrl(d.logo_url)) {
        setLogoPreviewUrl(d.logo_url.trim());
        setLogoMediaId(null);
      } else {
        const { mediaId, readUrl } = await fetchTenantLogo(tenantId);
        setLogoMediaId(mediaId);
        setLogoPreviewUrl(readUrl);
      }
    } catch (e) {
      toast.error(
        e?.response?.data?.message || 'Không tải được thông tin dòng họ.'
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, isSystemAdmin, queryTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!tenantId) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        slogan: slogan.trim() || null,
        description: description.trim() || null,
        logo_icon: logoIcon || null,
        // Không ghi presign / uuid vào logo_url
        logo_url: null,
      };
      if (isSystemAdmin && queryTenantId) {
        body.tenant_id = queryTenantId;
      }
      const res = await apiClient.patch('/tenants/me', body);
      const d = res.data?.data || res.data;
      setSlogan(d.slogan || '');
      setLogoIcon(d.logo_icon || null);
      toast.success('Đã lưu thông tin dòng họ.');
      try {
        await refreshUser?.();
      } catch (_) {}

    } catch (err) {
      toast.error(
        err?.response?.data?.message || 'Không lưu được. Vui lòng thử lại.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogo = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !tenantId) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ chọn file ảnh (PNG, JPG, WEBP…).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ảnh tối đa 5MB.');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'TENANT');
      fd.append('entity_id', tenantId);
      fd.append('purpose', 'LOGO');
      fd.append('is_primary', 'true');

      const up = await apiClient.post('/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const media = up.data?.data || up.data;
      if (!media?.id) {
        throw new Error('Upload OK nhưng thiếu media.id');
      }

      let readUrl = media.read_url || null;
      if (!isHttpUrl(readUrl)) {
        const urlRes = await apiClient.get(`/media/${media.id}/url`);
        readUrl =
          urlRes.data?.data?.url ||
          urlRes.data?.url ||
          null;
      }

      if (!isHttpUrl(readUrl)) {
        toast.error(
          'Đã lưu file trên R2 nhưng chưa lấy được link xem. Thử tải lại trang.'
        );
        setLogoMediaId(media.id);
        setLogoPreviewUrl(null);
        return;
      }

      setLogoMediaId(media.id);
      setLogoPreviewUrl(readUrl);
      // Ảnh logo ưu tiên hơn icon
      setLogoIcon(null);
      // Đồng bộ header mọi trang (AuthContext)
      try {
        setTenantLogoUrl?.(readUrl);
      } catch (_) {}

      // Clear logo_url cũ trên tenant (tránh uuid / URL cắt cụt)
      try {
        await apiClient.patch('/tenants/me', {
          ...(isSystemAdmin && queryTenantId
            ? { tenant_id: queryTenantId }
            : {}),
          logo_url: null,
          logo_icon: null,
        });
      } catch (_) {
        /* non-fatal */
      }

      toast.success('Đã tải logo lên.');
    } catch (err) {
      console.error('[AdminTenantSettings] upload', err?.response?.data || err);
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          'Upload logo thất bại.'
      );
    } finally {
      setUploading(false);
    }
  };

  const headerTenant = {
    id: tenantId,
    name: name || 'Dòng họ',
    slogan: slogan || null,
    logo_url: isHttpUrl(logoPreviewUrl) ? logoPreviewUrl : null,
    logo_icon: logoIcon,
  };

  if (!tenantId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-slate-600">
          Không xác định được dòng họ. SYSTEM_ADMIN hãy mở kèm ?tenantId=
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
        >
          Về trang quản trị
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader
        tenant={headerTenant}
        subtitle={status ? `Trạng thái: ${status}` : null}
      />

      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
          Quay lại
        </button>
        <h1 className="flex-1 text-center text-base font-black text-slate-800">
          Cài đặt dòng họ
        </h1>
        <span className="w-16" />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="flex flex-1 flex-col gap-5 px-4 py-5"
        >
          {/* Icon (tuỳ chọn khi chưa có ảnh) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-slate-700">
              Biểu tượng (khi chưa có ảnh logo)
            </p>
            <div className="grid grid-cols-4 gap-2">
              {ICON_OPTIONS.map(({ key, Icon, label }) => {
                const active = logoIcon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLogoIcon(key)}
                    className={`flex flex-col items-center gap-1 rounded-2xl border p-3 transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Icon className="h-7 w-7" />
                    <span className="text-[10px] font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
            {logoIcon ? (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-slate-500 underline"
                onClick={() => setLogoIcon(null)}
              >
                Bỏ chọn biểu tượng
              </button>
            ) : null}
          </div>

          {/* Logo file */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-bold text-slate-700">
              Ảnh logo (tuỳ chọn)
            </p>
            {isHttpUrl(logoPreviewUrl) ? (
              <img
                src={logoPreviewUrl}
                alt="Logo dòng họ"
                className="mb-3 h-20 w-20 rounded-2xl border border-slate-200 object-cover"
                onError={() => {
                  // Presign hết hạn / URL hỏng → thử fetch lại
                  setLogoPreviewUrl(null);
                  fetchTenantLogo(tenantId).then(({ mediaId, readUrl }) => {
                    setLogoMediaId(mediaId);
                    if (readUrl) setLogoPreviewUrl(readUrl);
                  });
                }}
              />
            ) : (
              <p className="mb-3 text-xs text-slate-500">
                {logoMediaId
                  ? 'Đã có file logo trên hệ thống — đang lấy link xem…'
                  : 'Chưa có ảnh. Có thể dùng biểu tượng ở trên.'}
              </p>
            )}
            {logoMediaId ? (
              <p className="mb-2 truncate text-[10px] text-slate-400">
                media: {logoMediaId}
              </p>
            ) : null}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 active:scale-[0.98]">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              {uploading ? 'Đang tải…' : 'Chọn ảnh logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={uploading}
                onChange={handleUploadLogo}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Tên dòng họ
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Gia đạo / slogan
            </span>
            <input
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              maxLength={255}
              placeholder="Ví dụ: Đoàn kết - Nghĩa tình"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Mô tả ngắn
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-indigo-400"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-sm disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </form>
      )}
    </div>
  );
}
