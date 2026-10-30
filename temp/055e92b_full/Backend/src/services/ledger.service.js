/**
 * PATH       : src/services/ledger.service.js
 * DATETIME   : 2026-09-01T15:30:00+07:00
 * VERSION    : 1.2.0-BFA-222-B1
 * DESCRIPTION: Wrapper cửa BL. Không insert trần. Không nuốt lỗi. Bắt tx.
 */

'use strict';

const { writeBpl } = require('./bpl.service.js');

class BusinessLoggerService {
  /**
   * @param {object} params  correlation_id, process_type, actor_id, ...
   * @param {object} tx      bắt buộc
   */
  async createLog(params = {}, tx = null) {
    if (!tx) {
      const err = new Error('ledger.createLog requires tx từ withTransaction.');
      err.statusCode = 400;
      err.code = 'BPL_TX_REQUIRED';
      err.isOperational = true;
      throw err;
    }

    return writeBpl({
      processType: params.process_type,
      actorContext: {
        actor_id: params.actor_id,
        actor_type: params.actor_type || 'USER',
        tenant_id: params.tenant_id || null,
        correlation_id: params.correlation_id,
      },
      processStatus: params.process_status || 'SUCCESS',
      attemptNo: params.attempt_no,
      context: params.context || {},
      payload: params.payload || {},
      tx,
    });
  }
}

module.exports = new BusinessLoggerService();
