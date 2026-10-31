// Regression entry point for the October 24 review findings. No paid provider calls.
const {spawnSync}=require('node:child_process');
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
run('corepack',['pnpm','build:api']);
run(process.execPath,['--experimental-strip-types','--test','apps/api/test/security-integrity.test.ts','apps/api/test/quiz.test.ts','packages/ai/test/oss-storage.test.ts','apps/miniapp/test/api-session.test.ts','apps/miniapp/test/family-context.test.ts']);
run(process.execPath,['scripts/smoke-inprocess.cjs']);
