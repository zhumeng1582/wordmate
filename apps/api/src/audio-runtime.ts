import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {configuredAudioPrice} from './audio-tariff';
export interface AudioRuntime {
 profile:Record<string,any>;
 voices:{id:string;accent:string;gender:string}[];
 synthesize?: (r:{text:string;accent:'en-GB'|'en-US';voiceId:string;rate:number})=>Promise<{bytes:Uint8Array}>;
 storageProfile:string;
 stores:Record<string,{put(key:string,bytes:Uint8Array,mimeType:'audio/mpeg'):Promise<void>;get(key:string):Promise<Uint8Array>;stat(key:string):Promise<{size:number}|null>;delete?(key:string):Promise<void>}>;
 spoolDir:string;pricePer10000Characters?:string;
}
export async function audioRuntime(env:Record<string,string|undefined>):Promise<AudioRuntime|undefined>{
 if(!env.OSS_BUCKET)return undefined;
 const api=await import(pathToFileURL(resolve(__dirname,'../../../packages/ai/dist/index.js')).href);
 const active=env.AUDIO_STORAGE_PROFILE||'oss-staging-1';
 const definitions:Record<string,{provider:string;env_prefix:string}>={ [active]:{provider:'oss',env_prefix:''},...(env.AUDIO_STORAGE_PROFILES?JSON.parse(env.AUDIO_STORAGE_PROFILES):{}) };
 const stores:AudioRuntime['stores']={};let storageProfile='';
 for(const [id,entry] of Object.entries(definitions)){
  if(entry.provider!=='oss'||!/^\w*$/.test(entry.env_prefix))throw Error('UNSUPPORTED_AUDIO_STORAGE');
  const values=Object.fromEntries(Object.entries(env).filter(([k])=>k.startsWith(entry.env_prefix)).map(([k,v])=>[k.slice(entry.env_prefix.length),v]));
  const fingerprint=createHash('sha256').update(JSON.stringify([values.OSS_BUCKET,values.OSS_REGION?.replace(/^oss-/,''),values.OSS_AUDIO_PREFIX])).digest('hex').slice(0,16);
  const fullId=`${id}:${fingerprint}`;stores[fullId]=api.createOssStorage(values);if(id===active)storageProfile=fullId;
 }
 if(!env.COSYVOICE_API_KEY&&env.TTS_PROVIDER&&env.TTS_PROVIDER!=='cosyvoice')throw Error('UNSUPPORTED_TTS_PROVIDER');
 const tts=env.COSYVOICE_API_KEY?api.createTtsProvider(env):undefined;
 return {profile:tts?.profile??{provider:'cosyvoice',region:'cn-beijing',model:env.COSYVOICE_MODEL||'cosyvoice-v3-flash',revision:'cosy-http-plain-aigc-v1',format:'mp3',sampleRate:24000},voices:tts?await tts.listVoices():env.COSYVOICE_ENABLED_VOICES?api.configuredCosyVoices(env):[],synthesize:tts?(r=>tts.synthesize(r)):undefined,storageProfile,stores,spoolDir:resolve(env.AUDIO_SPOOL_DIR||resolve(__dirname,'../../../.local/audio-spool')),pricePer10000Characters:configuredAudioPrice(env)};
}
