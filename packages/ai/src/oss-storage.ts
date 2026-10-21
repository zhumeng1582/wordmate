import {createHash,createHmac} from 'node:crypto';
import type {AudioObjectStorage} from './audio-storage.ts';
export class OssError extends Error {
 readonly code:string;readonly status?:number;readonly retryable:boolean;
 constructor(code:string,status?:number,retryable=false){super(code);this.code=code;this.status=status;this.retryable=retryable;}
}
const fail=(code:string):never=>{throw new OssError(code);};
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const hmac=(k:string|Uint8Array,v:string)=>createHmac('sha256',k).update(v).digest();
export function ossHeaders(method:string,bucket:string,key:string,region:string,id:string,secret:string,token:string,extra:Record<string,string>,date=new Date()){
 const timestamp=date.toISOString().replace(/[:-]|\.\d{3}/g,''),day=timestamp.slice(0,8),scope=`${day}/${region}/oss/aliyun_v4_request`;
 const headers:Record<string,string>={...extra,'x-oss-content-sha256':'UNSIGNED-PAYLOAD','x-oss-date':timestamp,...(token?{'x-oss-security-token':token}:{})};
 const uri='/'+[bucket,...key.split('/')].map(encodeURIComponent).join('/');
 const canonical=[method,uri,'',Object.keys(headers).sort().map(k=>`${k}:${headers[k].trim()}\n`).join(''),'','UNSIGNED-PAYLOAD'].join('\n');
 let signing=hmac('aliyun_v4'+secret,day);for(const v of [region,'oss','aliyun_v4_request'])signing=hmac(signing,v);
 headers.Authorization=`OSS4-HMAC-SHA256 Credential=${id}/${scope},Signature=${hmac(signing,['OSS4-HMAC-SHA256',timestamp,scope,sha(canonical)].join('\n')).toString('hex')}`;
 return headers;
}
export async function boundedAudio(response:Response,max=10*1024*1024):Promise<Uint8Array>{
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new OssError('AUDIO_TOO_LARGE');}
 const reader=response.body?.getReader();if(!reader)throw new OssError('EMPTY_AUDIO');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new OssError('AUDIO_TOO_LARGE');chunks.push(value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 if(!size)throw new OssError('EMPTY_AUDIO');return Buffer.concat(chunks);
}
/** Explicit RAM/STS credentials. ECS role credential discovery is not silently emulated. */
export function createOssStorage(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):AudioObjectStorage{
 const required=(k:string)=>env[k]?.trim()||fail('MISSING_'+k);
 const bucket=required('OSS_BUCKET'),region=required('OSS_REGION').replace(/^oss-/,''),prefix=required('OSS_AUDIO_PREFIX');
 const endpoint=required('OSS_ENDPOINT');let url:URL;try{url=new URL(endpoint.includes('://')?endpoint:'https://'+endpoint);}catch{return fail('INVALID_OSS_ENDPOINT');}
 if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)||!/^\w+-[a-z0-9-]+$/.test(region))fail('INVALID_OSS_CONFIGURATION');
 if(url.protocol!=='https:'||![`oss-${region}.aliyuncs.com`,`oss-${region}-internal.aliyuncs.com`].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')fail('INVALID_OSS_ENDPOINT');
 if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/$/.test(prefix))fail('INVALID_OSS_PREFIX');
 const id=required('ALIBABA_CLOUD_ACCESS_KEY_ID'),secret=required('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),token=env.ALIBABA_CLOUD_SECURITY_TOKEN?.trim()||'',mode=env.OSS_CREDENTIAL_MODE||(token?'sts':'ram_access_key');
 if(!['ram_access_key','sts'].includes(mode)||mode==='sts'&&!token||mode==='ram_access_key'&&token)fail('OSS_CREDENTIAL_MODE_MISMATCH');
 const request=async(method:string,key:string,bytes?:Uint8Array)=>{
  if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(key)||key.split('/').some(p=>p==='.'||p==='..'))fail('INVALID_AUDIO_OBJECT_KEY');
  const object=prefix+key;
  const headers=ossHeaders(method,bucket,object,region,id,secret,token,bytes?{'content-type':'audio/mpeg','content-md5':createHash('md5').update(bytes).digest('base64')}:{});
  let response:Response;try{response=await fetcher(`https://${bucket}.${url.hostname}/${object}`,{method,headers,...(bytes?{body:Buffer.from(bytes)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new OssError('AUDIO_STORAGE_UNAVAILABLE',undefined,true);}
  if(!response.ok){await response.body?.cancel();throw new OssError(response.status===404?'AUDIO_OBJECT_MISSING':response.status===403?'AUDIO_STORAGE_ACCESS_DENIED':'AUDIO_STORAGE_UNAVAILABLE',response.status,response.status===429||response.status>=500);}
  return response;
 };
 return {provider:'oss',
  async put(key,bytes){if(!bytes.length||bytes.length>10*1024*1024)fail('AUDIO_TOO_LARGE');const r=await request('PUT',key,bytes);await r.body?.cancel();},
  async get(key){return boundedAudio(await request('GET',key));},
  async stat(key){try{const r=await request('HEAD',key);const size=Number(r.headers.get('content-length'));await r.body?.cancel();return {size};}catch(e){if(e instanceof OssError&&e.code==='AUDIO_OBJECT_MISSING')return null;throw e;}},
  async delete(key){const r=await request('DELETE',key);await r.body?.cancel();}
 };
}
