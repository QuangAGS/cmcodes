//cat > /tmp/test-open-op.js << 'EOF'


'use strict';

const path = require('path');

// Cho phép chạy từ Backend/ hoặc từ repo root
/*
const backendRoot = process.cwd().endsWith('Backend')
  ? process.cwd()
  : path.join(process.cwd(), 'Backend');

process.chdir(backendRoot);
*/
const {openMemberPromoteInstance} = require('../shared/frameworks/srpf/services/openMemberPromoteInstance');
const srpf = require('../shared/frameworks/srpf');

// Chỉnh srcRoot cho đúng máy bạn
// const srcRoot = path.resolve(__dirname, 'src'); // nếu chạy từ gia-pha-backend
// Nếu chạy từ src/tests: 
//const srcRoot = path.resolve(__dirname, '..');

//const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf/services'));

async function main() {
  const input = {
    memberId: '83cebf8c-71fa-4225-9ae8-8b0d461c3df5',
    userId: '1f5f6437-5453-4cd3-bbc7-29ec98c8e800',
    tenantId: '687971c1-1f90-45e8-b162-97b5346d2f69',
    caseType: 'MEMBER_JOIN',
    sourceRegisterCaseId: null,
  };

  console.log('=== openMemberPromoteInstance #1 ===');
  const r1 = await openMemberPromoteInstance(input);
  console.log({
    created: r1.created,
    caseId: r1.caseId,
    correlationId: r1.correlationId,
    status: r1.instance.status,
    primary_member_id: r1.instance.primary_member_id,
  });

  console.log('=== openMemberPromoteInstance #2 (idempotent) ===');
  const r2 = await openMemberPromoteInstance(input);
  console.log({
    created: r2.created,
    caseId: r2.caseId,
    correlationId: r2.correlationId,
    sameCase: r1.caseId === r2.caseId,
  });

  if (r1.created && !r2.created && r1.caseId === r2.caseId && r1.instance.status === 'DRAFT') {
    console.log('PASS');
  } else if (!r1.created && !r2.created && r1.caseId === r2.caseId) {
    console.log('PASS (đã có OP mở từ trước — idempotent OK)');
  } else {
    console.log('CHECK manually — unexpected combination');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FAIL', e.code || '', e.message);
  process.exitCode = 1;
});
//EOF