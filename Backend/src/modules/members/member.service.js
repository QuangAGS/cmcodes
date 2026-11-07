/**
 * PATH: src/modules/members/member.service.js
 * DATETIME: 2026-11-02T15:30:00+07:00
 * VERSION: 1.9.0-FTDI-STEP3-DUAL-WRITE
 * DESCRIPTION:
 * - Tích hợp Dual-write FTDI Bước 3: Đồng bộ quan hệ phụ mẫu vào bảng parentages qua parentage.mapper.js khi tạo thành viên.
 * - Tự động bảo vệ bằng Advisory Lock và Cycle Check (isNewChild: true) không gây nghẽn hiệu năng.
 * - Bảo tồn 100% logic tạo Address, Member, Biographies và Audit Log hiện có.
 */

const { prisma } = require('../../lib/prisma.js');
const auditService = require('../../services/audit.service');
const dataIntegrityService = require('../../services/dataIntegrity.service');
const { syncMemberParentages, flushParentageAudit } = require('../genealogy/parentage.mapper.js');

const memberService = {
  /**
   * CREATE FULL MEMBER: Lưu đồng thời vào nhiều bảng (Transaction).
   * @param {Object} payload - Dữ liệu từ Controller gửi xuống (bao gồm Metadata).
   * @param {String} tenantId - ID dòng họ lấy từ Context.
   */
  createFullMember: async (payload, tenantId, actor = null) => {
    const { memberData, currentAddr, biographyData, changed_by, change_reason } = payload;

    return await prisma.$transaction(async (tx) => {
      /**
       * -------------------------------------------------------------------
       * 🏛️ STEP 1: Tạo bản ghi Address (Địa chỉ hiện tại)
       * -------------------------------------------------------------------
       */
      let curId = null;
      if (currentAddr?.full_address) {
        const addr = await tx.addresses.create({
          data: { ...currentAddr, tenant_id: tenantId, changed_by },
        });
        curId = addr.id;
        await auditService.logAction('THEM_MOI', 'addresses', addr.id, null, addr, changed_by, 'Đi kèm tạo mới thành viên', tenantId);
      }

      /**
       * -------------------------------------------------------------------
       * 👤 STEP 2: Tạo bản ghi cốt lõi trong bảng Members
       * -------------------------------------------------------------------
       */
      const {
        created_by: _ignoreCreatedBy,
        created_by_member_id: _ignoreCreatedByMember,
        changed_by: _ignoreChangedBy,
        tenant_id: _ignoreTenant,
        ...safeMemberData
      } = memberData || {};

      let createdByMemberId = payload.created_by_member_id || null;
      if (changed_by && !createdByMemberId) {
        const actorUser = await tx.users.findFirst({
          where: { id: changed_by, deleted_at: null },
          select: { member_id: true },
        });
        createdByMemberId = actorUser?.member_id || null;
      }

      const member = await tx.members.create({
        data: {
          ...safeMemberData,
          tenant_id: tenantId,
          current_address_id: curId,
          changed_by,
          created_by: changed_by || null,
          created_by_member_id: createdByMemberId,
        },
      });

      /**
       * -------------------------------------------------------------------
       * 🌿 STEP 2.5: FTDI DUAL-WRITE — ĐỒNG BỘ VÀO BẢNG PARENTAGES (BƯỚC 3)
       * -------------------------------------------------------------------
       */
      const fatherId = safeMemberData.father_id || null;
      const motherId = safeMemberData.mother_id || null;
      const parentUnionId = safeMemberData.parent_union_id || null;
      const childType = safeMemberData.child_type || 'CON_DE';

      if (fatherId || motherId) {
        const auditQueue = [];
        await syncMemberParentages(tx, {
          tenantId,
          childId: member.id,
          fatherId,
          motherId,
          unionId: parentUnionId,
          childType,
          actorId: changed_by,
          correlationId: payload.correlationId || null,
          isNewChild: true,
          auditQueue,
          ticketId: 'OP_MEMBER_CREATE',
        });
        await flushParentageAudit(tx, auditQueue);
      }

      /**
       * -------------------------------------------------------------------
       * 📖 STEP 3: Tạo bản ghi Tiểu sử (Biographies) đi kèm nếu có
       * -------------------------------------------------------------------
       */
      if (biographyData) {
        const bio = await tx.biographies.create({
          data: { ...biographyData, member_id: member.id, tenant_id: tenantId, changed_by },
        });
        await auditService.logAction('THEM_MOI', 'biographies', bio.id, null, bio, changed_by, 'Đi kèm tạo mới thành viên', tenantId);
      }

      /**
       * -------------------------------------------------------------------
       * 🔬 STEP 4: Nhật ký kiểm toán (Audit Logs) & Kiểm tra tính toàn vẹn
       * -------------------------------------------------------------------
       */
      await auditService.logAction('THEM_MOI', 'members', member.id, null, member, changed_by, change_reason, tenantId);

      return member;
    });
  },

  // =========================================================================
  // KHỐI TIẾN TRÌNH: KIỂM TRA SỨC KHỎE DỮ LIỆU & DỰNG CÂY (GIỮ NGUYÊN 100%)
  // =========================================================================

  getMemberTreeData: async (branchId) => {
    const all = await prisma.members.findMany({
      where: { 
        branch_id: branchId,
        deleted_at: null 
      },
      include: {
        marriages_as_husband: { 
          include: { members_marriages_wife_idTomembers: true } 
        },
        marriages_as_wife: { 
          include: { members_marriages_husband_idTomembers: true } 
        }
      }
    });

    let changed = true;
    while (changed) {
      changed = false;
      all.forEach(m => {
        const parent = all.find(p => p.id === m.father_id || p.id === m.mother_id);
        if (parent && m.generation === null && parent.generation !== null) {
          m.generation = parent.generation + 1;
          changed = true;
        }
      });
    }

    const healthIssues = dataIntegrityService.checkBranchHealth(all);
    const tree = memberService.buildTreeLogic(all);

    return {
      tree,
      healthIssues,
      stats: {
        totalMembers: all.length,
        issueCount: healthIssues.length
      }
    };
  },

  buildTreeLogic: (members) => {
    if (members.length === 0) return [];
    
    const sortedMembers = [...members].sort((a, b) => (a.generation || 0) - (b.generation || 0));
    const map = {};
    
    sortedMembers.forEach(m => { 
      map[m.id] = { ...m, children: [], partners: [] }; 
    });

    sortedMembers.forEach(m => {
      const marriages = [...(m.marriages_as_husband || []), ...(m.marriages_as_wife || [])];
      marriages.forEach(rel => {
        const spouse = rel.members_marriages_wife_idTomembers || rel.members_marriages_husband_idTomembers;
        if (spouse || rel.spouse_name_literal) {
          map[m.id].partners.push({ 
            id: spouse?.id || null, 
            full_name: rel.spouse_name_literal || spouse?.full_name,
            relation_type: rel.relation_type
          });
        }
      });
    });

    const roots = [];
    sortedMembers.forEach(m => {
      const pId = m.father_id || m.mother_id;
      if (pId && map[pId]) {
        map[pId].children.push(map[m.id]);
      } else {
        roots.push(map[m.id]);
      }
    });

    return roots;
  },

  getAllMembers(tenantId, filters = {}) {
    if (!tenantId) {
      const err = new Error('Thiếu tenantId.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      err.isOperational = true;
      throw err;
    }

    const where = {
      tenant_id: tenantId,
      deleted_at: null,
    };

    const includePending =
      filters.includePending === true ||
      filters.includePending === 'true' ||
      filters.includePending === '1';

    const status = filters.status ? String(filters.status).toUpperCase() : null;

    if (includePending || status === 'ALL') {
      // no status filter
    } else if (status) {
      where.status = status;
    } else {
      where.status = 'CHINH_THUC';
    }

    const q = String(filters.q || '').trim();
    if (q.length >= 2) {
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { alias: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.is_clan === 'true' || filters.is_clan === true) {
      where.is_clan = true;
    } else if (filters.is_clan === 'false' || filters.is_clan === false) {
      where.is_clan = false;
    }

    if (filters.gender) {
      const g = String(filters.gender).toUpperCase();
      if (g === 'NAM' || g === 'NU' || g === 'KHAC') where.gender = g;
    }

    if (filters.is_alive === 'true' || filters.is_alive === true) where.is_alive = true;
    if (filters.is_alive === 'false' || filters.is_alive === false) where.is_alive = false;

    let take = Number(filters.limit);
    if (!Number.isInteger(take) || take < 1) take = 20;
    if (take > 50) take = 50;

    return prisma.members.findMany({
      where,
      orderBy: [{ full_name: 'asc' }],
      take,
    });
  },

  getMemberById: async (id, tenantId) => {
    const where = { id, deleted_at: null };
    if (tenantId) where.tenant_id = tenantId;

    const member = await prisma.members.findFirst({ where });
    if (!member) {
      const err = new Error('Không tìm thấy thành viên.');
      err.statusCode = 404;
      err.code = 'MEMBER_NOT_FOUND';
      throw err;
    }
    return member;
  },

  updateFullMember: async (id, body, tenantId) => {
    const existing = await memberService.getMemberById(id, tenantId);

    const allowed = [
      'full_name',
      'alias',
      'gender',
      'is_alive',
      'birth_year',
      'birth_month',
      'birth_day',
      'is_birth_lunar',
      'birth_note',
      'generation',
      'note',
      'phone_number',
      'email',
      'child_type',
      'role',
    ];

    const data = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        data[key] = body[key];
      }
    }

    for (const numKey of ['birth_year', 'birth_month', 'birth_day', 'generation']) {
      if (data[numKey] === '' || data[numKey] === undefined) {
        // không đụng nếu client không gửi
      } else if (data[numKey] === null) {
        data[numKey] = null;
      } else if (typeof data[numKey] === 'string' && data[numKey].trim() === '') {
        data[numKey] = null;
      } else if (data[numKey] != null) {
        const n = Number(data[numKey]);
        data[numKey] = Number.isFinite(n) ? n : null;
      }
    }

    if (typeof data.is_alive === 'string') {
      data.is_alive = data.is_alive === 'true' || data.is_alive === '1';
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    if (body.changed_by) {
      data.changed_by = body.changed_by;
    }

    data.updated_at = new Date();

    const result = await prisma.members.updateMany({
      where: {
        id: existing.id,
        tenant_id: tenantId || existing.tenant_id,
        deleted_at: null,
      },
      data,
    });

    if (result.count !== 1) {
      const err = new Error('Không cập nhật được thành viên.');
      err.statusCode = 404;
      err.code = 'MEMBER_NOT_FOUND';
      throw err;
    }

    return memberService.getMemberById(existing.id, tenantId || existing.tenant_id);
  },

  getMemberNames: async (tenantId, ids) => {
    const started = Date.now();
    const list = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 40);
    if (!tenantId || list.length === 0) return [];
    const rows = await prisma.members.findMany({
      where: { tenant_id: tenantId, deleted_at: null, id: { in: list } },
      select: { id: true, full_name: true },
    });
    return rows;
  },
};

module.exports = memberService;