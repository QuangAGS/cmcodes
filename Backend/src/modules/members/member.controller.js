/**
 * DATETIME: 2026-11-11T12:35:00+07:00
 * PATH: src/modules/members/member.controller.js
 * VERSION: 1.7.0-MULTIHOME-ROLE-ACTOR-V12
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7 Member Controller:
 *   + create: Truyền created_by_member_id từ req.user.activeMemberId (thay vì member_id không tồn tại trên JWT).
 *   + update: VIEWER kiểm tra quyền dựa trên activeMemberId hoặc tra cứu user_member_links (chống 403 oan khi ở họ phụ).
 *   + Chuẩn hóa tenantId theo req.user.activeTenantId || req.user.tenantId.
 */

'use strict';

const memberService = require('./member.service');
const vitalService = require('./vital.service.js');
const profileService = require('../profile/profile.service.js');
const { basePrisma } = require('../../lib/prisma.js');

const memberController = {
  getNames: async (req, res) => {
    try {
      const tenantId = req.user?.activeTenantId || req.user?.tenantId || req.user?.tenant_id;
      const raw = String(req.query?.ids || '');
      const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
      const result = await memberService.getMemberNames(tenantId, ids);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Lỗi server',
      });
    }
  },

  getAll: async (req, res) => {
    try {
      const tenantId = req.user?.activeTenantId || req.user?.tenantId || req.user?.tenant_id;

      const filters = {
        status: req.query?.status,
        includePending: req.query?.includePending,
        q: req.query?.q,
        is_clan: req.query?.is_clan,
        gender: req.query?.gender,
        is_alive: req.query?.is_alive,
        limit: req.query?.limit,
      };

      const result = await memberService.getAllMembers(tenantId, filters);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Lỗi server',
      });
    }
  },

  getProfile: async (req, res) => {
    try {
      const data = await profileService.getMemberProfile(req.user, req.params.id, req.query.section);
      res.status(200).json({ status: 'success', success: true, data });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Lỗi server',
      });
    }
  },

  patchProfile: async (req, res) => {
    try {
      const data = await profileService.patchMemberProfile(req.user, req.params.id, req.body || {});
      res.status(200).json({ status: 'success', success: true, message: 'Đã lưu hồ sơ.', data });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Lỗi server',
      });
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user?.activeTenantId || req.user?.tenantId;
      const result = await memberService.getMemberById(id, tenantId);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  },

  create: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const tenantId = req.user?.activeTenantId || req.user?.tenantId || req.user?.tenant_id;
      const activeMemberId = req.user?.activeMemberId || req.user?.member_id || null;

      const result = await memberService.createFullMember(
        {
          ...req.body,
          changed_by: userId,
          created_by_member_id: activeMemberId,
        },
        tenantId,
        req.user
      );
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user?.activeTenantId || req.user?.tenantId || req.user?.tenant_id;
      const role = req.user?.roleInTenant || req.user?.role;
      let userMemberId = req.user?.activeMemberId || req.user?.member_id;

      // VIEWER: chỉ được sửa member gắn với chính mình trong dòng họ đang active
      if (role === 'VIEWER') {
        if (!userMemberId) {
          const userId = req.user?.userId || req.user?.id;
          const link = await basePrisma.user_member_links.findFirst({
            where: { user_id: userId, tenant_id: tenantId, deleted_at: null },
            select: { member_id: true },
          });
          userMemberId = link?.member_id || null;
        }

        if (!userMemberId || userMemberId !== id) {
          return res.status(403).json({
            status: 'error',
            code: 'FORBIDDEN',
            message: 'Bạn chỉ được cập nhật hồ sơ thành viên của chính mình.',
          });
        }
      }

      const result = await memberService.updateFullMember(id, {
        ...req.body,
        changed_by: req.user?.userId || req.user?.id,
      }, tenantId);

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Lỗi server',
      });
    }
  },

  patchVital: async (req, res) => {
    try {
      const data = await vitalService.patchVital(req.user, req.params.id, req.body || {});
      res.status(200).json({ status: 'success', success: true, message: 'Đã cập nhật tình trạng sống.', data });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Lỗi server',
      });
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user?.activeTenantId || req.user?.tenantId;
      await memberService.deleteMember(id, tenantId);
      res.status(200).json({ status: 'success', message: 'Đã xóa thành viên khỏi phả hệ' });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  },

  getMemberTree: async (req, res) => {
    try {
      const { branchId } = req.params;
      const tenantId = req.user?.activeTenantId || req.user?.tenantId;
      const raw = await memberService.getRawMembersForTree(branchId, tenantId);
      const tree = memberService.buildTreeLogic(raw);
      res.status(200).json({ status: 'success', data: tree });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  },

  getFocalTree: async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user?.activeTenantId || req.user?.tenantId;
      const data = await memberService.getFocalTreeData(id, tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  },

  getStats: async (req, res) => {
    try {
      res.json({ status: 'success', message: 'Tính năng thống kê đang được phát triển.' });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  },
};

module.exports = memberController;
