/**
 * PATH       : src/modules/mfo/mfo.controller.js
 * DATETIME   : 2026-09-16T15:10:00+07:00
 * VERSION    : 1.0.0-MFO-L1
 * DESCRIPTION: HTTP PLAN 5L. Chưa phê / RESULT.
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
};

module.exports = mfoController;
