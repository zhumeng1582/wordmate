// Runs the initialized Nest/Express validation + worker + save path with synthetic AI.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{IncomingMessage,ServerResponse}=require('node:http'),{Duplex}=require('node:stream'),{resolve}=require('node:path'),{rmSync}=require('node:fs');
test('AI poem import validates draft and atomic batch save requests through HTTP, including replay',async()=>{
 const name='poem-import-http-'+randomUUID();
 Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:'pglite:.local/'+name,LLM_PROVIDER:'qwen',QWEN_API_KEY:'synthetic-test-key',AI_CREDENTIAL_KEY:'10'.repeat(32),AI_MODEL_CATALOG:JSON.stringify([{id:'qwen',provider:'qwen',model:'test-model',label:'Test',vision:true,base_url:'https://dashscope.aliyuncs.com/compatible-mode/v1',input_yuan_per_million:'1',output_yuan_per_million:'2',cached_yuan_per_million:'0.25'}])});
 const sourceItems=[{title:'《春晓》',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓，处处闻啼鸟。',annotations:'晓：早晨；不觉晓：不知不觉天已亮。',translation:'春天里睡得香甜，不知不觉天已经亮了。'},{title:'静夜思',author:'李白',dynasty:'唐',body:'床前明月光，疑是地上霜。',annotations:'疑：好像。霜：地面凝结的白色冰晶。',translation:'床前洒着明亮的月光，好像地上铺了一层白霜。'}];let aiCalls=0,token='';
 const {createApplication}=require('../../apps/api/dist/main.js');
 const {app,dispose}=await createApplication({aiFetch:async()=>{aiCalls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:sourceItems,incomplete:false,overflow:false})}}],usage:{prompt_tokens:100,completion_tokens:50,prompt_tokens_details:{cached_tokens:0}}}),{status:200});}});
 function request(path,body,method=body?'POST':'GET'){
  return new Promise((resolve,reject)=>{
   const chunks=[],socket=new Duplex({read(){},write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback();}}),req=new IncomingMessage(socket),content=body?Buffer.from(JSON.stringify(body)):null;
   req.method=method;req.url='/api'+path;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;req.headers={host:'127.0.0.1','content-type':'application/json',authorization:'Bearer '+token,'idempotency-key':randomUUID(),...(content?{'content-length':String(content.length)}:{})};
   const res=new ServerResponse(req);res.assignSocket(socket);const timer=setTimeout(()=>reject(Error('HTTP timeout')),15000);
   res.on('finish',()=>{clearTimeout(timer);try{const raw=Buffer.concat(chunks).toString(),json=JSON.parse(raw.slice(raw.indexOf('\r\n\r\n')+4));resolve({status:res.statusCode,...json});}catch(error){reject(error);}finally{socket.destroy();}});
   app.getHttpAdapter().getInstance()(req,res);req.complete=true;req._destroy=(_error,callback)=>callback(null);if(content)req.push(content);req.push(null);
  });
 }
 async function ok(path,body,method){const response=await request(path,body,method);assert.equal(response.status,200,JSON.stringify(response));return response.data;}
 try{
  const policy=await ok('/privacy/policy');token=(await ok('/auth/dev',{code:'dev-dad'})).access_token;
  await ok('/me/privacy-consent',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true},'PUT');
  const family=await ok('/families',{name:'Synthetic poem import'}),child=await ok(`/families/${family.id}/children`,{nickname:'测试孩子',accent:'en-GB'}),route=`/children/${child.id}/poems`,job=randomUUID(),jobPath=route+'/imports/'+job;
  await ok(route+'/imports',{id:job,raw_text:'春晓和静夜思的诗词原文'});
  let ready;for(let n=0;n<60;n++){ready=await ok(jobPath);if(ready.status==='ready'||ready.status==='failed')break;await new Promise(r=>setTimeout(r,200));}assert.equal(ready.status,'ready',JSON.stringify(ready));assert.equal(aiCalls,1);const items=ready.results.flatMap(part=>part.items).map(({issues,...draft})=>draft);assert.equal(items[0].title,'春晓');
  const batch=items.map((draft,i)=>({draft,key:'draft-'+i,saved:false,locked:false,issues:[],issuesReviewed:true}));
  await ok(jobPath+'/draft',{batch,expected_batch:0},'PUT');assert.deepEqual((await ok(jobPath)).review_draft,batch);
  const {annotations,translation,...legacyFields}=items[0];
  const first={items:[legacyFields],request_id:randomUUID(),expected_batch:0,remaining_batch:batch.slice(1)},result=await ok(jobPath+'/save',first);assert.equal(result.saved_count,1);assert.equal(result.remaining_batch.length,1);assert.equal(result.review_generation,1);
  assert.deepEqual(await ok(jobPath+'/save',first),result);assert.equal((await ok(route)).total,1);const firstSaved=(await ok(route)).items[0],detail=await ok(route+'/'+firstSaved.id);assert.equal(detail.annotations,annotations);assert.equal(detail.translation,translation);
  assert.equal((await request(jobPath+'/draft',{batch,expected_batch:0},'PUT')).status,409);
  const last={items:[items[1]],request_id:randomUUID(),expected_batch:1,remaining_batch:[]},saved=await ok(jobPath+'/save',last);assert.equal(saved.total_saved,2);assert.deepEqual(await ok(jobPath+'/save',last),saved);assert.equal((await ok(route)).total,2);const all=(await ok(route)).items;for(const p of all){const detail=await ok(route+'/'+p.id);assert(detail.annotations);assert(detail.translation);}
  assert.equal((await request(jobPath+'/save',{...last,unexpected:true})).status,422);assert.equal((await request(jobPath+'/save',{items:[items[0]],request_id:randomUUID()})).status,422);
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});}
});
