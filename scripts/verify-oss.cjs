// Uses a previously verified synthetic TTS sample. No new TTS call and no delete permission needed.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {config,sign,hash,deniedDetail}=require('./lib/oss-probe.cjs');
const root=path.resolve(__dirname,'..');
if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
(async()=>{
 const start=Date.now(),id=randomUUID();let stage='configuration',key=null,uploaded=false,report,networkCode=null;
 const safeNetwork=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPERM','UND_ERR_CONNECT_TIMEOUT']);
 const safeOss=new Set(['AccessDenied','InvalidAccessKeyId','SignatureDoesNotMatch','SecurityTokenExpired','InvalidSecurityToken','RequestTimeTooSkewed','NoSuchBucket','NoSuchKey','InvalidArgument','PermanentRedirect','AccessDeniedForCustomer']);
 const fetchSafe=async(url,options)=>{try{return await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch(e){const code=e.cause?.code||e.code;networkCode=safeNetwork.has(code)?code:'NETWORK_OR_TLS_ERROR';throw Object.assign(Error(),{code:'OSS_NETWORK_OR_TIMEOUT'});}};
 try{
  const c=config(process.env);
  // Validate TTS setup without spending another synthesis request.
  const {createTtsProvider}=await import('../packages/ai/src/index.ts');const tts=createTtsProvider(process.env);const voices=await tts.listVoices();
  if(!['en-GB','en-US'].every(a=>voices.some(v=>v.accent===a)))throw Object.assign(Error(),{code:'BOTH_ACCENTS_MUST_BE_CONFIGURED'});
  stage='local_sample';
  const previous=JSON.parse(fs.readFileSync(path.join(root,'.local/tts-verification/report.json'),'utf8'));
  if(!previous.passed||!previous.samples?.length)throw Object.assign(Error(),{code:'VERIFIED_TTS_SAMPLE_REQUIRED'});
  const sample=previous.samples[0],file=path.resolve(root,sample.file);
  const sampleRoot=fs.realpathSync(path.join(root,'.local/tts-verification'))+path.sep;
  if(!fs.realpathSync(file).startsWith(sampleRoot))throw Object.assign(Error(),{code:'INVALID_SAMPLE_PATH'});
  const bytes=fs.readFileSync(file);if(bytes.length>10*1024*1024||hash(bytes)!==sample.sha256)throw Object.assign(Error(),{code:'LOCAL_SAMPLE_CHECKSUM_MISMATCH'});
  key=c.prefix+`verification/${id}.mp3`;
  const url=`https://${c.host}/${key}`;
  const request=async(method,body)=>{
   const extra=method==='PUT'?{'content-type':'audio/mpeg','x-oss-forbid-overwrite':'true'}:{};
   const response=await fetchSafe(url,{method,headers:sign({...c,key,method,headers:extra}),...(body?{body}:{})});
   if(!response.ok){const xml=await response.text();const raw=xml.match(/<Code>([^<]+)<\/Code>/)?.[1];throw Object.assign(Error(),{code:safeOss.has(raw)?'OSS_'+raw:'OSS_HTTP_ERROR',status:response.status,denied:raw==='AccessDenied'?deniedDetail(xml):null});}
   return response;
  };
  stage='oss_upload';const put=await request('PUT',bytes);await put.body?.cancel();uploaded=true;
  stage='oss_download';const downloaded=Buffer.from(await (await request('GET')).arrayBuffer());
  if(hash(downloaded)!==sample.sha256)throw Object.assign(Error(),{code:'OSS_ROUNDTRIP_CHECKSUM_MISMATCH'});
  stage='anonymous_access_check';const anonymous=await fetchSafe(url,{method:'GET'});await anonymous.body?.cancel();
  if(![403,404].includes(anonymous.status))throw Object.assign(Error(),{code:anonymous.ok?'OSS_OBJECT_PUBLIC':'OSS_PRIVATE_CHECK_INCONCLUSIVE',status:anonymous.status});
  report={passed:true,stage:'upload_download_and_private_access',bytes:bytes.length,sha256:sample.sha256,credential_mode:c.mode,anonymous_status:anonymous.status,tts_configuration_valid:true,tts_sample_run_id:previous.run_id};
 }catch(e){
  const safeCode=typeof e.code==='string'&&/^(MISSING_OSS_|MISSING_ALIBABA_|INVALID_OSS_|LOCAL_OSS_|OSS_|MISSING_COSYVOICE_|UNVERIFIED_TTS_|UNSUPPORTED_TTS_|TTS_PROFILE_|BOTH_ACCENTS_|VERIFIED_TTS_SAMPLE_REQUIRED|INVALID_SAMPLE_PATH|LOCAL_SAMPLE_CHECKSUM_MISMATCH)/.test(e.code);
  report={passed:false,stage,code:safeCode?e.code:stage==='local_sample'?'VERIFIED_TTS_SAMPLE_REQUIRED':'OSS_VERIFICATION_FAILED',http_status:e.status??null,network_code:networkCode,access_denied_detail:e.denied??null};process.exitCode=1;
 }
 Object.assign(report,{run_id:id,elapsed_ms:Date.now()-start,object_key:key,uploaded,retained_test_object:uploaded,tts_calls:0,business_cache_tested:false,miniapp_tested:false});
 const target=path.join(root,'.local/oss-verification.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{mode:0o600});fs.chmodSync(target,0o600);
 console.log(JSON.stringify(report,null,2));console.log('Report: .local/oss-verification.json. Successful uploads leave one small verification object; existing files are untouched.');
})();
