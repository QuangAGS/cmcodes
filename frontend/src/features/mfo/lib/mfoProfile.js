/**
 * PATH       : frontend/src/features/mfo/lib/mfoProfile.js
 * DATETIME   : 2026-10-13T14:57:00+07:00
 * VERSION    : 3.0.2-LAT3-MINIMAL
 * DESCRIPTION: Validation, whitelist và chiếu tên; không tạo API hoặc canvas mới.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích có thời gian.
 */
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Tạo danh sách đúng key được BE nhận từ canvas_delta, không suy key từ snapshot.
 */
export function getProfileItems(delta = {}) {
  return [...(delta.draft_children || []).map(r => ({
    key: r.id,
    nodeId: r.id,
    kind: 'child',
    label: r.label,
    siblingSeq: r.sibling_seq || null
  })), ...(delta.draft_spouses || []).map(r => ({
    key: r.union_id,
    nodeId: r.owner_node_id,
    kind: 'spouse',
    label: r.partner_name
  }))].filter(r => r.key);
}
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Nội tộc phải boolean; false hợp lệ. Kiểm tra các trường bắt buộc và ngày thành phần.
 */
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
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Whitelist hồ sơ: không chuyển đời, cha, mẹ hoặc thứ tự con từ form lên BE.
 */
export function cleanProfile(smp = {}, kind) {
  const keys = ['full_name', 'gender', 'is_alive', 'is_clan', 'birth_day', 'birth_month', 'birth_year', 'death_day', 'death_month', 'death_year', 'is_birth_lunar', 'is_death_lunar', 'death_note', 'note', 'is_anonymous'];
  if (kind === 'child') keys.push('child_type', 'sibling_seq', 'child_order'); // 🌟 Thêm child_order
  const out = Object.fromEntries(keys.filter(key => smp[key] !== undefined).map(key => [key, smp[key]]));
  out.full_name = String(out.full_name || '').trim();
  return out;
}
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Lỗi chưa đủ hồ sơ: nội tộc ưu tiên riêng; key không thuộc delta không được gửi staging.
 */
export function submissionError(items, staging, nodes = []) {
  const keys = new Set(items.map(item => item.key));
  if (nodes.some(n => n.data?.isAnonymous && String(n.id).startsWith('kd-') && !keys.has(n.id))) return 'MFO_SMP_INCOMPLETE';
  if (items.some(item => typeof staging[item.key]?.is_clan !== 'boolean')) return 'MFO_CLAN_UNCONFIRMED';
  if (items.some(item => profileError(staging[item.key], item.kind))) return 'MFO_SMP_INCOMPLETE';
  return null;
}
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Chiếu họ tên trên cây mà không mutate ID, vị trí hoặc cạnh; hôn phối theo union_id.
 */
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
/**
 * <2026-10-13T14:57:00+07:00>
 * Mục đích: Unwrap kết quả staging sẵn có, không phát sinh request GET thứ hai.
 */
export function stagingDataOf(response) {
  const data = response?.data?.data ?? response?.data ?? response;
  return data?.smp_staging_data || data?.ticket?.payload?.smp_staging_data || null;
}
