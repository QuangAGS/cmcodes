/**
 * PATH       : src/pages/MemberProfilePage.jsx
 * DATETIME   : 2026-09-07T11:25:00+07:00
 * VERSION    : 1.9.22-GEO-CARD
 * DESCRIPTION: 2.3 — đổi mục: T2 luôn; T1 nếu không dirty. Không reload avatar khi đổi mục.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  mapHref,
} from '../features/member/constants/addressCatalog.js';
import { genderLabel, residenceKindLabel } from '../features/member/constants/enumLabels.js';
import {
  AchievementEditor,
  AchievementReader,
  EMPTY_ACHIEVEMENT,
  ProofStrip,
  voiceText,
} from '../features/member/components/AchievementSection.jsx';
import { achievementFromApi } from '../features/member/constants/achievementCatalog.js';
import { SOCIAL_KINDS, SOCIAL_VALUE_TYPES, emptySocialItem, parseSocialProfiles, socialToPayload, kindLabel, socialHref } from '../features/member/constants/socialCatalog.js';
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
  death_year: '',
  death_month: '',
  death_day: '',
  is_death_lunar: true,
  death_note: '',
  phone_number: '',
  email: '',
  socialItems: [],
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
  resting: { ...EMPTY_ADDRESS },
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
  { key: 'death', label: 'Ngày mất / ngày giỗ' },
  { key: 'contact', label: 'Liên lạc' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'bio', label: 'Tiểu sử' },
  { key: 'bio_read', label: 'Đọc toàn bộ tiểu sử' },
  { key: 'ach', label: 'Thành tựu' },
  { key: 'ach_read', label: 'Đọc toàn bộ thành tựu' },
  { key: 'docs', label: 'Tài liệu khác' },
  { key: 'privacy', label: 'Ai được xem' },
];

const SECTION_KEYS = new Set(SECTIONS.map((s) => s.key));

function parseSectionParam(raw) {
  const v = String(raw || '').trim();
  return SECTION_KEYS.has(v) ? v : '';
}

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

function formatGio(form) {
  const parts = [form.death_day, form.death_month, form.death_year].filter((x) => x !== '' && x != null);
  if (!parts.length) return 'Chưa có ngày giỗ';
  const text = [form.death_day, form.death_month, form.death_year].filter((x) => x !== '' && x != null).join('/');
  const cal = form.is_death_lunar !== false ? 'âm lịch' : 'dương lịch';
  return `Giỗ ${text} (${cal})`;
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
  const { id: routeMemberId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const memberQs = routeMemberId ? { member_id: routeMemberId } : {};
  const profilePath = routeMemberId ? `/members/${routeMemberId}/profile` : '/me/profile';
  const api = {
    get: (url, cfg = {}) => apiClient.get(url, { ...cfg, params: { ...memberQs, ...(cfg.params || {}) } }),
    post: (url, body, cfg = {}) => {
      const next = { ...cfg, params: { ...memberQs, ...(cfg.params || {}) } };
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        if (routeMemberId && !body.has('member_id')) body.append('member_id', routeMemberId);
        return apiClient.post(url, body, next);
      }
      return apiClient.post(url, { ...(body || {}), ...memberQs }, next);
    },
    patch: (url, body, cfg = {}) => apiClient.patch(url, { ...(body || {}), ...memberQs }, cfg),
    delete: (url, cfg = {}) =>
      apiClient.delete(url, {
        ...cfg,
        params: { ...memberQs, ...(cfg.params || {}) },
        data: { ...(cfg.data || {}), ...memberQs },
      }),
  };
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'public',
    backTo: '/',
    showBack: true,
  });

  const [form, setForm] = useState(EMPTY);
  const [savedForm, setSavedForm] = useState(EMPTY);
  const [meta, setMeta] = useState({ gender: '', hint: null, is_alive: true, generation: null, memberId: null, canEdit: true });
  const [headerLogo, setHeaderLogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState(() => {
    const fromUrl = parseSectionParam(
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('section')
        : '',
    );
    if (fromUrl) return fromUrl;
    return readProfileSection('');
  });
  const [privacyGroup, setPrivacyGroup] = useState('CONTACT');
  const [bioTopic, setBioTopic] = useState(() => readBioTopic(''));
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
  const [socialUi, setSocialUi] = useState({ mode: 'list', idx: null });
  const [addrCard, setAddrCard] = useState('');
  const [residences, setResidences] = useState([]);
  const [docs, setDocs] = useState([]);
  const [docsUsed, setDocsUsed] = useState(0);
  /* P0 avatar — không lẫn state form hồ sơ */
  const fileRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const dirtyRef = useRef(false);
  const t0DoneRef = useRef(false);
  const t1LoadedRef = useRef('');

  useEffect(() => {
    writeProfileSection(section);
    const urlSection = parseSectionParam(searchParams.get('section'));
    if (urlSection === (section || '')) return;
    const next = new URLSearchParams(searchParams);
    if (section) next.set('section', section);
    else next.delete('section');
    setSearchParams(next, { replace: true });
  }, [section, searchParams, setSearchParams]);

  useEffect(() => {
    writeBioTopic(bioTopic);
  }, [bioTopic]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const alive = meta.is_alive !== false;
  const canEdit = meta.canEdit !== false;
  const canEditDeath = canEdit && !alive;
  useEffect(() => {
    if (!canEdit && section === 'bio') setSection('bio_read');
    if (!canEdit && section === 'ach') setSection('ach_read');
    if (!canEdit && section === 'privacy') setSection('identity');
  }, [canEdit, section]);
  const currentTitle = alive ? 'Nơi ở hiện tại' : 'Nơi ở cuối';
  const sectionMeta = useMemo(
    () => SECTIONS.find((s) => s.key === section) || { key: '', label: 'Chọn mục hồ sơ' },
    [section],
  );
  const sectionVoice = useMemo(() => {
    if (!section) return PROFILE_PAGE_HELP;
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
      death: ['death_year', 'death_month', 'death_day', 'is_death_lunar', 'death_note'],
      contact: ['phone_number', 'email', 'socialItems'],
      bio: [
        ...BIO_TOPICS.map((t) => t.key),
        'blood_note', 'blood_abo', 'blood_rh', 'health_flags', 'health_none',
        'congenital_flags', 'congenital_none',
      ],
      privacy: PRIVACY_ITEMS.map((it) => `privacy_${it.key}`),
    }[section] || [];
    return keys.some((k) => JSON.stringify(form[k] ?? '') !== JSON.stringify(savedForm[k] ?? ''));
  }, [form, savedForm, section]);
  dirtyRef.current = dirty;

  async function resolveAvatarSrc(memberId, hint) {
    if (isHttpUrl(hint)) return hint;
    try {
      if (routeMemberId) throw new Error('skip-self-avatar');
      const me = await api.get('/me/avatar');
      const u = me.data?.data?.avatar?.url;
      if (isHttpUrl(u)) return u;
    } catch (_) { /* fallback media */ }
    if (!memberId) return null;
    try {
      const res = await api.get(`/media/entity/MEMBER/${encodeURIComponent(memberId)}`);
      const raw = res.data?.data ?? res.data ?? [];
      const rows = Array.isArray(raw) ? raw : raw.items || [];
      const row =
        rows.find((m) => m.purpose === 'AVATAR' && m.is_primary) ||
        rows.find((m) => m.purpose === 'AVATAR') ||
        null;
      if (!row?.id) return null;
      if (isHttpUrl(row.read_url)) return row.read_url;
      const urlRes = await api.get(`/media/${row.id}/url`);
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
        const bootSec = parseSectionParam(
          typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('section') : '',
        );
        const t1 = bootSec === 'bio' || bootSec === 'bio_read' || bootSec === 'address' || bootSec === 'privacy';
        const res = await api.get(profilePath, t1 ? { params: { section: bootSec } } : {});
        if (t1) t1LoadedRef.current = bootSec;
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
          death_year: m.death_year ?? '',
          death_month: m.death_month ?? '',
          death_day: m.death_day ?? '',
          is_death_lunar: m.is_death_lunar !== false,
          death_note: m.death_note || '',
          phone_number: m.phone_number || '',
          email: m.email || '',
          socialItems: parseSocialProfiles(social),
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
          resting: addressFromApi(d.resting_address),
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
          hint: routeMemberId ? null : d.login_contact_hint,
          is_alive: !(m.is_alive === false || m.is_death === true),
          generation: m.generation ?? null,
          memberId: m.id || null,
          canEdit: d.can_edit === true
            || user?.role === 'CLAN_ADMIN'
            || user?.role === 'SYSTEM_ADMIN'
            || (!routeMemberId && d.can_edit !== false),
        });
        const src = await resolveAvatarSrc(m.id, d.avatar?.url);
        if (!cancelled) setAvatarUrl(src);
        t0DoneRef.current = true;
        try {
          const tid = sessionTenant.id;
          if (tid) {
            const { readUrl } = await fetchTenantLogo(tid);
            if (!cancelled && readUrl) setHeaderLogo(readUrl);
          }
        } catch (_) { /* logo header */ }
      } catch (e) {
        toastSpeak('error', e.response?.data?.message || 'Không tải được hồ sơ.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeMemberId]);

  useEffect(() => {
    if (!section) return undefined;
    let cancelled = false;
    (async () => {
      if (section === 'ach' || section === 'ach_read') {
        try {
          const ach = await api.get('/me/achievements');
          if (!cancelled) setAchievements(ach.data?.data?.items || []);
        } catch {
          if (!cancelled) setAchievements([]);
        }
      }
      if (section === 'address') {
        try {
          const rr = await api.get('/me/residences');
          if (!cancelled) setResidences(rr.data?.data?.items || rr.data?.data || []);
        } catch {
          if (!cancelled) setResidences([]);
        }
      }
      if (section === 'docs') {
        try {
          const docRes = await api.get('/me/documents');
          if (!cancelled) {
            setDocs(docRes.data?.data?.items || []);
            setDocsUsed(docRes.data?.data?.used_bytes || 0);
          }
        } catch {
          if (!cancelled) setDocs([]);
        }
      }
      if (section === 'bio' || section === 'bio_read' || section === 'address' || section === 'privacy') {
        try {
          if (t1LoadedRef.current === section) {
            t1LoadedRef.current = '';
          } else {
          const extra = await api.get(profilePath, { params: { section } });
          t1LoadedRef.current = section;
          const d = extra.data?.data || {};
          if (!cancelled && !dirtyRef.current) {
            setForm((prev) => {
              const next = { ...prev };
              if (d.biography) {
                const b = d.biography;
                next.childhood_summary = b.childhood_summary || '';
                next.education_history = b.education_history || '';
                next.career_history = b.career_history || '';
                next.later_life_summary = b.later_life_summary || '';
                next.personality_traits = b.personality_traits || '';
                next.notable_quotes = b.notable_quotes || '';
                next.blood_group = b.blood_group || '';
                next.blood_abo = splitBlood(b.blood_group || '').abo;
                next.blood_rh = splitBlood(b.blood_group || '').rh;
                next.blood_note = b.blood_note || '';
                next.health_flags = Array.isArray(b.health_flags) ? b.health_flags : [];
                next.health_summary = b.health_summary || '';
                next.health_none = !!b.health_none;
                next.congenital_flags = Array.isArray(b.congenital_flags) ? b.congenital_flags : [];
                next.congenital_summary = b.congenital_summary || '';
                next.congenital_none = !!b.congenital_none;
              }
              if (d.origin_address) next.origin = addressFromApi(d.origin_address);
              if (d.current_address) next.current = addressFromApi(d.current_address);
              if (d.resting_address) next.resting = addressFromApi(d.resting_address);
              (d.privacy || []).forEach((r) => {
                next[`privacy_${r.field_group}`] = r.visibility;
              });
              return next;
            });
            setSavedForm((prev) => ({ ...prev, ...((section === 'bio' || section === 'bio_read') ? {} : {}) }));
          }
          }
        } catch (_) { /* T1 mục */ }
      }
      if (section === 'bio' || section === 'bio_read') {
        try {
          const bioRes = await api.get('/me/biography/files');
          if (!cancelled) setBioFiles(bioRes.data?.data?.items || {});
        } catch {
          if (!cancelled) setBioFiles({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section, routeMemberId]);

  useEffect(() => {
    if (section !== 'contact') return;
    if ((form.socialItems || []).length === 0) {
      setField('socialItems', [emptySocialItem()]);
      setSocialUi({ mode: 'form', idx: 0 });
    } else if (socialUi.mode === 'list' || socialUi.idx == null) {
      setSocialUi({ mode: 'list', idx: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  function patchBodyForSection(sec, f, isAlive) {
    if (sec === 'identity') {
      return { full_name: f.full_name, alias: f.alias || null, note: f.note || null };
    }
    if (sec === 'birth') {
      return {
        birth_year: f.birth_year === '' ? null : f.birth_year,
        birth_month: f.birth_month === '' ? null : f.birth_month,
        birth_day: f.birth_day === '' ? null : f.birth_day,
        is_birth_lunar: !!f.is_birth_lunar,
        birth_note: f.birth_note || null,
      };
    }
    if (sec === 'death') {
      if (isAlive) return {};
      return {
        death_year: f.death_year === '' ? null : f.death_year,
        death_month: f.death_month === '' ? null : f.death_month,
        death_day: f.death_day === '' ? null : f.death_day,
        is_death_lunar: f.is_death_lunar !== false,
        death_note: f.death_note || null,
      };
    }
    if (sec === 'contact') {
      return {
        phone_number: f.phone_number || null,
        email: f.email || null,
        social_profiles: socialToPayload(f.socialItems),
      };
    }
    if (sec === 'privacy') {
      return {
        privacy: PRIVACY_ITEMS.map((it) => ({
          field_group: it.key,
          visibility: f[`privacy_${it.key}`],
        })),
      };
    }
    if (sec === 'bio') {
      const topic = arguments.length > 3 ? arguments[3] : '';
      if (!topic) return {};
      if (topic === 'blood_group') {
        return { biography: { blood_group: joinBlood(f.blood_abo, f.blood_rh) || null, blood_note: f.blood_note || null } };
      }
      if (topic === 'health_summary') {
        return { biography: {
          health_flags: f.health_none ? [] : (f.health_flags || []),
          health_summary: f.health_none ? null : (f.health_summary || null),
          health_none: !!f.health_none,
        } };
      }
      if (topic === 'congenital_summary') {
        return { biography: {
          congenital_flags: f.congenital_none ? [] : (f.congenital_flags || []),
          congenital_summary: f.congenital_none ? null : (f.congenital_summary || null),
          congenital_none: !!f.congenital_none,
        } };
      }
      return { biography: { [topic]: f[topic] || null } };
    }
    return {};
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!canEdit || !dirty) return;
    if (section === 'death' && alive) {
      toastSpeak('error', 'Ngày mất chỉ ghi khi thành viên đã được đánh dấu đã mất (quản trị).');
      return;
    }
    const nowY = new Date().getFullYear();
    const by = form.birth_year === '' || form.birth_year == null ? null : Number(form.birth_year);
    const dy = form.death_year === '' || form.death_year == null ? null : Number(form.death_year);
    if (section === 'birth' && by != null) {
      if (!Number.isFinite(by) || by < 1000 || by > nowY + 1) {
        toastSpeak('error', `Năm sinh phải từ 1000 đến ${nowY + 1}.`);
        return;
      }
    }
    if (section === 'death' && dy != null) {
      if (!Number.isFinite(dy) || dy < 1000 || dy > nowY) {
        toastSpeak('error', `Năm mất phải từ 1000 đến ${nowY}.`);
        return;
      }
      if (by != null && Number.isFinite(by) && dy < by) {
        toastSpeak('error', 'Năm mất không được trước năm sinh.');
        return;
      }
    }
    const body = patchBodyForSection(section, form, alive, bioTopic);
    if (!body || !Object.keys(body).length) {
      toastSpeak('error', 'Không có trường nào để lưu ở mục này.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(profilePath, body);
      toastSpeak('ok', 'Đã lưu mục này.');
      if (section === 'contact') {
        try {
          const extra = await api.get(profilePath, { params: { section: 'contact' } });
          const social = extra.data?.data?.member?.social_profiles || {};
          const items = parseSocialProfiles(social);
          setForm((prev) => ({ ...prev, socialItems: items }));
          setSavedForm((prev) => ({ ...prev, socialItems: items, phone_number: form.phone_number, email: form.email }));
        } catch (_) {
          setSavedForm(form);
        }
        setSocialUi({ mode: 'list', idx: null });
      } else {
        setSavedForm(form);
      }
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không lưu được hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  function goAddress(usage, mode) {
    if (!canEdit) return;
    if (mode === 'edit' && !window.confirm('Sửa địa chỉ đang có?')) return;
    if (mode === 'create' && usage !== 'origin' && !window.confirm(usage === 'resting' ? 'Tạo nơi an nghỉ mới?' : 'Tạo nơi ở mới?')) return;
    const q = new URLSearchParams({ usage, mode });
    if (routeMemberId) q.set('member_id', routeMemberId);
    navigate(`/me/profile/address?${q.toString()}`);
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
      const res = await api.post('/me/avatar', fd);
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
      await api.delete('/me/avatar');
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
                  disabled={avatarBusy || !canEdit}
                  className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-lg font-black text-indigo-700 disabled:opacity-60"
                  onClick={() => canEdit && fileRef.current && fileRef.current.click()}
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
                {avatarUrl && canEdit ? (
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
                  Giới tính: <span className="font-semibold">{genderLabel(meta.gender)}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Ngày sinh: <span className="font-semibold">{formatDob(form)}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Đời thứ: <span className="font-semibold">{meta.generation != null ? meta.generation : 'Chưa có'}</span>
                </p>
                {!alive ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-white">Đã chết</span>
                    <span className="text-sm font-semibold text-slate-700">{formatGio(form)}</span>
                  </p>
                ) : null}
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
              <option value="">Chọn mục hồ sơ</option>
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>

          {section ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 text-base font-black text-slate-800">{sectionMeta.label}</h2>
              <ZoneVoiceButton visible text={sectionVoice} label="Nghe" />
            </div>

            {section === 'identity' ? (
              <div className="space-y-3">
                <Field label="Họ và tên trên gia phả">
                  <input className={inputCls} readOnly={!canEdit} value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} required />
                </Field>
                <Field label="Tên gọi khác" hint="Tên ở nhà, biệt danh.">
                  <input className={inputCls} readOnly={!canEdit} value={form.alias} onChange={(e) => setField('alias', e.target.value)} />
                </Field>
                <Field label="Ghi chú ngắn">
                  <textarea className={inputCls} readOnly={!canEdit} rows={2} value={form.note} onChange={(e) => setField('note', e.target.value)} />
                </Field>
              </div>
            ) : null}

            {section === 'death' ? (
              <div className="space-y-3">
                {alive ? (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Thành viên còn sống. Ngày mất / ngày giỗ chỉ ghi sau khi quản trị đánh dấu đã mất.
                  </p>
                ) : null}
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Ngày">
                    <input className={inputCls} readOnly={!canEditDeath} inputMode="numeric" value={form.death_day} onChange={(e) => setField('death_day', e.target.value)} />
                  </Field>
                  <Field label="Tháng">
                    <input className={inputCls} readOnly={!canEditDeath} inputMode="numeric" value={form.death_month} onChange={(e) => setField('death_month', e.target.value)} />
                  </Field>
                  <Field label="Năm mất">
                    <input className={inputCls} readOnly={!canEditDeath} inputMode="numeric" value={form.death_year} onChange={(e) => setField('death_year', e.target.value)} />
                  </Field>
                </div>
                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-base font-semibold text-slate-700">
                  <input type="checkbox" className="h-5 w-5" disabled={!canEditDeath} checked={form.is_death_lunar !== false} onChange={(e) => setField('is_death_lunar', e.target.checked)} />
                  Ngày âm lịch (ngày giỗ)
                </label>
                <Field label="Ghi chú giỗ">
                  <input className={inputCls} readOnly={!canEditDeath} value={form.death_note} onChange={(e) => setField('death_note', e.target.value)} />
                </Field>
              </div>
            ) : null}

            {section === 'birth' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Ngày">
                    <input className={inputCls} readOnly={!canEdit} inputMode="numeric" value={form.birth_day} onChange={(e) => setField('birth_day', e.target.value)} />
                  </Field>
                  <Field label="Tháng">
                    <input className={inputCls} readOnly={!canEdit} inputMode="numeric" value={form.birth_month} onChange={(e) => setField('birth_month', e.target.value)} />
                  </Field>
                  <Field label="Năm">
                    <input className={inputCls} readOnly={!canEdit} inputMode="numeric" value={form.birth_year} onChange={(e) => setField('birth_year', e.target.value)} />
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
                  <input className={inputCls} readOnly={!canEdit} value={form.phone_number} onChange={(e) => setField('phone_number', e.target.value)} />
                </Field>
                <Field label="Email hồ sơ">
                  <input className={inputCls} readOnly={!canEdit} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                </Field>
                <div className="space-y-2">
                  <p className="text-sm font-black text-slate-800">Mạng xã hội / kênh liên lạc</p>
                  {socialUi.mode === 'list' && (form.socialItems || []).length > 0 ? (
                    <>
                      {(form.socialItems || []).map((row, idx) => (
                        <div key={`${row.kind}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <p className="text-sm font-black text-slate-800">{kindLabel(row.kind)}</p>
                          <p className="text-sm text-slate-600">{row.value_type} · {row.value}</p>
                          {row.value_type === 'QR_MEDIA' && socialHref(row) ? (
                            <img src={socialHref(row)} alt="QR" className="mt-2 h-24 w-24 rounded-lg object-cover" />
                          ) : null}
                          {socialHref(row) ? (
                            <a href={socialHref(row)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-bold text-indigo-700">
                              {row.value_type === 'PHONE' ? 'Gọi' : row.value_type === 'QR_MEDIA' ? 'Mở ảnh QR / danh thiếp' : 'Mở liên kết'}
                            </a>
                          ) : null}
                          {canEdit ? (
                            <div className="mt-2 flex gap-3">
                              <button
                                type="button"
                                className="text-sm font-bold text-indigo-700"
                                onClick={() => setSocialUi({ mode: 'form', idx })}
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="text-sm font-bold text-rose-600"
                                onClick={async () => {
                                  if (!window.confirm('Xóa kênh này?')) return;
                                  const next = form.socialItems.filter((_, i) => i !== idx);
                                  setField('socialItems', next);
                                  try {
                                    await api.patch(profilePath, { social_profiles: socialToPayload(next) });
                                    setSavedForm((prev) => ({ ...prev, socialItems: next }));
                                    toastSpeak('ok', 'Đã xóa kênh.');
                                  } catch (e) {
                                    toastSpeak('error', e.response?.data?.message || 'Không xóa được kênh.');
                                  }
                                }}
                              >
                                Xóa
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {canEdit ? (
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-indigo-200 py-3 text-sm font-black text-indigo-700"
                          onClick={() => {
                            setField('socialItems', [...(form.socialItems || []), emptySocialItem()]);
                            setSocialUi({ mode: 'form', idx: (form.socialItems || []).length });
                          }}
                        >
                          Thêm kênh
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {(() => {
                        const idx = socialUi.idx == null ? 0 : socialUi.idx;
                        const row = (form.socialItems || [])[idx] || emptySocialItem();
                        const items = form.socialItems && form.socialItems.length
                          ? form.socialItems
                          : [emptySocialItem()];
                        if (!(form.socialItems || []).length) {
                          /* keep one draft row in form */
                        }
                        return (
                          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                            <Field label="Kênh">
                              <select
                                className={inputCls}
                                disabled={!canEdit}
                                value={row.kind}
                                onChange={(e) => {
                                  const kind = e.target.value;
                                  const value_type = kind === 'ZALO' ? 'PHONE' : kind === 'TELEGRAM' ? 'ID' : 'URL';
                                  const next = [...items];
                                  next[idx] = { kind, value_type, value: '' };
                                  setField('socialItems', next);
                                }}
                              >
                                {SOCIAL_KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                              </select>
                            </Field>
                            <Field label="Kiểu dữ liệu">
                              <select
                                className={inputCls}
                                disabled={!canEdit}
                                value={row.value_type}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx] = { ...row, value_type: e.target.value };
                                  setField('socialItems', next);
                                }}
                              >
                                {SOCIAL_VALUE_TYPES.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                              </select>
                            </Field>
                            <Field label="Giá trị">
                              <input
                                className={inputCls}
                                readOnly={!canEdit}
                                value={row.value}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx] = { ...row, value: e.target.value };
                                  setField('socialItems', next);
                                }}
                              />
                            </Field>
                            {socialHref(row) ? (
                              <a href={socialHref(row)} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-700">
                                {row.value_type === 'PHONE' ? 'Gọi' : row.value_type === 'QR_MEDIA' ? 'Mở ảnh QR / danh thiếp' : 'Mở liên kết'}
                              </a>
                            ) : null}
                            {row.value_type === 'QR_MEDIA' && canEdit ? (
                              <Field label="Tải ảnh QR / danh thiếp">
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="block w-full text-sm"
                                  onChange={async (e) => {
                                    const file = e.target.files && e.target.files[0];
                                    e.target.value = '';
                                    if (!file) return;
                                    const fd = new FormData();
                                    fd.append('file', file);
                                    fd.append('caption', `${row.kind} QR`);
                                    try {
                                      const res = await api.post('/me/documents', fd);
                                      const item = res.data?.data?.item || res.data?.data;
                                      const url = item?.url || item?.read_url || '';
                                      if (!url) {
                                        toastSpeak('error', 'Không nhận được liên kết ảnh.');
                                        return;
                                      }
                                      const next = [...items];
                                      next[idx] = { ...row, value_type: 'QR_MEDIA', value: url, media_id: item?.id || null };
                                      setField('socialItems', next);
                                      toastSpeak('ok', 'Đã gắn ảnh QR / danh thiếp.');
                                    } catch (err) {
                                      toastSpeak('error', err.response?.data?.message || 'Không tải được ảnh.');
                                    }
                                  }}
                                />
                              </Field>
                            ) : null}
                            {row.value_type === 'QR_MEDIA' && socialHref(row) ? (
                              <img src={socialHref(row)} alt="QR" className="h-28 w-28 rounded-lg object-cover" />
                            ) : null}
                            {(form.socialItems || []).length > 0 ? (
                              <button
                                type="button"
                                className="text-sm font-bold text-slate-600"
                                onClick={() => {
                                  if (socialUi.idx != null && !(form.socialItems[socialUi.idx] || {}).value) {
                                    setField('socialItems', form.socialItems.filter((_, i) => i !== socialUi.idx));
                                  }
                                  setSocialUi({ mode: 'list', idx: null });
                                }}
                              >
                                Xem danh sách kênh
                              </button>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {section === 'address' ? (
              <div className="space-y-2">
                {[
                  { key: 'origin', title: 'Quê quán' },
                  { key: 'current', title: currentTitle },
                  ...(!alive ? [{ key: 'resting', title: 'Nơi an nghỉ' }] : []),
                  { key: 'history', title: 'Lịch sử thay đổi' },
                ].map((card) => {
                  const open = addrCard === card.key;
                  const place = card.key === 'origin' ? form.origin : card.key === 'current' ? form.current : card.key === 'resting' ? form.resting : null;
                  const summary = card.key === 'history'
                    ? (residences.length ? `${residences.length} lần ở` : 'Chưa có dòng lịch sử')
                    : (hasPlace(place) ? formatAddressSummary(place) : (card.key === 'current' && !alive ? 'Chưa rõ' : 'Chưa có'));
                  return (
                    <div key={card.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-3 text-left"
                        onClick={() => setAddrCard(open ? '' : card.key)}
                      >
                        <span className="flex-1">
                          <span className="block text-sm font-black text-slate-800">{card.title}</span>
                          <span className="block truncate text-xs text-slate-500">{summary}</span>
                        </span>
                        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      {open && card.key !== 'history' ? (
                        <div className="space-y-2 border-t border-slate-100 px-3 py-3">
                          <dl>
                            <ReadRow label="Địa chỉ" value={hasPlace(place) ? formatAddressSummary(place) : summary} />
                            <ReadRow label="Ghi chú" value={place?.notes || '—'} />
                            <ReadRow label="Tọa độ" value={(place?.latitude && place?.longitude) ? `${place.latitude}, ${place.longitude}` : '—'} />
                            {mapHref(place || {}) ? (
                              <p className="mt-1">
                                <a className="text-sm font-bold text-indigo-700 underline" href={mapHref(place)} target="_blank" rel="noreferrer">Mở bản đồ</a>
                              </p>
                            ) : <ReadRow label="Bản đồ" value="—" />}
                          </dl>
                          {canEdit ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={!hasPlace(place)}
                                onClick={() => goAddress(card.key === 'resting' ? 'resting' : card.key, 'edit')}
                                className="rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                              >
                                Sửa
                              </button>
                              {card.key === 'origin' ? (
                                !hasPlace(place) ? (
                                  <button type="button" onClick={() => goAddress('origin', 'create')} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">Thêm</button>
                                ) : <span />
                              ) : card.key === 'current' ? (
                                <button type="button" onClick={() => goAddress('current', 'create')} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">
                                  {alive ? 'Nơi ở mới' : (hasPlace(place) ? 'Thay đổi' : 'Thêm nơi ở cuối')}
                                </button>
                              ) : (
                                <button type="button" onClick={() => goAddress('resting', 'create')} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">
                                  {hasPlace(place) ? 'Thay đổi' : 'Thêm nơi an nghỉ'}
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {open && card.key === 'history' ? (
                        <div className="border-t border-slate-100 px-3 py-3">
                          <ul className="min-h-[16.5rem] max-h-[16.5rem] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50">
                            {residences.length ? [...residences].sort((a,b) => (Number(b.from_year)||0) - (Number(a.from_year)||0)).map((row) => (
                              <li key={row.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-0">
                                <p className="font-bold text-slate-800">{(!alive && row.is_current && row.kind !== 'RESTING')
                                  ? 'Nơi ở cuối'
                                  : residenceKindLabel(row.kind || 'RESIDENCE')}
                                {alive && row.is_current ? ' · đang ở' : ''}</p>
                                <p className="text-slate-600">{[row.from_year, row.to_year].filter(Boolean).join(' – ') || 'Chưa rõ năm'}</p>
                                <p className="text-slate-500">{row.full_address || row.address?.full_address || row.note || ''}</p>
                                <p className="text-xs text-slate-500">
                                  {(row.address && row.address.latitude && row.address.longitude)
                                    ? `${row.address.latitude}, ${row.address.longitude}`
                                    : '—'}
                                </p>
                                {mapHref(row.address || {}) ? (
                                  <p className="mt-1">
                                    <a className="text-xs font-bold text-indigo-700 underline" href={mapHref(row.address)} target="_blank" rel="noreferrer">Mở bản đồ</a>
                                  </p>
                                ) : null}
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="mt-1 block text-sm font-bold text-indigo-700"
                                    onClick={() => {
                                      if (!window.confirm('Sửa lần ở này (không đổi chỗ dùng chung)?')) return;
                                      const q = new URLSearchParams({ usage: row.kind === 'RESTING' ? 'resting' : 'current', mode: 'edit', residence_id: row.id });
                                      if (routeMemberId) q.set('member_id', routeMemberId);
                                      navigate(`/me/profile/address?${q.toString()}`);
                                    }}
                                  >
                                    Sửa lần ở
                                  </button>
                                ) : null}
                              </li>
                            )) : (
                              <li className="px-3 py-6 text-center text-sm text-slate-500">Chưa có lịch sử thay đổi.</li>
                            )}
                          </ul>
                          {canEdit ? (
                            <button
                              type="button"
                              className="mt-2 w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white"
                              onClick={() => {
                                if (!window.confirm('Thêm một lần ở trong lịch sử (không đổi nơi ở hiện tại / cuối)?')) return;
                                const q = new URLSearchParams({ usage: 'current', mode: 'create', history: '1' });
                                if (routeMemberId) q.set('member_id', routeMemberId);
                                navigate(`/me/profile/address?${q.toString()}`);
                              }}
                            >
                              Thêm lần ở trong lịch sử
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {section === 'bio' ? (
              <div className="space-y-3">
                <Field label="Chủ đề tiểu sử">
                  <select className={inputCls} value={bioTopic} onChange={(e) => setBioTopic(e.target.value)}>
                    <option value="">Chọn chủ đề</option>
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
                            <textarea className={inputCls} readOnly={!canEdit} rows={3} maxLength={255} value={form.blood_note} onChange={(e) => setField('blood_note', e.target.value)} />
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
                          <textarea className={inputCls} readOnly={!canEdit} rows={8} maxLength={it.max || undefined} value={text} onChange={(e) => setField(it.key, e.target.value)} />
                          {it.max ? <p className="text-xs text-slate-500">{text.length}/{it.max}</p> : null}
                        </>
                      )}
                      <ProofStrip
                        title="Tư liệu"
                        addLabel="Thêm tư liệu"
                        proofs={bioFiles[it.key] || []}
                        busy={bioFileBusy}
                        onAdd={canEdit ? () => {
                          writeProfileSection('bio');
                          writeBioTopic(it.key);
                          navigate(`/me/profile/biography/${it.key}/file${routeMemberId ? `?member_id=${routeMemberId}` : ''}`);
                        } : undefined}
                        onRemove={canEdit ? async (p) => {
                          if (!window.confirm('Xóa tư liệu này khỏi chủ đề?')) return;
                          setBioFileBusy(true);
                          try {
                            const res = await api.delete(`/me/biography/${it.key}/files/${p.id}`);
                            setBioFiles(res.data?.data?.items || {});
                            toastSpeak('ok', 'Đã xóa tư liệu.');
                          } catch (e) {
                            toastSpeak('error', e.response?.data?.message || 'Không xóa được tư liệu.');
                          } finally {
                            setBioFileBusy(false);
                          }
                        } : undefined}
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
                            onAdd={canEdit ? () => {
                              writeProfileSection('bio_read');
                              writeBioTopic(it.key);
                              navigate(`/me/profile/biography/${it.key}/file${routeMemberId ? `?member_id=${routeMemberId}` : ''}`);
                            } : undefined}
                            onRemove={canEdit ? async (p) => {
                              if (!window.confirm('Xóa tư liệu này khỏi chủ đề?')) return;
                              setBioFileBusy(true);
                              try {
                                const res = await api.delete(`/me/biography/${it.key}/files/${p.id}`);
                                setBioFiles(res.data?.data?.items || {});
                                toastSpeak('ok', 'Đã xóa tư liệu.');
                              } catch (e) {
                                toastSpeak('error', e.response?.data?.message || 'Không xóa được tư liệu.');
                              } finally {
                                setBioFileBusy(false);
                              }
                            } : undefined}
                          />
                          {canEdit ? <button
                            type="button"
                            className="w-full rounded-2xl border border-indigo-200 bg-white py-2 text-sm font-bold text-indigo-700"
                            onClick={() => {
                              setBioTopic(it.key);
                              setSection('bio');
                            }}
                          >
                            {text ? 'Sửa chủ đề này' : 'Nhập chủ đề này'}
                          </button> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}


            {section === 'ach' && canEdit ? (
              <AchievementEditor
                draft={achDraft}
                setDraft={setAchDraft}
                items={achievements}
                onHydrate={async (row) => {
                  if (!row?.id) return row;
                  try {
                    const res = await api.get(`/me/achievements/${row.id}`);
                    const item = res.data?.data?.item;
                    if (!item) return row;
                    setAchievements((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...item } : x)));
                    return item;
                  } catch (_) {
                    return row;
                  }
                }}
                onDelete={canEdit ? async (row) => {
                  if (!window.confirm('Xóa thành tích này?')) return;
                  try {
                    await api.delete(`/me/achievements/${row.id}`);
                    setAchievements((prev) => prev.filter((x) => x.id !== row.id));
                    if (achDraft.id === row.id) setAchDraft({ ...EMPTY_ACHIEVEMENT, category: row.category, sub_category: row.sub_category || '' });
                    toastSpeak('ok', 'Đã xóa thành tích.');
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không xóa được.');
                  }
                } : undefined}
                saving={savingAch}
                proofBusy={proofBusyId === achDraft.id}
                onAddProof={() => {
                  if (!achDraft.id) {
                    toastSpeak('error', 'Lưu thành tựu trước khi thêm minh chứng.');
                    return;
                  }
                  writeProfileSection('ach');
                  writeAchOpenId(achDraft.id);
                  if (!canEdit) return; navigate(`/me/profile/achievement/${achDraft.id}/proof${routeMemberId ? `?member_id=${routeMemberId}` : ''}`);
                }}
                onRemoveProof={async (proof) => {
                  if (!achDraft.id) return;
                  if (!window.confirm('Xóa minh chứng này?')) return;
                  setProofBusyId(achDraft.id);
                  try {
                    const res = await api.delete(`/me/achievements/${achDraft.id}/proofs/${proof.id}`);
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
                    return false;
                  }
                  setSavingAch(true);
                  try {
                    if (achDraft.id) {
                      await api.patch(`/me/achievements/${achDraft.id}`, payload);
                      toastSpeak('ok', 'Đã lưu thành tích.');
                    } else {
                      await api.post('/me/achievements', payload);
                      toastSpeak('ok', 'Đã thêm thành tích.');
                    }
                    const ach = await api.get('/me/achievements');
                    const items = ach.data?.data?.items || [];
                    setAchievements(items);
                    setAchDraft({
                      ...EMPTY_ACHIEVEMENT,
                      category: payload.category || achDraft.category,
                      sub_category: payload.sub_category || achDraft.sub_category || '',
                    });
                    return true;
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không lưu được thành tích.');
                    return false;
                  } finally {
                    setSavingAch(false);
                  }
                }}
              />
            ) : null}

            {section === 'ach_read' ? (
              <AchievementReader
                items={achievements}
                onHydrate={async (row) => {
                  if (!row?.id) return row;
                  try {
                    const res = await api.get(`/me/achievements/${row.id}`);
                    const item = res.data?.data?.item;
                    if (!item) return row;
                    setAchievements((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...item } : x)));
                    return item;
                  } catch (_) {
                    return row;
                  }
                }}
                openMap={achOpen}
                setOpenMap={setAchOpen}
                onCreate={canEdit ? () => {
                  setAchDraft({ ...EMPTY_ACHIEVEMENT });
                  setSection('ach');
                } : undefined}
                onEdit={canEdit ? async (row) => {
                  let full = row;
                  try {
                    const res = await api.get(`/me/achievements/${row.id}`);
                    if (res.data?.data?.item) full = res.data.data.item;
                  } catch (_) { /* list gầy */ }
                  setAchDraft({ ...achievementFromApi(full), proofs: full.proofs || [] });
                  setSection('ach');
                } : undefined}
                onDelete={canEdit ? async (row) => {
                  if (!window.confirm('Xóa thành tích này?')) return;
                  try {
                    await api.delete(`/me/achievements/${row.id}`);
                    setAchievements((prev) => prev.filter((x) => x.id !== row.id));
                    toastSpeak('ok', 'Đã xóa thành tích.');
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không xóa được.');
                  }
                } : undefined}
                proofBusyId={proofBusyId}
                onAddProof={canEdit ? (row) => {
                  writeProfileSection('ach_read');
                  writeAchOpenId(row.id);
                  navigate(`/me/profile/achievement/${row.id}/proof${routeMemberId ? `?member_id=${routeMemberId}` : ''}`);
                } : undefined}
                onRemoveProof={canEdit ? async (row, proof) => {
                  if (!window.confirm('Xóa minh chứng này?')) return;
                  setProofBusyId(row.id);
                  try {
                    const res = await api.delete(`/me/achievements/${row.id}/proofs/${proof.id}`);
                    const proofs = res.data?.data?.proofs || [];
                    setAchievements((prev) => prev.map((x) => (x.id === row.id ? { ...x, proofs } : x)));
                    toastSpeak('ok', 'Đã xóa minh chứng.');
                  } catch (e) {
                    toastSpeak('error', e.response?.data?.message || 'Không xóa được minh chứng.');
                  } finally {
                    setProofBusyId(null);
                  }
                } : undefined}
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
                          {canEdit ? <button
                            type="button"
                            className="text-xs font-bold text-rose-600"
                            onClick={async () => {
                              if (!window.confirm('Xóa tài liệu này khỏi hồ sơ và kho lưu trữ?')) return;
                              try {
                                const res = await api.delete(`/me/documents/${p.id}`);
                                setDocs(res.data?.data?.items || []);
                                setDocsUsed(res.data?.data?.used_bytes || 0);
                                toastSpeak('ok', 'Đã xóa tài liệu.');
                              } catch (e) {
                                toastSpeak('error', e.response?.data?.message || 'Không xóa được.');
                              }
                            }}
                          >
                            Xóa
                          </button> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Chưa có tài liệu khác.</p>
                )}
                {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    writeProfileSection('docs');
                    navigate(`/me/profile/document${routeMemberId ? `?member_id=${routeMemberId}` : ''}`);
                  }}
                  className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white"
                >
                  Thêm tài liệu
                </button>
                ) : null}
              </div>
            ) : null}

            {section === 'privacy' ? (
              <div className="space-y-3">
                <Field label="Mục thông tin">
                  <select className={inputCls} disabled={!canEdit} value={privacyGroup} onChange={(e) => setPrivacyGroup(e.target.value)}>
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
          ) : null}

          {canEdit && section && section !== 'address' && section !== 'bio_read' && section !== 'ach' && section !== 'ach_read' && section !== 'docs' && !(section === 'death' && alive) && !(section === 'bio' && !bioTopic) ? (
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
