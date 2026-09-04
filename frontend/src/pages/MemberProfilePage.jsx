/**
 * PATH       : src/pages/MemberProfilePage.jsx
 * DATETIME   : 2026-08-29T18:00:00+07:00
 * VERSION    : 1.8.0-A01-AVATAR-CROP
 * DESCRIPTION: Shell tóm tắt + một mục. Địa chỉ đọc 2 cột. Form địa chỉ trang con.
 *              Avatar: chọn file → LogoCropModal (cùng logo tenant) → POST /me/avatar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import { MediaPeek, downloadMediaSafe } from '../lib/MediaPeek.jsx';
import { toastSpeak } from '../lib/toastSpeak.js';
import { compressImageFile, isHeicLike, isRasterImage } from '../lib/compressImage.js';
import { readAchOpenId, readBioTopic, readProfileSection, writeAchOpenId, writeBioTopic, writeProfileSection } from '../lib/profileSection.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { fetchTenantLogo, isHttpUrl } from '../lib/tenantLogo.js';
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
  ProofStrip,
  voiceText,
} from '../features/member/components/AchievementSection.jsx';
import { achievementFromApi } from '../features/member/constants/achievementCatalog.js';
import LogoCropModal from '../features/admin/components/LogoCropModal.jsx';

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
  blood_group: '',
  blood_abo: '',
  blood_rh: '',
  blood_note: '',
  health_flags: [],
  health_summary: '',
  health_none: false,
  congenital_flags: [],
  congenital_summary: '',
  congenital_none: false,
  origin: { ...EMPTY_ADDRESS },
  current: { ...EMPTY_ADDRESS },
  privacy_CONTACT: 'TENANT',
  privacy_BIRTH_DATE: 'TENANT',
  privacy_ADDRESS: 'TENANT',
  privacy_BIO: 'TENANT',
  privacy_ACHIEVEMENT: 'TENANT',
  privacy_HEALTH: 'SELF',
  privacy_DOCS: 'SELF',
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
  { key: 'docs', label: 'Tài liệu khác' },
  { key: 'privacy', label: 'Ai được xem' },
];

const BIO_TOPICS = [
  { key: 'childhood_summary', label: 'Thiếu thời', voice: 'Thiếu thời.', max: null },
  { key: 'education_history', label: 'Học vấn', voice: 'Học vấn.', max: null },
  { key: 'career_history', label: 'Nghề nghiệp', voice: 'Nghề nghiệp.', max: null },
  { key: 'later_life_summary', label: 'Về già / giai đoạn sau', voice: 'Về già và giai đoạn sau.', max: null },
  { key: 'personality_traits', label: 'Tính cách', voice: 'Tính cách.', max: 500 },
  { key: 'notable_quotes', label: 'Danh ngôn', voice: 'Danh ngôn.', max: null },
  { key: 'blood_group', label: 'Nhóm máu', voice: 'Nhóm máu.', kind: 'blood' },
  { key: 'health_summary', label: 'Bệnh tật', voice: 'Bệnh tật.', kind: 'health' },
  { key: 'congenital_summary', label: 'Bệnh / dị tật bẩm sinh', voice: 'Bệnh dị tật bẩm sinh.', kind: 'congenital' },
];

const BLOOD_ABO = [
  { value: '', label: 'Chưa chọn' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'AB', label: 'AB' },
  { value: 'O', label: 'O' },
  { value: 'UNKNOWN', label: 'Chưa rõ' },
];
const BLOOD_RH = [
  { value: '', label: 'Chưa chọn' },
  { value: 'POS', label: 'Rh +' },
  { value: 'NEG', label: 'Rh -' },
  { value: 'UNKNOWN', label: 'Chưa rõ' },
];
const HEALTH_FLAG_OPTS = [
  { value: 'CARDIO', label: 'Tim mạch / huyết áp' },
  { value: 'DIABETES', label: 'Tiểu đường' },
  { value: 'CANCER', label: 'Ung thư' },
  { value: 'RESPIRATORY', label: 'Hô hấp' },
  { value: 'NEURO', label: 'Thần kinh / đột quỵ' },
  { value: 'JOINT', label: 'Xương khớp' },
  { value: 'ALLERGY', label: 'Dị ứng' },
  { value: 'OTHER', label: 'Khác / chưa rõ' },
];
const CONGENITAL_FLAG_OPTS = [
  { value: 'HEART', label: 'Tim bẩm sinh' },
  { value: 'CLEFT', label: 'Khe hở môi / vòm' },
  { value: 'HEARING_VISION', label: 'Khiếm thính / khiếm thị bẩm sinh' },
  { value: 'LIMB_SPINE', label: 'Bất thường chi / cột sống' },
  { value: 'NEURO', label: 'Thần kinh bẩm sinh' },
  { value: 'SYNDROME', label: 'Hội chứng di truyền đã biết' },
  { value: 'OTHER', label: 'Khác / chưa rõ' },
];

function splitBlood(group) {
  const g = String(group || '').trim().toUpperCase();
  if (!g) return { abo: '', rh: '' };
  if (g === 'UNKNOWN') return { abo: 'UNKNOWN', rh: 'UNKNOWN' };
  const m = g.match(/^(A|B|AB|O)_(POS|NEG)$/);
  if (!m) return { abo: '', rh: '' };
  return { abo: m[1], rh: m[2] };
}

function joinBlood(abo, rh) {
  if (abo === 'UNKNOWN' || rh === 'UNKNOWN') return 'UNKNOWN';
  if (!abo || !rh) return '';
  return `${abo}_${rh}`;
}

function bloodParts(form) {
  if (form.blood_abo || form.blood_rh) {
    return { abo: form.blood_abo || '', rh: form.blood_rh || '' };
  }
  return splitBlood(form.blood_group);
}

function bloodVoice(form) {
  const { abo, rh } = bloodParts(form);
  if (!abo && !rh) return 'Nhóm máu. Chưa có nội dung.';
  if (abo === 'UNKNOWN') return `Nhóm máu. Chưa rõ. ${form.blood_note || ''}`.trim();
  const rhLabel = rh === 'POS' ? 'dương' : rh === 'NEG' ? 'âm' : '';
  return `Nhóm máu. ${abo} ${rhLabel}. ${form.blood_note || ''}`.trim();
}

function flagVoice(form, noneKey, flagsKey, summaryKey, opts, title, noneLabel) {
  if (form[noneKey]) return `${title}. ${noneLabel}`;
  const flags = Array.isArray(form[flagsKey]) ? form[flagsKey] : [];
  const names = opts.filter((o) => flags.includes(o.value)).map((o) => o.label);
  const summary = String(form[summaryKey] || '').trim();
  if (!names.length && !summary) return `${title}. Chưa có nội dung.`;
  return `${title}. ${names.join(', ')}. ${summary}`.trim();
}

function healthVoice(form) {
  return flagVoice(form, 'health_none', 'health_flags', 'health_summary', HEALTH_FLAG_OPTS, 'Bệnh tật', 'Không mắc bệnh đáng kể.');
}

function congenitalVoice(form) {
  return flagVoice(form, 'congenital_none', 'congenital_flags', 'congenital_summary', CONGENITAL_FLAG_OPTS, 'Bệnh dị tật bẩm sinh', 'Không có bệnh hoặc dị tật bẩm sinh đã biết.');
}

const PRIVACY_ITEMS = [
  { key: 'CONTACT', label: 'Liên lạc' },
  { key: 'BIRTH_DATE', label: 'Ngày sinh' },
  { key: 'ADDRESS', label: 'Địa chỉ' },
  { key: 'BIO', label: 'Tiểu sử chữ và tư liệu chữ' },
  { key: 'ACHIEVEMENT', label: 'Thành tựu và minh chứng' },
  { key: 'HEALTH', label: 'Nhóm máu, bệnh tật, dị tật bẩm sinh' },
  { key: 'DOCS', label: 'Tài liệu khác' },
];

const PRIVACY_DEFAULT = {
  CONTACT: 'TENANT',
  BIRTH_DATE: 'TENANT',
  ADDRESS: 'TENANT',
  BIO: 'TENANT',
  ACHIEVEMENT: 'TENANT',
  HEALTH: 'SELF',
  DOCS: 'SELF',
};

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
  const [savedForm, setSavedForm] = useState(EMPTY);
  const [meta, setMeta] = useState({ gender: '', hint: null, is_alive: true, generation: null, memberId: null });
  const [headerLogo, setHeaderLogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState(() => readProfileSection('identity'));
  const [privacyGroup, setPrivacyGroup] = useState('CONTACT');
  const [bioTopic, setBioTopic] = useState(() => readBioTopic('childhood_summary'));
  const [bioFiles, setBioFiles] = useState({});
  const [bioFileBusy, setBioFileBusy] = useState(false);
  const [bioOpen, setBioOpen] = useState(() => {
    const t = readBioTopic('');
    return t ? { [t]: true } : {};
  });
  const [achievements, setAchievements] = useState([]);
  const [achDraft, setAchDraft] = useState({ ...EMPTY_ACHIEVEMENT });
  const [achOpen, setAchOpen] = useState(() => {
    const id = readAchOpenId();
    return id ? { [id]: true } : {};
  });
  const [savingAch, setSavingAch] = useState(false);
  const [proofBusyId, setProofBusyId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docsUsed, setDocsUsed] = useState(0);
  /* P0 avatar — không lẫn state form hồ sơ */
  const fileRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);

  useEffect(() => {
    writeProfileSection(section);
  }, [section]);

  useEffect(() => {
    writeBioTopic(bioTopic);
  }, [bioTopic]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const alive = meta.is_alive !== false;
  const currentTitle = alive ? 'Nơi ở hiện tại' : 'Nơi ở cuối';
  const sectionMeta = useMemo(() => SECTIONS.find((s) => s.key === section) || SECTIONS[0], [section]);
  const sectionVoice = useMemo(() => {
    if (section === 'bio_read') {
      return BIO_TOPICS.map((it) => {
        const body = it.kind === 'blood'
          ? bloodVoice(form)
          : it.kind === 'health'
            ? healthVoice(form)
            : it.kind === 'congenital'
              ? congenitalVoice(form)
              : `${it.voice} ${String(form[it.key] || '').trim() || 'Chưa có nội dung.'}`;
        const files = (bioFiles[it.key] || [])
          .map((p) => p.caption || p.file_name)
          .filter(Boolean)
          .join(', ');
        return `${body}${files ? ` Tư liệu: ${files}.` : ''}`;
      }).join(' ');
    }
    if (section === 'ach_read') {
      if (!achievements.length) return 'Chưa có thành tích.';
      return achievements.map((row) => voiceText(row)).join('. ');
    }
    if (section === 'docs') {
      if (!docs.length) return 'Chưa có tài liệu khác.';
      return docs
        .map((p) => `${p.caption || 'Tài liệu'}. ${p.file_name || ''}`.trim())
        .join('. ');
    }
    return PROFILE_ZONE[section] || sectionMeta.label;
  }, [section, sectionMeta.label, form, bioFiles, achievements, docs]);
  const dirty = useMemo(() => {
    const keys = {
      identity: ['full_name', 'alias', 'note'],
      birth: ['birth_year', 'birth_month', 'birth_day', 'is_birth_lunar', 'birth_note'],
      contact: ['phone_number', 'email', 'zalo', 'facebook', 'website'],
      bio: [
        ...BIO_TOPICS.map((t) => t.key),
        'blood_note', 'blood_abo', 'blood_rh', 'health_flags', 'health_none',
        'congenital_flags', 'congenital_none',
      ],
      privacy: PRIVACY_ITEMS.map((it) => `privacy_${it.key}`),
    }[section] || [];
    return keys.some((k) => String(form[k] ?? '') !== String(savedForm[k] ?? ''));
  }, [form, savedForm, section]);

  async function resolveAvatarSrc(memberId, hint) {
    if (isHttpUrl(hint)) return hint;
    try {
      const me = await apiClient.get('/me/avatar');
      const u = me.data?.data?.avatar?.url;
      if (isHttpUrl(u)) return u;
    } catch (_) { /* fallback media */ }
    if (!memberId) return null;
    try {
      const res = await apiClient.get(`/media/entity/MEMBER/${encodeURIComponent(memberId)}`);
      const raw = res.data?.data ?? res.data ?? [];
      const rows = Array.isArray(raw) ? raw : raw.items || [];
      const row =
        rows.find((m) => m.purpose === 'AVATAR' && m.is_primary) ||
        rows.find((m) => m.purpose === 'AVATAR') ||
        null;
      if (!row?.id) return null;
      if (isHttpUrl(row.read_url)) return row.read_url;
      const urlRes = await apiClient.get(`/media/${row.id}/url`);
      const u = urlRes.data?.data?.url || urlRes.data?.url || null;
      return isHttpUrl(u) ? u : null;
    } catch (_) {
      return null;
    }
  }

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
        const nextForm = {
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
          blood_group: b.blood_group || '',
          blood_abo: splitBlood(b.blood_group || '').abo,
          blood_rh: splitBlood(b.blood_group || '').rh,
          blood_note: b.blood_note || '',
          health_flags: Array.isArray(b.health_flags) ? b.health_flags : [],
          health_summary: b.health_summary || '',
          health_none: !!b.health_none,
          congenital_flags: Array.isArray(b.congenital_flags) ? b.congenital_flags : [],
          congenital_summary: b.congenital_summary || '',
          congenital_none: !!b.congenital_none,
          origin: addressFromApi(d.origin_address),
          current: addressFromApi(d.current_address),
          privacy_CONTACT: priv.privacy_CONTACT || PRIVACY_DEFAULT.CONTACT,
          privacy_BIRTH_DATE: priv.privacy_BIRTH_DATE || PRIVACY_DEFAULT.BIRTH_DATE,
          privacy_ADDRESS: priv.privacy_ADDRESS || PRIVACY_DEFAULT.ADDRESS,
          privacy_BIO: priv.privacy_BIO || PRIVACY_DEFAULT.BIO,
          privacy_ACHIEVEMENT: priv.privacy_ACHIEVEMENT || PRIVACY_DEFAULT.ACHIEVEMENT,
          privacy_HEALTH: priv.privacy_HEALTH || PRIVACY_DEFAULT.HEALTH,
          privacy_DOCS: priv.privacy_DOCS || PRIVACY_DEFAULT.DOCS,
        };
        setForm(nextForm);
        setSavedForm(nextForm);
        setMeta({
          gender: m.gender || '',
          hint: d.login_contact_hint,
          is_alive: m.is_alive !== false,
          generation: m.generation ?? null,
          memberId: m.id || null,
        });
        const src = await resolveAvatarSrc(m.id, d.avatar?.url);
        if (!cancelled) setAvatarUrl(src);
        try {
          const tid = sessionTenant.id;
          if (tid) {
            const { readUrl } = await fetchTenantLogo(tid);
            if (!cancelled && readUrl) setHeaderLogo(readUrl);
          }
        } catch (_) { /* logo header */ }
        try {
          const ach = await apiClient.get('/me/achievements');
          if (!cancelled) setAchievements(ach.data?.data?.items || []);
        } catch {
          if (!cancelled) setAchievements([]);
        }
        try {
          const docRes = await apiClient.get('/me/documents');
          if (!cancelled) {
            setDocs(docRes.data?.data?.items || []);
            setDocsUsed(docRes.data?.data?.used_bytes || 0);
          }
        } catch {
          if (!cancelled) setDocs([]);
        }
        try {
          const bioRes = await apiClient.get('/me/biography/files');
          if (!cancelled) setBioFiles(bioRes.data?.data?.items || {});
        } catch {
          if (!cancelled) setBioFiles({});
        }
      } catch (e) {
        toastSpeak('error', e.response?.data?.message || 'Không tải được hồ sơ.');
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
    if (!dirty) return;
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
          blood_group: joinBlood(form.blood_abo, form.blood_rh) || null,
          blood_note: form.blood_note || null,
          health_flags: form.health_none ? [] : (form.health_flags || []),
          health_summary: form.health_none ? null : (form.health_summary || null),
          health_none: !!form.health_none,
          congenital_flags: form.congenital_none ? [] : (form.congenital_flags || []),
          congenital_summary: form.congenital_none ? null : (form.congenital_summary || null),
          congenital_none: !!form.congenital_none,
        },
        privacy: PRIVACY_ITEMS.map((it) => ({
          field_group: it.key,
          visibility: form[`privacy_${it.key}`],
        })),
      });
      toastSpeak('ok', 'Đã lưu hồ sơ dòng họ.');
      setSavedForm(form);
      if (section === 'bio') setSection('bio_read');
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không lưu được hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  function goAddress(usage, mode) {
    navigate(`/me/profile/address?usage=${usage}&mode=${mode}`);
  }

  /* Chọn file → LogoCropModal (cùng component logo tenant). POST sau onConfirm. */
  async function onPickAvatar(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!isRasterImage(file) && !isHeicLike(file)) {
      toastSpeak('error', 'Chỉ nhận JPEG, PNG, WebP hoặc HEIC.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toastSpeak('error', 'Ảnh gốc không quá 8MB.');
      return;
    }
    try {
      const ready = isHeicLike(file)
        ? await compressImageFile(file, { maxEdge: 2400, quality: 0.9 })
        : file;
      setCropFile(ready);
    } catch (e) {
      toastSpeak('error', e.message || 'Không đọc được ảnh HEIC.');
    }
  }

  async function onCropConfirm(blob) {
    if (!blob) {
      setCropFile(null);
      return;
    }
    setCropFile(null);
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      /* field "file" = upload.single('file'); interceptor gỡ application/json */
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      fd.append('file', blob, `avatar.${ext}`);
      const res = await apiClient.post('/me/avatar', fd);
      const hint = res.data?.data?.avatar?.url || null;
      const src = await resolveAvatarSrc(meta.memberId, hint);
      setAvatarUrl(src || (isHttpUrl(hint) ? hint : URL.createObjectURL(blob)));
      toastSpeak('ok', 'Đã cập nhật ảnh đại diện.');
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không tải được ảnh.');
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
      toastSpeak('ok', 'Đã xóa ảnh đại diện.');
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không xóa được ảnh.');
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader
        tenant={{ ...sessionTenant, logo_url: headerLogo || sessionTenant.logo_url }}
        subtitle="Hồ sơ dòng họ"
      />

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
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
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
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarUrl(null)}
                    />
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
              <ZoneVoiceButton visible text={sectionVoice} label="Nghe" />
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
                  const voice = it.kind === 'blood'
                    ? bloodVoice(form)
                    : it.kind === 'health'
                      ? healthVoice(form)
                      : it.kind === 'congenital'
                        ? congenitalVoice(form)
                        : (String(text).trim() ? `${it.voice} ${text}` : `${it.voice} Chưa có nội dung.`);
                  const blood = bloodParts(form);
                  const structured = it.kind === 'blood' || it.kind === 'health' || it.kind === 'congenital';
                  return (
                    <div key={it.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-800">{structured || String(text).trim() ? 'Sửa nội dung' : 'Nhập nội dung'}</p>
                        <ZoneVoiceButton visible text={voice} label="Nghe chủ đề" />
                      </div>
                      {it.kind === 'blood' ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Nhóm">
                              <select
                                className={inputCls}
                                value={blood.abo}
                                onChange={(e) => {
                                  const abo = e.target.value;
                                  const rh = abo === 'UNKNOWN' ? 'UNKNOWN' : (blood.rh === 'UNKNOWN' ? '' : blood.rh);
                                  setForm((prev) => ({
                                    ...prev,
                                    blood_abo: abo,
                                    blood_rh: rh,
                                    blood_group: joinBlood(abo, rh),
                                  }));
                                }}
                              >
                                {BLOOD_ABO.map((o) => <option key={o.value || 'empty'} value={o.value}>{o.label}</option>)}
                              </select>
                            </Field>
                            <Field label="Rh">
                              <select
                                className={inputCls}
                                value={blood.rh}
                                onChange={(e) => {
                                  const rh = e.target.value;
                                  const abo = rh === 'UNKNOWN' ? 'UNKNOWN' : (blood.abo === 'UNKNOWN' ? '' : blood.abo);
                                  setForm((prev) => ({
                                    ...prev,
                                    blood_abo: abo,
                                    blood_rh: rh,
                                    blood_group: joinBlood(abo, rh),
                                  }));
                                }}
                              >
                                {BLOOD_RH.map((o) => <option key={o.value || 'empty'} value={o.value}>{o.label}</option>)}
                              </select>
                            </Field>
                          </div>
                          <Field label="Mô tả ngắn" hint="Nơi xét, năm, lưu ý truyền máu.">
                            <textarea className={inputCls} rows={3} maxLength={255} value={form.blood_note} onChange={(e) => setField('blood_note', e.target.value)} />
                            <p className="text-xs text-slate-500">{(form.blood_note || '').length}/255</p>
                          </Field>
                        </div>
                      ) : it.kind === 'health' || it.kind === 'congenital' ? (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={!!form[it.kind === 'health' ? 'health_none' : 'congenital_none']}
                              onChange={(e) => {
                                const on = e.target.checked;
                                if (it.kind === 'health') {
                                  setForm((prev) => ({ ...prev, health_none: on, health_flags: on ? [] : prev.health_flags, health_summary: on ? '' : prev.health_summary }));
                                } else {
                                  setForm((prev) => ({ ...prev, congenital_none: on, congenital_flags: on ? [] : prev.congenital_flags, congenital_summary: on ? '' : prev.congenital_summary }));
                                }
                              }}
                            />
                            {it.kind === 'health' ? 'Không mắc bệnh đáng kể' : 'Không có bệnh hoặc dị tật bẩm sinh đã biết'}
                          </label>
                          {(it.kind === 'health' ? HEALTH_FLAG_OPTS : CONGENITAL_FLAG_OPTS).map((o) => {
                            const flagsKey = it.kind === 'health' ? 'health_flags' : 'congenital_flags';
                            const none = it.kind === 'health' ? form.health_none : form.congenital_none;
                            const cur = form[flagsKey] || [];
                            return (
                              <label key={o.value} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  disabled={!!none}
                                  checked={cur.includes(o.value)}
                                  onChange={(e) => {
                                    const next = e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value);
                                    setField(flagsKey, next);
                                  }}
                                />
                                {o.label}
                              </label>
                            );
                          })}
                          <Field label="Mô tả">
                            <textarea
                              className={inputCls}
                              rows={5}
                              disabled={!!(it.kind === 'health' ? form.health_none : form.congenital_none)}
                              value={it.kind === 'health' ? form.health_summary : form.congenital_summary}
                              onChange={(e) => setField(it.kind === 'health' ? 'health_summary' : 'congenital_summary', e.target.value)}
                            />
                          </Field>
                        </div>
                      ) : (
                        <>
                          <textarea className={inputCls} rows={8} maxLength={it.max || undefined} value={text} onChange={(e) => setField(it.key, e.target.value)} />
                          {it.max ? <p className="text-xs text-slate-500">{text.length}/{it.max}</p> : null}
                        </>
                      )}
                      <ProofStrip
                        title="Tư liệu"
                        addLabel="Thêm tư liệu"
                        proofs={bioFiles[it.key] || []}
                        busy={bioFileBusy}
                        onAdd={() => {
                          writeProfileSection('bio');
                          writeBioTopic(it.key);
                          navigate(`/me/profile/biography/${it.key}/file`);
                        }}
                        onRemove={async (p) => {
                          if (!window.confirm('Xóa tư liệu này khỏi chủ đề?')) return;
                          setBioFileBusy(true);
                          try {
                            const res = await apiClient.delete(`/me/biography/${it.key}/files/${p.id}`);
                            setBioFiles(res.data?.data?.items || {});
                            toastSpeak('ok', 'Đã xóa tư liệu.');
                          } catch (e) {
                            toastSpeak('error', e.response?.data?.message || 'Không xóa được tư liệu.');
                          } finally {
                            setBioFileBusy(false);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {section === 'bio_read' ? (
              <div className="space-y-2">
                {BIO_TOPICS.map((it) => {
                  const text = it.kind === 'blood'
                    ? [form.blood_group === 'UNKNOWN' ? 'Chưa rõ' : form.blood_group.replace('_POS', '+').replace('_NEG', '-'), form.blood_note].filter(Boolean).join(' — ')
                    : it.kind === 'health'
                      ? (form.health_none ? 'Không mắc bệnh đáng kể' : [HEALTH_FLAG_OPTS.filter((o) => (form.health_flags || []).includes(o.value)).map((o) => o.label).join(', '), form.health_summary].filter(Boolean).join('. '))
                      : it.kind === 'congenital'
                        ? (form.congenital_none ? 'Không có bệnh hoặc dị tật bẩm sinh đã biết' : [CONGENITAL_FLAG_OPTS.filter((o) => (form.congenital_flags || []).includes(o.value)).map((o) => o.label).join(', '), form.congenital_summary].filter(Boolean).join('. '))
                        : (form[it.key] || '').trim();
                  const open = !!bioOpen[it.key];
                  const voice = it.kind === 'blood'
                    ? bloodVoice(form)
                    : it.kind === 'health'
                      ? healthVoice(form)
                      : it.kind === 'congenital'
                        ? congenitalVoice(form)
                        : (text ? `${it.voice} ${text}` : `${it.voice} Chưa có nội dung.`);
                  return (
                    <div key={it.key} className="rounded-2xl border border-slate-200 bg-slate-50/80">
                      <div className="flex items-center gap-2 px-3 py-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => setBioOpen((prev) => ({ ...prev, [it.key]: !prev[it.key] }))}
                        >
                          <span className="flex-1 truncate text-sm font-black text-slate-800">{it.label}</span>
                          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                        </button>
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <ZoneVoiceButton visible text={voice} label="Nghe" />
                        </div>
                      </div>
                      {open ? (
                        <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                          <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{text || 'Chưa có nội dung.'}</p>
                          <ProofStrip
                            title="Tư liệu"
                            addLabel="Thêm tư liệu"
                            proofs={bioFiles[it.key] || []}
                            busy={bioFileBusy}
                            onAdd={() => {
                              writeProfileSection('bio_read');
                              writeBioTopic(it.key);
                              navigate(`/me/profile/biography/${it.key}/file`);
                            }}
                            onRemove={async (p) => {
                              if (!window.confirm('Xóa tư liệu này khỏi chủ đề?')) return;
                              setBioFileBusy(true);
                              try {
                                const res = await apiClient.delete(`/me/biography/${it.key}/files/${p.id}`);
                                setBioFiles(res.data?.data?.items || {});
                                toastSpeak('ok', 'Đã xóa tư liệu.');
                              } catch (e) {
                                toastSpeak('error', e.response?.data?.message || 'Không xóa được tư liệu.');
                              } finally {
                                setBioFileBusy(false);
                              }
                            }}
                          />
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
                proofBusy={proofBusyId === achDraft.id}
                onAddProof={() => {
                  if (!achDraft.id) {
                    toastSpeak('error', 'Lưu thành tựu trước khi thêm minh chứng.');
                    return;
                  }
                  writeProfileSection('ach');
                  writeAchOpenId(achDraft.id);
                  navigate(`/me/profile/achievement/${achDraft.id}/proof`);
                }}
                onRemoveProof={async (proof) => {
                  if (!achDraft.id) return;
                  if (!window.confirm('Xóa minh chứng này?')) return;
                  setProofBusyId(achDraft.id);
                  try {
                    const res = await apiClient.delete(`/me/achievements/${achDraft.id}/proofs/${proof.id}`);
                    const proofs = res.data?.data?.proofs || [];
                    setAchDraft((prev) => ({ ...prev, proofs }));
                    setAchievements((prev) => prev.map((x) => (x.id === achDraft.id ? { ...x, proofs } : x)));
                    toastSpeak('ok', 'Đã xóa minh chứng.');
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không xóa được minh chứng.');
                  } finally {
                    setProofBusyId(null);
                  }
                }}
                onCancel={() => setAchDraft({ ...EMPTY_ACHIEVEMENT })}
                onSave={async (payload) => {
                  if (!payload.title || !payload.achieved_year) {
                    toastSpeak('error', 'Cần tiêu đề và năm.');
                    return;
                  }
                  setSavingAch(true);
                  try {
                    if (achDraft.id) {
                      await apiClient.patch(`/me/achievements/${achDraft.id}`, payload);
                      toastSpeak('ok', 'Đã lưu thành tích.');
                    } else {
                      await apiClient.post('/me/achievements', payload);
                      toastSpeak('ok', 'Đã thêm thành tích.');
                    }
                    const ach = await apiClient.get('/me/achievements');
                    const items = ach.data?.data?.items || [];
                    setAchievements(items);
                    const keepId = achDraft.id;
                    const next = keepId
                      ? items.find((x) => x.id === keepId)
                      : items[0];
                    if (next) setAchDraft({ ...achievementFromApi(next), proofs: next.proofs || [] });
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không lưu được thành tích.');
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
                  setAchDraft({ ...achievementFromApi(row), proofs: row.proofs || [] });
                  setSection('ach');
                }}
                onDelete={async (row) => {
                  if (!window.confirm('Xóa thành tích này?')) return;
                  try {
                    await apiClient.delete(`/me/achievements/${row.id}`);
                    setAchievements((prev) => prev.filter((x) => x.id !== row.id));
                    toastSpeak('ok', 'Đã xóa thành tích.');
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không xóa được.');
                  }
                }}
                proofBusyId={proofBusyId}
                onAddProof={(row) => {
                  writeProfileSection('ach_read');
                  writeAchOpenId(row.id);
                  navigate(`/me/profile/achievement/${row.id}/proof`);
                }}
                onRemoveProof={async (row, proof) => {
                  if (!window.confirm('Xóa minh chứng này?')) return;
                  setProofBusyId(row.id);
                  try {
                    const res = await apiClient.delete(`/me/achievements/${row.id}/proofs/${proof.id}`);
                    const proofs = res.data?.data?.proofs || [];
                    setAchievements((prev) => prev.map((x) => (x.id === row.id ? { ...x, proofs } : x)));
                    toastSpeak('ok', 'Đã xóa minh chứng.');
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không xóa được minh chứng.');
                  } finally {
                    setProofBusyId(null);
                  }
                }}
              />
            ) : null}

            {section === 'docs' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Đã dùng {(docsUsed / (1024 * 1024)).toFixed(1)} / 30 MB
                </p>
                {docs.length ? (
                  <ul className="space-y-2">
                    {docs.map((p) => (
                      <li key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-sm font-black text-slate-800">{p.caption || 'Không mô tả'}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          {String(p.mime_type || '').startsWith('video/')
                            ? 'Video'
                            : String(p.mime_type || '').startsWith('audio/')
                              ? 'Audio'
                              : String(p.mime_type || '').startsWith('image/')
                                ? 'Ảnh'
                                : String(p.mime_type || '') === 'application/pdf'
                                  ? 'PDF'
                                  : 'Tệp'}
                        </p>
                        <MediaPeek item={p} />
                        <div className="mt-1 flex items-center gap-4">
                          <button
                            type="button"
                            className="text-xs font-bold text-indigo-700"
                            onClick={async () => {
                              try {
                                await downloadMediaSafe(p);
                              } catch (e) {
                                toastSpeak('error', e.response?.data?.message || 'Không tải được tệp.');
                              }
                            }}
                          >
                            Tải về
                          </button>
                          <button
                            type="button"
                            className="text-xs font-bold text-rose-600"
                            onClick={async () => {
                              if (!window.confirm('Xóa tài liệu này khỏi hồ sơ và kho lưu trữ?')) return;
                              try {
                                const res = await apiClient.delete(`/me/documents/${p.id}`);
                                setDocs(res.data?.data?.items || []);
                                setDocsUsed(res.data?.data?.used_bytes || 0);
                                toastSpeak('ok', 'Đã xóa tài liệu.');
                              } catch (e) {
                                toastSpeak('error', e.response?.data?.message || 'Không xóa được.');
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Chưa có tài liệu khác.</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    writeProfileSection('docs');
                    navigate('/me/profile/document');
                  }}
                  className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white"
                >
                  Thêm tài liệu
                </button>
              </div>
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

          {section !== 'address' && section !== 'bio_read' && section !== 'ach' && section !== 'ach_read' && section !== 'docs' ? (
            <button
              type="submit"
              disabled={saving || !dirty}
              className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : dirty ? 'Lưu mục này' : 'Chưa có thay đổi'}
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

      {cropFile ? (
        <LogoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={onCropConfirm}
        />
      ) : null}
    </div>
  );
}
