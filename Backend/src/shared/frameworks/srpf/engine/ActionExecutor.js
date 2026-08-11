/**
 * PATH       : backend/src/shared/frameworks/srpf/engine/ActionExecutor.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Core Action Executor of SRPF.
 *              Orchestrates Guard → Transition → Side-effect → BPL+audit → Communication.
 *
 * Policies (Architecture v1.1):
 * - 1 important Action = 1 Correlation (except SAVE_DRAFT → no Correlation)
 * - Side-effects are synchronous inside one transaction (no saga in v1)
 * - Communication runs after commit
 *
 * NOTE: Skeleton only — loadInstance / prisma wiring left for Phase 3.
 */

'use strict';

const registry = require('../registry/ProcessDefinitionRegistry');
const contextGuard = require('../guards/ContextGuard');
const stateMachine = require('./StateMachineRunner');
const correlationFactory = require('./CorrelationFactory');
const bplWriter = require('../ledger/BusinessLedgerWriter');
const communicationHook = require('../communication/CommunicationHook');
const { isTerminalState } = require('../constants/states');
const { requiresCorrelation } = require('../constants/actions');

/**
 * Execute an SRPF action.
 *
 * @param {object} params
 * @param {string} params.processType
 * @param {string} params.instanceId
 * @param {string} params.action
 * @param {object} [params.payload]
 * @param {object} params.actorContext
 * @returns {Promise<{ instance: object, correlationId: string|null }>}
 */
async function executeAction({
  processType,
  instanceId,
  action,
  payload = {},
  actorContext,
}) {
  const definition = registry.get(processType);
  if (!definition) {
    // TODO: throw CED SRPF.PROCESS_NOT_REGISTERED
    throw new Error(`[SRPF Skeleton] Process not registered: ${processType}`);
  }

  // TODO (Phase 3): load instance from storage
  // Temporary strategy: onboarding_cases (+ metadata)
  // Long-term note: dedicated process_instances model recommended
  const instance = await loadInstanceStub(instanceId);

  // 1. Context Guard
  await contextGuard.assertAllowed(definition, action, actorContext, instance);

  // 2. Resolve transition
  const nextState = stateMachine.resolve(definition, instance.currentState || instance.status, action);
  if (!nextState) {
    // TODO: throw CED SRPF.INVALID_TRANSITION
    throw new Error(`[SRPF Skeleton] Invalid transition: ${instance.currentState} + ${action}`);
  }

  // 3. Profile validation (if defined for this action)
  if (definition.profileValidation && typeof definition.profileValidation[action] === 'function') {
    await definition.profileValidation[action](instance, payload);
  }

  // 4. Transaction boundary (side-effect + ledger inside TX)
  // TODO (Phase 3): replace with real prisma.$transaction
  const result = await runInTransactionStub(async (tx) => {
    const correlationId = await correlationFactory.create({
      action,
      actorContext,
      tx,
    });

    const updated = await stateMachine.apply(tx, instance, nextState, action, payload);

    // Side-effect only on terminal states, synchronous inside TX
    if (isTerminalState(nextState) && definition.sideEffects && definition.sideEffects[nextState]) {
      await definition.sideEffects[nextState](updated, tx, actorContext);
    }

    // BPL + audit_logs (skipped when no correlationId, e.g. SAVE_DRAFT)
    if (correlationId) {
      const concreteProcessType =
        (definition.actionToProcessType && definition.actionToProcessType[action]) || processType;

      await bplWriter.write({
        tx,
        correlationId,
        processType: concreteProcessType,
        action,
        actorContext,
        instance: updated,
        metadata: {
          from: instance.currentState || instance.status,
          to: nextState,
          payload,
        },
      });
    }

    return { instance: updated, correlationId };
  });

  // 5. After-commit communication
  if (result.correlationId) {
    await communicationHook.emit({
      event: `${processType}_${action}`,
      correlationId: result.correlationId,
      instance: result.instance,
      actorContext,
    });
  }

  return result;
}

/**
 * Stub — replace with real loader in Phase 3.
 * @param {string} instanceId
 */
async function loadInstanceStub(instanceId) {
  // TODO: load from onboarding_cases (temporary) or process_instances (preferred long-term)
  throw new Error(`[SRPF Skeleton] loadInstance not implemented for id=${instanceId}`);
}

/**
 * Stub transaction runner — replace with prisma.$transaction in Phase 3.
 * @param {function} fn
 */
async function runInTransactionStub(fn) {
  // No real TX in skeleton
  const fakeTx = {};
  return fn(fakeTx);
}

module.exports = {
  executeAction,
};
