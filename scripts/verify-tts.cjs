// Two short live synthesis calls at most. No retries and no secret/URL logging.
const {resolve}=require('node:path');
const {existsSync,mkdirSync,writeFileSync,readFileSync,chmodSync}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=resolve(__dirname,'..');
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
const directory=resolve(root,'.local/tts-verification');
mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
(async()=>{
 const start=Date.now(),runId=randomUUID(),samples=[];
 let stage='configuration',networkCode=null,providerCode=null,calls=0,report;
 const networkCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPERM','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
 const safeProviderCodes=new Set(['InvalidApiKey','InvalidParameter','InvalidParameter.Model','InvalidParameter.Voice','AccessDenied','Forbidden','ModelNotFound','Throttling','Throttling.RateQuota','QuotaExhausted','Arrearage','InternalError']);
 const fetcher=async(url,init)=>{
  stage=String(url).includes('/SpeechSynthesizer')?'synthesis_request':'audio_download';
  if(stage==='synthesis_request')calls++;
  try{
   const response=await fetch(url,init);
   if(stage==='synthesis_request'){
    const body=await response.clone().json().catch(()=>null);
    if(body?.code)providerCode=safeProviderCodes.has(body.code)?body.code:'UNCLASSIFIED_PROVIDER_ERROR';
   }
   return response;
  }catch(e){const code=e.cause?.code||e.code;networkCode=networkCodes.has(code)?code:'NETWORK_OR_TLS_ERROR';throw e;}
 };
 try{
  const {createTtsProvider}=await import('../packages/ai/src/index.ts');
  const provider=createTtsProvider(process.env,fetcher),voices=await provider.listVoices();
  const selected=['en-GB','en-US'].map(accent=>voices.find(v=>v.accent===accent));
  if(selected.some(v=>!v))throw Object.assign(Error(),{code:'BOTH_ACCENTS_MUST_BE_CONFIGURED'});
  for(const voice of selected){
   const result=await provider.synthesize({text:'airport',accent:voice.accent,voiceId:voice.id,rate:1});
   stage='local_file_roundtrip';
   const filename=`${runId}-${voice.accent}.mp3`,file=resolve(directory,filename);
   writeFileSync(file,result.bytes,{mode:0o600});
   const saved=readFileSync(file);
   if(!saved.equals(Buffer.from(result.bytes)))throw Object.assign(Error(),{code:'AUDIO_SAVE_MISMATCH'});
   let decoded=false;
   if(process.platform==='darwin'&&existsSync('/usr/bin/afinfo')){
    stage='audio_decode';const checked=spawnSync('/usr/bin/afinfo',[file],{encoding:'utf8',timeout:10000});
    if(checked.status!==0||!checked.stdout.includes('estimated duration:'))throw Object.assign(Error(),{code:'AUDIO_DECODE_FAILED'});
    decoded=true;
   }
   samples.push({accent:voice.accent,voice_id:voice.id,bytes:saved.length,sha256:createHash('sha256').update(saved).digest('hex'),file:`.local/tts-verification/${filename}`,decoder_checked:decoded});
  }
  report={passed:true,stage:'synthesis_download_and_local_save',profile:provider.profile,samples};
 }catch(e){
  // Never print arbitrary exception messages, provider bodies, URLs, or configuration.
  const known=new Set(['BOTH_ACCENTS_MUST_BE_CONFIGURED','AUDIO_SAVE_MISMATCH','AUDIO_DECODE_FAILED','UNSUPPORTED_TTS_PROVIDER','TTS_PROFILE_MISMATCH','MISSING_COSYVOICE_API_KEY','MISSING_COSYVOICE_WORKSPACE_ID','MISSING_COSYVOICE_ENABLED_VOICES','INVALID_COSYVOICE_WORKSPACE','UNVERIFIED_TTS_MODEL','UNVERIFIED_TTS_VOICE','VOICE_ACCENT_UNAVAILABLE','UPSTREAM_NETWORK_OR_TIMEOUT','UPSTREAM_HTTP_ERROR','UPSTREAM_INVALID_JSON','TTS_SYNTHESIS_FAILED','INCOMPLETE_SYNTHESIS','INVALID_AUDIO_URL','UPSTREAM_AUDIO_READ_FAILED','INVALID_AUDIO_RESPONSE']);
  report={passed:false,stage,code:known.has(e.code)?e.code:'TTS_VERIFICATION_FAILED',http_status:e.status??null,network_code:networkCode,provider_code:providerCode,samples};process.exitCode=1;
 }
 Object.assign(report,{run_id:runId,elapsed_ms:Date.now()-start,synthesis_requests_attempted:calls,oss_tested:false,miniapp_tested:false,pronunciation_quality_reviewed:false});
 const file=resolve(directory,'report.json');writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});chmodSync(file,0o600);
 console.log(JSON.stringify(report,null,2));
 console.log('Report: .local/tts-verification/report.json (not tracked by Git). No OSS or miniapp integration tested.');
})();
