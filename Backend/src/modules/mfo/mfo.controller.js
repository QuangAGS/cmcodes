/**
 * PATH       : src/modules/mfo/mfo.controller.js
 * DATETIME   : 2026-09-17T16:50:00+07:00
 * VERSION    : 1.3.0-MFO-L5
 * DESCRIPTION: HTTP PLAN + phê + cây + CREATE trong PLAN_OK.
 */

const mfoService = require('./mfo.service');

function sendError(res, error) {
  const status = error.statusCode || 500;
  const body = {
    status: 'error',
    code: error.code,
    message: error.message,
  };
  if (error.k != null) body.k = error.k;
  if (error.ticket_id) body.ticket_id = error.ticket_id;
  if (error.ticket_status) body.ticket_status = error.ticket_status;
  return res.status(status).json(body);
}

const mfoController = {
  createPlan: async (req, res) => {
    try {
      const data = await mfoService.createPlan({
        user: req.user,
        body: req.body || {},
        correlationId: req.correlationId,
      });
      res.status(201).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  listPlans: async (req, res) => {
    try {
      const data = await mfoService.listPlans({
        user: req.user,
        query: req.query || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  getPlan: async (req, res) => {
    try {
      const data = await mfoService.getPlan({
        user: req.user,
        ticketId: req.params.id,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  approvePlan: async (req, res) => {
    try {
      const data = await mfoService.approvePlan({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  rejectPlan: async (req, res) => {
    try {
      const data = await mfoService.rejectPlan({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  createInPlan: async (req, res) => {
    try {
      const data = await mfoService.createInPlan({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(201).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },


  softDeleteMember: async (req, res) => {
    try {
      const data = await mfoService.softDeleteMember({
        user: req.user,
        ticketId: req.params.id,
        memberId: req.params.memberId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  patchMemberInPlan: async (req, res) => {
    try {
      const data = await mfoService.patchMemberInPlan({
        user: req.user,
        ticketId: req.params.id,
        memberId: req.params.memberId,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  linkFounder: async (req, res) => {
    try {
      const data = await mfoService.linkFounder({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  createSpouse: async (req, res) => {
    try {
      const data = await mfoService.createSpouse({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(201).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  patchUnion: async (req, res) => {
    try {
      const data = await mfoService.patchUnion({
        user: req.user,
        ticketId: req.params.id,
        unionId: req.params.unionId,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  submitResult: async (req, res) => {
    try {
      const data = await mfoService.submitResult({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  approveResult: async (req, res) => {
    try {
      const data = await mfoService.approveResult({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  rejectResult: async (req, res) => {
    try {
      const data = await mfoService.rejectResult({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  getOriginTree: async (req, res) => {
    try {
      const data = await mfoService.getOriginTree({
        user: req.user,
        originId: req.params.originId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = mfoController;
