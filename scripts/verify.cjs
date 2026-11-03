// Offline release checks; no production network or paid providers.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function files(dir,suffix){return fs.readdirSync(path.join(root,dir)).filter(name=>name.endsWith(suffix)).sort().map(name=>`${dir}/${name}`);}
function run(label,command,args,env={}){console.log(`\nChecking ${label}...`);const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,...env}});if(result.status!==0)process.exit(result.status??1);}
run('generated contracts',process.execPath,['scripts/generate-contracts.cjs','--check']);
run('API build','corepack',['pnpm','build:api']);
run('miniapp typecheck','corepack',['pnpm','--filter','@wordmate/miniapp','typecheck']);
run('miniapp tests',process.execPath,['--experimental-strip-types','--test','--test-concurrency=2',...files('apps/miniapp/test','.test.ts')]);
run('API tests',process.execPath,['--experimental-strip-types','--test','--test-concurrency=2',...files('apps/api/test','.test.ts')]);
run('AI tests',process.execPath,['--experimental-strip-types','--test','--test-concurrency=2',...files('packages/ai/test','.test.ts')]);
run('script and local database tests',process.execPath,['--test','--test-concurrency=2',...files('scripts/test','.test.cjs'),'apps/api/test/local-database.test.cjs']);
run('HTTP integration',process.execPath,['scripts/smoke-inprocess.cjs']);
run('miniapp release build','corepack',['pnpm','build:release'],{MINIAPP_API_BASE:process.env.MINIAPP_API_BASE||'https://api.dancigongxue.world/api'});
console.log('\nOffline checks passed. WeChat device verification remains separate.');
