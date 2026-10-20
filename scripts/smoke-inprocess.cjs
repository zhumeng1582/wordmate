// Exercises the real initialized Nest/Express pipeline without opening a network port.
const {IncomingMessage,ServerResponse}=require('node:http');
const {Duplex}=require('node:stream');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {rmSync}=require('node:fs');
const {resolve}=require('node:path');
const name=`inprocess-${randomUUID()}`;
Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:`pglite:.local/${name}`});
const {createApplication}=require('../apps/api/dist/main.js');
(async()=>{
 const {app,dispose}=await createApplication();let token='';
 function request(path,body,key=randomUUID(),method=body?'POST':'GET'){
  return new Promise((resolve,reject)=>{
   const chunks=[];const socket=new Duplex({read(){},write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
   const req=new IncomingMessage(socket);req.method=method;req.url='/api'+path;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;
   const content=body?Buffer.from(JSON.stringify(body)):null;
   req.headers={host:'127.0.0.1','content-type':'application/json',authorization:`Bearer ${token}`,'idempotency-key':key,...(content?{'content-length':String(content.length)}:{})};
   const res=new ServerResponse(req);res.assignSocket(socket);
   const timeout=setTimeout(()=>reject(Error('handler timed out: '+path+' '+Buffer.concat(chunks).toString())),10000);
   res.on('finish',()=>{clearTimeout(timeout);const raw=Buffer.concat(chunks).toString();try{const data=JSON.parse(raw.slice(raw.indexOf('\r\n\r\n')+4));resolve({status:res.statusCode,...data});}catch(e){reject(e);}finally{socket.destroy();}});
   app.getHttpAdapter().getInstance()(req,res);
   req.complete=true;req._destroy=(error,callback)=>callback(error);if(content)req.push(content);req.push(null);
  });
 }
 async function ok(path,body,key,method){const r=await request(path,body,key,method);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
 try{
  assert.equal((await request('/me')).status,401);
  assert.equal((await request('/auth/dev',{code:'dev-dad',unexpected:true})).status,422);
  const login=await ok('/auth/dev',{code:'dev-dad'});token=login.access_token;
  const f=await ok('/families',{name:'路由验收'});
  const members=await ok(`/families/${f.id}/members`);assert.equal(members.items.length,1);assert.equal(members.items[0].role,'owner');
  const c=await ok(`/families/${f.id}/children`,{nickname:'测试',accent:'en-GB'});
  const book=await ok(`/children/${c.id}/wordbooks`,{name:'词本'});
  const batch=await ok(`/children/${c.id}/batches`,{wordbook_id:book.id,words:['apple','book']});
  await ok(`/batches/${batch.id}/confirm`,{expected_version:1,selections:batch.items.map(i=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  const s=await ok(`/children/${c.id}/study-sessions`,{source:'scheduled'});
  const cards=await ok(`/study-sessions/${s.id}/cards`);assert.equal(cards.items.length,2);
  const event={session_id:s.id,card_id:cards.items[0].id,event_id:randomUUID(),expected_version:1,rating:'again',lease_generation:s.lease_generation};
  const result=await ok('/reviews',event);assert.equal(result.version,2);assert.equal(result.today.completed_words,1);
  assert.deepEqual(await ok('/reviews',event),result);
  await ok(`/study-sessions/${s.id}/end`,{lease_generation:s.lease_generation});
  const month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);
  const preview=await ok(`/children/${c.id}/monthly-quizzes/preview?month=${month}`);assert.equal(preview.eligible_count,1);
  let quiz=await ok(`/children/${c.id}/monthly-quizzes`,{month,mode:'sample',sample_count:10});assert.equal(quiz.status,'preparing');
  for(let n=0;n<30&&quiz.status==='preparing';n++){await new Promise(r=>setTimeout(r,200));quiz=await ok(`/monthly-quizzes/${quiz.id}`);}
  assert.equal(quiz.status,'ready');
  assert.equal((await request(`/monthly-quizzes/${quiz.id}/results`)).status,409);
  const started=await ok(`/monthly-quizzes/${quiz.id}/resume`,{expected_version:quiz.version});
  const question=(await ok(`/monthly-quizzes/${quiz.id}/items?limit=50`)).items[0];
  const answered=await ok(`/monthly-quizzes/${quiz.id}/items/${question.id}/answer`,{expected_version:question.answer_version,session_id:started.session.id,lease_generation:started.session.lease_generation,selected_option_id:question.options[0].id},undefined,'PUT');
  assert.equal(answered.answered_count,1);
  const scored=await ok(`/monthly-quizzes/${quiz.id}/submit`,{expected_version:answered.quiz_version,session_id:started.session.id,lease_generation:started.session.lease_generation,confirm_unanswered:false});assert.equal(scored.total_count,1);
  assert.equal((await ok(`/monthly-quizzes/${quiz.id}/results`)).items.length,1);
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const calendar=await ok(`/children/${c.id}/calendar?month=${month}`);assert(calendar.days.find(d=>d.date===today).wrong_words>=1);
  const wrong=await ok(`/children/${c.id}/wrong-words?date=${today}&source=review&limit=1`);assert.equal(wrong.items.length,1);
  assert.equal((await request(`/children/${c.id}/wrong-words?date=2026-02-30`)).status,422);
  assert.equal((await request(`/children/${c.id}/study-sessions`,{source:'manual',word_ids:[]})).status,422);
  const extra=await ok(`/children/${c.id}/study-sessions`,{source:'calendar',date:today});
  const queue=await ok(`/study-sessions/${extra.id}/cards?limit=1`);assert.equal(queue.items.length,1);assert.equal(queue.items[0].practice_only,true);
  const practiced=await ok('/reviews',{session_id:extra.id,lease_generation:extra.lease_generation,card_id:queue.items[0].id,expected_version:queue.items[0].version,event_id:randomUUID(),rating:'good'});
  assert.equal(practiced.practice_only,true);assert.equal(practiced.version,queue.items[0].version);assert.equal(practiced.today.completed_words,1);
  await ok(`/study-sessions/${extra.id}/end`,{lease_generation:extra.lease_generation});
  console.log('PASS: Nest/Express request parsing, validation, auth, batch, real FSRS, review replay, lease end and monthly quiz worker/PUT/submit/results, calendar, wrong words and practice (in process; TCP not tested)');
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
