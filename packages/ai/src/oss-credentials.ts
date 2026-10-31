export type OssCredentials={id:string;secret:string;token:string;expiresAt?:number};
export class OssError extends Error {
 readonly code:string;readonly status?:number;readonly retryable:boolean;
 constructor(code:string,status?:number,retryable=false){super(code);this.code=code;this.status=status;this.retryable=retryable;}
}
const fail=(code:string):never=>{throw new OssError(code);};
export function ossCredentialProvider(env:Record<string,string|undefined>,fetcher:typeof fetch,now:()=>number=Date.now):()=>Promise<OssCredentials>{
 const required=(key:string)=>env[key]?.trim()||fail('MISSING_'+key);
 const mode=env.OSS_CREDENTIAL_MODE||(env.ALIBABA_CLOUD_SECURITY_TOKEN?'sts':'ram_access_key');
 if(mode!=='ecs_ram_role'){
  if(!['sts','ram_access_key'].includes(mode))fail('OSS_CREDENTIAL_MODE_MISMATCH');
  const value={id:required('ALIBABA_CLOUD_ACCESS_KEY_ID'),secret:required('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),token:env.ALIBABA_CLOUD_SECURITY_TOKEN?.trim()||''};
  if(mode==='sts'&&!value.token||mode==='ram_access_key'&&value.token)fail('OSS_CREDENTIAL_MODE_MISMATCH');
  return async()=>value;
 }
 const role=required('OSS_RAM_ROLE_NAME');if(!/^[A-Za-z0-9_.-]{1,64}$/.test(role))fail('INVALID_OSS_RAM_ROLE');
 // IMDSv2 only, fixed host and paths. Metadata tokens are never sent to OSS.
 const base='http://100.100.100.200/latest';
 const read=async(path:string,init:RequestInit,max:number)=>{
  const response=await fetcher(base+path,{...init,redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!response.ok){await response.body?.cancel();throw Error('metadata unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('empty metadata');
  let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>max)throw Error('oversized metadata');chunks.push(x.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
 };
 let cached:OssCredentials|undefined,pending:Promise<OssCredentials>|undefined;
 const refresh=async()=>{
  try{
   const token=(await read('/api/token',{method:'PUT',headers:{'X-aliyun-ecs-metadata-token-ttl-seconds':'60'}},4096)).trim();
   if(!token||/[\r\n\x00]/.test(token))throw Error('invalid token');
   const data=JSON.parse(await read('/meta-data/ram/security-credentials/'+encodeURIComponent(role),{headers:{'X-aliyun-ecs-metadata-token':token}},16384));
   const expiration=Date.parse(data.Expiration);
   if(data.Code!=='Success'||![data.AccessKeyId,data.AccessKeySecret,data.SecurityToken].every(v=>typeof v==='string'&&v.trim()&&v.length<=8192&&!/[\r\n\x00]/.test(v))||!Number.isFinite(expiration)||expiration<=now()+30000)throw Error('invalid credentials');
   return cached={id:data.AccessKeyId,secret:data.AccessKeySecret,token:data.SecurityToken,expiresAt:expiration};
  }catch{throw new OssError('AUDIO_STORAGE_UNAVAILABLE',undefined,true);}
 };
 return async()=>{
  if(cached&&cached.expiresAt!>now()+120000)return cached;
  if(!pending)pending=refresh().finally(()=>{pending=undefined;});
  return pending;
 };
}
