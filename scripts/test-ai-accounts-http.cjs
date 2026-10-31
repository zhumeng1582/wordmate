// Real Nest/Express requests, offline providers, no listener and no paid requests.
const {IncomingMessage,ServerResponse}=require('node:http');
const {Duplex}=require('node:stream');
const {randomUUID}=require('node:crypto');
const {rmSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const name=`ai-accounts-http-${randomUUID()}`;
Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:`pglite:.local/${name}`,WECHAT_APP_ID:'ai-http-test',LLM_PROVIDER:'qwen',QWEN_API_KEY:'offline-system-secret',AI_CREDENTIAL_KEY:'12'.repeat(32),AI_RECHARGE_ENABLED:'false',AI_MODEL_CATALOG:JSON.stringify([{id:'qwen',provider:'qwen',model:'offline-test',label:'Offline Qwen'}])});
const {createApplication}=require('../apps/api/dist/main.js');
(async()=>{
 let calls=0,token='';const {app,dispose}=await createApplication({aiFetch:async(_u,init)=>{
  calls++;assert.equal(init.headers.Authorization,'Bearer offline-private-secret');const b=JSON.parse(init.body),test=b.response_format?.json_schema?.name==='connection_test';
  const data=test?{ok:true}:{items:[{input_index:0,input:'cat',status:'ok',lemma:'cat',part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:'猫',sentence_en:'I see the cat.',sentence_zh:'我看到了猫。',reason:null}]};
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage:{prompt_tokens:100,completion_tokens:20}});
 }});
 function request(path,body,method=body?'POST':'GET'){
  return new Promise((done,reject)=>{
   const chunks=[],socket=new Duplex({read(){},write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback();}}),req=new IncomingMessage(socket);req.method=method;req.url='/api'+path;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;
   const bytes=body?Buffer.from(JSON.stringify(body)):null;req.headers={host:'127.0.0.1','content-type':'application/json',authorization:`Bearer ${token}`,'idempotency-key':randomUUID(),...(bytes?{'content-length':String(bytes.length)}:{})};
   const res=new ServerResponse(req);res.assignSocket(socket);const timeout=setTimeout(()=>reject(Error('request timeout')),10000);
   res.on('finish',()=>{clearTimeout(timeout);try{const raw=Buffer.concat(chunks).toString();done({status:res.statusCode,...JSON.parse(raw.slice(raw.indexOf('\r\n\r\n')+4))});}catch(e){reject(e);}finally{socket.destroy();}});
   app.getHttpAdapter().getInstance()(req,res);req.complete=true;req._destroy=(e,cb)=>cb(e);if(bytes)req.push(bytes);req.push(null);
  });
 }
 const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 try{
  assert.equal((await request('/me/ai-settings')).status,401);const policy=await ok('/privacy/policy'),login=await ok('/auth/dev',{code:'dev-dad'});token=login.access_token;
  assert.equal((await ok('/me/ai-settings')).balance_micros,0);
  const body={mode:'byok',model_id:'qwen',expected_version:0,api_key:'offline-private-secret',provider_consent:true};assert.equal((await request('/me/ai-settings',body,'PUT')).status,403);
  await ok('/me/privacy-consent',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true},'PUT');
  assert.equal((await request('/me/ai-settings',{...body,base_url:'https://attacker.test'},'PUT')).status,422);
  const saved=await ok('/me/ai-settings',body,'PUT');assert.equal(saved.has_key,true);assert(!JSON.stringify(saved).includes(body.api_key));assert.equal((await ok('/me/ai-test',{})).connected,true);
  const family=await ok('/families',{name:'Offline AI'}),child=await ok(`/families/${family.id}/children`,{nickname:'孩子'}),book=await ok(`/children/${child.id}/wordbooks`,{name:'词本'});
  let job=await ok(`/children/${child.id}/ai-batches`,{wordbook_id:book.id,words:['cat']});
  for(let n=0;n<30&&['queued','running'].includes(job.status);n++){await new Promise(r=>setTimeout(r,100));job=await ok(`/ai-batches/${job.id}`);}
  assert.equal(job.status,'succeeded');assert.equal(calls,2);assert.equal((await ok('/me/ai-usage')).items.length,2);assert.equal((await ok('/me/ai-settings')).balance_micros,20000000);assert.equal((await ok('/me/ai-recharges')).enabled,false);
  assert.equal((await request('/me/ai-recharges',{family_id:family.id,product_id:'any',code:'unused',platform:'android',request_id:randomUUID()})).status,503);
  const dadToken=token;token=(await ok('/auth/dev',{code:'dev-mom'})).access_token;await ok('/me/privacy-consent',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true},'PUT');assert.equal((await ok('/me/ai-usage')).items.length,0);assert.equal((await ok('/me/ai-settings')).has_key,false);assert.equal((await request(`/ai-batches/${job.id}`)).status,404);await ok('/me/ai-settings',{...body,api_key:'offline-mom-key'},'PUT');await ok('/me',{confirm:true},'DELETE');const momAgain=await ok('/auth/dev',{code:'dev-mom'});token=momAgain.access_token;assert.equal((await ok('/me/ai-settings')).has_key,false);token=dadToken;
  assert.equal((await ok('/me/ai-key',{expected_version:1},'DELETE')).has_key,false);assert.equal((await request(`/children/${child.id}/ai-batches`,{wordbook_id:book.id,words:['dog']})).error.code,'AI_KEY_REQUIRED');
  await ok('/me/privacy-consent',{confirm:true},'DELETE');assert.equal((await ok('/me/ai-settings')).has_key,false);assert.equal((await ok('/me/ai-usage')).items.length,2);await ok('/me/ai-key',{expected_version:2},'DELETE');
  console.log('PASS: AI settings, private-key connection/generation, billing reads, ownership, payment-disabled and withdrawn-consent management through real Nest/Express handlers. No external requests.');
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});}
})().catch(()=>{console.error('AI account HTTP verification failed');process.exitCode=1;});
