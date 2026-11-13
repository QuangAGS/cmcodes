/**
 * PATH       : src/modules/auth/registrationValidator.js
 * DATETIME   : 2026-11-13T18:05:00+07:00
 * VERSION    : 1.3.1-MULTIHOME-UAT-BUG3-RELATIONSHIP
 * DESCRIPTION:
 * - Căn cứ: AMEND-RP-OP-2026-01-V1.1
 * - [1.2.0]: Bổ sung pattern regex cho email, phone và claimed_member_id (UUID v4)
 *   ngăn chặn triệt để dữ liệu rác và lỗi database "invalid input syntax for type uuid".
 * - Tuân thủ nguyên tắc Q1 (bảo tồn luồng cũ) và Q2 (chuẩn tài liệu kỹ thuật).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
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
    max: 20, 
    pattern: PHONE_REGEX, 
    patternMessage: 'Số điện thoại không đúng định dạng (VD: 0912345678 hoặc +84912345678).' 
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
