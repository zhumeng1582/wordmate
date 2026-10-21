// Isolated audio business flow. Live mode makes three TTS calls and retains three small OSS objects.
const {resolve}=require('node:path'),{existsSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {randomUUID,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),offline=process.argv.includes('--offline'),run=randomUUID(),name='audio-flow-'+run;
if(!offline&&existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development'});
const {connect}=require('../apps/api/dist/database.js'),{Core}=require('../apps/api/dist/core.js');
const {audioRuntime}=require('../apps/api/dist/audio-runtime.js'),{DevIdentity,FixtureDictionary,createScheduler}=require('../apps/api/dist/providers.js');
(async()=>{
 let source,report,stage='configuration',calls=0;const originalFetch=global.fetch;let networkCode=null;
 global.fetch=async(...args)=>{try{return await originalFetch(...args);}catch(e){const code=e.cause?.code||e.code;networkCode=['ENOTFOUND','EAI_AGAIN','ECONNRESET','ETIMEDOUT','EPERM'].includes(code)?code:'NETWORK_OR_TLS_ERROR';throw e;}};
 const start=Date.now(),objects=new Map(),retained=[];
 const sha=b=>createHash('sha256').update(b).digest('hex');
 try{
  const runtime=offline?{profile:{provider:'mock',model:'mock',revision:'1'},voices:[{id:'gb',accent:'en-GB',gender:'Female'},{id:'us',accent:'en-US',gender:'Female'}],synthesize:async()=>({bytes:Buffer.from('ID3-offline-flow')}),storageProfile:'mock',stores:{mock:{put:async(k,b)=>{objects.set(k,b);},stat:async k=>objects.has(k)?{size:objects.get(k).length}:null,get:async k=>{if(!objects.has(k))throw Object.assign(Error(),{code:'AUDIO_OBJECT_MISSING'});return objects.get(k);}}},childDaily:20,userDaily:40}:await audioRuntime(process.env);
  if(!runtime?.synthesize)throw Object.assign(Error(),{code:'AUDIO_NOT_CONFIGURED'});
  runtime.spoolDir=resolve(root,'.local',name+'-spool');
  const synthesize=runtime.synthesize;runtime.synthesize=async r=>{calls++;return synthesize(r);};
  const scheduler=await createScheduler();let connection=await connect('pglite:.local/'+name);source=connection.source;
  const makeCore=()=>new Core(connection.db,new DevIdentity(),new FixtureDictionary(),scheduler,'audio-flow',()=>new Date(),undefined,runtime);
  let core=makeCore();
  const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id;
  const f=await core.createFamily(dad,'family',{name:'隔离音频验收'}),c=await core.createChild(dad,'child',f.id,{nickname:'验收'}),book=await core.createWordbook(dad,'book',c.id,{name:'验收词本'});
  const batch=await core.createBatch(dad,'batch',c.id,{wordbook_id:book.id,words:['apple']});
  await core.confirmBatch(dad,'confirm',batch.id,{expected_version:1,selections:batch.items.map(i=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  const word=(await core.words(dad,c.id)).items[0];
  const sentence=(await connection.db.query("INSERT INTO wordmate.sentences(child_id,text_en,translation_zh,level,model,prompt_version,status,created_by) VALUES($1,'I eat an apple.','我吃一个苹果。','A1','verification','0.1','validated',$2) RETURNING id",[c.id,dad])).rows[0];
  const checks=[];
  for(const [kind,accent] of [['word','en-GB'],['word','en-US'],['sentence','en-US']]){
   stage=kind+'_'+accent;
   const voice=runtime.voices.find(v=>v.accent===accent);if(!voice)throw Object.assign(Error(),{code:'AUDIO_VOICE_UNAVAILABLE'});
   const request={...(kind==='word'?{word_id:word.id}:{sentence_id:sentence.id}),content_version:1,accent,voice_id:voice.id,speech_rate:1};
   const job=await core.audio.create(dad,randomUUID(),request);await core.audio.processOne();
   const finished=await core.audio.get(dad,job.job_id);if(finished.status!=='succeeded')throw Object.assign(Error(),{code:finished.error_code||'AUDIO_FLOW_FAILED'});
   const bytes=await core.audio.content(dad,job.audio_id),before=calls;
   assert.equal((await core.audio.create(dad,randomUUID(),request)).audio_id,job.audio_id);
   assert.equal(sha(await core.audio.content(dad,job.audio_id)),sha(bytes));assert.equal(calls,before);
   await assert.rejects(core.audio.content(mom,job.audio_id),{code:'FAMILY_NOT_FOUND'});
   checks.push({kind,accent,bytes:bytes.length,sha256:sha(bytes),cache_reused:true});
   retained.push({job,request,checksum:sha(bytes)});
  }
  stage='database_restart';
  await source.destroy();source=undefined;connection=await connect('pglite:.local/'+name);source=connection.source;core=makeCore();
  for(const item of retained){assert.equal((await core.audio.create(dad,randomUUID(),item.request)).status,'succeeded');assert.equal(sha(await core.audio.content(dad,item.job.audio_id)),item.checksum);}
  assert.equal(calls,3);
  report={passed:true,stage:'synthesis_storage_authorized_download_and_cache',checks,database_restart_cache_reused:true,unauthorized_family_denied:true};
 }catch(e){report={passed:false,stage,code:/^(AUDIO_|INVALID_AUDIO_|MISSING_|OSS_|UNSUPPORTED_|UNVERIFIED_)/.test(e.code||'')?e.code:'AUDIO_FLOW_VERIFICATION_FAILED'};process.exitCode=1;}
 finally{global.fetch=originalFetch;if(source)await source.destroy();rmSync(resolve(root,'.local',name),{recursive:true,force:true});rmSync(resolve(root,'.local',name+'-spool'),{recursive:true,force:true});}
 Object.assign(report,{mode:offline?'offline_mock':'live',network_code:networkCode,run_id:run,elapsed_ms:Date.now()-start,tts_calls:calls,retained_test_objects:offline?0:retained.length,orphan_objects_possible:!offline&&!report.passed,miniapp_playback_tested:false,pronunciation_quality_reviewed:false});
 mkdirSync(resolve(root,'.local'),{recursive:true});writeFileSync(resolve(root,offline?'.local/audio-flow-verification-offline.json':'.local/audio-flow-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));console.log('Report: .local/audio-flow-verification'+(offline?'-offline':'')+'.json. Isolated database removed; live OSS objects retained (no delete permission required).');
})();
