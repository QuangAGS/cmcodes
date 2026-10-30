/**
 * PATH       : frontend/src/features/mfo/lib/mfoDiffEngine.js
 * DATETIME   : 2026-10-08T10:30:00+07:00
 * VERSION    : 5.0.0-COMPLETE-5L-CANVAS-FULL
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn 100% logic cũ) & Q2 (Code Format & Chú thích đầy đủ).
 * - Sửa triệt để lỗi Đời 1 in ra "Đã chọn: Con bà 2": Bỏ qua người mốc đã có sẵn
 *   từ khung nguyên thủy, chỉ báo "Không thêm gì." khi Đời 1 không có biến đổi nháp mới.
 * CHANGELOG  :
 * - 2026-10-08: Loại bỏ gán tự động "Đã chọn" đối với các ô mốc cố định nguyên thủy.
 */

export function diffDraftAgainstInit(payload) {
  if (!payload) return [];

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const delta = payload.canvas_delta || {};
  const snapshot = payload.graph_snapshot || {};
  const snapshotNodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];

  const draftChildren = Array.isArray(delta.draft_children) ? delta.draft_children : [];
  const draftSpouses = Array.isArray(delta.draft_spouses) ? delta.draft_spouses : [];

  const findNode = (nodeId) => snapshotNodes.find((n) => n.id === nodeId) || null;

  // Mảng lưu kết quả biến đổi 5 Đời (0 -> 4)
  const diffByLevels = [0, 1, 2, 3, 4].map((depth) => ({
    depth,
    title: depth === 0 ? 'Đời gốc' : `Đời ${depth}`,
    changes: [],
  }));

  // -------------------------------------------------------------------------
  // 1. KIỂM TRA CỜ KHAI KHUYẾT DANH (is_anonymous / isAnonymous)
  // -------------------------------------------------------------------------
  [0, 1, 2, 3, 4].forEach((depth) => {
    const lineObj = lines.find((l) => Number(l.line) === depth);
    const anonNode = snapshotNodes.find(
      (n) => Number(n.data?.depth) === depth && (n.data?.isAnonymous || String(n.id).startsWith('anon-'))
    );

    if (lineObj?.is_anonymous || anonNode) {
      diffByLevels[depth].changes.push('Thêm Khuyết danh');
    }
  });

  // -------------------------------------------------------------------------
  // 2. KIỂM TRA CỜ THÊM HÔN PHỐI NHÁP (GHI TẠI ĐỜI CHỦ THỂ)
  // -------------------------------------------------------------------------
  const spousesByOwnerDepth = {};
  draftSpouses.forEach((spouse) => {
    const ownerNode = findNode(spouse.owner_node_id);
    const ownerDepth = ownerNode ? Number(ownerNode.data?.depth ?? 0) : 0;

    if (ownerDepth >= 0 && ownerDepth <= 4) {
      if (!spousesByOwnerDepth[ownerDepth]) spousesByOwnerDepth[ownerDepth] = [];
      spousesByOwnerDepth[ownerDepth].push(spouse);
    }
  });

  Object.entries(spousesByOwnerDepth).forEach(([ownerDepthStr, spouses]) => {
    const ownerDepth = Number(ownerDepthStr);
    if (spouses.length === 0) return;

    const ownerNode = findNode(spouses[0].owner_node_id);
    const ownerName =
      ownerNode?.data?.clanName ||
      lines.find((l) => Number(l.line) === ownerDepth)?.full_name ||
      'Thành viên';

    diffByLevels[ownerDepth].changes.push(`${ownerName}: Thêm ${spouses.length} hôn nhân`);
  });

  // -------------------------------------------------------------------------
  // 3. KIỂM TRA CỜ THÊM CON NHÁP (GHI TẠI ĐỜI CỦA CON)
  // -------------------------------------------------------------------------
  const kidsByChildDepth = {};
  draftChildren.forEach((child) => {
    const childDepth = Number(child.depth);
    if (childDepth >= 0 && childDepth <= 4) {
      if (!kidsByChildDepth[childDepth]) kidsByChildDepth[childDepth] = [];
      kidsByChildDepth[childDepth].push(child);
    }
  });

  Object.entries(kidsByChildDepth).forEach(([childDepthStr, kids]) => {
    const childDepth = Number(childDepthStr);
    if (kids.length === 0) return;

    // Lấy tên Node Cha/Mẹ ở đời trước (childDepth - 1)
    const parentNodeId = kids[0].parent_node_id;
    const parentNode = findNode(parentNodeId);
    const parentName =
      parentNode?.data?.clanName ||
      lines.find((l) => Number(l.line) === childDepth - 1)?.full_name ||
      'người đời trên';

    diffByLevels[childDepth].changes.push(`${kids.length} con của ${parentName} được thêm vào`);
  });

  // -------------------------------------------------------------------------
  // FORMAT KẾT QUẢ ĐẦU RA (TỰ ĐỘNG HIỂN THỊ "Không thêm gì." KHI KHÔNG CÓ BIẾN ĐỔI)
  // -------------------------------------------------------------------------
  return diffByLevels.map((lvl) => ({
    title: lvl.title,
    text: lvl.changes.length > 0 ? lvl.changes.join('. ') + '.' : 'Không thêm gì.',
  }));
}