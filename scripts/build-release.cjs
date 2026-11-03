const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const {sourceProvenance,ensureSourceUnchanged}=require('./release-provenance.cjs');
const value=process.env.MINIAPP_API_BASE;
let url;try{url=new URL(value);}catch{}
if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||url.hostname.includes(':')||url.port||!url.pathname.endsWith('/api')){
 console.error('请先设置 MINIAPP_API_BASE=https://你的已备案域名/api；发布构建禁止 localhost、IP、明文 HTTP 和密钥参数。');process.exit(1);
}
const provenance=sourceProvenance();
const result=spawnSync('corepack',['pnpm','--filter','@wordmate/miniapp','build'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production',MINIAPP_DEV_AUTH:'false'}});
if(result.status!==0)process.exitCode=result.status??1;
else{ensureSourceUnchanged(provenance,sourceProvenance());fs.writeFileSync('apps/miniapp/dist/release-info.json',JSON.stringify({format:1,...provenance,api_base:url.origin+url.pathname})+'\n');process.exitCode=spawnSync(process.execPath,['scripts/check-miniapp.cjs'],{stdio:'inherit'}).status??1;}
