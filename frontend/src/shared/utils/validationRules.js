/**
 * PATH       : src/shared/utils/validationRules.js
 * DATETIME   : 2026-11-14T14:48:00+07:00
 * VERSION    : 2.1.0-INTL-PHONE-LIBPHONENUMBER
 * DESCRIPTION:
 * - Bộ rule dùng chung cho auth forms.
 * - Nâng cấp phoneRule và bổ sung bộ chọn quốc gia (COUNTRY_PHONE_OPTIONS) + chuẩn hóa
 *   số điện thoại quốc tế ITU-T E.164 bằng libphonenumber-js/min.
 * - Giữ nguyên tên export cũ để không phá các file schema hiện tại.
 */

import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export const COUNTRY_PHONE_OPTIONS = [
  { code: 'VN', dialCode: '+84', label: '🇻🇳 Việt Nam (+84)', placeholder: '0912 345 678' },
  { code: 'US', dialCode: '+1', label: '🇺🇸 Hoa Kỳ (+1)', placeholder: '(408) 555-1234' },
  { code: 'CA', dialCode: '+1', label: '🇨🇦 Canada (+1)', placeholder: '(416) 555-1234' },
  { code: 'AU', dialCode: '+61', label: '🇦🇺 Úc (+61)', placeholder: '0412 345 678' },
  { code: 'FR', dialCode: '+33', label: '🇫🇷 Pháp (+33)', placeholder: '06 12 34 56 78' },
  { code: 'DE', dialCode: '+49', label: '🇩🇪 Đức (+49)', placeholder: '0151 23456789' },
  { code: 'GB', dialCode: '+44', label: '🇬🇧 Anh (+44)', placeholder: '07700 900123' },
  { code: 'JP', dialCode: '+81', label: '🇯🇵 Nhật Bản (+81)', placeholder: '090-1234-5678' },
  { code: 'KR', dialCode: '+82', label: '🇰🇷 Hàn Quốc (+82)', placeholder: '010-1234-5678' },
  { code: 'TW', dialCode: '+886', label: '🇹🇼 Đài Loan (+886)', placeholder: '0912 345 678' },
  { code: 'SG', dialCode: '+65', label: '🇸🇬 Singapore (+65)', placeholder: '8123 4567' },
  { code: 'TH', dialCode: '+66', label: '🇹🇭 Thái Lan (+66)', placeholder: '081 234 5678' },
  { code: 'CZ', dialCode: '+420', label: '🇨🇿 Séc (+420)', placeholder: '601 123 456' },
  { code: 'RU', dialCode: '+7', label: '🇷🇺 Nga (+7)', placeholder: '912 345-67-89' },
  { code: 'INTL', dialCode: '+', label: '🌐 Quốc gia khác (+...)', placeholder: '+41 79 123 45 67' },
];

const SUPPORTED_COUNTRY_SET = new Set(
  COUNTRY_PHONE_OPTIONS.map((c) => c.code).filter((c) => c !== 'INTL')
);

/**
 * Nhận diện mã quốc gia từ chuỗi SĐT (dùng khi khôi phục draft từ WaitingPage hoặc revision).
 */
export const detectPhoneCountry = (rawValue, fallback = 'VN') => {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback;

  let compact = raw.replace(/[\s().-]+/g, '');
  if (compact.startsWith('00') && compact.length > 4) {
    compact = `+${compact.slice(2)}`;
  }

  const parsed = parsePhoneNumberFromString(
    compact,
    fallback && fallback !== 'INTL' ? fallback : undefined
  );
  if (parsed?.country) {
    return SUPPORTED_COUNTRY_SET.has(parsed.country) ? parsed.country : 'INTL';
  }
  return fallback;
};

/**
 * Chuẩn hóa số điện thoại theo quốc gia đã chọn:
 * - VN (+84): quy về dạng 10 số `0xxxxxxxxx` để tương thích ngược hoàn toàn với dữ liệu DB cũ.
 * - Quốc gia khác: quy về chuẩn quốc tế E.164 `+<mã_quốc_gia><số_thuê_bao>`.
 */
export const normalizePhoneWithCountry = (rawValue, countryCode = 'VN') => {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  let compact = raw.replace(/[\s().-]+/g, '');
  if (compact.startsWith('00') && compact.length > 4) {
    compact = `+${compact.slice(2)}`;
  }

  const region =
    countryCode && String(countryCode).toUpperCase() !== 'INTL'
      ? String(countryCode).toUpperCase()
      : undefined;

  let parsed = parsePhoneNumberFromString(compact, region);

  if ((!parsed || !parsed.isValid()) && !compact.startsWith('+')) {
    const digitsOnly = compact.replace(/\D/g, '');
    if (
      (region === 'VN' || !region) &&
      /^84(3|5|7|8|9)[0-9]{8}$/.test(digitsOnly)
    ) {
      parsed = parsePhoneNumberFromString(`+${digitsOnly}`);
    } else if (!region && digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      parsed = parsePhoneNumberFromString(`+${digitsOnly}`);
    }
  }

  if (parsed && parsed.isValid()) {
    if (parsed.country === 'VN') {
      return `0${parsed.nationalNumber}`;
    }
    return parsed.number;
  }

  return '';
};

/**
 * Kiểm tra chi tiết tính hợp lệ của SĐT theo quốc gia được chọn.
 */
export const validatePhoneWithCountry = (rawValue, countryCode = 'VN') => {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return {
      valid: false,
      normalized: '',
      country: countryCode,
      message: 'Bác vui lòng nhập số điện thoại đăng nhập.',
    };
  }

  const countryMeta =
    COUNTRY_PHONE_OPTIONS.find((c) => c.code === countryCode) ||
    COUNTRY_PHONE_OPTIONS[0];

  if (countryCode === 'INTL' && !raw.startsWith('+') && !raw.startsWith('00')) {
    return {
      valid: false,
      normalized: '',
      country: countryCode,
      message: 'Với quốc gia khác, bác vui lòng nhập kèm mã vùng quốc tế bắt đầu bằng dấu + (ví dụ: +41 79 123 45 67).',
    };
  }

  const normalized = normalizePhoneWithCountry(raw, countryCode);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      country: countryCode,
      message:
        countryCode === 'VN'
          ? 'Số điện thoại Việt Nam chưa đúng định dạng (ví dụ: 0912 345 678).'
          : `Số điện thoại chưa đúng định dạng của ${countryMeta.label} (ví dụ: ${countryMeta.placeholder}).`,
    };
  }

  return {
    valid: true,
    normalized,
    country: countryCode,
    message: '',
  };
};

export const safeString = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  },
  z.string().nullable()
);

export const emailRule = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email không đúng định dạng');

export const optionalEmailRule = z
  .union([
    emailRule,
    z.literal(''),
  ])
  .optional();

export const phoneRule = z
  .string()
  .trim()
  .min(7, 'Số điện thoại quá ngắn')
  .max(25, 'Số điện thoại quá dài')
  .refine(
    (val) => Boolean(normalizePhoneWithCountry(val, 'VN')),
    'Số điện thoại không đúng định dạng quốc gia hoặc quốc tế E.164'
  );

export const birthYearRule = z.preprocess(
  (val) => {
    if (val === '' || val === null || typeof val === 'undefined') return null;
    const n = Number(val);
    return Number.isNaN(n) ? val : n;
  },
  z
    .number({
      invalid_type_error: 'Năm sinh không hợp lệ',
    })
    .int('Năm sinh phải là số nguyên')
    .min(1000, 'Năm sinh không hợp lệ')
    .max(new Date().getFullYear(), 'Năm sinh không hợp lệ')
    .nullable()
);
