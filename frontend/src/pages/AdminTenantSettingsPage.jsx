/**
 * PATH       : src/pages/AdminTenantSettingsPage.jsx
 * DATETIME   : 2026-08-25T20:40:00+07:00
 * VERSION    : 2.1.0-FOOTER
 * DESCRIPTION:
 * - Card UI: nhận diện (icon XOR ảnh), tên/gia đạo, giao diện, MXH.
 * - Crop logo 1:1 trước upload; mutual exclusive icon ↔ ảnh.
 * - Elder: AudioHelpButton + ZoneVoiceButton từng card.
 * - theme_color + social_configs (zalo/facebook/website).
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
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import { fetchTenantLogo, isHttpUrl } from '../lib/tenantLogo.js';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import LogoCropModal from '../features/admin/components/LogoCropModal.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

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

const PAGE_HELP =
  'Trang cài đặt dòng họ. Bạn đặt tên, câu gia đạo, mô tả, màu chủ đạo. ' +
  'Phần nhận diện: chọn biểu tượng có sẵn hoặc tải ảnh logo — chỉ dùng một cách. ' +
  'Ảnh sẽ chỉnh khung vuông trước khi lưu. Cuối cùng bấm Lưu thay đổi.';

const ZONE = {
  identity:
    'Chọn cách hiện biểu tượng dòng họ trên đầu trang: dùng icon có sẵn, hoặc tải ảnh logo đã cắt khung.',
  profile:
    'Điền tên dòng họ, câu gia đạo và mô tả ngắn. Tên bắt buộc. Mã slug chỉ xem, không sửa tại đây.',
  theme: 'Chọn màu chủ đạo dạng mã màu sáu ký tự, ví dụ #4F46E5.',
  social: 'Tuỳ chọn: dán liên kết Zalo, Facebook hoặc website của dòng họ.',
};

function Card({ title, zoneText, open, onToggle, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-4 text-left"
      >
        <span className="flex-1 text-sm font-black text-slate-800">{title}</span>
        {open ? (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          <ZoneVoiceButton visible text={zoneText} label="Nghe hướng dẫn" />
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function AdminTenantSettingsPage() {
  const { user, logout, setTenantLogoUrl, refreshUser } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };
  const footerNav = resolveFooterNav(user, { pageKey: 'admin-settings' });
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
  const [slug, setSlug] = useState('');
  const [themeColor, setThemeColor] = useState('#4F46E5');
  const [zalo, setZalo] = useState('');
  const [facebook, setFacebook] = useState('');
  const [website, setWebsite] = useState('');

  /** 'icon' | 'image' | null */
  const [idMode, setIdMode] = useState(null);
  const [logoIcon, setLogoIcon] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [logoMediaId, setLogoMediaId] = useState(null);
  const [status, setStatus] = useState(null);

  const [cropFile, setCropFile] = useState(null);
  const [openCard, setOpenCard] = useState({
    identity: true,
    profile: true,
    theme: false,
    social: false,
  });

  const toggle = (k) =>
    setOpenCard((p) => ({ ...p, [k]: !p[k] }));

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
      setSlug(d.slug || '');
      setStatus(d.status || null);
      setThemeColor(d.theme_color || '#4F46E5');

      const sc =
        d.social_configs && typeof d.social_configs === 'object'
          ? d.social_configs
          : {};
      setZalo(sc.zalo || '');
      setFacebook(sc.facebook || '');
      setWebsite(sc.website || '');

      const icon = d.logo_icon || sc.logo_icon || null;
      let mediaId = null;
      let readUrl = null;
      if (isHttpUrl(d.logo_url)) {
        readUrl = d.logo_url.trim();
      } else {
        const logo = await fetchTenantLogo(tenantId);
        mediaId = logo.mediaId;
        readUrl = logo.readUrl;
      }

      if (readUrl || mediaId) {
        setIdMode('image');
        setLogoIcon(null);
        setLogoMediaId(mediaId);
        setLogoPreviewUrl(readUrl);
      } else if (icon) {
        setIdMode('icon');
        setLogoIcon(icon);
        setLogoMediaId(null);
        setLogoPreviewUrl(null);
      } else {
        setIdMode(null);
        setLogoIcon(null);
        setLogoMediaId(null);
        setLogoPreviewUrl(null);
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

  const chooseIconMode = () => {
    setIdMode('icon');
    setLogoPreviewUrl(null);
    // giữ logoMediaId trên server; chỉ không dùng ảnh trên UI cho đến khi save clear icon path
  };

  const chooseImageMode = () => {
    setIdMode('image');
    setLogoIcon(null);
  };

  const selectIcon = (key) => {
    setIdMode('icon');
    setLogoIcon(key);
    setLogoPreviewUrl(null);
  };

  const onPickFile = (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ chọn file ảnh (PNG, JPG, WEBP…).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Ảnh tối đa 8MB trước khi cắt.');
      return;
    }
    setCropFile(file);
  };

  const uploadCropped = async (blob) => {
    if (!tenantId || !blob) return;
    setCropFile(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'logo.png');
      fd.append('entity_type', 'TENANT');
      fd.append('entity_id', tenantId);
      fd.append('purpose', 'LOGO');
      fd.append('is_primary', 'true');

      const up = await apiClient.post('/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const media = up.data?.data || up.data;
      if (!media?.id) throw new Error('Thiếu media.id');

      let readUrl = media.read_url || null;
      if (!isHttpUrl(readUrl)) {
        const urlRes = await apiClient.get(`/media/${media.id}/url`);
        readUrl = urlRes.data?.data?.url || urlRes.data?.url || null;
      }
      if (!isHttpUrl(readUrl)) {
        toast.error('Đã lưu R2 nhưng chưa lấy được link xem. F5 thử lại.');
        setLogoMediaId(media.id);
        return;
      }

      setIdMode('image');
      setLogoIcon(null);
      setLogoMediaId(media.id);
      setLogoPreviewUrl(readUrl);
      setTenantLogoUrl?.(readUrl);

      await apiClient.patch('/tenants/me', {
        ...(isSystemAdmin && queryTenantId ? { tenant_id: queryTenantId } : {}),
        logo_url: null,
        logo_icon: null,
      });

      toast.success('Đã cập nhật ảnh logo.');
    } catch (err) {
      console.error('[settings] upload', err?.response?.data || err);
      toast.error(err?.response?.data?.message || 'Upload logo thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!tenantId) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        slogan: slogan.trim() || null,
        description: description.trim() || null,
        theme_color: themeColor || null,
        logo_url: null,
        logo_icon: idMode === 'icon' ? logoIcon || null : null,
        // social_configs: merge zalo/facebook/website — BE updateTenantSettings
        // hiện merge logo_icon vào social_configs; cần gửi kèm nếu BE hỗ trợ
      };
      if (isSystemAdmin && queryTenantId) body.tenant_id = queryTenantId;

      // Gửi social qua PATCH body mở rộng — nếu BE chưa nhận, không phá name/slogan
      body.social_zalo = zalo.trim() || null;
      body.social_facebook = facebook.trim() || null;
      body.social_website = website.trim() || null;

      const res = await apiClient.patch('/tenants/me', body);
      const d = res.data?.data || res.data;
      setSlogan(d.slogan || '');
      setLogoIcon(d.logo_icon || (idMode === 'icon' ? logoIcon : null));
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

  const headerTenant = {
    id: tenantId,
    name: name || 'Dòng họ',
    slogan: slogan || null,
    logo_url:
      idMode === 'image' && isHttpUrl(logoPreviewUrl) ? logoPreviewUrl : null,
    logo_icon: idMode === 'icon' ? logoIcon : null,
  };

  if (!tenantId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-slate-600">
          Không xác định được dòng họ. SYSTEM_ADMIN mở kèm ?tenantId=
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
          onClick={() => navigate(footerNav.backTo || '/admin')}
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

      <div className="px-4 pt-3">
        <AudioHelpButton text={PAGE_HELP} label="Nghe hướng dẫn trang" />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10"
        >
          {/* Card nhận diện */}
          <Card
            title="1. Nhận diện (biểu tượng / logo)"
            zoneText={ZONE.identity}
            open={openCard.identity}
            onToggle={() => toggle('identity')}
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={chooseIconMode}
                className={`rounded-2xl border p-4 text-left ${
                  idMode === 'icon'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <Settings className="mb-2 h-6 w-6 text-indigo-700" />
                <div className="text-sm font-black text-slate-800">Biểu tượng</div>
                <div className="text-xs text-slate-500">Chọn icon có sẵn</div>
              </button>
              <button
                type="button"
                onClick={chooseImageMode}
                className={`rounded-2xl border p-4 text-left ${
                  idMode === 'image'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <ImageIcon className="mb-2 h-6 w-6 text-indigo-700" />
                <div className="text-sm font-black text-slate-800">Ảnh logo</div>
                <div className="text-xs text-slate-500">Tải & cắt khung</div>
              </button>
            </div>

            {idMode === 'icon' ? (
              <div className="grid grid-cols-4 gap-2 pt-2">
                {ICON_OPTIONS.map(({ key, Icon, label }) => {
                  const active = logoIcon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectIcon(key)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border p-3 ${
                        active
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <Icon className="h-7 w-7" />
                      <span className="text-[10px] font-semibold">{label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {idMode === 'image' ? (
              <div className="space-y-3 pt-2">
                {isHttpUrl(logoPreviewUrl) ? (
                  <img
                    src={logoPreviewUrl}
                    alt=""
                    className="h-24 w-24 rounded-2xl border border-slate-200 object-cover"
                  />
                ) : (
                  <p className="text-xs text-slate-500">Chưa có ảnh logo.</p>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
                  {uploading ? 'Đang tải…' : 'Chọn ảnh để cắt & tải lên'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={onPickFile}
                  />
                </label>
              </div>
            ) : null}
          </Card>

          <Card
            title="2. Tên & gia đạo"
            zoneText={ZONE.profile}
            open={openCard.profile}
            onToggle={() => toggle('profile')}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">
                Tên dòng họ
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400"
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-indigo-400"
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-indigo-400"
              />
            </label>
            {slug ? (
              <p className="text-xs text-slate-500">
                Mã dòng họ (slug): <strong>{slug}</strong> — chỉ xem
              </p>
            ) : null}
          </Card>

          <Card
            title="3. Màu chủ đạo"
            zoneText={ZONE.theme}
            open={openCard.theme}
            onToggle={() => toggle('theme')}
          >
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(themeColor) ? themeColor : '#4F46E5'}
                onChange={(e) => setThemeColor(e.target.value.toUpperCase())}
                className="h-12 w-14 cursor-pointer rounded-xl border border-slate-200"
              />
              <input
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                maxLength={7}
                placeholder="#4F46E5"
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm outline-none focus:border-indigo-400"
              />
            </div>
          </Card>

          <Card
            title="4. Liên kết mạng xã hội"
            zoneText={ZONE.social}
            open={openCard.social}
            onToggle={() => toggle('social')}
          >
            <label className="block text-sm">
              <span className="font-bold text-slate-700">Zalo</span>
              <input
                value={zalo}
                onChange={(e) => setZalo(e.target.value)}
                placeholder="https://zalo.me/..."
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold text-slate-700">Facebook</span>
              <input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://facebook.com/..."
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold text-slate-700">Website</span>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400"
              />
            </label>
          </Card>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-black text-white disabled:opacity-50"
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

      <div className="px-4 pb-6">
        <AppFooterNav {...footerNav} onLogout={handleLogout} />
      </div>

      {cropFile ? (
        <LogoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={uploadCropped}
        />
      ) : null}
    </div>
  );
}
