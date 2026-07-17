/**
 * PATH: backend/src/scripts/notificationRepoTest.js
 * PURPOSE:
 * Quick sanity test for EGAL-25 repositories, policies, and orchestrator
 *
 * RUN:
 * node src/scripts/notificationRepoTest.js
 */

const { prisma } = require('../lib/prisma');

const communicationRepository = require(
  '../modules/notifications/repository/communication.repository'
);

const deliveryRepository = require(
  '../modules/notifications/repository/delivery.repository'
);

const notificationOrchestrator = require(
  '../modules/notifications/orchestrator/notificationOrchestrator'
);

const reliabilityPolicy = require(
  '../modules/notifications/policy/reliabilityPolicy'
);

const channelPolicy = require(
  '../modules/notifications/policy/channelPolicy'
);

const routingPolicy = require(
  '../modules/notifications/policy/routingPolicy'
);

const BAdapter = require(
  '../modules/notifications/adapters/BaseAdapter'
);

const BaseAdapter = new BAdapter({
  channel: 'EMAIL',
  provider: 'TEST',
});

const InAppAdapter = require(
  '../modules/notifications/adapters/InAppAdapter'
);

const IAadapter = new InAppAdapter();

const EmailAdapter = require(
  '../modules/notifications/adapters/EmailAdapter'
);

const Eadapter = new EmailAdapter();

const ZaloManualAdapter = require(
  '../modules/notifications/adapters/ZaloManualAdapter'
);

const Zadapter = new ZaloManualAdapter();

const TelegramAdapter = require(
  '../modules/notifications/adapters/TelegramAdapter'
);

const Tadapter = new TelegramAdapter();

const WhatsAppAdapter = require(
  '../modules/notifications/adapters/WhatsAppAdapter'
);

const Wadapter = new WhatsAppAdapter();

const adapterRegistry = require(
  '../modules/notifications/adapters'
);

console.log(adapterRegistry.listSupportedChannels());

async function run() {
  try {
    const userId =
      '00000000-0000-0000-0000-000000000000';

    console.log('=== TEST START ===');

    const testUser = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
      },
    });

    if (!testUser) {
      throw new Error(
        `Không tìm thấy test user với id = ${userId}`
      );
    }

    console.log('Test user OK');
    console.log(testUser);

    const prefs =
      await communicationRepository.getUserPreferences(
        userId
      );

    console.log('Preferences OK');
    console.log(prefs);

    const bindings =
      await communicationRepository.getBindings(userId);

    console.log('Bindings OK');
    console.log(bindings);

    const pendingDeliveries =
      await deliveryRepository.getPendingDeliveries({
        take: 5,
      });

    console.log('Pending deliveries OK');
    console.log(pendingDeliveries);

    const pendingInbound =
      await deliveryRepository.getPendingInboundMessages({
        take: 5,
      });

    console.log('Pending inbound messages OK');
    console.log(pendingInbound);

    console.log('Reliability policy OK');
    console.log(
      reliabilityPolicy.getEventReliabilityPolicy(
        'PASSWORD_RESET_REQUESTED'
      )
    );

    console.log('Channel policy OK');
    console.log(
      channelPolicy.resolveCandidateChannels({
        eventType: 'USER_APPROVED',
        preferredChannel: 'ZALO',
      })
    );

    console.log('Zalo initial status OK');
    console.log(
      channelPolicy.resolveInitialDeliveryStatus({
        eventType: 'USER_APPROVED',
        channel: 'ZALO',
      })
    );

    console.log('Routing policy OK');
    console.dir(
      routingPolicy.resolveRoutes({
        eventType: 'USER_APPROVED',
        preference: {
          channel: 'ZALO',
          enabled: true,
        },
        bindings: [
          {
            channel: 'ZALO',
            binding_state: 'SUGGESTED',
          },
        ],
      }),
      { depth: null }
    );

    const emitted =
      await notificationOrchestrator.emit(
        'USER_APPROVED',
        {
          userId,
          channels: ['EMAIL', 'ZALO', 'IN_APP'],
        }
      );

    console.log('Orchestrator OK');
    console.dir(emitted, { depth: null });

    console.log(
      'Deliveries count:',
      emitted.deliveries.length
    );

    console.log(
      'Deliveries:',
      emitted.deliveries
    );

    //For BaseAdapter
    console.log(await BaseAdapter.healthCheck());
    console.log(BaseAdapter.canSend({}));

    //For InAppAdapter
    console.log(await IAadapter.healthCheck());
    console.log(
      await IAadapter.send({
        delivery: { id: 'delivery-test' },
        notification: { id: 'notification-test' },
      })
    );

    //EmailAdapter
    console.log(await Eadapter.healthCheck());
    console.log(
      await Eadapter.send({
        delivery: {
          id: 'delivery-test',
          recipient: 'test@example.com',
        },
        notification: {
          id: 'notification-test',
          title: 'Test email',
          content: 'Hello from EGAL-25',
        },
      })
    );

    //ZaloApdapter
    console.log(await Zadapter.healthCheck());
    console.log(
      await Zadapter.send({
        delivery: {
          id: 'delivery-test',
        },
        notification: {
          id: 'notification-test',
          title: 'Hồ sơ đã được phê duyệt',
          content: 'Tài khoản của bác đã được phê duyệt.',
        },
        user: {
          name: 'Bác Quang',
          phone: '0913000000',
        },
      })
    );

    //TelgramAdapter
    console.log(await Tadapter.healthCheck());
    console.log(
      await Tadapter.send({
        delivery: {
          id: 'delivery-test',
          recipient: '123456789',
        },
        notification: {
          id: 'notification-test',
          title: 'Hồ sơ đã được phê duyệt',
          content: 'Tài khoản của bác đã được phê duyệt.',
        },
      })
    );

    //WhatsAppAdapter
    console.log(await Wadapter.healthCheck());
    console.log(
      await Wadapter.send({
        delivery: {
          id: 'delivery-test',
          recipient: '+84913000000',
        },
        notification: {
          id: 'notification-test',
          title: 'Hồ sơ đã được phê duyệt',
          content: 'Tài khoản của bác đã được phê duyệt.',
        },
      })
    );

    //Index.js
    console.log(
      await adapterRegistry.healthCheckAll()
    );

    const zaloAdapter =
      adapterRegistry.createAdapter('ZALO');

    console.log(
      await zaloAdapter.healthCheck()
    );



    console.log('=== TEST PASS ===');
  } catch (err) {
    console.error('=== TEST FAILED ===');
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();