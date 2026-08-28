/**
 * PATH       : src/pages/MemberProfilePage.jsx
 * VERSION    : 1.1.0-A01-CARDS
 * DESCRIPTION: A01 — cards + elder voice, cùng shell settings.
 */

import { useEffect, useState } from 'react';
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
  origin_full: '',
  origin_id: '',
  current_full: '',
  current_id: '',
  privacy_CONTACT: 'TENANT',
  privacy_ACHIEVEMENT: 'TENANT',
  privacy_BIRTH_DATE: 'TENANT',
};

const inputCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

function Card({ title, zoneText, open, onToggle, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-left"
      >
        <h2 className="flex-1 text-base font-black text-slate-800">{title}</h2>
        <ZoneVoiceButton visible text={zoneText} label="Nghe" />
        {open ? (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {open ? <div className="space-y-3 border-t border-slate-100 px-4 py-4">{children}</div> : null}
    </section>
  );
}

function AddressPick({ label, valueText, valueId, onPick, onType }) {
  const [q, setQ] = useState(valueText || '');
  const [hits, setHits] = useState([]);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    setQ(valueText || '');
  }, [valueText]);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.get('/me/addresses', { params: { q: text } });
        setHits(res.data?.data?.items || []);
        setOpenList(true);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      <input
        className={inputCls}
        value={q}
        placeholder="Gõ để tìm địa chỉ đã có trong họ"
        onChange={(e) => {
          setQ(e.target.value);
          onType(e.target.value);
        }}
        onFocus={() => hits.length && setOpenList(true)}
      />
      {valueId ? (
        <p className="mt-1 text-xs font-semibold text-emerald-700">Đã chọn địa chỉ có sẵn</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Không thấy thì giữ nguyên chữ — lần lưu sẽ tạo mới nếu chưa trùng.</p>
      )}
      {openList && hits.length > 0 ? (
        <ul className="mt-2 max-h-40 overflow-auto rounded-2xl border border-slate-200 bg-white">
          {hits.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                onClick={() => {
                  setQ(row.full_address);
                  setOpenList(false);
                  onPick(row);
                }}
              >
                {row.full_address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
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
  const [meta, setMeta] = useState({ gender: '', hint: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState({
    identity: true,
    birth: true,
    contact: true,
    address: false,
    bio: false,
    privacy: false,
  });

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggle = (k) => setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

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
          origin_full: d.origin_address?.full_address || '',
          origin_id: d.origin_address?.id || '',
          current_full: d.current_address?.full_address || '',
          current_id: d.current_address?.id || '',
          privacy_CONTACT: priv.privacy_CONTACT || 'TENANT',
          privacy_ACHIEVEMENT: priv.privacy_ACHIEVEMENT || 'TENANT',
          privacy_BIRTH_DATE: priv.privacy_BIRTH_DATE || 'TENANT',
        });
        setMeta({ gender: m.gender || '', hint: d.login_contact_hint });
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
        origin_address: form.origin_id
          ? { address_id: form.origin_id }
          : form.origin_full
            ? { full_address: form.origin_full }
            : undefined,
        current_address: form.current_id
          ? { address_id: form.current_id }
          : form.current_full
            ? { full_address: form.current_full }
            : undefined,
        privacy: [
          { field_group: 'CONTACT', visibility: form.privacy_CONTACT },
          { field_group: 'ACHIEVEMENT', visibility: form.privacy_ACHIEVEMENT },
          { field_group: 'BIRTH_DATE', visibility: form.privacy_BIRTH_DATE },
        ],
      });
      toast.success('Đã lưu hồ sơ dòng họ.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không lưu được hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Hồ sơ dòng họ" />

      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">Hồ sơ của tôi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Số đăng nhập không đổi tại đây.
          {meta.gender ? ` Giới tính: ${meta.gender} — không tự sửa.` : ''}
        </p>
        <div className="mt-3">
          <AudioHelpButton text={PROFILE_PAGE_HELP} label="Nghe hướng dẫn trang" />
        </div>
        {meta.hint ? (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {meta.hint}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
          <Card title="1. Họ tên" zoneText={PROFILE_ZONE.identity} open={open.identity} onToggle={() => toggle('identity')}>
            <Field label="Họ và tên trên gia phả">
              <input className={inputCls} value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} required />
            </Field>
            <Field label="Tên gọi khác" hint="Tên ở nhà, biệt danh.">
              <input className={inputCls} value={form.alias} onChange={(e) => setField('alias', e.target.value)} />
            </Field>
            <Field label="Ghi chú ngắn">
              <input className={inputCls} value={form.note} onChange={(e) => setField('note', e.target.value)} />
            </Field>
          </Card>

          <Card title="2. Ngày sinh" zoneText={PROFILE_ZONE.birth} open={open.birth} onToggle={() => toggle('birth')}>
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
          </Card>

          <Card title="3. Liên lạc trên gia phả" zoneText={PROFILE_ZONE.contact} open={open.contact} onToggle={() => toggle('contact')}>
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
          </Card>

          <Card title="4. Địa chỉ" zoneText={PROFILE_ZONE.address} open={open.address} onToggle={() => toggle('address')}>
            <AddressPick
              label="Quê quán"
              valueText={form.origin_full}
              valueId={form.origin_id}
              onPick={(row) => {
                setField('origin_id', row.id);
                setField('origin_full', row.full_address);
              }}
              onType={(text) => {
                setField('origin_id', '');
                setField('origin_full', text);
              }}
            />
            <AddressPick
              label="Nơi ở hiện tại"
              valueText={form.current_full}
              valueId={form.current_id}
              onPick={(row) => {
                setField('current_id', row.id);
                setField('current_full', row.full_address);
              }}
              onType={(text) => {
                setField('current_id', '');
                setField('current_full', text);
              }}
            />
          </Card>

          <Card title="5. Tiểu sử" zoneText={PROFILE_ZONE.bio} open={open.bio} onToggle={() => toggle('bio')}>
            <Field label="Thiếu thời">
              <textarea className={inputCls} rows={3} value={form.childhood_summary} onChange={(e) => setField('childhood_summary', e.target.value)} />
            </Field>
            <Field label="Học vấn">
              <textarea className={inputCls} rows={3} value={form.education_history} onChange={(e) => setField('education_history', e.target.value)} />
            </Field>
            <Field label="Nghề nghiệp">
              <textarea className={inputCls} rows={3} value={form.career_history} onChange={(e) => setField('career_history', e.target.value)} />
            </Field>
          </Card>

          <Card title="6. Ai được xem" zoneText={PROFILE_ZONE.privacy} open={open.privacy} onToggle={() => toggle('privacy')}>
            {[
              ['CONTACT', 'Liên lạc'],
              ['BIRTH_DATE', 'Ngày sinh'],
              ['ACHIEVEMENT', 'Thành tựu'],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <select className={inputCls} value={form[`privacy_${key}`]} onChange={(e) => setField(`privacy_${key}`, e.target.value)}>
                  <option value="TENANT">Nội bộ dòng họ</option>
                  <option value="SELF">Chỉ mình tôi</option>
                </select>
              </Field>
            ))}
          </Card>

          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
          </button>
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
