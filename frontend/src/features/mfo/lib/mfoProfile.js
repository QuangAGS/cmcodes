/**
 * PATH       : frontend/src/features/mfo/lib/mfoProfile.js
 * DATETIME   : 2026-10-19T11:45:00+07:00
 * VERSION    : 3.0.4-E4-ALIAS
 * DESCRIPTION: Bổ sung branch_id và alias vào whitelist cleanProfile để lưu thông tin Chi/nhánh và Tên khác ở Cửa 2.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích có thời gian.
 *
 * CHANGE LOG :
 * - 2026-10-13T14:57:00+07:00 | 3.0.2 | Tạo danh sách đúng key từ canvas_delta.
 * - 2026-10-19T07:25:00+07:00 | 3.0.3 | Thêm 'branch_id' vào mảng keys của cleanProfile.
 * - 2026-10-19T11:45:00+07:00 | 3.0.4 | Thêm 'alias' vào mảng keys của cleanProfile (E4 FIX).
 */

export function getProfileItems(delta = {}) {
  return [...(delta.draft_children || []).map(r => ({
    key: r.id,
    nodeId: r.id,
    kind: 'child',
    label: r.label
  })), ...(delta.draft_spouses || []).map(r => ({
    key: r.union_id,
    nodeId: r.owner_node_id,
    kind: 'spouse',
    label: r.partner_name
  }))].filter(r => r.key);
}

export function profileError(smp = {}, kind) {
  if (typeof smp.is_clan !== 'boolean') return 'MFO_CLAN_UNCONFIRMED';
  if (!String(smp.full_name || '').trim() || !['NAM', 'NU'].includes(smp.gender) || typeof smp.is_alive !== 'boolean') return 'MFO_SMP_INVALID';
  if (kind === 'child' && !['CON_DE', 'CON_RE', 'CON_DAU', 'CON_NUOI'].includes(smp.child_type)) return 'MFO_SMP_INCOMPLETE';
  for (const prefix of ['birth', 'death']) {
    for (const [part, max] of [['day', 31], ['month', 12], ['year', 3000]]) {
      const n = smp[`${prefix}_${part}`];
      if (n != null && n !== '' && (!Number.isInteger(Number(n)) || Number(n) < 1 || Number(n) > max)) return 'MFO_SMP_INVALID';
    }
  }
  return null;
}

export function cleanProfile(smp = {}, kind) {
  const keys = [
    'full_name', 
    'alias',
    'gender', 
    'is_alive', 
    'is_clan', 
    'branch_id', 
    'birth_day', 'birth_month', 'birth_year', 
    'death_day', 'death_month', 'death_year', 
    'is_birth_lunar', 
    'is_death_lunar', 'death_note', 
    'note', 
    'is_anonymous'
  ];
  if (kind === 'child') keys.push('child_type');
  const out = Object.fromEntries(keys.filter(key => smp[key] !== undefined).map(key => [key, smp[key]]));
  out.full_name = String(out.full_name || '').trim();
  if (out.alias !== undefined) out.alias = String(out.alias || '').trim() || null;
  return out;
}

export function submissionError(items, staging, nodes = []) {
  const keys = new Set(items.map(item => item.key));
  if (nodes.some(n => n.data?.isAnonymous && String(n.id).startsWith('kd-') && !keys.has(n.id))) return 'MFO_SMP_INCOMPLETE';
  if (items.some(item => typeof staging[item.key]?.is_clan !== 'boolean')) return 'MFO_CLAN_UNCONFIRMED';
  if (items.some(item => profileError(staging[item.key], item.kind))) return 'MFO_SMP_INCOMPLETE';
  return null;
}

export function projectProfiles(nodes, staging) {
  return nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      ...(staging[node.id]?.full_name ? {
        clanName: staging[node.id].full_name
      } : {}),
      tabs: (node.data?.tabs || []).map(tab => ({
        ...tab,
        ...(staging[tab.unionId]?.full_name ? {
          partnerName: staging[tab.unionId].full_name
        } : {})
      }))
    }
  }));
}

export function stagingDataOf(response) {
  const data = response?.data?.data ?? response?.data ?? response;
  return data?.smp_staging_data || data?.ticket?.payload?.smp_staging_data || null;
}