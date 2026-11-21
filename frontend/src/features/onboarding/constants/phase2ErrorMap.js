/**
 * ============================================================================
 * PATH       : src/features/onboarding/constants/phase2ErrorMap.js
 * DATETIME   : 2026-11-21T09:45:00+07:00
 * VERSION    : 1.1.0-ISO29148-UAT-IMP3
 * DESCRIPTION: Ánh xạ mã lỗi HTTP sang từ điển thông báo tập trung
 *              PHASE2_MESSAGE_CATALOG (bảo toàn export PHASE2_ERROR_MAP [Q2]).
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { PHASE2_MESSAGE_CATALOG } from './phase2MessageCatalog.js';

export const PHASE2_ERROR_MAP = Object.freeze(
  Object.keys(PHASE2_MESSAGE_CATALOG).reduce((acc, code) => {
    const item = PHASE2_MESSAGE_CATALOG[code];
    acc[code] = {
      type: item.type,
      title: item.title,
      message: item.message,
      action: item.action,
      actionLabel: item.actionLabel,
    };
    return acc;
  }, {})
);
