/* Version cũ
const Joi = require('joi');

const schemas = {
  members: Joi.object({
    full_name: Joi.string().required(),
    changed_by: Joi.string().required(),
    change_reason: Joi.string().allow(null, '')
  }),
  branches: Joi.object({
    name: Joi.string().required(),
    changed_by: Joi.string().required(),
    change_reason: Joi.string().allow(null, '')
  })
};

module.exports = schemas;
*/

// Verson mới
// file: src/shared/validations/base.validation.js
const Joi = require('joi');

const schemas = {
  // Schema cho bảng branches
  branches: Joi.object({
    // Chỉ bắt buộc những trường cốt lõi
    name: Joi.string().min(3).required().messages({
      'string.empty': 'Tên chi nhánh không được để trống',
      'string.min': 'Tên chi nhánh phải có ít nhất 3 ký tự'
    }),
    
    // Bắt buộc phải có thông tin Audit để ghi log
    changed_by: Joi.string().required(),
    change_reason: Joi.string().required(),
  }).unknown(true), // <--- CHÌA KHÓA: Cho phép address, phone, parent_id... đi qua thoải mái

  // Schema cho bảng addresses
  addresses: Joi.object({
    full_address: Joi.string().required(),
    changed_by: Joi.string().required(),
    change_reason: Joi.string().required(),
  }).unknown(true),

  // Schema cho bảng worships
    worships: Joi.object({
    name: Joi.string().required(),
    changed_by: Joi.string().required(),
    change_reason: Joi.string().required(),
  }).unknown(true),

  // Cập nhật lại schema members để hỗ trợ BR1
  members: Joi.object({
    // Tab 1: Thông tin cơ bản (Bọc trong memberData)
    memberData: Joi.object({
      full_name: Joi.string().required().messages({
        'string.empty': 'Tên thành viên không được để trống'
      }),
      gender: Joi.string().valid('NAM', 'NU', 'KHAC').required(),
      branch_id: Joi.string().required(),
      // Các trường khác cho phép tự do
    }).unknown(true).required(),

    // Các Tab khác: Cho phép có hoặc không (optional)
    currentAddr: Joi.object().unknown(true).optional(),
    originAddr: Joi.object().unknown(true).optional(),
    biographyData: Joi.object().unknown(true).optional(),
    mediaList: Joi.array().items(Joi.object().unknown(true)).optional(),

    // Thông tin bắt buộc để ghi Log
    changed_by: Joi.string().required(),
    change_reason: Joi.string().required().messages({
      'string.empty': 'Lý do thay đổi không được để trống'
    })
  }).unknown(true) 
};

module.exports = schemas;