/**
 * ============================================================================
 * PATH       : src/features/register-wizard/utils/joinClanValidation.js
 * DATETIME   : 2026-11-21T11:50:00+07:00
 * VERSION    : 2.2.0-UAT-BUG6-FIX
 * DESCRIPTION:
 * - Đồng bộ thông báo lỗi tiếng Việt thân thiện cho người cao tuổi (EU) và
 *   chuẩn hóa preprocess cho temp_birth_year, temp_note, phone.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { z } from 'zod';
import { safeString, optionalEmailRule, phoneRule, birthYearRule } from '../../../shared/utils/validationRules.js';

export const joinClanSchema = z.object({
  tenantId: z.string().min(1, 'Bác bắt buộc phải chọn một dòng họ từ danh sách.'),
  clanName: z.string().trim(),

  temp_full_name: safeString.refine((val) => val !== null, 'Bác vui lòng nhập họ và tên khai sinh.'),
  temp_father_name: safeString.refine((val) => val !== null, 'Bác vui lòng nhập họ và tên Cha để Ban Quản trị đối chiếu.'),
  temp_grandfather_name: safeString.optional(),

  temp_birth_year: z.preprocess(
    (val) => (val === '' || val === null || typeof val === 'undefined' ? null : Number(val)),
    birthYearRule
  ),

  temp_relationship: z.enum(
    ['CON_DE', 'CON_DAU', 'CON_RE', 'CON_NUOI', 'CON_DO_DAU', 'KHAC'],
    { message: 'Bác vui lòng chọn quan hệ với dòng họ.' }
  ),

  temp_note: safeString.refine(
    (val) => val !== null && val.length > 10,
    'Bác vui lòng nhập lời nhắn gửi Ban Quản trị tối thiểu 11 ký tự.'
  ),
  temp_address: safeString.optional(),
  temp_branch_name: safeString.optional(),
  referrer_name: safeString.optional(),
  referrer_phone: safeString.optional(),

  name: z.string().optional().default(''),
  phone: phoneRule,
  email: optionalEmailRule,
  password: z.string().min(6, 'Mật khẩu đăng nhập cần tối thiểu 6 ký tự.'),
});
