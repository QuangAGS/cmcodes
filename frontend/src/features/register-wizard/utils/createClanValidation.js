/**
 * PATH       : src/features/register-wizard/utils/createClanValidation.js
 * DATETIME   : 2026-11-23T06:35:00+07:00
 * VERSION    : 2.4.1-ISO29148-UAT-BUG11
 * DESCRIPTION:
 * - selectedSlug trở thành optional vì backend tự sinh slug.
 * - [2.3.0]: Bổ sung elder_name & elder_phone (Người cao niên >= 60 tuổi xác minh
 *   ngoại tuyến theo Baseline ARCH-06) vào createClanSchema.
 */

import { z } from 'zod';
import { safeString, emailRule, phoneRule, birthYearRule } from  '../../../shared/utils/validationRules.js';

export const createClanSchema = z.object({
  // --- KHỐI 1: THÔNG TIN DÒNG HỌ ---
  clanName: safeString.refine((val) => val !== null && val.length > 0, 'Tên dòng họ khởi tạo là bắt buộc'),

  description: z
    .string()
    .trim()
    .min(10, 'Mô tả dòng họ bắt buộc phải từ 10 ký tự trở lên')
    .max(500, 'Mô tả không được vượt quá 500 ký tự'),

  // Slug: Không bắt buộc nữa vì backend tự sinh
  selectedSlug: z.string().optional().default(''),

  logo_url: z.string().url('Link logo phải là URL hợp lệ').optional().or(z.literal('')),

  // --- KHỐI 2: ĐỐI SOÁT NHÂN THÂN ---
  temp_full_name: safeString.refine((val) => val !== null && val.length > 0, 'Họ tên quản trị viên là bắt buộc'),

  temp_father_name: safeString.refine((val) => val !== null && val.length > 0, 'Tên cha/mẹ là bắt buộc'),

  temp_grandfather_name: safeString.optional(),

  temp_birth_year: z.preprocess(
    (val) => (val === "" || val === null ? null : Number(val)),
    birthYearRule
  ),

  temp_relationship: z.enum(
    ['CON_DE', 'CON_DAU', 'CON_RE', 'CON_NUOI', 'CON_DO_DAU', 'KHAC'],
    { message: 'Quan hệ khai báo không hợp lệ' }
  ),

  temp_branch_name: safeString.optional(),
  temp_address: safeString.optional(),

  temp_note: safeString.refine(
    (val) => val !== null && val.length >= 10,
    'Lời nhắn tới Ban quản trị bắt buộc phải từ 10 ký tự trở lên'
  ),

  // --- KHỐI 2B: THẨM ĐỊNH KHỞI TẠO DÒNG HỌ (ARCH-06 UAT-IMP6 / UAT-BUG11) ---
  setup_purpose: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z
      .enum(['FAMILY_START', 'CLAN_DIGITIZE', 'FAMILY_CONNECT', 'OTHER'], {
        message: 'Vui lòng chọn mục đích khởi tạo dòng họ hợp lệ.',
      })
      .optional()
  ),
  known_generations: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z
      .enum(['1_2', '3_4', '5_PLUS'], {
        message: 'Vui lòng chọn phạm vi số đời dự kiến hợp lệ.',
      })
      .optional()
  ),
  earliest_ancestor_name: safeString.optional(),
  clan_origin_place: safeString.optional(),
  elder_name: safeString.optional(),
  elder_phone: safeString.optional(),

  // --- KHỐI 3: THIẾT LẬP TÀI KHOẢN ---
  phone: phoneRule,
  email: emailRule,
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

export default createClanSchema;
