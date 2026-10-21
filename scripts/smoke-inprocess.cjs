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
 const audioObjects=new Map();let audioCalls=0;
 const audio={profile:{provider:'mock',model:'mock'},voices:[{id:'gb',accent:'en-GB',gender:'Female'}],synthesize:async()=>{audioCalls++;return {bytes:Buffer.from('ID3-route-test')};},storageProfile:'mock',stores:{mock:{put:async(k,b)=>{audioObjects.set(k,b);},get:async k=>audioObjects.get(k),stat:async k=>audioObjects.has(k)?{size:audioObjects.get(k).length}:null}},spoolDir:resolve('.local',name+'-spool'),childDaily:20,userDaily:40};
 const {app,dispose}=await createApplication({audio,vocabulary:{provider:'deepseek',model:'offline-route-test',promptVersion:'test',rawPromptVersion:'raw-test',generateRaw:async raw=>{if(raw==='无法识别')return {error:'NO_WORDS_FOUND',items:[]};assert.equal(raw,'1. pencil 铅笔');return {error:null,items:[{input_index:0,input:'pencil',status:'ok',lemma:'pencil',part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:'铅笔',sentence_en:'I see the pencil.',sentence_zh:'我看到铅笔。',reason:null}]};},generate:async words=>({items:words.map((w,i)=>({input_index:i,input:w,status:'ok',lemma:w,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:'路线测试词',sentence_en:`I see the ${w}.`,sentence_zh:'这是路线测试例句。',reason:null}))})}});let token='';
 function request(path,body,key=randomUUID(),method=body?'POST':'GET'){
  return new Promise((resolve,reject)=>{
   const chunks=[];const socket=new Duplex({read(){},write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
   const req=new IncomingMessage(socket);req.method=method;req.url='/api'+path;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;
   const content=body?Buffer.from(JSON.stringify(body)):null;
   req.headers={host:'127.0.0.1','content-type':'application/json',authorization:`Bearer ${token}`,'idempotency-key':key,...(content?{'content-length':String(content.length)}:{})};
   const res=new ServerResponse(req);res.assignSocket(socket);
   const timeout=setTimeout(()=>reject(Error('handler timed out: '+path+' '+Buffer.concat(chunks).toString())),10000);
   res.on('finish',()=>{clearTimeout(timeout);const raw=Buffer.concat(chunks).toString();try{const body=raw.slice(raw.indexOf('\r\n\r\n')+4);const data=String(res.getHeader('Content-Type')).startsWith('audio/mpeg')?{data:body}:JSON.parse(body);resolve({status:res.statusCode,...data});}catch(e){reject(e);}finally{socket.destroy();}});
   app.getHttpAdapter().getInstance()(req,res);
   req.complete=true;req._destroy=(error,callback)=>callback(error);if(content)req.push(content);req.push(null);
  });
 }
 async function ok(path,body,key,method){const r=await request(path,body,key,method);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
 try{
  assert.equal((await request('/me')).status,401);
  assert.equal((await request('/auth/dev',{code:'dev-dad',unexpected:true})).status,422);
  const login=await ok('/auth/dev',{code:'dev-dad'});token=login.access_token;
  assert.equal((await request('/voice-previews',{accent:'en-GB',voice_id:'gb',text:'arbitrary text'})).status,422);
  {const previewRequest=await request('/voice-previews',{accent:'en-GB',voice_id:'gb'});assert.equal(previewRequest.status,202);let preview=previewRequest.data;
  for(let n=0;n<30&&preview.status!=='succeeded';n++){await new Promise(r=>setTimeout(r,200));preview=await ok(`/voice-previews/${preview.job_id}`);}
  assert.equal(preview.status,'succeeded');assert.equal(await ok(preview.resource_path),'ID3-route-test');
  assert.equal((await request('/voice-previews',{accent:'en-GB',voice_id:'gb'})).status,200);}
  const f=await ok('/families',{name:'路由验收'});
  const members=await ok(`/families/${f.id}/members`);assert.equal(members.items.length,1);assert.equal(members.items[0].role,'owner');
  const c=await ok(`/families/${f.id}/children`,{nickname:'测试',accent:'en-GB'});
  const goal=await ok(`/children/${c.id}/learning-goal`);assert.equal(goal.daily_goal,10);
  const updatedGoal=await ok(`/children/${c.id}/learning-goal`,{daily_goal:20,expected_version:goal.version},undefined,'PUT');assert.equal(updatedGoal.today_goal,20);
  assert.equal((await request(`/children/${c.id}/learning-goal`,{daily_goal:0,expected_version:updatedGoal.version},undefined,'PUT')).status,422);
  await ok(`/children/${c.id}/learning-goal`,{daily_goal:10,expected_version:updatedGoal.version},undefined,'PUT');
  const book=await ok(`/children/${c.id}/wordbooks`,{name:'词本'});
  const batch=await ok(`/children/${c.id}/batches`,{wordbook_id:book.id,words:['apple','book']});
  await ok(`/batches/${batch.id}/confirm`,{expected_version:1,selections:batch.items.map(i=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  assert.equal((await ok('/voices')).items[0].id,'gb');
  const preferences=await ok('/me/audio-settings');assert.equal(preferences.accent,'en-GB');
  const savedPreferences=await ok('/me/audio-settings',{accent:'en-GB',voice_id:'gb',expected_version:preferences.version},undefined,'PUT');
  assert.deepEqual(await ok('/me/audio-settings'),savedPreferences);
  assert.equal((await request('/me/audio-settings',{accent:'en-GB',voice_id:'gb',expected_version:savedPreferences.version,actor_id:c.id},undefined,'PUT')).status,422);
  const audioWord=(await ok(`/children/${c.id}/words`)).items[0];
  const speech={word_id:audioWord.id,content_version:audioWord.version,accent:'en-GB',voice_id:'gb',speech_rate:1};
  assert.equal((await request('/audio',{...speech,text:'untrusted'})).status,422);
  assert.equal((await request('/audio',{...speech,sentence_id:audioWord.id})).status,422);
  const queued=await request('/audio',speech);assert.equal(queued.status,202);let sound=queued.data;
  for(let n=0;n<30&&sound.status!=='succeeded';n++){await new Promise(r=>setTimeout(r,200));sound=await ok(`/jobs/${sound.job_id}`);}
  assert.equal(sound.status,'succeeded',JSON.stringify(sound));
  assert.equal(await ok(sound.resource_path),'ID3-route-test');
  assert.equal((await request('/audio',speech)).status,200);assert.equal(audioCalls,2);
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
  const rangedWrong=await ok(`/children/${c.id}/wrong-words?date_from=${today}&date_to=${today}&source=review&limit=1`);assert.equal(rangedWrong.items.length,1);
  assert.equal((await request(`/children/${c.id}/wrong-words?date_from=${today}`)).status,422);
  assert.equal((await request(`/children/${c.id}/wrong-words?unknown=1`)).status,422);
  assert.equal((await request(`/children/${c.id}/study-sessions`,{source:'manual',word_ids:[]})).status,422);
  const extra=await ok(`/children/${c.id}/study-sessions`,{source:'calendar',date:today});
  const queue=await ok(`/study-sessions/${extra.id}/cards?limit=1`);assert.equal(queue.items.length,1);assert.equal(queue.items[0].practice_only,true);
  const practiced=await ok('/reviews',{session_id:extra.id,lease_generation:extra.lease_generation,card_id:queue.items[0].id,expected_version:queue.items[0].version,event_id:randomUUID(),rating:'good'});
  assert.equal(practiced.practice_only,true);assert.equal(practiced.version,queue.items[0].version);assert.equal(practiced.today.completed_words,1);
  await ok(`/study-sessions/${extra.id}/end`,{lease_generation:extra.lease_generation});
  const aiBody={wordbook_id:book.id,source_type:'text',raw_text:'1. pencil 铅笔',theme:'课堂'};
  assert.equal((await request(`/children/${c.id}/ai-batches`,{...aiBody,source_type:'image',url:'https://example.invalid/a.png'})).status,422);
  const created=await ok(`/children/${c.id}/ai-batches`,aiBody,'ai-dedupe');assert.equal(created.status,'queued');
  assert.equal((await ok(`/children/${c.id}/ai-batches`,aiBody,'ai-dedupe')).id,created.id);
  let ai=created;for(let n=0;n<30&&['queued','running'].includes(ai.status);n++){await new Promise(r=>setTimeout(r,100));ai=await ok(`/ai-batches/${created.id}`);}
  assert.equal(ai.status,'succeeded');assert(ai.items[0].word_id);
  assert.equal((await ok(`/children/${c.id}/ai-batches`)).items[0].id,ai.id);
  const failedJob=await ok(`/children/${c.id}/ai-batches`,{...aiBody,raw_text:'无法识别'});
  let failed=failedJob;for(let n=0;n<30&&['queued','running'].includes(failed.status);n++){await new Promise(r=>setTimeout(r,100));failed=await ok(`/ai-batches/${failed.id}`);}
  assert.equal(failed.status,'failed');
  const editBody={...aiBody,theme:'重新编辑',expected_attempts:failed.attempts};
  assert.equal((await request(`/ai-batches/${failed.id}`,{...editBody,extra:true},'invalid-edit','PUT')).status,422);
  const edited=await ok(`/ai-batches/${failed.id}`,editBody,'replace-job','PUT');assert.equal(edited.id,failed.id);assert.equal(edited.error_code,null);
  assert.equal((await ok(`/ai-batches/${failed.id}`,editBody,'replace-job','PUT')).id,failed.id);
  for(let n=0;n<30&&['queued','running'].includes(failed.status= (await ok(`/ai-batches/${failed.id}`)).status);n++)await new Promise(r=>setTimeout(r,100));
  assert.equal(failed.status,'succeeded');
  const generated=(await ok(`/children/${c.id}/words`)).items.find(w=>w.id===ai.items[0].word_id);assert.equal(generated.example.text_en,'I see the pencil.');
  const audioReview=await ok(`/children/${c.id}/study-sessions`,{source:'manual',word_ids:[generated.id]});
  const audioCard=(await ok(`/study-sessions/${audioReview.id}/cards`)).items[0];
  assert.equal(audioCard.ipa_gb,'/test/');assert.equal(audioCard.example.text_en,'I see the pencil.');assert.equal(audioCard.example.content_version,1);
  assert.equal('translation_zh' in audioCard.example,false);
  const revealedWord=await ok(`/children/${c.id}/words/${audioCard.child_word_id}`);assert.equal(revealedWord.example.translation_zh,'我看到铅笔。');assert.equal(revealedWord.example.id,audioCard.example.id);
  await ok(`/study-sessions/${audioReview.id}/end`,{lease_generation:audioReview.lease_generation});
  assert.equal((await request(`/children/${c.id}/ai-batches`,{...aiBody,unexpected:true})).status,422);
  console.log('PASS: Nest/Express request parsing, validation, auth, batch, real FSRS, review replay, lease end and monthly quiz worker/PUT/submit/results, calendar, wrong words practice async AI batch save, audio worker/cache/authorized binary download (in process; TCP not tested)');
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});rmSync(resolve('.local',name+'-spool'),{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
