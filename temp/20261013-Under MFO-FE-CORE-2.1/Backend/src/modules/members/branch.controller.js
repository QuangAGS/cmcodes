/**
 * PATH       : src/modules/members/branch.controller.js
 * DATETIME   : 2026-09-14T21:55:00+07:00
 * VERSION    : 2.3.1-M13-QUOTA
 * DESCRIPTION: Cây chi + create/update chặn vòng parent_id.
 *   M13: REVIEW + Lát 1 Founder/Origin/ATTACH. Q1 giữ cycle + commonService.
 */

const branchService = require('./branch.service');
const commonService = require('../../shared/utils/common.utils.service');
const { assertParentAllowed } = require('./branchCycle.js');

function sendError(res, error) {
  const status = error.statusCode || (String(error.message || '').includes('Bảo mật') ? 403 : 500);
  const body = {
    status: 'error',
    code: error.code,
    message: error.message,
  };
  if (error.missing) body.missing = error.missing;
  return res.status(status).json(body);
}

const branchController = {
  getBranchTree: async (req, res) => {
    try {
      const tree = await branchService.getBranchTree();
      res.status(200).json({ status: 'success', data: tree });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const body = req.body || {};
      await assertParentAllowed(null, body.parent_id || null);
      const result = await commonService.create('branches', body, req.user);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body || {};
      if (body.parent_id !== undefined) {
        await assertParentAllowed(req.params.id, body.parent_id || null);
      }
      const result = await commonService.update('branches', req.params.id, body, req.user);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  submit: async (req, res) => {
    try {
      const data = await branchService.submitBranch({
        branchId: req.params.id,
        user: req.user,
        note: req.body && req.body.note,
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  approve: async (req, res) => {
    try {
      const data = await branchService.approveBranch({
        branchId: req.params.id,
        user: req.user,
        note: req.body && req.body.note,
        max_generation_span: req.body && req.body.max_generation_span,
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  reject: async (req, res) => {
    try {
      const data = await branchService.rejectBranch({
        branchId: req.params.id,
        user: req.user,
        reason: req.body && req.body.reason,
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  setFounder: async (req, res) => {
    try {
      const data = await branchService.setFounder({
        branchId: req.params.id,
        user: req.user,
        memberId: req.body && req.body.member_id,
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  setOrigin: async (req, res) => {
    try {
      const data = await branchService.setOrigin({
        branchId: req.params.id,
        user: req.user,
        memberId: req.body && (req.body.member_id || null),
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  patchMember: async (req, res) => {
    try {
      const data = await branchService.patchBranchMember({
        branchId: req.params.id,
        user: req.user,
        memberId: req.body && req.body.member_id,
        op: req.body && req.body.op,
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = branchController;
