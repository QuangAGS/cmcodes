/**
 * PATH: src/modules/members/branch.controller.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 2.0.0
 * DESCRIPTION: Chỉ chứa các logic đặc thù cho Chi họ (Tree logic).
 */
const branchService = require('./branch.service');

const branchController = {
  // Logic lấy cây phả hệ (không nằm trong CRUD phẳng)
  getBranchTree: async (req, res) => {
    try {
      // BranchService sẽ tự lấy tenantId từ context (AsyncLocalStorage)
      const tree = await branchService.getBranchTree();
      res.status(200).json({ status: "success", data: tree });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
};

module.exports = branchController;