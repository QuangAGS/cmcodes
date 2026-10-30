# SRPF Skeleton — Standard Revision Process Framework

**PATH**       : backend/src/shared/frameworks/srpf/  
**VERSION**    : 0.1.0-skeleton  
**DATETIME**   : 2026-08-11T14:40:00+07:00  
**STATUS**     : Skeleton only — **no production logic**

## Purpose

This package is the **realization skeleton** of the Standard Revision Process Framework (SRPF) v1.0-Final.

It provides:

- Directory structure
- Q2 headers on every file
- Constants (states, actions)
- Empty stubs / interfaces for Engine components
- Clear TODOs for Phase 3 implementation

## Locked decisions (Architecture v1.1)

1. **Process Instance storage**  
   Temporary: map onto `onboarding_cases` + metadata.  
   **Mandatory note**: a dedicated `process_instances` model is recommended from the start.

2. **SAVE_DRAFT**  
   Does **NOT** generate Correlation.

3. **Side-effects**  
   Synchronous inside one transaction only.  
   **No saga / compensation** in v1.

4. **BusinessLedgerWriter**  
   Writes both `business_process_logs` **and** `audit_logs`.

## Structure

```
srpf/
├── index.js                          # Public barrel
├── constants/
│   ├── states.js
│   └── actions.js
├── registry/
│   └── ProcessDefinitionRegistry.js
├── engine/
│   ├── ActionExecutor.js
│   ├── StateMachineRunner.js
│   └── CorrelationFactory.js
├── guards/
│   └── ContextGuard.js
├── ledger/
│   └── BusinessLedgerWriter.js
├── communication/
│   └── CommunicationHook.js
├── errors/
│   └── srpf.codes.js
└── types/
    └── ProcessDefinition.contract.js
```

## Next (Phase 3 — Implementation)

1. Wire `loadInstance` to storage (temporary `onboarding_cases`).
2. Replace stubs with real `prisma.$transaction`.
3. Integrate existing `bpl.service.js` + audit_logs.
4. Integrate `notificationOrchestrator.js`.
5. Connect CED (`createError` / `createBusinessError`).
6. Register first concrete Process Definition (e.g. Member Promote).

## Q1 reminder

Do **not** modify Register / OP-2 / Tenant Activate flows that are already CLOSED unless there is a logged regression with reproduction steps.
