// Full Nest/Express + worker flow; all AI and speech responses are synthetic.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{IncomingMessage,ServerResponse}=require('node:http'),{Duplex}=require('node:stream'),{resolve}=require('node:path'),{rmSync}=require('node:fs');
test('poem audio correction supports the real query, failed retry, playback and undo endpoints',async()=>{
 const name='repair-http-'+randomUUID();
 Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:'pglite:.local/'+name,LLM_PROVIDER:'qwen',QWEN_API_KEY:'synthetic-test-key',AI_CREDENTIAL_KEY:'10'.repeat(32),AI_MODEL_CATALOG:JSON.stringify([{id:'qwen',provider:'qwen',model:'test-model',label:'Test',base_url:'https://dashscope.aliyuncs.com/compatible-mode/v1',input_yuan_per_million:'1',output_yuan_per_million:'2',cached_yuan_per_million:'0.25'}])});
 let token='',reject=true,spoken=[];
 const audio={profile:{provider:'cosyvoice',model:'cosyvoice-v3-flash'},voices:[],storageProfile:'mock',stores:{},spoolDir:'/tmp/unused-http-repair',pricePer10000Characters:'1',synthesize:async input=>{spoken.push(input);return {bytes:Buffer.from('ID3-synthetic-repair-'+spoken.length)};}};
 const {createApplication}=require('../../apps/api/dist/main.js');
 const {app,dispose}=await createApplication({audio,aiFetch:async(_url,init)=>{const body=JSON.parse(String(init.body)),verify=body.response_format?.json_schema?.name==='content_repair_verify',value=verify?{approved:!reject,reason:reject?'无法确认本次读音':'读音计划核验通过'}:{values:{},pronunciations:[{text:'耘',alphabet:'py',ph:'yun2'}],note:'已核对耘字读音。',verified:!reject};return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:30,prompt_tokens_details:{cached_tokens:0}}});}});
 function request(path,body,method=body?'POST':'GET'){
  return new Promise((resolve,reject)=>{
   const chunks=[],socket=new Duplex({read(){},write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback();}}),req=new IncomingMessage(socket),content=body?Buffer.from(JSON.stringify(body)):null;
   req.method=method;req.url='/api'+path;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;req.headers={host:'127.0.0.1','content-type':'application/json',authorization:'Bearer '+token,'idempotency-key':randomUUID(),...(content?{'content-length':String(content.length)}:{})};
   const res=new ServerResponse(req);res.assignSocket(socket);const timer=setTimeout(()=>reject(Error('HTTP timeout')),15000);
   res.on('finish',()=>{clearTimeout(timer);try{const raw=Buffer.concat(chunks),payload=raw.subarray(raw.indexOf('\r\n\r\n')+4);resolve(payload[0]===123?{status:res.statusCode,...JSON.parse(payload.toString())}:{status:res.statusCode,bytes:payload});}catch(error){reject(error);}finally{socket.destroy();}});
   app.getHttpAdapter().getInstance()(req,res);req.complete=true;req._destroy=(_error,callback)=>callback(null);if(content)req.push(content);req.push(null);
  });
 }
 async function ok(path,body,method){const response=await request(path,body,method);assert.equal(response.status,200,JSON.stringify(response));return response.data;}
 try{
  const policy=await ok('/privacy/policy');token=(await ok('/auth/dev',{code:'dev-dad'})).access_token;
  await ok('/me/privacy-consent',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true},'PUT');
  const family=await ok('/families',{name:'Synthetic correction'}),child=await ok(`/families/${family.id}/children`,{nickname:'测试孩子',accent:'en-GB'}),poemBase=`/children/${child.id}/poems`,poem=await ok(poemBase,{title:'四时田园杂兴',author:'范成大',body:'昼出耘田夜绩麻。'}),base=`/children/${child.id}/content-repairs`,query=`${base}?kind=poems&target_id=${poem.id}`;
  const initial=await ok(query);assert.equal(initial.latest,null);assert.equal((await request(query+'&invalid=1')).status,422);
  const body={kind:'poems',target_id:poem.id,issue:'audio',description:'耘应读yun2',expected_version:initial.version};
  async function done(id){for(let n=0;n<100;n++){const j=await ok(base+'/'+id);if(['failed','succeeded'].includes(j.status))return j;await new Promise(r=>setTimeout(r,100));}throw Error('worker did not finish');}
  const failed=await done((await ok(base,body)).id);assert.equal(failed.status,'failed');assert.equal(failed.error_code,'REPAIR_NOT_VERIFIED');assert.equal(spoken.length,0);assert.equal((await ok(poemBase+'/'+poem.id)).body,poem.body);
  reject=false;const retried=await ok(base,body);assert.notEqual(retried.id,failed.id);const fixed=await done(retried.id);assert.equal(fixed.status,'succeeded',JSON.stringify(fixed));assert.match(spoken[0].ssml,/<phoneme[^>]+py[^>]+yun2/);assert.equal(spoken.length,1);
  assert.equal((await ok(poemBase+'/'+poem.id+'/audio',{})).resource_path,fixed.resource_path);const speech=await request(fixed.resource_path);assert.equal(speech.status,200);assert.match(speech.bytes.toString(),/^ID3-synthetic-repair-/);
  const undone=await ok(base+'/'+fixed.id+'/undo',{});assert.equal(undone.status,'undone');assert.equal((await request(fixed.resource_path)).status,404);const after=await ok(poemBase+'/'+poem.id);assert.equal(after.body,poem.body);assert.equal(after.memorized_at,null);
  assert.equal((await ok(query)).latest.status,'undone');
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});}
});
