/**
 * PATH       : src/modules/members/branch.controller.js
 * DATETIME   : 2026-09-10T16:10:00+07:00
 * VERSION    : 2.1.0-CYCLE
 * DESCRIPTION: Cây chi + create/update chặn vòng parent_id.
 */

const branchService = require('./branch.service');
const commonService = require('../../shared/utils/common.utils.service');
const { assertParentAllowed } = require('./branchCycle.js');

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
      const status = error.statusCode || 500;
      res.status(status).json({ status: 'error', code: error.code, message: error.message });
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
      const status = error.statusCode || (String(error.message || '').includes('Bảo mật') ? 403 : 500);
      res.status(status).json({ status: 'error', code: error.code, message: error.message });
    }
  },
};

module.exports = branchController;
