/**
 * PATH: backend/src/services/memberService.js
 * DATETIME   : 2026-06-16T21:15:00+07:00
 * VERSION    : 1.7.5
 * DESCRIPTION: 
 * - Rà soát và loại bỏ/comment toàn bộ việc sinh khóa chính (PK) thủ công `id: uuidv4()` ở tầng Backend.
 * - Nhường hoàn toàn quyền sinh mã UUID tự động cho tầng Database PostgreSQL (Supabase).
 * - Bảo tồn 100% logic nghiệp vụ tạo thành viên phức hợp và kiểm tra Data Integrity (Q1).
 * - Tuân thủ cấu trúc format tài liệu hệ thống (Q2).
 */

const { prisma } = require('../lib/prisma');
// const { v4: uuidv4 } = require('uuid'); 🚫 KHÔNG DÙNG: Khóa chính PK đã được cấu hình tự sinh tự động ở tầng DB
const auditService = require('./auditService');
const dataIntegrityService = require('./dataIntegrityService');

const memberService = {
  /**
   * CREATE FULL MEMBER: Lưu đồng thời vào nhiều bảng (Transaction).
   * @param {Object} payload - Dữ liệu từ Controller gửi xuống (bao gồm Metadata).
   * @param {String} tenantId - ID dòng họ lấy từ Context.
   */
  createFullMember: async (payload, tenantId) => {
  const { memberData, currentAddr, biographyData, changed_by, change_reason } = payload;

    return await prisma.$transaction(async (tx) => {
      /**
       * -------------------------------------------------------------------
       * 🏛️ STEP 1: Tạo bản ghi Address (Địa chỉ hiện tại)
       * -------------------------------------------------------------------
       * @dateTime 2026-06-16T21:16:00+07:00
       * Loại bỏ hoàn toàn id vật lý ở code để Database tự động cấp phát UUID mới.
       */
      // 1. Tạo Address trước (Bóc tách metadata)
      let curId = null;
      if (currentAddr?.full_address) {
        const addr = await tx.addresses.create({
          // data: { ...currentAddr, id: uuidv4(), tenant_id: tenantId, changed_by }. // ◄ CŨ: Gây thừa mã sinh
          data: { ...currentAddr, tenant_id: tenantId, changed_by }
        });
        curId = addr.id;
        // Ghi log riêng cho địa chỉ
        await auditService.logAction('THEM_MOI', 'addresses', addr.id, null, addr, changed_by, 'Đi kèm tạo mới thành viên', tenantId);
      }
      /**
       * -------------------------------------------------------------------
       * 👤 STEP 2: Tạo bản ghi cốt lõi trong bảng Members
       * -------------------------------------------------------------------
       * @dateTime 2026-06-16T21:18:15+07:00
       * Thực hiện comment rõ ràng dòng `id` cũ để đội ngũ làm tài liệu dễ đối chiếu.
       */
      // 2. Tạo Member (Sử dụng curId vừa lấy)
      const member = await tx.members.create({
        data: {
          ...memberData,
          //id: uuidv4(), // 🚫 ĐÃ COMMENT: DB PostgreSQL tự động chạy hàm gen_random_uuid() cho trường này
          tenant_id: tenantId,
          current_address_id: curId,
          changed_by
        }
      });

      /**
       * -------------------------------------------------------------------
       * 📖 STEP 3: Tạo bản ghi Tiểu sử (Biographies) đi kèm nếu có
       * -------------------------------------------------------------------
       * @dateTime 2026-06-16T21:19:30+07:00
       */
      // 3. Tạo Tiểu sử (Biographies)
      if (biographyData) {
        const bio = await tx.biographies.create({
          //data: { ...biographyData, id: uuidv4(), member_id: member.id, tenant_id: tenantId, changed_by }. // ◄ CŨ: Gây thừa mã sinh
          data: { ...biographyData, member_id: member.id, tenant_id: tenantId, changed_by }
        });
        await auditService.logAction('THEM_MOI', 'biographies', bio.id, null, bio, changed_by, 'Đi kèm tạo mới thành viên', tenantId);
      }

      /**
       * -------------------------------------------------------------------
       * 🔬 STEP 4: Nhật ký kiểm toán (Audit Logs) & Kiểm tra tính toàn vẹn
       * -------------------------------------------------------------------
       * @dateTime 2026-06-16T21:21:00+07:00
       */
      // Ghi Sổ cái biến động dữ liệu chi tiết cho hành động THEM_MOI
      // 4. Log hành động chính
      await auditService.logAction('THEM_MOI', 'members', member.id, null, member, changed_by, change_reason, tenantId);

      return member;
    });
  },

  // =========================================================================
  // KHỐI TIẾN TRÌNH: KIỂM TRA SỨC KHỎE DỮ LIỆU & DỰNG CÂY
  // =========================================================================

  /**
   * LẤY DỮ LIỆU CÂY: Bao gồm suy luận đời và kiểm tra sức khỏe dữ liệu.
   * @param {String} branchId - ID chi họ.
   */
  getMemberTreeData: async (branchId) => {
    // 1. Lấy tất cả thành viên trong chi họ (Prisma tự lọc tenant_id)
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

    // 2. SUY LUẬN PHẢ HỆ: Tự động tính toán generation (đời) nếu bị thiếu
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

    // 3. KIỂM TRA SỨC KHỎE DỮ LIỆU (Data Integrity)
    const healthIssues = dataIntegrityService.checkBranchHealth(all);

    // 4. DỰNG CẤU TRÚC CÂY (Tree Logic)
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

  /**
   * DỰNG CÂY: Chuyển danh sách phẳng thành cấu trúc lồng nhau (Nested).
   */
  buildTreeLogic: (members) => {
    if (members.length === 0) return [];
    
    // Sắp xếp theo đời để dựng từ gốc lên
    const sortedMembers = [...members].sort((a, b) => (a.generation || 0) - (b.generation || 0));
    const map = {};
    
    // Tạo map và khởi tạo mảng con/phối ngẫu
    sortedMembers.forEach(m => { 
      map[m.id] = { ...m, children: [], partners: [] }; 
    });

    // Xử lý quan hệ phối ngẫu (Marriages)
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

    // Xây dựng quan hệ cha-con
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
  }
};

module.exports = memberService;