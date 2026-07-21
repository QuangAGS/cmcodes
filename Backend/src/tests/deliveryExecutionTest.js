/**
 * PATH: src/tests/deliveryExecutionTest.js
 * RUN:
 * node src/scripts/deliveryExecutionTest.js
 */

const notificationOrchestrator = require(
  '../modules/notifications/orchestrator/notificationOrchestrator'
);

const communicationRepository = require(
  '../modules/notifications/repository/communication.repository'
);

const deliveryExecutionService = require(
  '../modules/notifications/services/deliveryExecution.service'
);



async function run() {
  try {
    const userId =
      '00000000-0000-0000-0000-000000000000';

    console.log('=== DELIVERY EXECUTION TEST START ===');

    const emitted =
      await notificationOrchestrator.emit(
        'USER_APPROVED',
        {
          userId,
          channels: ['EMAIL', 'ZALO', 'IN_APP'],
        }
      );

    console.log('Emit OK');
    console.log(
      emitted.deliveries.map((d) => ({
        id: d.id,
        channel: d.channel,
        status: d.status,
        recipient: d.recipient,
      }))
    );

    const user =
      await communicationRepository.getUserBasicProfile(
        userId
      );

    const bindings =
      await communicationRepository.getBindings(userId);

    const executed =
      await deliveryExecutionService.executeMany({
        deliveries: emitted.deliveries,
        notification: emitted.notification,
        user,
        bindings,
      });

    console.log('Execution OK');
    console.log(
      executed.map((d) => ({
        id: d.id,
        channel: d.channel,
        status: d.status,
        recipient: d.recipient,
        sent_at: d.sent_at,
        delivered_at: d.delivered_at,
        manual_note: d.manual_note,
        raw_response: d.raw_response,
      }))
    );

    //For PHASE 5C
    const Nemitted =
      await notificationOrchestrator.emit(
        'USER_APPROVED',
        {
          userId,
          channels: ['EMAIL', 'ZALO', 'IN_APP'],
          executeImmediately: true,
        }
      );

    console.log('For PHASE 5C');
    console.dir(Nemitted.executedDeliveries, { depth: null });

    console.log('=== DELIVERY EXECUTION TEST PASS ===');
  } catch (err) {
    console.error('=== DELIVERY EXECUTION TEST FAILED ===');
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();