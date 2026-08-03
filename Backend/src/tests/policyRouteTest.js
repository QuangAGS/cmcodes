const routingPolicy = require('../modules/notifications/policy/routingPolicy');

function printCase(title, result) {
  console.log('\n==============================');
  console.log(title);
  console.log('preferredChannel:', result.preferredChannel);
  console.log('requiresEmail:', result.requiresEmail);
  console.table(result.routes);
}

printCase(
  'CASE 1 — No email / no preference',
  routingPolicy.resolveRoutes({
    eventType: 'USER_REGISTERED',
    preference: null,
    bindings: [],
  })
);

printCase(
  'CASE 2 — Has email binding',
  routingPolicy.resolveRoutes({
    eventType: 'USER_APPROVED',
    preference: { channel: 'EMAIL', enabled: true },
    bindings: [
      {
        channel: 'EMAIL',
        binding_state: 'CONNECTED',
      },
    ],
  })
);

printCase(
  'CASE 3 — Legacy ZALO preference',
  routingPolicy.resolveRoutes({
    eventType: 'USER_APPROVED',
    preference: { channel: 'ZALO', enabled: true },
    bindings: [
      {
        channel: 'ZALO',
        binding_state: 'SUGGESTED',
      },
    ],
  })
);