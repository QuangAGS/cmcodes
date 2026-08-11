/**
 * PATH       : backend/src/shared/frameworks/srpf/registry/ProcessDefinitionRegistry.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Registry for Process Definitions.
 *              Holds the mapping processType → ProcessDefinition.
 *
 * NOTE: Skeleton only — no validation logic yet.
 */

'use strict';

/** @type {Map<string, import('../types/ProcessDefinition.contract').ProcessDefinition>} */
const _registry = new Map();

/**
 * Register a Process Definition.
 * @param {string} processType
 * @param {object} definition
 */
function register(processType, definition) {
  // TODO: validate definition against contract (Phase 3)
  if (_registry.has(processType)) {
    // TODO: decide overwrite policy or throw
  }
  _registry.set(processType, definition);
}

/**
 * Get a registered Process Definition.
 * @param {string} processType
 * @returns {object|undefined}
 */
function get(processType) {
  return _registry.get(processType);
}

/**
 * Check if a processType is registered.
 * @param {string} processType
 * @returns {boolean}
 */
function has(processType) {
  return _registry.has(processType);
}

/**
 * List all registered process types.
 * @returns {string[]}
 */
function list() {
  return Array.from(_registry.keys());
}

/**
 * Clear registry (mainly for tests).
 */
function clear() {
  _registry.clear();
}

module.exports = {
  register,
  get,
  has,
  list,
  clear,
};
