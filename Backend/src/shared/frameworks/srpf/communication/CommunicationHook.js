/**
 * PATH       : backend/src/shared/frameworks/srpf/communication/CommunicationHook.js
 * DATETIME   : 2026-08-13T14:45:00+07:00
 * VERSION    : 0.7.1-phase3.4
 * DESCRIPTION: After-commit communication hook for SRPF.
 *              Maps SRPF logical events → notification_event enum (schema).
 *              Uses silentEmit → notificationOrchestrator (Register UAT path).
 *
 * Policy:
 * - After TX commit only
 * - Failure must NOT break business success
 * - No correlationId → no emit
 */

'use strict';

const path = require('path');

/**
 * SRPF logical event (Executor: `${processType}_${action}`)
 * → Prisma enum notification_event
 */
const SRPF_EVENT_TO_NOTIFICATION_EVENT = Object.freeze({
  MEMBER_PROMOTE_SUBMIT: 'ONBOARDING_SUBMITTED',
  MEMBER_PROMOTE_START_REVIEW: 'ONBOARDING_UNDER_REVIEW',
  MEMBER_PROMOTE_RETURN_FOR_REVISION: 'ONBOARDING_REVISION_REQUESTED',
  MEMBER_PROMOTE_APPROVE: 'ONBOARDING_APPROVED',
  MEMBER_PROMOTE_REJECT: 'ONBOARDING_REJECTED',
  MEMBER_PROMOTE_CANCEL: 'ONBOARDING_CANCELLED',
  MEMBER_PROMOTE_WITHDRAW: 'ONBOARDING_CANCELLED',
  MEMBER_PROMOTE_SAVE_DRAFT: null, // no emit expected without correlation anyway
});

/** Default Vietnamese copy (orchestrator catalog may still apply by enum name) */
const NOTIFICATION_EVENT_TEXT = Object.freeze({
  ONBOARDING_SUBMITTED: {
    title: 'Hồ sơ thành viên đã được gửi',
    content: 'Hồ sơ đề nghị chính thức hóa thành viên đã được gửi để xem xét.',
  },
  ONBOARDING_UNDER_REVIEW: {
    title: 'Hồ sơ đang được xem xét',
    content: 'Ban quản trị đang xem xét hồ sơ thành viên của bác.',
  },
  ONBOARDING_REVISION_REQUESTED: {
    title: 'Yêu cầu bổ sung hồ sơ',
    content: 'Hồ sơ cần được bổ sung / chỉnh sửa trước khi phê duyệt.',
  },
  ONBOARDING_APPROVED: {
    title: 'Thành viên đã được chính thức hóa',
    content: 'Hồ sơ của bác đã được phê duyệt. Trạng thái thành viên: Chính thức.',
  },
  ONBOARDING_REJECTED: {
    title: 'Hồ sơ chưa được phê duyệt',
    content: 'Hồ sơ đề nghị chính thức hóa thành viên chưa được phê duyệt.',
  },
  ONBOARDING_CANCELLED: {
    title: 'Hồ sơ đã được hủy',
    content: 'Tiến trình chính thức hóa thành viên đã được hủy.',
  },
});

function loadSilentEmit() {
  const candidates = [
    path.join(__dirname, '../../../../modules/notifications/services/silentNotificationEmit.service.js'),
    path.join(__dirname, '../../../modules/notifications/services/silentNotificationEmit.service.js'),
  ];

  for (const p of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(p);
      if (mod && typeof mod.silentEmit === 'function') return mod.silentEmit;
    } catch (_) {
      /* next */
    }
  }

  try {
    // eslint-disable-next-line global-require
    const mod = require('../../../../modules/notifications/services/silentNotificationEmit.service');
    if (mod && typeof mod.silentEmit === 'function') return mod.silentEmit;
  } catch (_) {
    /* ignore */
  }

  return null;
}

function resolveUserId(instance, actorContext) {
  if (instance && instance.user_id) return instance.user_id;
  const actor = actorContext && (actorContext.user_id || actorContext.actor_id);
  if (actor && /^[0-9a-f-]{36}$/i.test(actor)) return actor;
  return null;
}

/**
 * Map SRPF event string to notification_event enum value.
 * @param {string} srpfEvent
 * @returns {string|null}
 */
function toNotificationEvent(srpfEvent) {
  if (!srpfEvent) return null;
  if (Object.prototype.hasOwnProperty.call(SRPF_EVENT_TO_NOTIFICATION_EVENT, srpfEvent)) {
    return SRPF_EVENT_TO_NOTIFICATION_EVENT[srpfEvent];
  }
  // Already a valid-looking ONBOARDING_* name from caller
  if (typeof srpfEvent === 'string' && srpfEvent.startsWith('ONBOARDING_')) {
    return srpfEvent;
  }
  return null;
}

/**
 * @param {object} params
 * @param {string} params.event - e.g. MEMBER_PROMOTE_SUBMIT
 * @param {string|null} params.correlationId
 * @param {object} params.instance
 * @param {object} params.actorContext
 */
async function emit({ event, correlationId, instance, actorContext }) {
  if (!correlationId) {
    return null;
  }

  const notificationEvent = toNotificationEvent(event);
  if (!notificationEvent) {
    // eslint-disable-next-line no-console
    console.warn('[SRPF CommunicationHook] skip emit — unmapped event_type', {
      event,
      correlationId,
    });
    return null;
  }

  const userId = resolveUserId(instance, actorContext);
  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn('[SRPF CommunicationHook] skip emit — no userId', {
      event,
      notificationEvent,
      correlationId,
      instanceId: instance && instance.id,
    });
    return null;
  }

  const silentEmit = loadSilentEmit();
  if (!silentEmit) {
    // eslint-disable-next-line no-console
    console.warn('[SRPF CommunicationHook] silentEmit not found — skip');
    return null;
  }

  const text = NOTIFICATION_EVENT_TEXT[notificationEvent] || {};

  try {
    return await silentEmit(
      notificationEvent,
      {
        userId,
        correlationId,
        correlation_id: correlationId,
        title: text.title,
        content: text.content,
        metadata: {
          source: 'SRPF',
          srpf_event: event,
          notification_event: notificationEvent,
          instance_id: instance && instance.id,
          process_storage: instance && instance._storage,
          case_type: instance && instance.case_type,
          status: instance && (instance.currentState || instance.status),
        },
        executeImmediately: false,
      },
      {
        source: 'SRPF.CommunicationHook',
        instanceId: instance && instance.id,
      }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SRPF CommunicationHook] emit failed', {
      event,
      notificationEvent,
      correlationId,
      message: err && err.message,
    });
    return null;
  }
}

module.exports = {
  emit,
  resolveUserId,
  toNotificationEvent,
  SRPF_EVENT_TO_NOTIFICATION_EVENT,
  NOTIFICATION_EVENT_TEXT,
};
