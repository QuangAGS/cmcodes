/**
 * PATH       : src/pages/MemberViewProfilePage.jsx
 * DATETIME   : 2026-09-05T08:20:00+07:00
 * VERSION    : 1.2.0-M12E3
 * DESCRIPTION: Cùng mục hồ sơ /me/profile. Người mất thêm nơi ở cuối + nơi an nghỉ.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

const inputCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

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

const BIO_TEXT = [
  { key: 'childhood_summary', label: 'Thiếu thời' },
  { key: 'education_history', label: 'Học vấn' },
  { key: 'career_history', label: 'Nghề nghiệp' },
  { key: 'later_life_summary', label: 'Về già / giai đoạn sau' },
  { key: 'personality_traits', label: 'Tính cách' },
  { key: 'notable_quotes', label: 'Danh ngôn' },
];

function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p[p.length - 1][0] || '')).toUpperCase();
}

function fmtDeath(m) {
  if (!m || m.is_alive !== false) return '';
  const parts = [m.death_day, m.death_month, m.death_year].filter((x) => x != null && x !== '');
  if (!parts.length) return 'Đã mất';
  return `Mất ${parts.join('/')} ${m.is_death_lunar ? '(âm lịch)' : ''}`.trim();
}

function emptyBio() {
  const o = {};
  BIO_TEXT.forEach((t) => { o[t.key] = ''; });
  o.blood_group = '';
  o.blood_note = '';
  o.health_summary = '';
  o.health_none = false;
  o.congenital_summary = '';
  o.congenital_none = false;
  return o;
}

export default function MemberViewProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, { pageKey: 'profile', backTo: '/', showBack: true });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('identity');
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [bio, setBio] = useState(emptyBio());

  function applyPayload(payload) {
    setData(payload);
    setNote(payload.member?.note || '');
    const b = payload.biography || {};
    setBio({
      ...emptyBio(),
      childhood_summary: b.childhood_summary || '',
      education_history: b.education_history || '',
      career_history: b.career_history || '',
      later_life_summary: b.later_life_summary || '',
      personality_traits: b.personality_traits || '',
      notable_quotes: b.notable_quotes || '',
      blood_group: b.blood_group || '',
      blood_note: b.blood_note || '',
      health_summary: b.health_summary || '',
      health_none: !!b.health_none,
      congenital_summary: b.congenital_summary || '',
      congenital_none: !!b.congenital_none,
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/members/${id}/profile`);
        if (!cancelled) applyPayload(res.data?.data || {});
      } catch (e) {
        toast.error(e.response?.data?.message || 'Không tải được hồ sơ.');
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const member = data?.member;
  const dead = member && member.is_alive === false;
  const canEdit = !!data?.can_edit;
  const lastStay = data?.current_address;
  const origin = data?.origin_address;
  const sectionMeta = SECTIONS.find((s) => s.key === section) || SECTIONS[0];

  const dirty = useMemo(() => {
    if (!data) return false;
    const b = data.biography || {};
    if (String(note || '') !== String(data.member?.note || '')) return true;
    return BIO_TEXT.some((t) => String(bio[t.key] || '') !== String(b[t.key] || ''))
      || String(bio.blood_group || '') !== String(b.blood_group || '')
      || String(bio.blood_note || '') !== String(b.blood_note || '')
      || String(bio.health_summary || '') !== String(b.health_summary || '')
      || !!bio.health_none !== !!b.health_none
      || String(bio.congenital_summary || '') !== String(b.congenital_summary || '')
      || !!bio.congenital_none !== !!b.congenital_none;
  }, [data, note, bio]);

  async function onSave(ev) {
    ev.preventDefault();
    if (!canEdit || !dirty) return;
    setSaving(true);
    try {
      const res = await apiClient.patch(`/members/${id}/profile`, {
        note: note || null,
        biography: {
          ...Object.fromEntries(BIO_TEXT.map((t) => [t.key, bio[t.key] || null])),
          blood_group: bio.blood_group || null,
          blood_note: bio.blood_note || null,
          health_summary: bio.health_summary || null,
          health_none: !!bio.health_none,
          congenital_summary: bio.congenital_summary || null,
          congenital_none: !!bio.congenital_none,
        },
      });
      applyPayload(res.data?.data || {});
      toast.success('Đã lưu hồ sơ.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không lưu được.');
    } finally {
      setSaving(false);
    }
  }

  function field(label, value, onChange, rows = 3) {
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
        {canEdit && onChange ? (
          <textarea className={inputCls} rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{value || '—'}</p>
        )}
      </label>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Hồ sơ thành viên" />
      {loading ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">Đang tải...</p>
      ) : !member ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">Không có dữ liệu.</p>
      ) : (
        <form onSubmit={onSave} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-black text-indigo-700">
                {initials(member.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black text-slate-800">{member.full_name || 'Chưa có tên'}</h1>
                <p className="mt-1 text-sm text-slate-600">Giới tính: <span className="font-semibold">{member.gender || '—'}</span></p>
                <p className="text-sm text-slate-600">Đời thứ: <span className="font-semibold">{member.generation != null ? member.generation : 'Chưa có'}</span></p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {dead ? (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-white">Đã mất</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Còn sống</span>
                  )}
                  {dead ? <span className="text-sm font-medium text-slate-600">{fmtDeath(member)}</span> : null}
                </div>
              </div>
            </div>
          </section>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Mục hồ sơ</span>
            <select className={inputCls} value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-black text-slate-800">{sectionMeta.label}</h2>

            {section === 'identity' ? field('Ghi chú', note, canEdit ? setNote : null) : null}

            {section === 'birth' ? (
              <p className="text-sm text-slate-700">
                {[member.birth_day, member.birth_month, member.birth_year].filter(Boolean).join('/') || 'Chưa có ngày sinh'}
                {member.is_birth_lunar ? ' (âm lịch)' : ''}
              </p>
            ) : null}

            {section === 'contact' ? (
              <div className="space-y-1 text-sm text-slate-700">
                <p>Điện thoại: {member.phone_number || '—'}</p>
                <p>Email: {member.email || '—'}</p>
              </div>
            ) : null}

            {section === 'address' ? (
              <div className="space-y-3 text-sm text-slate-700">
                <div>
                  <p className="font-bold text-slate-800">Quê quán</p>
                  <p>{origin?.full_address || origin?.line1 || 'Chưa có'}</p>
                </div>
                <div>
                  <p className="font-bold text-slate-800">{dead ? 'Nơi ở cuối' : 'Nơi ở hiện tại'}</p>
                  <p>{lastStay?.full_address || lastStay?.line1 || 'Chưa có'}</p>
                </div>
                {dead ? (
                  <div>
                    <p className="font-bold text-slate-800">Nơi an nghỉ</p>
                    <p className="text-slate-500">Chưa gắn nghĩa trang / phần mộ (lát graves).</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {section === 'bio' ? (
              <div className="space-y-3">
                {BIO_TEXT.map((t) => (
                  <div key={t.key}>
                    {field(t.label, bio[t.key], canEdit ? (v) => setBio((p) => ({ ...p, [t.key]: v })) : null)}
                  </div>
                ))}
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">Nhóm máu</span>
                  {canEdit ? (
                    <input className={inputCls} value={bio.blood_group} onChange={(e) => setBio((p) => ({ ...p, blood_group: e.target.value }))} />
                  ) : (
                    <p className="text-sm text-slate-700">{bio.blood_group || '—'}</p>
                  )}
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" disabled={!canEdit} checked={!!bio.health_none} onChange={(e) => setBio((p) => ({ ...p, health_none: e.target.checked }))} />
                  Không mắc bệnh đáng kể
                </label>
                {field('Bệnh tật', bio.health_summary, canEdit ? (v) => setBio((p) => ({ ...p, health_summary: v })) : null)}
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" disabled={!canEdit} checked={!!bio.congenital_none} onChange={(e) => setBio((p) => ({ ...p, congenital_none: e.target.checked }))} />
                  Không dị tật bẩm sinh đáng kể
                </label>
                {field('Bệnh / dị tật bẩm sinh', bio.congenital_summary, canEdit ? (v) => setBio((p) => ({ ...p, congenital_summary: v })) : null)}
              </div>
            ) : null}

            {section === 'bio_read' ? (
              <div className="space-y-3 text-sm text-slate-700">
                {BIO_TEXT.map((t) => (
                  <div key={t.key}>
                    <p className="font-bold text-slate-800">{t.label}</p>
                    <p className="whitespace-pre-wrap">{bio[t.key] || '—'}</p>
                  </div>
                ))}
                <p><span className="font-bold">Nhóm máu:</span> {bio.blood_group || '—'}</p>
                <p><span className="font-bold">Bệnh tật:</span> {bio.health_none ? 'Không mắc bệnh đáng kể' : (bio.health_summary || '—')}</p>
                <p><span className="font-bold">Bẩm sinh:</span> {bio.congenital_none ? 'Không dị tật đáng kể' : (bio.congenital_summary || '—')}</p>
              </div>
            ) : null}

            {section === 'ach' || section === 'ach_read' ? (
              <p className="text-sm text-slate-500">Thành tựu: lát nối GET achievements theo member_id (chưa gắn UI này).</p>
            ) : null}
            {section === 'docs' ? (
              <p className="text-sm text-slate-500">Tài liệu: lát nối media DOCUMENT theo member_id.</p>
            ) : null}
            {section === 'privacy' ? (
              <ul className="space-y-1 text-sm text-slate-700">
                {(data.privacy || []).map((r) => (
                  <li key={r.field_group}>{r.field_group}: {r.visibility === 'SELF' ? 'Chỉ mình / steward' : 'Trong dòng họ'}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {canEdit ? (
            <button type="submit" disabled={saving || !dirty} className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-40">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          ) : (
            <p className="text-center text-sm text-slate-500">Bạn chỉ được xem hồ sơ này.</p>
          )}
        </form>
      )}
      <div className="px-4 pb-6">
        <AppFooterNav {...footerNav} onLogout={() => { logout(); navigate('/auth', { replace: true }); }} />
      </div>
    </div>
  );
}
