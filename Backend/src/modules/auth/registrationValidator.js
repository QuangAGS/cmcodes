/**
 * ============================================================================
 * PATH       : src/modules/auth/registrationValidator.js
 * DATETIME   : 2026-11-22T23:10:00+07:00
 * VERSION    : 1.7.0-ISO29148-UAT-IMP6-CLAN-SETUP
 * DESCRIPTION:
 * - Căn cứ: AMEND-RP-OP-2026-01-V1.1 & UAT-IMP4 / UAT-IMP5 / UAT-Bug 8.
 * - [1.2.0]: Bổ sung pattern regex cho email, phone và claimed_member_id (UUID v4)
 *   ngăn chặn triệt để dữ liệu rác và lỗi database "invalid input syntax for type uuid".
 * - [1.4.0]: Nâng cấp kiểm tra phone theo chuẩn quốc tế libphonenumber-js (ITU-T E.164),
 *   hỗ trợ cả số Việt Nam (0xxxxxxxxx / +84...) lẫn số kiều bào quốc tế (+1..., +61..., +33...).
 * - [1.5.0-ISO29148-UAT-BUG8-REFERRER]:
 *   + Bổ sung các trường người giới thiệu trong họ (`referrer_name`, `referrer_phone`,
 *     `referrer_phone_country`, `referrer_info`), danh sách mạng xã hội động
 *     (`social_links`) và người cao niên xác minh (`elder_name`, `elder_phone`) vào
 *     `REGISTRATION_SCHEMA` để `validateRegistrationProfile` không cắt bỏ trước khi
 *     lưu vào `onboarding_cases.metadata.registration_profile`.
 * - Tuân thủ nguyên tắc Q1 (bảo tồn luồng cũ), Q2 (bảo toàn contract), Q3 (chuẩn tài liệu).
 * ============================================================================
 */

const { isValidPhoneNumber, normalizeCanonicalPhone } = require('../../shared/utils/slug.utils');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(0(3|5|7|8|9)[0-9]{8}|\+[1-9][0-9]{6,14})$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const REGISTRATION_SCHEMA = {
  full_name: { type: 'string', required: true, max: 100 },
  alias: { type: 'string', required: false, max: 100 },
  gender: { type: 'string', required: true, enum: ['NAM', 'NU', 'KHAC'] },
  birth_year: { type: 'number', required: false, min: 1800, max: new Date().getFullYear() },
  birth_month: { type: 'number', required: false, min: 1, max: 12 },
  birth_day: { type: 'number', required: false, min: 1, max: 31 },
  birth_place: { type: 'string', required: false, max: 200 },
  death_year: { type: 'number', required: false, min: 1800, max: new Date().getFullYear() },
  is_alive: { type: 'boolean', required: false, default: true },
  generation: { type: 'number', required: false, min: 1, max: 20 },
  phone: { 
    type: 'string', 
    required: false, 
    max: 25, 
    customValidate: (val) => isValidPhoneNumber(val, 'VN'),
    normalize: (val) => normalizeCanonicalPhone(val, 'VN') || String(val).trim(),
    patternMessage: 'Số điện thoại không đúng định dạng quốc gia hoặc quốc tế E.164 (VD: 0912345678 hoặc +14085551234).' 
  },
  email: { 
    type: 'string', 
    required: false, 
    max: 100, 
    pattern: EMAIL_REGEX, 
    patternMessage: 'Email không đúng định dạng hợp lệ.' 
  },
  member_role: { type: 'string', required: false, max: 50, default: 'THANH_VIEN' },
  branch_name: { type: 'string', required: false, max: 100 },
  father_name: { type: 'string', required: false, max: 100 },
  mother_name: { type: 'string', required: false, max: 100 },
  grandfather_name: { type: 'string', required: false, max: 100 },
  grandmother_name: { type: 'string', required: false, max: 100 },
  address: { type: 'string', required: false, max: 500 },
  note: { type: 'string', required: false, max: 1000 },
  claimed_member_id: { 
    type: 'string', 
    required: false, 
    max: 36, 
    pattern: UUID_REGEX, 
    patternMessage: 'claimed_member_id phải đúng định dạng chuẩn UUID.' 
  },
  proof_documents: { type: 'array', required: false },
  social_profiles: { type: 'object', required: false },
  social_links: { type: 'array', required: false },
  referrer_name: { type: 'string', required: false, max: 120 },
  referrer_phone: {
    type: 'string',
    required: false,
    max: 25,
    customValidate: (val) => isValidPhoneNumber(val, 'VN'),
    normalize: (val) => normalizeCanonicalPhone(val, 'VN') || String(val).trim(),
    patternMessage: 'Số điện thoại người giới thiệu không đúng định dạng quốc gia hoặc quốc tế E.164 (VD: 0912345678 hoặc +14085551234).',
  },
  referrer_phone_country: { type: 'string', required: false, max: 10 },
  referrer_info: { type: 'object', required: false },
  elder_name: { type: 'string', required: false, max: 120 },
  elder_phone: {
    type: 'string',
    required: false,
    max: 25,
    customValidate: (val) => isValidPhoneNumber(val, 'VN'),
    normalize: (val) => normalizeCanonicalPhone(val, 'VN') || String(val).trim(),
    patternMessage: 'Số điện thoại người cao niên xác minh không đúng định dạng quốc gia hoặc quốc tế E.164.',
  },
  child_type: {
    type: 'string',
    required: false,
    enum: ['CON_DE', 'CON_DAU', 'CON_RE', 'CON_NUOI', 'CON_DO_DAU', 'CON_RIENG', 'KHAC'],
  },
  temp_relationship: {
    type: 'string',
    required: false,
    enum: ['CON_DE', 'CON_DAU', 'CON_RE', 'CON_NUOI', 'CON_DO_DAU', 'CON_RIENG', 'KHAC'],
  },
  claim_mode: {
    type: 'string',
    required: false,
    enum: ['CLAIM_EM', 'NEW_PROFILE_21', 'CLAN_SETUP'],
  },
  claim_verification: { type: 'object', required: false },
  setup_purpose: {
    type: 'string',
    required: false,
    enum: ['FAMILY_START', 'CLAN_DIGITIZE', 'FAMILY_CONNECT', 'OTHER'],
  },
  known_generations: {
    type: 'string',
    required: false,
    enum: ['1_2', '3_4', '5_PLUS'],
  },
  earliest_ancestor_name: { type: 'string', required: false, max: 120 },
  clan_origin_place: { type: 'string', required: false, max: 200 },
  agreed_rules: { type: 'boolean', required: false },
  agreed_rules_snapshot: { type: 'string', required: false, max: 30000 },
  agreed_tos_version: { type: 'string', required: false, max: 20 },
  agreed_clan_rules_version: { type: 'number', required: false, min: 1 },
};

function validateRegistrationProfile(data = {}) {
  const cleanData = {};

  for (const [key, rule] of Object.entries(REGISTRATION_SCHEMA)) {
    let val = data[key];

    if (val === undefined || val === null || val === '') {
      if (rule.required) {
        const err = new Error(`Trường [${key}] là bắt buộc.`);
        err.status = 400;
        err.code = 'VALIDATION_REQUIRED';
        throw err;
      }
      if (rule.default !== undefined) {
        cleanData[key] = rule.default;
      }
      continue;
    }

    if (rule.type === 'number' && typeof val === 'string' && !isNaN(val)) {
      val = Number(val);
    }

    if (rule.type === 'boolean' && typeof val === 'string') {
      val = val === 'true' || val === '1';
    }

    if (rule.type === 'array') {
      if (!Array.isArray(val)) {
        const err = new Error(`Trường [${key}] phải là mảng.`);
        err.status = 400;
        err.code = 'VALIDATION_TYPE';
        throw err;
      }
      cleanData[key] = val;
      continue;
    }

    if (rule.type === 'object') {
      if (typeof val !== 'object' || Array.isArray(val)) {
        const err = new Error(`Trường [${key}] phải là object.`);
        err.status = 400;
        err.code = 'VALIDATION_TYPE';
        throw err;
      }
      cleanData[key] = val;
      continue;
    }

    if (typeof val !== rule.type) {
      const err = new Error(`Trường [${key}] phải là ${rule.type}.`);
      err.status = 400;
      err.code = 'VALIDATION_TYPE';
      throw err;
    }

    if (rule.type === 'string' && rule.max && val.length > rule.max) {
      const err = new Error(`Trường [${key}] không được vượt quá ${rule.max} ký tự.`);
      err.status = 400;
      err.code = 'VALIDATION_MAX';
      throw err;
    }

    // Kiểm tra định dạng Regex nếu trường có quy định pattern
    if (rule.pattern && typeof val === 'string' && !rule.pattern.test(val.trim())) {
      const err = new Error(rule.patternMessage || `Trường [${key}] sai định dạng.`);
      err.status = 400;
      err.code = 'VALIDATION_FORMAT';
      throw err;
    }

    // Kiểm tra bằng hàm validate chuyên biệt (VD: libphonenumber-js)
    if (rule.customValidate && typeof val === 'string') {
      if (!rule.customValidate(val)) {
        const err = new Error(rule.patternMessage || `Trường [${key}] sai định dạng.`);
        err.status = 400;
        err.code = 'VALIDATION_FORMAT';
        throw err;
      }
      if (typeof rule.normalize === 'function') {
        val = rule.normalize(val);
      }
    }

    if (rule.type === 'number') {
      if (rule.min !== undefined && val < rule.min) {
        const err = new Error(`Trường [${key}] phải >= ${rule.min}.`);
        err.status = 400;
        err.code = 'VALIDATION_MIN';
        throw err;
      }
      if (rule.max !== undefined && val > rule.max) {
        const err = new Error(`Trường [${key}] phải <= ${rule.max}.`);
        err.status = 400;
        err.code = 'VALIDATION_MAX';
        throw err;
      }
    }

    if (rule.enum && !rule.enum.includes(val)) {
      const err = new Error(`Giá trị [${val}] không hợp lệ cho [${key}].`);
      err.status = 400;
      err.code = 'VALIDATION_ENUM';
      throw err;
    }

    cleanData[key] = val;
  }

  return cleanData;
}

module.exports = { 
  validateRegistrationProfile, 
  REGISTRATION_SCHEMA,
  EMAIL_REGEX,
  PHONE_REGEX,
  UUID_REGEX 
};
