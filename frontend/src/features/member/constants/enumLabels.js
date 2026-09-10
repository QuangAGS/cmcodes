/**
 * PATH       : src/features/member/constants/enumLabels.js
 * DATETIME   : 2026-09-09T17:35:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Enum API → nhãn Việt. Tái dùng ENUM_LABELS OP + kind chỗ ở.
 */

import { ENUM_LABELS } from '../../onboarding/constants/opFieldLabels.js';

export const RESIDENCE_KIND_LABELS = {
  ORIGIN: 'Quê quán',
  RESIDENCE: 'Nơi ở',
  TEMPORARY: 'Tạm trú',
  LAST: 'Nơi ở cuối',
  RESTING: 'Nơi an nghỉ',
};

export function enumLabel(group, code) {
  if (!code) return '—';
  const key = String(code);
  if (group === 'member_residences_kind') return RESIDENCE_KIND_LABELS[key] || key;
  const bag = ENUM_LABELS[group];
  return (bag && bag[key]) || key;
}

export function genderLabel(code) {
  return enumLabel('members_gender', code);
}

export function residenceKindLabel(code) {
  return enumLabel('member_residences_kind', code);
}
