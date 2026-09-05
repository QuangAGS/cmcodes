/**
 * PATH       : src/features/member/components/AddressForm.jsx
 * DATETIME   : 2026-08-29T16:40:00+07:00
 * VERSION    : 1.3.0-M12L-GEO
 * DESCRIPTION: Form chỗ ISO. VN: 34 tỉnh + xã, ẩn huyện. Search chỗ đã gắn member.
 */

import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../../lib/apiClient.js';
import {
  COMMON_COUNTRIES,
  VN_PROVINCES,
  EMPTY_ADDRESS,
  wardsOfProvince,
  addressFromApi,
  matchProvinceName,
  matchWardName,
  mapHref,
} from '../constants/addressCatalog.js';

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

export default function AddressForm({ value, onChange }) {
  const addr = { ...EMPTY_ADDRESS, ...(value || {}) };
  const isVn = (addr.country_code || 'VN') === 'VN';
  const wards = useMemo(() => (isVn ? wardsOfProvince(addr.admin_area) : []), [isVn, addr.admin_area]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.get('/me/addresses', {
          params: { q: text, country_code: addr.country_code || 'VN', member_only: 1 },
        });
        setHits(res.data?.data?.items || []);
        setOpenList(true);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, addr.country_code]);

  function patch(partial) {
    const nextId = Object.prototype.hasOwnProperty.call(partial, 'address_id')
      ? partial.address_id
      : addr.address_id;
    onChange({ ...addr, ...partial, address_id: nextId || '' });
  }

  async function pickExisting(row) {
    setQ('');
    setOpenList(false);
    let raw = row;
    try {
      const res = await apiClient.get('/me/addresses', { params: { id: row.id, limit: 1 } });
      raw = res.data?.data?.items?.[0] || row;
    } catch {
      raw = row;
    }
    const mapped = addressFromApi(raw);
    const admin = matchProvinceName(mapped.admin_area);
    const ward = matchWardName(admin, mapped.sub_locality);
    onChange({
      ...EMPTY_ADDRESS,
      ...mapped,
      address_id: raw.id || mapped.address_id,
      admin_area: admin,
      sub_locality: ward,
      notes: raw.notes || mapped.notes || '',
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Country (Quốc gia)">
        <select
          className={inputCls}
          value={addr.country_code || 'VN'}
          onChange={(e) =>
            patch({
              country_code: e.target.value,
              admin_area: '',
              locality: '',
              sub_locality: '',
              address_id: '',
              full_address: '',
            })
          }
        >
          {COMMON_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Tìm địa chỉ đã dùng trong hồ sơ thành viên" hint="Gõ ≥ 2 ký tự. Chỉ chỗ đã gắn quê / nơi ở của member trong họ.">
        <input className={inputCls} value={q} placeholder="Tìm chỗ đã có" onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpenList(true)} />
      </Field>
      {openList && hits.length > 0 ? (
        <ul className="max-h-40 overflow-auto rounded-2xl border border-slate-200 bg-white">
          {hits.map((row) => (
            <li key={row.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50" onClick={() => pickExisting(row)}>
                {row.full_address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {addr.address_id ? <p className="text-xs font-semibold text-emerald-700">Đã chọn chỗ có sẵn.</p> : null}

      <Field label="Administrative area (Tỉnh/Thành phố)">
        {isVn ? (
          <select className={inputCls} value={addr.admin_area || ''} onChange={(e) => patch({ admin_area: e.target.value, sub_locality: '', locality: '' })}>
            <option value="">— Chọn tỉnh/thành —</option>
            {addr.admin_area && !VN_PROVINCES.includes(addr.admin_area) ? (
              <option value={addr.admin_area}>{addr.admin_area}</option>
            ) : null}
            {VN_PROVINCES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <input className={inputCls} value={addr.admin_area} onChange={(e) => patch({ admin_area: e.target.value })} />
        )}
      </Field>

      {!isVn ? (
        <Field label="Locality (Quận/Huyện / thành phố)">
          <input className={inputCls} value={addr.locality} onChange={(e) => patch({ locality: e.target.value })} />
        </Field>
      ) : null}

      <Field label="Dependent locality (Phường/Xã)">
        {isVn && wards.length > 0 ? (
          <select className={inputCls} value={addr.sub_locality || ''} onChange={(e) => patch({ sub_locality: e.target.value })}>
            <option value="">— Chọn xã/phường —</option>
            {addr.sub_locality && !wards.includes(addr.sub_locality) ? (
              <option value={addr.sub_locality}>{addr.sub_locality}</option>
            ) : null}
            {wards.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <input className={inputCls} value={addr.sub_locality} onChange={(e) => patch({ sub_locality: e.target.value })} />
        )}
      </Field>

      <Field label="Address line 1 (Số nhà, đường)">
        <input className={inputCls} value={addr.line1} onChange={(e) => patch({ line1: e.target.value })} />
      </Field>
      <Field label="Address line 2 (Tòa nhà, ngõ, thôn)">
        <input className={inputCls} value={addr.line2} onChange={(e) => patch({ line2: e.target.value })} />
      </Field>
      <Field label="Zip code (mã bưu chính)">
        <input className={inputCls} value={addr.postal_code} onChange={(e) => patch({ postal_code: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Vĩ độ (lat)" hint="-90 … 90">
          <input
            className={inputCls}
            inputMode="decimal"
            value={addr.latitude || ''}
            onChange={(e) => patch({ latitude: e.target.value })}
            placeholder="18.444"
          />
        </Field>
        <Field label="Kinh độ (lng)" hint="-180 … 180">
          <input
            className={inputCls}
            inputMode="decimal"
            value={addr.longitude || ''}
            onChange={(e) => patch({ longitude: e.target.value })}
            placeholder="105.374"
          />
        </Field>
      </div>
      <button
        type="button"
        className="rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700"
        onClick={() => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            (pos) => patch({
              latitude: String(pos.coords.latitude),
              longitude: String(pos.coords.longitude),
            }),
            () => {},
            { enableHighAccuracy: true, timeout: 12000 },
          );
        }}
      >
        Lấy vị trí máy
      </button>
      <Field label="Link bản đồ" hint="Dán URL hoặc dùng tọa độ. Bấm để mở bản đồ.">
        <input className={inputCls} value={addr.location_url || ''} onChange={(e) => patch({ location_url: e.target.value })} placeholder="https://maps.google.com/..." />
        {mapHref(addr) ? (
          <a
            className="mt-2 inline-block text-sm font-black text-indigo-700 underline"
            href={mapHref(addr)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở bản đồ
          </a>
        ) : (
          <span className="mt-2 block text-xs text-slate-500">Chưa có link hoặc tọa độ.</span>
        )}
      </Field>
      <Field label="Note (Ghi chú)" hint="Tên cũ, chữ gia phả / bia, hoặc ghi chú khác của chỗ này.">
        <textarea className={inputCls} rows={3} value={addr.notes} onChange={(e) => patch({ notes: e.target.value })} />
      </Field>
    </div>
  );
}
