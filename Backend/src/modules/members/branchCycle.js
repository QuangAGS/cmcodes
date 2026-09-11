/**
 * PATH       : src/modules/members/branchCycle.js
 * DATETIME   : 2026-09-10T16:10:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Cấm parent = self và vòng trên cây chi (cùng tenant / ALS).
 */

'use strict';

const { prisma } = require('../../lib/prisma.js');

function deny(message, code = 'BRANCH_PARENT') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  err.isOperational = true;
  throw err;
}

async function assertParentAllowed(branchId, parentId) {
  if (!parentId) return;
  const pid = String(parentId);
  if (branchId && String(branchId) === pid) {
    deny('Chi không thể là cha của chính nó.');
  }
  const parent = await prisma.branches.findFirst({
    where: { id: pid, deleted_at: null },
    select: { id: true },
  });
  if (!parent) deny('Chi cha không tồn tại hoặc khác dòng họ.', 'BRANCH_PARENT_NOT_FOUND');

  if (!branchId) return;

  let cursor = pid;
  const seen = new Set();
  while (cursor) {
    if (cursor === String(branchId)) deny('Không chọn chi con (hoặc cháu) làm cha — tạo vòng.');
    if (seen.has(cursor)) deny('Cây chi đang có vòng, không lưu.');
    seen.add(cursor);
    const row = await prisma.branches.findFirst({
      where: { id: cursor, deleted_at: null },
      select: { parent_id: true },
    });
    cursor = row && row.parent_id ? String(row.parent_id) : null;
  }
}

module.exports = { assertParentAllowed };
