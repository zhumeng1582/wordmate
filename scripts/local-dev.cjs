const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
const env={...process.env,NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:'pglite:.local/dev-db',WECHAT_APP_ID:'wxcf7d28bc513949d4',MINIAPP_DEV_AUTH:'true',MINIAPP_API_BASE:'http://127.0.0.1:3000/api',PORT:'3000'};
function run(args){const r=spawnSync('corepack',['pnpm',...args],{cwd:root,env,stdio:'inherit'});if(r.error){console.error(r.error.message);process.exit(1);}if(r.status!==0)process.exit(r.status??1);}
run(['--filter','@wordmate/api','build']);
run(['--filter','@wordmate/miniapp','typecheck']);
run(['--filter','@wordmate/miniapp','build']);
const artifacts=spawnSync(process.execPath,['scripts/check-miniapp.cjs'],{cwd:root,env,stdio:'inherit'});
if(artifacts.status!==0)process.exit(artifacts.status??1);
console.log('\n小程序构建完成。微信开发者工具导入 apps/miniapp；本地开发时关闭合法域名检查。\n后端将监听 http://127.0.0.1:3000。数据持久保存在 .local/dev-db，Ctrl+C 停止。\n');
// Load provider secrets only for the server, after the miniapp build.
const {existsSync,readFileSync}=require('node:fs'),{parseEnv}=require('node:util');
const local=existsSync(resolve(root,'.env'))?parseEnv(readFileSync(resolve(root,'.env'),'utf8')):{};
const profilePrefixes=local.AUDIO_STORAGE_PROFILES?Object.values(JSON.parse(local.AUDIO_STORAGE_PROFILES)).map(p=>p.env_prefix).filter(p=>typeof p==='string'&&/^[A-Z][A-Z0-9_]*_$/.test(p)):[];
const providers=Object.fromEntries(Object.entries(local).filter(([key])=>/^(LLM_|DEEPSEEK_|OPENAI_|QWEN_|TTS_|COSYVOICE_|OSS_|ALIBABA_CLOUD_|AUDIO_)/.test(key)||profilePrefixes.some(prefix=>key.startsWith(prefix))));
const serverEnv={...env,...providers};
const r=spawnSync(process.execPath,['apps/api/dist/main.js'],{cwd:root,env:serverEnv,stdio:'inherit'});process.exit(r.status??1);
