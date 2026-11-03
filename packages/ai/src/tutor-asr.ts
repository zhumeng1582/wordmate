import {ProviderError} from './index.ts';

type Env=Record<string,string|undefined>;
export type TutorTranscription={text:string;duration_seconds:number;request_id?:string};
// This adapter accepts bytes only: client-controlled URLs must never reach the provider.
export function createTutorAsr(env:Env,fetcher:typeof fetch=fetch){
 const key=env.TUTOR_ASR_API_KEY?.trim(),workspace=env.TUTOR_ASR_WORKSPACE_ID?.trim();
 if(!key||!workspace)throw new ProviderError('ASR_NOT_CONFIGURED');
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(workspace))throw new ProviderError('INVALID_ASR_CONFIGURATION');
 const model=env.TUTOR_ASR_MODEL||'qwen-audio-3.0-asr-flash';
 if(model!=='qwen-audio-3.0-asr-flash')throw new ProviderError('UNVERIFIED_ASR_MODEL');
 const url=`https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;
 return {model,async transcribe(bytes:Uint8Array):Promise<TutorTranscription>{
  if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes.length>2*1024*1024||!(bytes[0]===73&&bytes[1]===68&&bytes[2]===51||bytes[0]===255&&(bytes[1]&224)===224))throw new ProviderError('INVALID_ASR_AUDIO');
  const data=`data:audio/mpeg;base64,${Buffer.from(bytes).toString('base64')}`;
  let response:Response;try{response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-DashScope-SSE':'disable'},body:JSON.stringify({model,input:{messages:[{role:'user',content:[{type:'input_audio',input_audio:{data}}]}]},parameters:{format:'mp3',language_hints:['zh','en']}})});}catch{throw new ProviderError('ASR_NETWORK_OR_TIMEOUT',true);}
  if(!response.ok)throw new ProviderError('ASR_UPSTREAM_ERROR',response.status===429||response.status>=500,response.status);
  let result:any;try{const body=await response.text();if(body.length>65536)throw Error();result=JSON.parse(body);}catch{throw new ProviderError('ASR_INVALID_RESPONSE',true);}
  const text=result?.output?.text,duration=result?.usage?.duration;
  if(typeof text!=='string'||text.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)||!Number.isFinite(duration)||duration<0||duration>300)throw new ProviderError('ASR_INVALID_RESPONSE',true);
  const request_id=typeof result.request_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(result.request_id)?result.request_id:undefined;
  return {text:text.trim(),duration_seconds:duration,...(request_id?{request_id}:{})};
 }};
}
