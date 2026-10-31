const {existsSync,readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {parseEnv}=require('node:util');

const root=resolve(__dirname,'..');
const limitArg=process.argv.slice(2).find(arg=>arg.startsWith('--limit='));
const limit=limitArg?Number(limitArg.slice('--limit='.length)):10;
if(!Number.isInteger(limit)||limit<1||limit>10){
 console.error('用法：node scripts/generate-poster-pool-local.cjs [--limit=1..10]');
 process.exit(1);
}
const envPath=resolve(root,'.env');
if(!existsSync(envPath)){
 console.error('找不到项目根目录 .env；请先配置本地图片模型和 OSS 参数。');
 process.exit(1);
}

const fileEnv=parseEnv(readFileSync(envPath,'utf8'));
const localEnv={...fileEnv,NODE_ENV:'development',AUTH_MODE:'development',DATABASE_URL:'pglite:.local/dev-db'};
const missing=[];
if(!(localEnv.POSTER_IMAGE_API_KEY||localEnv.QWEN_API_KEY||localEnv.OCR_API_KEY))missing.push('QWEN_API_KEY 或 OCR_API_KEY');
if(!(localEnv.POSTER_IMAGE_WORKSPACE_ID||localEnv.OCR_WORKSPACE_ID))missing.push('OCR_WORKSPACE_ID');
for(const key of ['OSS_BUCKET','OSS_REGION','OSS_ENDPOINT','ALIBABA_CLOUD_ACCESS_KEY_ID','ALIBABA_CLOUD_ACCESS_KEY_SECRET'])if(!localEnv[key])missing.push(key);
if(missing.length){
 console.error(`.env 缺少海报生成配置：${missing.join('、')}`);
 process.exit(1);
}

// Force the embedded local database even if the shell or .env has production DB settings.
process.env.NODE_ENV='development';
process.env.AUTH_MODE='development';
process.env.DATABASE_URL='pglite:.local/dev-db';
console.log(`开始生成今日共享海报背景池：本次最多处理 ${limit} 张。图片会产生模型调用费用，并上传至当前 .env 配置的 OSS 私有桶。`);
console.log(`OSS 前缀：${(localEnv.OSS_POSTER_PREFIX||'checkin/posters/').replace(/^\/+|\/+$/g,'')}/pool/`);

async function main(){
 let source;
 try{
  const {connect}=require('../apps/api/dist/database.js');
  const {checkinShareImageCache}=require('../apps/api/dist/checkin-share-images.js');
  const connected=await connect('pglite:.local/dev-db');
  source=connected.source;
  const cache=await checkinShareImageCache(localEnv,connected.db,fetch,true);
  if(!cache)throw new Error('POSTER_CONFIGURATION_INCOMPLETE');
  const result=await cache.prepareDailyPool(limit,status=>{
   console.log(`进度：成功 ${status.succeeded}/10，失败 ${status.failed}，待处理 ${status.pending}${status.errors.length?`；错误码：${status.errors.join(', ')}`:''}`);
  });
  console.log(`完成：成功 ${result.succeeded}/10，失败 ${result.failed}，待处理 ${result.pending}${result.errors.length?`；错误码：${result.errors.join(', ')}`:''}。`);
  if(result.failed||result.pending)process.exitCode=1;
 }catch(error){
  console.error(`海报池生成失败：${error?.code||error?.message||'UNKNOWN_ERROR'}`);
  process.exitCode=1;
 }finally{
  if(source)await source.destroy().catch(()=>{});
 }
}

main();
