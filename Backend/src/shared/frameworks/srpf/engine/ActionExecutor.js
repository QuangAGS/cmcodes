/**
 * PATH       : backend/src/shared/frameworks/srpf/engine/ActionExecutor.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: Core Action Executor of SRPF — CED-aware throws (Phase 3.3).
 */

'use strict';

const { prisma } = require('../../../../lib/prisma.js');
const registry = require('../registry/ProcessDefinitionRegistry');
const contextGuard = require('../guards/ContextGuard');
const stateMachine = require('./StateMachineRunner');
const correlationFactory = require('./CorrelationFactory');
const bplWriter = require('../ledger/BusinessLedgerWriter');
const communicationHook = require('../communication/CommunicationHook');
const processInstanceLoader = require('../storage/ProcessInstanceLoader');
const { isTerminalState } = require('../constants/states');
const { srpfError, SRPF_ERROR_CODES } = require('../errors/srpfCreateError');

/**
 * @param {object} params
 * @param {string} params.processType
 * @param {string} params.instanceId
 * @param {string} params.action
 * @param {object} [params.payload]
 * @param {object} params.actorContext
 */
async function executeAction({
  processType,
  instanceId,
  action,
  payload = {},
  actorContext = {},
}) {
  const definition = registry.get(processType);
  if (!definition) {
    throw srpfError(
      SRPF_ERROR_CODES.PROCESS_NOT_REGISTERED,
      `Process not registered: ${processType}`,
      { details: { processType } }
    );
  }

  const instance = await processInstanceLoader.load(instanceId);

  if (typeof definition.entryCondition === 'function') {
    await definition.entryCondition({
      instance,
      actorContext,
      action,
      payload,
      tx: null,
    });
  }

  await contextGuard.assertAllowed(definition, action, actorContext, instance);

  const currentState = instance.currentState || instance.status;
  const nextState = stateMachine.resolve(definition, currentState, action);
  if (!nextState) {
    throw srpfError(
      SRPF_ERROR_CODES.INVALID_TRANSITION,
      `Invalid transition: ${currentState} + ${action}`,
      { details: { currentState, action, processType } }
    );
  }

  if (definition.profileValidation && typeof definition.profileValidation[action] === 'function') {
    await definition.profileValidation[action](instance, payload);
  }

  const result = await prisma.$transaction(async (tx) => {
    const correlationId = await correlationFactory.create({
      action,
      actorContext,
      tx,
    });

    const actorWithPayload = { ...actorContext, _payload: payload };

    const updated = await stateMachine.apply(tx, instance, nextState, action, payload, {
      actorContext: actorWithPayload,
    });

    if (isTerminalState(nextState) && definition.sideEffects && definition.sideEffects[nextState]) {
      await definition.sideEffects[nextState](updated, tx, actorWithPayload);
    }

    if (correlationId) {
      const concreteProcessType =
        (definition.actionToProcessType && definition.actionToProcessType[action]) || processType;

      await bplWriter.write({
        tx,
        correlationId,
        processType: concreteProcessType,
        action,
        actorContext: actorWithPayload,
        instance: updated,
        metadata: {
          from: currentState,
          to: nextState,
          payload,
        },
      });
    }

    return { instance: updated, correlationId };
  });

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

module.exports = {
  executeAction,
};
