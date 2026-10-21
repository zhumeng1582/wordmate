const {spawnSync}=require('node:child_process');
const value=process.env.MINIAPP_API_BASE;
let url;try{url=new URL(value);}catch{}
if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||url.hostname.includes(':')||url.port||!url.pathname.endsWith('/api')){
 console.error('请先设置 MINIAPP_API_BASE=https://你的已备案域名/api；发布构建禁止 localhost、IP、明文 HTTP 和密钥参数。');process.exit(1);
}
const result=spawnSync('corepack',['pnpm','--filter','@wordmate/miniapp','build'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production',MINIAPP_DEV_AUTH:'false'}});
process.exitCode=result.status??1;
