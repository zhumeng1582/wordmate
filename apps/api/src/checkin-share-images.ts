import {randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,unlink,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ensure,uuid} from './errors.ts';
import type {Database,Sql} from './ports.ts';

export type ShareImageStatus={id:string;theme:string;status:'pending'|'processing'|'succeeded'|'failed'};
export interface ShareImageStorage {put(key:string,bytes:Uint8Array,mimeType:string):Promise<void>;get(key:string):Promise<Uint8Array>;delete(key:string):Promise<void>}
export type ShareImageGenerator=(theme:string,copy?:string)=>Promise<{bytes:Uint8Array;mime_type:'image/png'|'image/jpeg'}>;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const validImage=(b:Uint8Array)=>b.length>=PNG.length&&(PNG.every((v,i)=>b[i]===v)||b[0]===0xff&&b[1]===0xd8&&b[b.length-2]===0xff&&b[b.length-1]===0xd9);
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const POOL_THEMES=['growth','curiosity','perseverance','courage','discovery','calm','growth','curiosity','perseverance','discovery'];
const POOL_COPY:Record<string,string>={growth:'Every small step helps you grow.',curiosity:'Stay curious and discover something new.',perseverance:'Keep going, one step at a time.',courage:'Be brave and explore a new horizon.',discovery:'The world is full of wonderful discoveries.',calm:'Take your time and enjoy learning.'};

async function localPosterAssets(db:Database):Promise<CheckinShareImageCache>{
 const assets=resolve(__dirname,'../../../assets/share-posters');
 const names=(await readdir(assets)).filter(name=>/^\d{2}-[a-z0-9-]+\.png$/.test(name)).sort();
 ensure(names.length>0,500,'LOCAL_POSTER_ASSETS_MISSING');
 const themeAssets:Record<string,string[]>={
  growth:['06-forest-path.png','07-mountain-valley.png'],
  curiosity:['01-lake.png','03-cloud-sky.png','10-island-bay.png'],
  perseverance:['04-desert.png','07-mountain-valley.png','08-snow-mountain.png'],
  courage:['02-ocean-sunrise.png','05-deep-sea.png','09-river-canyon.png'],
  discovery:['03-cloud-sky.png','09-river-canyon.png','10-island-bay.png'],
  calm:['01-lake.png','05-deep-sea.png','08-snow-mountain.png']
 };
 const cacheDir=resolve(__dirname,'../../../.local/share-posters');
 const objectPath=(key:string)=>{
  ensure(/^[a-zA-Z0-9/_-]+\.png$/.test(key),400,'LOCAL_POSTER_KEY_INVALID');
  const path=resolve(cacheDir,key.replaceAll('/','_'));
  ensure(path.startsWith(cacheDir+'/'),400,'LOCAL_POSTER_KEY_INVALID');
  return path;
 };
 const storage:ShareImageStorage={
  async put(key,bytes){await mkdir(cacheDir,{recursive:true});await writeFile(objectPath(key),bytes);},
  async get(key){try{return new Uint8Array(await readFile(objectPath(key)));}catch(e){if((e as any)?.code==='ENOENT')throw Object.assign(new Error('AUDIO_OBJECT_MISSING'),{code:'AUDIO_OBJECT_MISSING'});throw e;}},
  async delete(key){try{await unlink(objectPath(key));}catch(e){if((e as any)?.code!=='ENOENT')throw e;}}
 };
 const generate:ShareImageGenerator=async(theme)=>{
  const matching=(themeAssets[theme]||[]).filter(name=>names.includes(name));
  const choices=matching.length?matching:names;
  const name=choices[Math.floor(Math.random()*choices.length)]!;
  return {bytes:new Uint8Array(await readFile(resolve(assets,name))),mime_type:'image/png'};
 };
 return new CheckinShareImageCache(db,storage,generate,false);
}

/** Daily shared background pool plus a durable per-account 8-hour assignment cache. */
export class CheckinShareImageCache {
 private db:Database;private storage:ShareImageStorage;private generate:ShareImageGenerator;private prewarmPool:boolean;
 private authorize?: (q:Sql,actor:string,scope:string)=>Promise<void>;
 setAuthorization(fn:(q:Sql,actor:string,scope:string)=>Promise<void>){this.authorize=fn;}
 constructor(db:Database,storage:ShareImageStorage,generate:ShareImageGenerator,prewarmPool=true){this.db=db;this.storage=storage;this.generate=generate;this.prewarmPool=prewarmPool;}
 async obtain(actor:string,theme:string,copy='',scope=''):Promise<ShareImageStatus>{
  return this.db.transaction(async q=>{
   await q.query('SET LOCAL search_path TO wordmate, public');
   await this.authorize?.(q,actor,scope);
   ensure(await one(q,"SELECT 1 FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'UNAUTHENTICATED');
   const existing=await one(q,"SELECT id,theme,status FROM checkin_share_images WHERE requested_by=$1 AND cache_scope=$2 AND status<>'failed' AND created_at>now()-interval '8 hours' ORDER BY created_at DESC LIMIT 1",[actor,scope]);
   if(existing)return existing as ShareImageStatus;
   return await one(q,"INSERT INTO checkin_share_images(id,requested_by,cache_scope,theme,prompt_copy,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id,theme,status",[randomUUID(),actor,scope,theme,copy.slice(0,600)]) as ShareImageStatus;
  });
 }
 async status(actor:string,id:string):Promise<ShareImageStatus>{
  return this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate, public');const row=await one(q,'SELECT id,theme,status,cache_scope FROM checkin_share_images WHERE id=$1 AND requested_by=$2 AND expires_at>now()',[uuid(id),actor]);ensure(row,404,'SHARE_IMAGE_NOT_FOUND');await this.authorize?.(q,actor,row.cache_scope);return {id:row.id,theme:row.theme,status:row.status} as ShareImageStatus;});
 }
 async content(actor:string,id:string):Promise<{bytes:Uint8Array;mime_type:string}>{
  const row=await this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate, public');const r=await one(q,"SELECT status,storage_key,mime_type,cache_scope FROM checkin_share_images WHERE id=$1 AND requested_by=$2 AND expires_at>now()",[uuid(id),actor]);ensure(r,404,'SHARE_IMAGE_NOT_FOUND');ensure(r.status==='succeeded'&&r.storage_key,409,'SHARE_IMAGE_NOT_READY');await this.authorize?.(q,actor,r.cache_scope);return r;});
  const bytes=await this.storage.get(row.storage_key);await this.status(actor,id);return {bytes,mime_type:row.mime_type};
 }
 async processOne():Promise<boolean>{
  if(this.prewarmPool)await this.ensureDailyPool();
  // A user gets the first available shared landscape immediately, while the
  // remaining daily pool continues to fill in the background.
  const assignment=await this.db.transaction(async q=>{
   await q.query('SET LOCAL search_path TO wordmate, public');
   const pending=await one(q,"SELECT id,theme,requested_by,cache_scope FROM checkin_share_images WHERE status='pending' AND expires_at>now() ORDER BY created_at LIMIT 1");
   if(!pending)return null;
   try{await this.authorize?.(q,pending.requested_by,pending.cache_scope);}catch{await q.query("UPDATE checkin_share_images SET status='failed',error_code='GENERATION_SCOPE_UNAVAILABLE' WHERE id=$1",[pending.id]);return {id:pending.id};}
   if(!await one(q,"SELECT id FROM checkin_share_images WHERE id=$1 AND status='pending' FOR UPDATE SKIP LOCKED",[pending.id]))return null;
   const image=await one(q,"SELECT storage_key,mime_type FROM checkin_poster_background_pool WHERE status='succeeded' AND expires_at>now() ORDER BY (theme=$1) DESC,random() LIMIT 1",[pending.theme]);
   if(!image)return null;
   await q.query("UPDATE checkin_share_images SET status='succeeded',storage_key=$2,mime_type=$3,completed_at=now(),error_code=NULL WHERE id=$1",[pending.id,image.storage_key,image.mime_type]);
   return {id:pending.id};
  });
  if(assignment)return true;
  await this.recoverAbandoned('checkin_poster_background_pool');
  await this.recoverAbandoned('checkin_share_images');
  const poolJob=this.prewarmPool?await this.claimJob('checkin_poster_background_pool'):null;
  if(poolJob){await this.generateJob('checkin_poster_background_pool',poolJob);return true;}
  const active=this.prewarmPool?(await one(this.db,"SELECT count(*)::int n FROM wordmate.checkin_poster_background_pool WHERE status IN ('pending','processing') AND expires_at>now()")).n:0;
  const assigned=active>0?null:await this.claimJob('checkin_share_images');
  if(!assigned){
   const expiredPool=(await this.db.query("SELECT id,storage_key FROM wordmate.checkin_poster_background_pool WHERE expires_at<=now() ORDER BY expires_at LIMIT 1")).rows[0];
   if(expiredPool){if(expiredPool.storage_key)await this.deleteObject(expiredPool.storage_key);await this.db.query('DELETE FROM wordmate.checkin_poster_background_pool WHERE id=$1 AND expires_at<=now()',[expiredPool.id]);return true;}
   const expired=(await this.db.query("SELECT id,storage_key FROM wordmate.checkin_share_images WHERE expires_at<=now() ORDER BY expires_at LIMIT 1")).rows[0];
   if(!expired)return false;
   if(expired.storage_key&&!String(expired.storage_key).startsWith('pool/'))await this.deleteObject(expired.storage_key);
   await this.db.query('DELETE FROM wordmate.checkin_share_images WHERE id=$1 AND expires_at<=now()',[expired.id]);return true;
  }
  await this.generateJob('checkin_share_images',assigned);
  return true;
 }
 // Queue creation time is unrelated to the lifetime of a worker's current claim.
 private async recoverAbandoned(table:'checkin_share_images'|'checkin_poster_background_pool'){
  await this.db.query(`UPDATE wordmate.${table} SET status='pending',lease_until=NULL,lease_token=NULL WHERE status='processing' AND (lease_until IS NULL OR lease_until<=now())`);
 }
 private async claimJob(table:'checkin_share_images'|'checkin_poster_background_pool'){
  const order=table==='checkin_share_images'?'created_at,id':'generation_date,slot';
  // Ten minutes exceeds the provider's bounded submit/poll/download timeouts.
  return one(this.db,`WITH claimed AS (UPDATE wordmate.${table} SET status='processing',lease_token=$1,lease_until=now()+interval '10 minutes',error_code=NULL,completed_at=NULL WHERE id=(SELECT id FROM wordmate.${table} WHERE status='pending' AND expires_at>now() ORDER BY ${order} FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *) SELECT * FROM claimed`,[randomUUID()]);
 }
 private async generateJob(table:'checkin_share_images'|'checkin_poster_background_pool',job:any):Promise<void>{
  let objectKey:string|undefined,objectStored=false;
  try{
   if(table==='checkin_share_images')await this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate,public');await this.authorize?.(q,job.requested_by,job.cache_scope);ensure(await one(q,"SELECT 1 FROM checkin_share_images WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until>now() AND expires_at>now()",[job.id,job.lease_token]),409,'SHARE_IMAGE_LEASE_LOST');});
   const result=await this.generate(job.theme,job.prompt_copy||'');ensure(validImage(result.bytes)&&result.bytes.length<=10*1024*1024,502,'SHARE_IMAGE_INVALID');
   const scope=table==='checkin_share_images'?`checkin/${job.requested_by}`:`pool/${job.generation_date}`;
   // Each attempt owns a separate object, so late workers cannot overwrite or
   // delete the winning worker's upload after a lease has been recovered.
   objectKey=`${scope}/${job.id}-${job.lease_token}.${result.mime_type==='image/jpeg'?'jpg':'png'}`;
   const saved=await this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate,public');if(table==='checkin_share_images')await this.authorize?.(q,job.requested_by,job.cache_scope);await this.storage.put(objectKey!,result.bytes,result.mime_type);objectStored=true;return one(q,`WITH saved AS (UPDATE wordmate.${table} SET status='succeeded',storage_key=$3,mime_type=$4,completed_at=now(),error_code=NULL,lease_until=NULL,lease_token=NULL WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until>now() AND expires_at>now() RETURNING id) SELECT id FROM saved`,[job.id,job.lease_token,objectKey,result.mime_type]);});
   if(!saved)await this.storage.delete(objectKey).catch(()=>{});
  }catch(e){
   if(objectStored&&objectKey)await this.storage.delete(objectKey).catch(()=>{});
   const code=typeof (e as any)?.code==='string'?(e as any).code:'SHARE_IMAGE_GENERATION_FAILED';
   await this.db.query(`UPDATE wordmate.${table} SET status='failed',error_code=$3,completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until>now()`,[job.id,job.lease_token,code.slice(0,64)]);
  }
 }
 private async deleteObject(key:string){try{await this.storage.delete(key);}catch(e){if((e as any)?.code!=='AUDIO_OBJECT_MISSING')throw e;}}
 async deleteAccount(q:Sql,actor:string){await this.deleteAssignments(q,'requested_by=$1',[actor]);}
 async deleteChild(q:Sql,child:string){await this.deleteAssignments(q,"split_part(cache_scope,':',1)=$1",[child]);}
 private async deleteAssignments(q:Sql,where:string,args:string[]){
  const rows=(await q.query(`SELECT id,storage_key FROM checkin_share_images WHERE ${where} FOR UPDATE`,args)).rows;
  for(const row of rows){if(row.storage_key&&!row.storage_key.startsWith('pool/')){try{await this.storage.delete(row.storage_key);}catch(e){if((e as any)?.code!=='AUDIO_OBJECT_MISSING')throw e;}}await q.query('DELETE FROM checkin_share_images WHERE id=$1',[row.id]);}
 }
 /** Explicit local/admin operation: fill today's shared pool without processing user jobs. */
 async prepareDailyPool(limit=POOL_THEMES.length,onProgress?:(status:{succeeded:number;failed:number;pending:number;errors:string[]})=>void):Promise<{succeeded:number;failed:number;pending:number;errors:string[]}>{
  await this.ensureDailyPool();
  await this.db.query("UPDATE wordmate.checkin_poster_background_pool SET status='pending',error_code=NULL,completed_at=NULL,lease_until=NULL,lease_token=NULL WHERE generation_date=(now() AT TIME ZONE 'Asia/Shanghai')::date AND status='failed'");
  const max=Math.max(1,Math.min(POOL_THEMES.length,Math.floor(limit)||1));
  for(let i=0;i<max;i++){
   if(!await this.processPoolOne())break;
   if(onProgress)onProgress(await this.poolProgress());
  }
  const row=await this.poolProgress();
  return row;
 }
 private async poolProgress():Promise<{succeeded:number;failed:number;pending:number;errors:string[]}>{
  const row=await one(this.db,"SELECT count(*) FILTER (WHERE status='succeeded')::int AS succeeded,count(*) FILTER (WHERE status='failed')::int AS failed,count(*) FILTER (WHERE status IN ('pending','processing'))::int AS pending,coalesce(array_agg(DISTINCT error_code) FILTER (WHERE status='failed' AND error_code IS NOT NULL),'{}') AS errors FROM wordmate.checkin_poster_background_pool WHERE generation_date=(now() AT TIME ZONE 'Asia/Shanghai')::date");
  return row as {succeeded:number;failed:number;pending:number;errors:string[]};
 }
 private async processPoolOne():Promise<boolean>{
  await this.recoverAbandoned('checkin_poster_background_pool');
  const poolJob=await this.claimJob('checkin_poster_background_pool');
  if(!poolJob)return false;
  await this.generateJob('checkin_poster_background_pool',poolJob);return true;
 }
 private async ensureDailyPool(){
  const values=POOL_THEMES.map((theme,slot)=>`(${slot},'${theme}','${POOL_COPY[theme]!.replaceAll("'","''")}')`).join(',');
  await this.db.query(`INSERT INTO wordmate.checkin_poster_background_pool(generation_date,slot,theme,prompt_copy,status) SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date,v.slot,v.theme,v.copy,'pending' FROM (VALUES ${values}) AS v(slot,theme,copy) ON CONFLICT(generation_date,slot) DO NOTHING`);
 }
}

export async function shareImageGenerator(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch,wait:(ms:number)=>Promise<void>=(ms=>new Promise(resolve=>setTimeout(resolve,ms)))):Promise<ShareImageGenerator|undefined>{
 // Reuse the existing DashScope/Qwen credentials by default. Dedicated poster
 // credentials remain an optional override for isolated billing or permissions.
 const apiKey=(env.POSTER_IMAGE_API_KEY||env.QWEN_API_KEY||env.OCR_API_KEY)?.trim();if(!apiKey)return;
 const workspace=(env.POSTER_IMAGE_WORKSPACE_ID||env.OCR_WORKSPACE_ID)?.trim(),region=env.POSTER_IMAGE_REGION?.trim()||'cn-beijing',model=env.POSTER_IMAGE_MODEL?.trim()||'qwen-image-2.1-turbo';
 ensure(workspace&&/^[a-z0-9-]+$/.test(workspace)&&/^[a-z0-9-]+$/.test(region),500,'POSTER_IMAGE_CONFIGURATION_INVALID');
 const base=`https://${workspace}.${region}.maas.aliyuncs.com/api/v1`;
 const themes:Record<string,string>={growth:'成长主题，浅蓝、米白、鼠尾草绿。',curiosity:'好奇与探索主题，湖蓝、浅绿、米白。',perseverance:'坚持前行主题，暖沙色、淡金、浅蓝。',courage:'勇气主题，海蓝、青绿、米白。',discovery:'发现新事物主题，天蓝、淡金、云白。',calm:'宁静主题，浅青、雾蓝、米白、柔和浅光。'};
 return async (theme,copy)=>{
  ensure(themes[theme],422,'SHARE_IMAGE_THEME_INVALID');
  const scene=themes[theme];
  const prompt=`Follow the mood of this encouraging learning message: “${(copy||'').replace(/[\r\n"<>]/g,' ').slice(0,600)}”. ${scene} Choose a fitting varied landscape such as mountains, a lake, ocean, open sky, desert, or deep sea. Soft watercolor illustration, mainly light colors. No text or lettering.`;
  const response=await fetcher(`${base}/services/aigc/image-generation/generation`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-DashScope-Async':'enable'},body:JSON.stringify({model,input:{messages:[{role:'user',content:[{text:prompt}]}]},parameters:{prompt_extend:true,size:'960*1280',n:1}}),signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('POSTER_PROVIDER_FAILED'),{code:'POSTER_PROVIDER_FAILED'});}
  const submitted:any=await response.json(),taskId=submitted?.output?.task_id;
  ensure(typeof taskId==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(taskId),502,'POSTER_TASK_MISSING');
  let payload:any;
  for(let attempt=0;attempt<24;attempt++){
   if(attempt)await wait(5000);
   const poll=await fetcher(`${base}/tasks/${encodeURIComponent(taskId)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!poll.ok){await poll.body?.cancel();throw Object.assign(new Error('POSTER_TASK_POLL_FAILED'),{code:'POSTER_TASK_POLL_FAILED'});}
   payload=await poll.json();const taskStatus=payload?.output?.task_status;
   if(taskStatus==='SUCCEEDED')break;
   if(['FAILED','CANCELED','UNKNOWN'].includes(taskStatus))throw Object.assign(new Error('POSTER_TASK_FAILED'),{code:'POSTER_TASK_FAILED'});
   if(attempt===23)throw Object.assign(new Error('POSTER_TASK_TIMEOUT'),{code:'POSTER_TASK_TIMEOUT'});
  }
  const imageUrl=payload?.output?.choices?.[0]?.message?.content?.find((x:any)=>typeof x?.image==='string')?.image||payload?.output?.results?.find((x:any)=>typeof x?.url==='string')?.url;
  ensure(typeof imageUrl==='string',502,'POSTER_IMAGE_MISSING');
  let parsed:URL;try{parsed=new URL(imageUrl);}catch{throw Object.assign(new Error('POSTER_IMAGE_URL_MALFORMED'),{code:'POSTER_IMAGE_URL_MALFORMED'});}
  ensure(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port,502,'POSTER_IMAGE_URL_ORIGIN_REJECTED');
  // DashScope uses both regional and accelerated OSS endpoints, with dynamic
  // bucket names (for example dashscope-result-bj and dashscope-a717).
  ensure(/^dashscope-[a-z0-9-]+\.oss-(?:accelerate|cn-[a-z0-9-]+)\.aliyuncs\.com$/.test(parsed.hostname),502,'POSTER_IMAGE_URL_HOST_REJECTED');
  const downloaded=await fetcher(parsed.href,{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!downloaded.ok){await downloaded.body?.cancel();throw Object.assign(new Error('POSTER_IMAGE_DOWNLOAD_FAILED'),{code:'POSTER_IMAGE_DOWNLOAD_FAILED'});}
  const mime=(downloaded.headers.get('content-type')||'').split(';')[0].toLowerCase();ensure(mime==='image/png'||mime==='image/jpeg',502,'POSTER_IMAGE_INVALID');
  const reader=downloaded.body?.getReader();ensure(reader,502,'POSTER_IMAGE_EMPTY');const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;ensure(size<=10*1024*1024,502,'POSTER_IMAGE_TOO_LARGE');chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);ensure(validImage(bytes),502,'POSTER_IMAGE_INVALID');return {bytes,mime_type:mime as 'image/png'|'image/jpeg'};
 };
}

export async function checkinShareImageCache(env:Record<string,string|undefined>,db:Database,fetcher:typeof fetch=fetch,prewarmPool=env.NODE_ENV==='production'&&env.POSTER_POOL_PREWARM!=='false'):Promise<CheckinShareImageCache|undefined>{
 // In local development, serve one of the checked-in server-side poster assets.
 // The miniapp still obtains the image through its normal authenticated API flow.
 if(env.NODE_ENV==='development')return localPosterAssets(db);
 const generate=await shareImageGenerator(env,fetcher);if(!generate)return;
 // Poster generation is optional in local/dev environments. Reuse existing OSS
 // settings when available and keep its objects under a safe dedicated prefix.
 if(!env.OSS_BUCKET||!env.OSS_REGION||!env.OSS_ENDPOINT)return;
 const api=await import(pathToFileURL(resolve(__dirname,'../../../packages/ai/dist/index.js')).href);
 const storage=api.createOssStorage({...env,OSS_AUDIO_PREFIX:env.OSS_POSTER_PREFIX?.trim()||'checkin/posters/'});
 return new CheckinShareImageCache(db,{put:(key,bytes,mime)=>storage.put(key,bytes,mime),get:(key)=>storage.get(key),async delete(key){try{await storage.delete(key);}catch(e){if((e as any)?.code!=='AUDIO_OBJECT_MISSING')throw e;}}},generate,prewarmPool);
}
