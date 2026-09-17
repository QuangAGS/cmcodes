/**
 * PATH       : src/modules/mfo/mfo.controller.js
 * DATETIME   : 2026-09-17T16:50:00+07:00
 * VERSION    : 1.2.0-MFO-L4
 * DESCRIPTION: HTTP PLAN + phê PLAN + mảnh cây Origin.
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
