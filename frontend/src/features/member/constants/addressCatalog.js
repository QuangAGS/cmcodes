/**
 * PATH       : src/features/member/constants/addressCatalog.js
 * DATETIME   : 2026-08-29T16:40:00+07:00
 * VERSION    : 1.2.0-A01-ADDR2
 * DESCRIPTION: ISO helpers + catalog VN 34 tỉnh / xã (QĐ 19/2025). Một catalog cho quê và nơi ở.
 */

import vnAdmin2025 from './vnAdmin2025.json';

export const COMMON_COUNTRIES = [
  { code: 'VN', label: 'Viet Nam (Việt Nam)' },
  { code: 'US', label: 'United States (Hoa Kỳ)' },
  { code: 'FR', label: 'France (Pháp)' },
  { code: 'AU', label: 'Australia (Úc)' },
  { code: 'CA', label: 'Canada (Canada)' },
  { code: 'GB', label: 'United Kingdom (Anh)' },
  { code: 'DE', label: 'Germany (Đức)' },
  { code: 'JP', label: 'Japan (Nhật Bản)' },
  { code: 'KR', label: 'Korea, Republic of (Hàn Quốc)' },
  { code: 'CN', label: 'China (Trung Quốc)' },
  { code: 'TW', label: 'Taiwan (Đài Loan)' },
  { code: 'SG', label: 'Singapore (Singapore)' },
  { code: 'TH', label: 'Thailand (Thái Lan)' },
  { code: 'LA', label: 'Lao PDR (Lào)' },
  { code: 'KH', label: 'Cambodia (Campuchia)' },
  { code: 'MY', label: 'Malaysia (Malaysia)' },
  { code: 'ID', label: 'Indonesia (Indonesia)' },
  { code: 'PH', label: 'Philippines (Philippines)' },
  { code: 'RU', label: 'Russian Federation (Nga)' },
  { code: 'IT', label: 'Italy (Ý)' },
  { code: 'ES', label: 'Spain (Tây Ban Nha)' },
  { code: 'NZ', label: 'New Zealand (New Zealand)' },
];

export const VN_PROVINCES = vnAdmin2025.map((p) => p.name);

export function wardsOfProvince(provinceName) {
  const row = vnAdmin2025.find((p) => p.name === provinceName);
  return row ? row.wards : [];
}

function foldAdmin(s) {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/^(tỉnh|thành phố|tp\.?|quận|huyện|thị xã|phường|xã|thị trấn|đặc khu)\s+/i, '')
    .trim();
}

export function matchProvinceName(raw) {
  if (!raw) return '';
  const hit = VN_PROVINCES.find((n) => n === raw || foldAdmin(n) === foldAdmin(raw));
  return hit || raw;
}

export function matchWardName(provinceName, raw) {
  if (!raw) return '';
  const wards = wardsOfProvince(matchProvinceName(provinceName));
  const hit = wards.find((n) => n === raw || foldAdmin(n) === foldAdmin(raw));
  return hit || raw;
}

export const EMPTY_ADDRESS = {
  address_id: '',
  country_code: 'VN',
  admin_area: '',
  locality: '',
  sub_locality: '',
  line1: '',
  line2: '',
  postal_code: '',
  notes: '',
  full_address: '',
};

export function addressFromApi(row) {
  if (!row || typeof row !== 'object') return { ...EMPTY_ADDRESS };
  return {
    address_id: row.id || row.address_id || '',
    country_code: (row.country_code || 'VN').toString().toUpperCase().slice(0, 2),
    admin_area: row.admin_area || '',
    locality: row.locality || '',
    sub_locality: row.sub_locality || '',
    line1: row.line1 || '',
    line2: row.line2 || '',
    postal_code: row.postal_code || '',
    notes: row.notes || '',
    full_address: row.full_address || '',
  };
}

export function addressToUpdate(addr) {
  return addressToPatch(addr);
}

export function addressToPatch(addr) {
  if (!addr) return undefined;
  const country_code = (addr.country_code || 'VN').toString().toUpperCase().slice(0, 2);
  const isVn = country_code === 'VN';
  const hasPart = [addr.admin_area, isVn ? '' : addr.locality, addr.sub_locality, addr.line1, addr.line2]
    .some((v) => String(v || '').trim());
  if (!addr.address_id && !hasPart) return undefined;
  const body = {
    country_code,
    admin_area: addr.admin_area || null,
    locality: isVn ? null : addr.locality || null,
    sub_locality: addr.sub_locality || null,
    line1: addr.line1 || null,
    line2: addr.line2 || null,
    postal_code: addr.postal_code || null,
    notes: String(addr.notes || '').trim() ? String(addr.notes).trim().slice(0, 255) : null,
  };
  if (addr.address_id) {
    body.address_id = addr.address_id;
    body.update = true;
  }
  return body;
}

export function countryLabel(code) {
  const hit = COMMON_COUNTRIES.find((c) => c.code === code);
  return hit ? hit.label : code || '';
}

export function formatAddressLines(addr) {
  if (!addr) return [];
  const cc = (addr.country_code || 'VN').toUpperCase();
  if (cc === 'VN') {
    const base = [addr.line2, addr.line1].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
    const lines = [];
    if (base) lines.push(['Địa chỉ cơ sở', base]);
    if (addr.sub_locality) lines.push(['Xã/Phường', addr.sub_locality]);
    if (addr.admin_area) lines.push(['Tỉnh/Thành', addr.admin_area]);
    if (addr.postal_code) lines.push(['Zip code (mã bưu chính)', addr.postal_code]);
    if (addr.notes) lines.push(['Ghi chú', addr.notes]);
    if (!lines.length && addr.full_address) lines.push(['Địa chỉ', addr.full_address]);
    return lines;
  }
  const rows = [
    addr.line1,
    addr.line2,
    addr.sub_locality,
    addr.locality,
    [addr.admin_area, addr.postal_code].filter(Boolean).join(' '),
    countryLabel(cc),
  ].map((s) => String(s || '').trim()).filter(Boolean);
  if (addr.notes) rows.push(addr.notes);
  if (!rows.length && addr.full_address) return [['Địa chỉ', addr.full_address]];
  return rows.map((t) => ['', t]);
}


export function formatAddressSummary(addr) {
  if (!addr) return '';
  const cc = (addr.country_code || 'VN').toUpperCase();
  if (cc === 'VN') {
    return [addr.line2, addr.line1, addr.sub_locality, addr.admin_area]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return [addr.line1, addr.line2, addr.sub_locality, addr.locality, addr.admin_area, addr.postal_code, countryLabel(cc)]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(', ') || addr.full_address || '';
}

export function hasPlace(addr) {
  if (!addr) return false;
  return Boolean(addr.address_id || addr.full_address || addr.admin_area || addr.sub_locality || addr.line1);
}
