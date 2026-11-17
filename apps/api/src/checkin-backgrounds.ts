import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ensure,DomainError} from './errors.ts';

export const CHECKIN_BACKGROUND_IDS=['01-lake','02-ocean-sunrise','03-cloud-sky','04-desert','05-deep-sea','06-forest-path','07-mountain-valley','08-snow-mountain','09-river-canyon','10-island-bay'];
export const CHECKIN_BACKGROUND_VERSION='compressed-v1';
type Storage={get:(key:string)=>Promise<Uint8Array>};
/** A fixed, bounded set of private OSS objects. Never accepts a URL or arbitrary key. */
export class CheckinBackgrounds {
 private cache=new Map<string,{bytes:Uint8Array;mime:string}>();
 private pending=new Map<string,Promise<{bytes:Uint8Array;mime:string}>>();
 private storage?:Storage;
 constructor(storage?:Storage){this.storage=storage;}
 async content(id:string,format:string){
  ensure(CHECKIN_BACKGROUND_IDS.includes(id)&&['webp','jpg'].includes(format),404,'CHECKIN_BACKGROUND_NOT_FOUND');
  ensure(this.storage,503,'CHECKIN_BACKGROUND_UNAVAILABLE');
  const key=`${CHECKIN_BACKGROUND_VERSION}/${id}.${format}`,cached=this.cache.get(key);if(cached)return cached;
  const pending=this.pending.get(key);if(pending)return pending;
  const work=(async()=>{
   let bytes:Uint8Array;try{bytes=await this.storage!.get(key);}catch{throw new DomainError(503,'CHECKIN_BACKGROUND_UNAVAILABLE');}
   ensure(bytes.length>12&&bytes.length<=1024*1024,503,'CHECKIN_BACKGROUND_UNAVAILABLE');
   const b=Buffer.from(bytes),valid=format==='webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':b[0]===0xff&&b[1]===0xd8;
   ensure(valid,503,'CHECKIN_BACKGROUND_UNAVAILABLE');
   const result={bytes,mime:format==='webp'?'image/webp':'image/jpeg'};this.cache.set(key,result);return result;
  })();
  this.pending.set(key,work);try{return await work;}finally{this.pending.delete(key);}
 }
}
export async function checkinBackgrounds(env:Record<string,string|undefined>){
 if(!env.OSS_BUCKET||!env.OSS_REGION||!env.OSS_ENDPOINT)return new CheckinBackgrounds();
 const api=await import(pathToFileURL(resolve(__dirname,'../../../packages/ai/dist/index.js')).href);
 return new CheckinBackgrounds(api.createOssStorage({...env,OSS_AUDIO_PREFIX:env.OSS_POSTER_PREFIX?.trim()||'checkin/posters/'}));
}
