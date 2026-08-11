/**
 * PATH       : backend/src/shared/frameworks/srpf/types/ProcessDefinition.contract.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: JSDoc contract for a Process Definition registered into SRPF.
 *              This file is documentation-only (no runtime exports of value).
 *
 * Source of truth: SRPF Architecture Overview + Pseudo-code v1.1
 *
 * NOTE: Skeleton only.
 */

'use strict';

/**
 * @typedef {Object} ProcessDefinition
 * @property {string} processType
 *           Logical process type (may map to business_process_type enum values).
 *
 * @property {boolean} revisionSupported
 *           Whether this process supports RETURN_FOR_REVISION loop.
 *
 * @property {string[]} supportedStates
 *           Subset of SRPF_STATES that this process uses.
 *
 * @property {Object.<string, string[]>} contextGuards
 *           Map: action → allowed roles (e.g. ['CLAN_ADMIN', 'SYSTEM_ADMIN', 'MEMBER']).
 *
 * @property {function(Object): Promise<boolean|void>} [entryCondition]
 *           Optional. Called before the first meaningful action.
 *           Throw CED error or return false to block.
 *
 * @property {Object.<string, function>} [profileValidation]
 *           Optional. Map: action → async validator(instance, payload).
 *           Used e.g. before APPROVE to check Hard Required fields.
 *
 * @property {Object.<string, function>} [sideEffects]
 *           Optional. Map: terminalState → async sideEffect(instance, tx, actorContext).
 *           MUST run inside the same transaction (v1 policy: no saga).
 *
 * @property {Object.<string, string>} [actionToProcessType]
 *           Optional. Map: action → concrete business_process_type for BPL writing.
 *
 * @property {Object} [transitions]
 *           Optional explicit transition table.
 *           If omitted, StateMachineRunner uses default SRPF transitions.
 */

/**
 * Example shape (not executed):
 *
 * const ExampleDefinition = {
 *   processType: 'MEMBER_PROMOTE',
 *   revisionSupported: true,
 *   supportedStates: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'REJECTED'],
 *   contextGuards: {
 *     SUBMIT: ['MEMBER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'],
 *     APPROVE: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
 *   },
 *   entryCondition: async (ctx) => { ... },
 *   profileValidation: {
 *     APPROVE: async (instance, payload) => { ... },
 *   },
 *   sideEffects: {
 *     APPROVED: async (instance, tx, actor) => { ... },
 *   },
 *   actionToProcessType: {
 *     SUBMIT: 'MEMBER_PROMOTE_SUBMIT',
 *     APPROVE: 'MEMBER_PROMOTE_APPROVE',
 *   },
 * };
 */

module.exports = {};
