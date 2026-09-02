/**
 * PATH       : src/pages/MemberProfilePage.jsx
 * DATETIME   : 2026-08-29T18:00:00+07:00
 * VERSION    : 1.7.0-A01-AVATAR-P0
 * DESCRIPTION: Shell tóm tắt + một mục. Địa chỉ đọc 2 cột. Form địa chỉ trang con.
 *              P0: vòng tròn avatar → JPEG/PNG/WebP ≤ 2MB → POST /me/avatar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import {
  PROFILE_PAGE_HELP,
  PROFILE_ZONE,
} from '../features/member/constants/memberProfileMessages.js';
import {
  EMPTY_ADDRESS,
  addressFromApi,
  formatAddressSummary,
  hasPlace,
} from '../features/member/constants/addressCatalog.js';
import {
  AchievementEditor,
  AchievementReader,
  EMPTY_ACHIEVEMENT,
} from '../features/member/components/AchievementSection.jsx';
import { achievementFromApi } from '../features/member/constants/achievementCatalog.js';

const EMPTY = {
  full_name: '',
  alias: '',
  note: '',
  birth_year: '',
  birth_month: '',
  birth_day: '',
  is_birth_lunar: false,
  birth_note: '',
  phone_number: '',
  email: '',
  zalo: '',
  facebook: '',
  website: '',
  childhood_summary: '',
  education_history: '',
  career_history: '',
  later_life_summary: '',
  personality_traits: '',
  notable_quotes: '',
  origin: { ...EMPTY_ADDRESS },
  current: { ...EMPTY_ADDRESS },
  privacy_CONTACT: 'TENANT',
  privacy_ACHIEVEMENT: 'TENANT',
  privacy_BIRTH_DATE: 'TENANT',
};

const SECTIONS = [
  { key: 'identity', label: 'Họ tên' },
  { key: 'birth', label: 'Ngày sinh' },
  { key: 'contact', label: 'Liên lạc' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'bio', label: 'Tiểu sử' },
  { key: 'bio_read', label: 'Đọc toàn bộ tiểu sử' },
  { key: 'ach', label: 'Thành tựu' },
  { key: 'ach_read', label: 'Đọc toàn bộ thành tựu' },
  { key: 'privacy', label: 'Ai được xem' },
];

const BIO_TOPICS = [
  { key: 'childhood_summary', label: 'Thiếu thời', voice: 'Thiếu thời.', max: null },
  { key: 'education_history', label: 'Học vấn', voice: 'Học vấn.', max: null },
  { key: 'career_history', label: 'Nghề nghiệp', voice: 'Nghề nghiệp.', max: null },
  { key: 'later_life_summary', label: 'Về già / giai đoạn sau', voice: 'Về già và giai đoạn sau.', max: null },
  { key: 'personality_traits', label: 'Tính cách', voice: 'Tính cách.', max: 500 },
  { key: 'notable_quotes', label: 'Danh ngôn', voice: 'Danh ngôn.', max: null },
];

const PRIVACY_ITEMS = [
  { key: 'CONTACT', label: 'Liên lạc' },
  { key: 'BIRTH_DATE', label: 'Ngày sinh' },
  { key: 'ACHIEVEMENT', label: 'Thành tựu' },
];

const inputCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function ReadRow({ label, value }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1.5">
      <dt className="text-sm italic text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function formatDob(form) {
  const d = [form.birth_day, form.birth_month, form.birth_year].filter((x) => x !== '' && x != null);
  if (!d.length) return 'Chưa có';
  const s = [form.birth_day, form.birth_month, form.birth_year].filter((x) => x !== '' && x != null).join('/');
  return form.is_birth_lunar ? `${s} (âm lịch)` : s;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MemberProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'public',
    backTo: '/',
    showBack: true,
  });

  const [form, setForm] = useState(EMPTY);
  const [meta, setMeta] = useState({ gender: '', hint: null, is_alive: true, generation: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('identity');
  const [privacyGroup, setPrivacyGroup] = useState('CONTACT');
  const [bioTopic, setBioTopic] = useState('childhood_summary');
  const [bioOpen, setBioOpen] = useState({});
  const [achievements, setAchievements] = useState([]);
  const [achDraft, setAchDraft] = useState({ ...EMPTY_ACHIEVEMENT });
  const [achOpen, setAchOpen] = useState({});
  const [savingAch, setSavingAch] = useState(false);
  /* P0 avatar — không lẫn state form hồ sơ */
  const fileRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const alive = meta.is_alive !== false;
  const currentTitle = alive ? 'Nơi ở hiện tại' : 'Nơi ở cuối';
  const sectionMeta = useMemo(() => SECTIONS.find((s) => s.key === section) || SECTIONS[0], [section]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/me/profile');
        const d = res.data?.data || {};
        const m = d.member || {};
        const b = d.biography || {};
        const social = m.social_profiles || {};
        const priv = {};
        (d.privacy || []).forEach((r) => {
          priv[`privacy_${r.field_group}`] = r.visibility;
        });
        if (cancelled) return;
        setForm({
          ...EMPTY,
          full_name: m.full_name || '',
          alias: m.alias || '',
          note: m.note || '',
          birth_year: m.birth_year ?? '',
          birth_month: m.birth_month ?? '',
          birth_day: m.birth_day ?? '',
          is_birth_lunar: !!m.is_birth_lunar,
          birth_note: m.birth_note || '',
          phone_number: m.phone_number || '',
          email: m.email || '',
          zalo: social.zalo || '',
          facebook: social.facebook || '',
          website: social.website || '',
          childhood_summary: b.childhood_summary || '',
          education_history: b.education_history || '',
          career_history: b.career_history || '',
          later_life_summary: b.later_life_summary || '',
          personality_traits: b.personality_traits || '',
          notable_quotes: b.notable_quotes || '',
          origin: addressFromApi(d.origin_address),
          current: addressFromApi(d.current_address),
          privacy_CONTACT: priv.privacy_CONTACT || 'TENANT',
          privacy_ACHIEVEMENT: priv.privacy_ACHIEVEMENT || 'TENANT',
          privacy_BIRTH_DATE: priv.privacy_BIRTH_DATE || 'TENANT',
        });
        setMeta({
          gender: m.gender || '',
          hint: d.login_contact_hint,
          is_alive: m.is_alive !== false,
          generation: m.generation ?? null,
        });
        /* P0: GET /me/profile.data.avatar.url (presign R2) */
        setAvatarUrl(d.avatar?.url || null);
        try {
          const ach = await apiClient.get('/me/achievements');
          if (!cancelled) setAchievements(ach.data?.data?.items || []);
        } catch {
          if (!cancelled) setAchievements([]);
        }
      } catch (e) {
        toast.error(e.response?.data?.message || 'Không tải được hồ sơ.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(ev) {
    ev.preventDefault();
    setSaving(true);
    try {
      await apiClient.patch('/me/profile', {
        full_name: form.full_name,
        alias: form.alias || null,
        note: form.note || null,
        birth_year: form.birth_year === '' ? null : form.birth_year,
        birth_month: form.birth_month === '' ? null : form.birth_month,
        birth_day: form.birth_day === '' ? null : form.birth_day,
        is_birth_lunar: !!form.is_birth_lunar,
        birth_note: form.birth_note || null,
        phone_number: form.phone_number || null,
        email: form.email || null,
        social_profiles: {
          zalo: form.zalo || null,
          facebook: form.facebook || null,
          website: form.website || null,
        },
        biography: {
          childhood_summary: form.childhood_summary || null,
          education_history: form.education_history || null,
          career_history: form.career_history || null,
          later_life_summary: form.later_life_summary || null,
          personality_traits: form.personality_traits || null,
          notable_quotes: form.notable_quotes || null,
        },
        privacy: [
          { field_group: 'CONTACT', visibility: form.privacy_CONTACT },
          { field_group: 'ACHIEVEMENT', visibility: form.privacy_ACHIEVEMENT },
          { field_group: 'BIRTH_DATE', visibility: form.privacy_BIRTH_DATE },
        ],
      });
      toast.success('Đã lưu hồ sơ dòng họ.');
      if (section === 'bio') setSection('bio_read');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không lưu được hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  function goAddress(usage, mode) {
    navigate(`/me/profile/address?usage=${usage}&mode=${mode}`);
  }

  /* P0 avatar: field name "file" khớp upload.single('file') */
  async function onPickAvatar(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      toast.error('Chỉ nhận JPEG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ảnh không quá 2MB.');
      return;
    }
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post('/me/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAvatarUrl(res.data?.data?.avatar?.url || URL.createObjectURL(file));
      toast.success('Đã cập nhật ảnh đại diện.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không tải được ảnh.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onRemoveAvatar(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!window.confirm('Xóa ảnh đại diện?')) return;
    setAvatarBusy(true);
    try {
      await apiClient.delete('/me/avatar');
      setAvatarUrl(null);
      toast.success('Đã xóa ảnh đại diện.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không xóa được ảnh.');
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Hồ sơ dòng họ" />

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              <div className="relative shrink-0">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onPickAvatar}
                />
                <button
                  type="button"
                  disabled={avatarBusy}
                  className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-lg font-black text-indigo-700 disabled:opacity-60"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  aria-label="Ảnh đại diện"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(form.full_name)
                  )}
                  {avatarBusy ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                    </span>
                  ) : null}
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 disabled:opacity-60"
                    onClick={onRemoveAvatar}
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black text-slate-800">{form.full_name || 'Chưa có tên'}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Giới tính: <span className="font-semibold">{meta.gender || '—'}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Ngày sinh: <span className="font-semibold">{formatDob(form)}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Đời thứ: <span className="font-semibold">{meta.generation != null ? meta.generation : 'Chưa có'}</span>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <AudioHelpButton text={PROFILE_PAGE_HELP} label="Nghe hướng dẫn trang" />
            </div>
            {meta.hint ? (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{meta.hint}</p>
            ) : null}
          </section>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Mục hồ sơ</span>
            <select className={inputCls} value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 text-base font-black text-slate-800">{sectionMeta.label}</h2>
              <ZoneVoiceButton visible text={PROFILE_ZONE[section] || sectionMeta.label} label="Nghe" />
            </div>

            {section === 'identity' ? (
              <div className="space-y-3">
                <Field label="Họ và tên trên gia phả">
                  <input className={inputCls} value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} required />
                </Field>
                <Field label="Tên gọi khác" hint="Tên ở nhà, biệt danh.">
                  <input className={inputCls} value={form.alias} onChange={(e) => setField('alias', e.target.value)} />
                </Field>
                <Field label="Ghi chú ngắn">
                  <textarea className={inputCls} rows={2} value={form.note} onChange={(e) => setField('note', e.target.value)} />
                </Field>
              </div>
            ) : null}

            {section === 'birth' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Ngày">
                    <input className={inputCls} inputMode="numeric" value={form.birth_day} onChange={(e) => setField('birth_day', e.target.value)} />
                  </Field>
                  <Field label="Tháng">
                    <input className={inputCls} inputMode="numeric" value={form.birth_month} onChange={(e) => setField('birth_month', e.target.value)} />
                  </Field>
                  <Field label="Năm">
                    <input className={inputCls} inputMode="numeric" value={form.birth_year} onChange={(e) => setField('birth_year', e.target.value)} />
                  </Field>
                </div>
                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-base font-semibold text-slate-700">
                  <input type="checkbox" className="h-5 w-5" checked={form.is_birth_lunar} onChange={(e) => setField('is_birth_lunar', e.target.checked)} />
                  Ngày âm lịch
                </label>
              </div>
            ) : null}

            {section === 'contact' ? (
              <div className="space-y-3">
                <Field label="Số điện thoại gia phả" hint="Không phải số đăng nhập.">
                  <input className={inputCls} value={form.phone_number} onChange={(e) => setField('phone_number', e.target.value)} />
                </Field>
                <Field label="Email hồ sơ">
                  <input className={inputCls} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                </Field>
                <Field label="Zalo">
                  <input className={inputCls} value={form.zalo} onChange={(e) => setField('zalo', e.target.value)} />
                </Field>
                <Field label="Facebook">
                  <input className={inputCls} value={form.facebook} onChange={(e) => setField('facebook', e.target.value)} />
                </Field>
                <Field label="Website">
                  <input className={inputCls} value={form.website} onChange={(e) => setField('website', e.target.value)} />
                </Field>
              </div>
            ) : null}

            {section === 'address' ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm font-black text-slate-800">Quê quán</p>
                  <dl>
                    <ReadRow label="Địa chỉ" value={hasPlace(form.origin) ? formatAddressSummary(form.origin) : 'Chưa có'} />
                    <ReadRow label="Ghi chú" value={form.origin.notes || '—'} />
                  </dl>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!hasPlace(form.origin)}
                      onClick={() => goAddress('origin', 'edit')}
                      className="rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      Sửa
                    </button>
                    {!hasPlace(form.origin) ? (
                      <button type="button" onClick={() => goAddress('origin', 'create')} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">Thêm</button>
                    ) : (
                      <span />
                    )}
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-1 text-sm font-black text-slate-800">{currentTitle}</p>
                  <dl>
                    <ReadRow
                      label="Địa chỉ"
                      value={hasPlace(form.current) ? formatAddressSummary(form.current) : (alive ? 'Chưa có' : 'Chưa rõ')}
                    />
                    <ReadRow label="Ghi chú" value={form.current.notes || '—'} />
                  </dl>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!hasPlace(form.current)}
                      onClick={() => goAddress('current', 'edit')}
                      className="rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      Sửa
                    </button>
                    {alive ? (
                      <button type="button" onClick={() => goAddress('current', 'create')} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">
                        {hasPlace(form.current) ? 'Thay đổi / Tạo mới' : 'Thêm'}
                      </button>
                    ) : (
                      <button type="button" onClick={() => goAddress('current', 'create')} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">
                        {hasPlace(form.current) ? 'Thay đổi' : 'Thêm nơi ở cuối'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {section === 'bio' ? (
              <div className="space-y-3">
                <Field label="Chủ đề tiểu sử">
                  <select className={inputCls} value={bioTopic} onChange={(e) => setBioTopic(e.target.value)}>
                    {BIO_TOPICS.map((it) => (
                      <option key={it.key} value={it.key}>{it.label}</option>
                    ))}
                  </select>
                </Field>
                {BIO_TOPICS.filter((it) => it.key === bioTopic).map((it) => {
                  const text = form[it.key] || '';
                  const voice = text.trim() ? `${it.voice} ${text}` : `${it.voice} Chưa có nội dung.`;
                  return (
                    <div key={it.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-800">{text.trim() ? 'Sửa nội dung' : 'Nhập nội dung'}</p>
                        <ZoneVoiceButton visible text={voice} label="Nghe chủ đề" />
                      </div>
                      <textarea
                        className={inputCls}
                        rows={8}
                        maxLength={it.max || undefined}
                        value={text}
                        onChange={(e) => setField(it.key, e.target.value)}
                      />
                      {it.max ? <p className="text-xs text-slate-500">{text.length}/{it.max}</p> : null}
                      <p className="text-xs text-slate-400">Tài liệu đính kèm: lát media.</p>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {section === 'bio_read' ? (
              <div className="space-y-2">
                {BIO_TOPICS.map((it) => {
                  const text = (form[it.key] || '').trim();
                  const open = !!bioOpen[it.key];
                  const voice = text ? `${it.voice} ${text}` : `${it.voice} Chưa có nội dung.`;
                  return (
                    <div key={it.key} className="rounded-2xl border border-slate-200 bg-slate-50/80">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-3 text-left"
                        onClick={() => setBioOpen((prev) => ({ ...prev, [it.key]: !prev[it.key] }))}
                      >
                        <span className="flex-1 text-sm font-black text-slate-800">{it.label}</span>
                        <span className="max-w-[40%] truncate text-xs text-slate-500">{text ? text : 'Chưa có'}</span>
                        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      {open ? (
                        <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                          <div className="flex justify-end">
                            <ZoneVoiceButton visible text={voice} label="Nghe chủ đề" />
                          </div>
                          <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{text || 'Chưa có nội dung.'}</p>
                          <button
                            type="button"
                            className="w-full rounded-2xl border border-indigo-200 bg-white py-2 text-sm font-bold text-indigo-700"
                            onClick={() => {
                              setBioTopic(it.key);
                              setSection('bio');
                            }}
                          >
                            {text ? 'Sửa chủ đề này' : 'Nhập chủ đề này'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}


            {section === 'ach' ? (
              <AchievementEditor
                draft={achDraft}
                setDraft={setAchDraft}
                saving={savingAch}
                onCancel={() => setAchDraft({ ...EMPTY_ACHIEVEMENT })}
                onSave={async (payload) => {
                  if (!payload.title || !payload.achieved_year) {
                    toast.error('Cần tiêu đề và năm.');
                    return;
                  }
                  setSavingAch(true);
                  try {
                    if (achDraft.id) {
                      await apiClient.patch(`/me/achievements/${achDraft.id}`, payload);
                      toast.success('Đã lưu thành tích.');
                    } else {
                      await apiClient.post('/me/achievements', payload);
                      toast.success('Đã thêm thành tích.');
                    }
                    const ach = await apiClient.get('/me/achievements');
                    setAchievements(ach.data?.data?.items || []);
                    setAchDraft({ ...EMPTY_ACHIEVEMENT });
                    setSection('ach_read');
                  } catch (e) {
                    toast.error(e.response?.data?.message || 'Không lưu được thành tích.');
                  } finally {
                    setSavingAch(false);
                  }
                }}
              />
            ) : null}

            {section === 'ach_read' ? (
              <AchievementReader
                items={achievements}
                openMap={achOpen}
                setOpenMap={setAchOpen}
                onCreate={() => {
                  setAchDraft({ ...EMPTY_ACHIEVEMENT });
                  setSection('ach');
                }}
                onEdit={(row) => {
                  setAchDraft(achievementFromApi(row));
                  setSection('ach');
                }}
                onDelete={async (row) => {
                  if (!window.confirm('Xóa thành tích này?')) return;
                  try {
                    await apiClient.delete(`/me/achievements/${row.id}`);
                    setAchievements((prev) => prev.filter((x) => x.id !== row.id));
                    toast.success('Đã xóa thành tích.');
                  } catch (e) {
                    toast.error(e.response?.data?.message || 'Không xóa được.');
                  }
                }}
              />
            ) : null}

            {section === 'privacy' ? (
              <div className="space-y-3">
                <Field label="Mục thông tin">
                  <select className={inputCls} value={privacyGroup} onChange={(e) => setPrivacyGroup(e.target.value)}>
                    {PRIVACY_ITEMS.map((it) => (
                      <option key={it.key} value={it.key}>{it.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ai được xem?" hint="Mặc định: nội bộ dòng họ.">
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`rounded-2xl border px-3 py-3 text-sm font-bold ${form[`privacy_${privacyGroup}`] === 'TENANT' ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="radio"
                        className="mr-2"
                        checked={form[`privacy_${privacyGroup}`] === 'TENANT'}
                        onChange={() => setField(`privacy_${privacyGroup}`, 'TENANT')}
                      />
                      Nội bộ dòng họ
                    </label>
                    <label className={`rounded-2xl border px-3 py-3 text-sm font-bold ${form[`privacy_${privacyGroup}`] === 'SELF' ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="radio"
                        className="mr-2"
                        checked={form[`privacy_${privacyGroup}`] === 'SELF'}
                        onChange={() => setField(`privacy_${privacyGroup}`, 'SELF')}
                      />
                      Chỉ mình tôi
                    </label>
                  </div>
                </Field>
              </div>
            ) : null}
          </section>

          {section !== 'address' && section !== 'bio_read' && section !== 'ach' && section !== 'ach_read' ? (
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : 'Lưu mục này'}
            </button>
          ) : null}
        </form>
      )}

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
