/**
 * PATH       : backend/src/shared/frameworks/srpf/registry/ProcessDefinitionRegistry.js
 * DATETIME   : 2026-10-09T13:55:00+07:00
 * VERSION    : 1.1.0-SRPF-REGISTRY-BOOTSTRAPPED
 * DESCRIPTION:
 * - Kho đăng ký tập trung cho các Process Definition thuộc hạ tầng SRPF.
 * - Hỗ trợ nạp đa hình: register(definition) hoặc register(processType, definition).
 * - Tự động nạp và kích hoạt 2 tiến trình MFO_PLAN (Gate 1) và MFO_RESULT (Gate 2).
 */

'use strict';

/** @type {Map<string, object>} */
const _registry = new Map();

/**
 * Đăng ký một Process Definition vào Registry.
 * Hỗ trợ cả 2 dạng gọi:
 * - register(definitionObject)
 * - register(processTypeString, definitionObject)
 *
 * @param {string|object} processTypeOrDef
 * @param {object} [maybeDefinition]
 */
function register(processTypeOrDef, maybeDefinition) {
  let processType = processTypeOrDef;
  let definition = maybeDefinition;

  // Xử lý trường hợp truyền trực tiếp definition object có thuộc tính processType
  if (typeof processTypeOrDef === 'object' && processTypeOrDef !== null && !maybeDefinition) {
    definition = processTypeOrDef;
    processType = definition.processType;
  }

  if (!processType || typeof processType !== 'string') {
    throw new Error('[SRPF Registry] ProcessDefinition bắt buộc phải có processType hợp lệ kiểu string.');
  }

  if (!definition || typeof definition !== 'object') {
    throw new Error(`[SRPF Registry] ProcessDefinition cho tiến trình "${processType}" phải là một object.`);
  }

  _registry.set(processType, definition);
  console.log(`[SRPF Registry] SUCCESS: Registered processType [${processType}]`);
}

/**
 * Lấy Process Definition theo tên tiến trình.
 * @param {string} processType
 * @returns {object|undefined}
 */
function get(processType) {
  return _registry.get(processType);
}

/**
 * Kiểm tra tiến trình đã được đăng ký hay chưa.
 * @param {string} processType
 * @returns {boolean}
 */
function has(processType) {
  return _registry.has(processType);
}

/**
 * Lấy danh sách tên tất cả các tiến trình đã đăng ký.
 * @returns {string[]}
 */
function list() {
  return Array.from(_registry.keys());
}

/**
 * Xóa sạch registry (phục vụ viết Unit Test).
 */
function clear() {
  _registry.clear();
}

// ---------------------------------------------------------------------------
// TỰ ĐỘNG ĐĂNG KÝ CÁC TIẾN TRÌNH SRPF CỦA TOÀN HỆ THỐNG
// ---------------------------------------------------------------------------
try {
  const mfoPlanProcessDefinition = require('../../../../modules/mfo/definitions/mfoPlanProcess.definition');
  const mfoResultProcessDefinition = require('../../../../modules/mfo/definitions/mfoResultProcess.definition');

  if (mfoPlanProcessDefinition) {
    register(mfoPlanProcessDefinition);
  }
  if (mfoResultProcessDefinition) {
    register(mfoResultProcessDefinition);
  }
} catch (error) {
  console.error('[SRPF Registry BOOT ERROR] Không thể tự động nạp MFO Process Definitions:', error);
}

module.exports = {
  register,
  get,
  has,
  list,
  clear,
};