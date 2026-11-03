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
 const audio={profile:{provider:'mock',model:'mock'},voices:[{id:'gb',accent:'en-GB',gender:'Female'}],synthesize:async()=>{audioCalls++;return {bytes:Buffer.from('ID3-route-test')};},storageProfile:'mock',stores:{mock:{put:async(k,b)=>{audioObjects.set(k,b);},get:async k=>audioObjects.get(k),stat:async k=>audioObjects.has(k)?{size:audioObjects.get(k).length}:null,delete:async k=>{audioObjects.delete(k);}}},spoolDir:resolve('.local',name+'-spool'),pricePer10000Characters:'1'};
 const {app,dispose}=await createApplication({audio,encouragement:async()=>[{en:'Keep learning, and let your curiosity grow.',zh:'坚持学习，让好奇心不断生长。',theme:'curiosity'},{en:'Small steps can lead to wonderful discoveries.',zh:'小小的脚步，也能走向美好的发现。',theme:'discovery'},{en:'Every word you learn is a small step forward.',zh:'每学会一个单词，都是向前迈出的一小步。',theme:'growth'}],vocabulary:{provider:'deepseek',model:'offline-route-test',promptVersion:'test',rawPromptVersion:'raw-test',generateRaw:async raw=>{if(raw==='无法识别')return {error:'NO_WORDS_FOUND',items:[]};assert.equal(raw,'1. pencil 铅笔');return {error:null,items:[{input_index:0,input:'pencil',status:'ok',lemma:'pencil',part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:'铅笔',sentence_en:'I see the pencil.',sentence_zh:'我看到铅笔。',reason:null}]};},generate:async words=>({items:words.map((w,i)=>({input_index:i,input:w,status:'ok',lemma:w,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:'路线测试词',sentence_en:`I see the ${w}.`,sentence_zh:'这是路线测试例句。',reason:null}))})}});let token='';
 function request(path,body,key=randomUUID(),method=body?'POST':'GET'){
  return new Promise((resolve,reject)=>{
   const chunks=[];const socket=new Duplex({read(){},write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
   const req=new IncomingMessage(socket);req.method=method;req.url='/api'+path;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;
   const content=body?Buffer.from(JSON.stringify(body)):null;
   req.headers={host:'127.0.0.1','content-type':'application/json',authorization:`Bearer ${token}`,'idempotency-key':key,...(content?{'content-length':String(content.length)}:{})};
   const res=new ServerResponse(req);res.assignSocket(socket);
   const timeout=setTimeout(()=>reject(Error('handler timed out: '+path+' '+Buffer.concat(chunks).toString())),10000);
   res.on('finish',()=>{clearTimeout(timeout);const raw=Buffer.concat(chunks).toString();try{const body=raw.slice(raw.indexOf('\r\n\r\n')+4);const data=/^(audio\/mpeg|image\/)/.test(String(res.getHeader('Content-Type')))?{data:body}:JSON.parse(body);resolve({status:res.statusCode,mime:res.getHeader('Content-Type'),...data});}catch(e){reject(e);}finally{socket.destroy();}});
   app.getHttpAdapter().getInstance()(req,res);
   req.complete=true;req._destroy=(error,callback)=>callback(error);if(content)req.push(content);req.push(null);
  });
 }
 async function ok(path,body,key,method){const r=await request(path,body,key,method);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
 try{
  assert.equal((await request('/me')).status,401);
  assert.equal((await request('/children/'+randomUUID()+'/import-file',{name:'a.txt',base64:'YQ=='})).status,401);
  assert.equal((await request('/auth/dev',{code:'dev-dad',unexpected:true})).status,422);
  const policy=await ok('/privacy/policy');
  const login=await ok('/auth/dev',{code:'dev-dad'});token=login.access_token;
  assert.equal((await request('/families',{name:'同意前不得创建'})).status,403);
  await ok('/me/privacy-consent',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true},undefined,'PUT');
  assert.equal((await ok('/me/privacy-consent')).accepted,true);
  assert.equal((await request('/voice-previews',{accent:'en-GB',voice_id:'gb',text:'arbitrary text'})).status,422);
  {const previewRequest=await request('/voice-previews',{accent:'en-GB',voice_id:'gb'});assert.equal(previewRequest.status,202);let preview=previewRequest.data;
  for(let n=0;n<30&&preview.status!=='succeeded';n++){await new Promise(r=>setTimeout(r,200));preview=await ok(`/voice-previews/${preview.job_id}`);}
  assert.equal(preview.status,'succeeded');assert.equal(await ok(preview.resource_path),'ID3-route-test');
  assert.equal((await request('/voice-previews',{accent:'en-GB',voice_id:'gb'})).status,200);}
  {const me=await ok('/me'),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=';
   const profile=await ok('/me/profile',{display_name:'陪学家长',expected_version:me.user.version,avatar_base64:png,avatar_mime:'image/png'},undefined,'PUT');
   assert.equal(profile.display_name,'陪学家长');const avatar=await request(profile.avatar_path);assert.equal(avatar.status,200);assert.equal(avatar.mime,'image/png');
   assert.equal((await request(profile.avatar_path+'&unexpected=1')).status,422);const savedToken=token;token='';assert.equal((await request(profile.avatar_path)).status,401);token=savedToken;
  }
  const f=await ok('/families',{name:'路由验收'});
  {const invitation=await ok(`/families/${f.id}/invites`,{});const destination=await ok('/family-invites/resolve',{invite_token:invitation.invite_token});assert.equal(destination.state,'member');assert.equal(destination.family.id,f.id);
   assert.equal((await request('/family-invites/resolve',{invite_token:invitation.invite_token,user_id:login.user.id})).status,422);
   const savedToken=token;token='';assert.equal((await request('/family-invites/resolve',{invite_token:invitation.invite_token})).status,401);
   const parent=await ok('/auth/dev',{code:'dev-mom'});token=parent.access_token;assert.equal((await request('/family-invites/resolve',{invite_token:invitation.invite_token})).status,403);
   await ok('/me/privacy-consent',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true},undefined,'PUT');assert.equal((await ok('/family-invites/resolve',{invite_token:invitation.invite_token})).state,'ready');
   await ok('/family-invites/claim',{invite_token:invitation.invite_token});assert.equal((await ok('/family-invites/resolve',{invite_token:invitation.invite_token})).state,'waiting');token=savedToken;
   await ok(`/family-invites/${invitation.id}/approve`,{});token=parent.access_token;assert.equal((await ok('/family-invites/resolve',{invite_token:invitation.invite_token})).state,'member');token=savedToken;
   await ok(`/families/${f.id}/members/${parent.user.id}`,{},undefined,'DELETE');token=parent.access_token;assert.equal((await ok('/family-invites/resolve',{invite_token:invitation.invite_token})).state,'unavailable');token=savedToken;}
  const members=await ok(`/families/${f.id}/members`);assert.equal(members.items.length,1);assert.equal(members.items[0].role,'owner');
  // Match the family page payload, including unselected optional profile fields.
  for(const profile of [{gender:'invalid'},{school_grade:42},{school_grade:'x'.repeat(25)},{school_grade:'invalid\n'},{unexpected:true}])assert.equal((await request(`/families/${f.id}/children`,{nickname:'无效档案',...profile})).status,422);
  const emptyProfile=await ok(`/families/${f.id}/children`,{nickname:'选填留空',school_grade:'',gender:'unspecified'});
  assert.equal(emptyProfile.school_grade,'');assert.equal(emptyProfile.gender,'unspecified');
  {const catalogue=await ok(`/textbook-volumes?child_id=${emptyProfile.id}`);assert.equal(catalogue.items.length,4);const volume=catalogue.items[0];const joined=await ok(`/children/${emptyProfile.id}/textbook-volumes/${volume.id}/join`,{});assert.equal((await ok(`/children/${emptyProfile.id}/words?wordbook_id=${joined.id}`)).total,volume.word_count);assert.equal((await ok(`/textbook-volumes?child_id=${emptyProfile.id}`)).items[0].joined_book_id,joined.id);}
  const c=await ok(`/families/${f.id}/children`,{nickname:'测试',accent:'en-GB',school_grade:'小学一年级',gender:'boy'});
  assert.equal(c.school_grade,'小学一年级');assert.equal(c.gender,'boy');
  assert.equal((await ok(`/families/${f.id}/children`)).items.find(item=>item.id===c.id).school_grade,'小学一年级');
  const goal=await ok(`/children/${c.id}/learning-goal`);assert.equal(goal.daily_goal,10);
  const updatedGoal=await ok(`/children/${c.id}/learning-goal`,{daily_goal:20,expected_version:goal.version},undefined,'PUT');assert.equal(updatedGoal.today_goal,20);
  assert.equal((await request(`/children/${c.id}/learning-goal`,{daily_goal:0,expected_version:updatedGoal.version},undefined,'PUT')).status,422);
  await ok(`/children/${c.id}/learning-goal`,{daily_goal:10,expected_version:updatedGoal.version},undefined,'PUT');
  const book=await ok(`/children/${c.id}/wordbooks`,{name:'词本',grade:'三年级',textbook:'人教版',category:'阅读'});
  assert.equal(book.grade,'三年级');
  assert.equal((await ok('/shared-wordbooks?q=apple')).items.length,0);
  assert.equal((await request(`/children/${c.id}/wordbooks/${book.id}/share`,{published:false},undefined,'PUT')).status,404);
  const batch=await ok(`/children/${c.id}/batches`,{wordbook_id:book.id,words:['apple','book']});
  await ok(`/batches/${batch.id}/confirm`,{expected_version:1,selections:batch.items.map(i=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  assert.equal((await ok(`/children/${c.id}/today?wordbook_id=${book.id}`)).new_count,2);
  {const scoped=await ok(`/children/${c.id}/study-sessions`,{source:'new_words',wordbook_id:book.id});assert.equal(scoped.total,2);await ok(`/study-sessions/${scoped.id}/end`,{lease_generation:scoped.lease_generation});}
  const shared=await ok(`/children/${c.id}/wordbooks/${book.id}/share`,{published:true,title:'词本',author:'作者',description:'测试简介'},undefined,'PUT');assert.equal((await ok('/shared-wordbooks?q=作者')).items[0].id,shared.id);assert.equal((await ok('/shared-wordbooks?grade='+encodeURIComponent('三年级'))).items[0].id,shared.id);assert.equal((await ok(`/shared-wordbooks/${shared.id}`)).word_count,2);
  await ok(`/children/${c.id}/wordbooks/${book.id}/share`,{published:false},undefined,'PUT');
  assert.equal((await ok('/voices')).items[0].id,'gb');
  const preferences=await ok('/me/audio-settings');assert.equal(preferences.accent,'en-GB');
  const savedPreferences=await ok('/me/audio-settings',{accent:'en-GB',voice_id:'gb',auto_play:true,expected_version:preferences.version},undefined,'PUT');
  assert.deepEqual(await ok('/me/audio-settings'),savedPreferences);assert.equal(savedPreferences.auto_play,true);
  assert.equal((await request('/me/audio-settings',{accent:'en-GB',voice_id:'gb',expected_version:savedPreferences.version,actor_id:c.id},undefined,'PUT')).status,422);
  assert.equal((await request(`/children/${c.id}/import-file`,{name:'large.txt',base64:'a'.repeat(7*1024*1024)})).status,413);
  const imported=await ok(`/children/${c.id}/import-file`,{name:'words.csv',base64:Buffer.from('airport,机场').toString('base64')});assert.equal(imported.text,'airport,机场');
  assert.equal((await request(`/children/${c.id}/import-file`,{name:'bad.exe',base64:'YQ=='})).status,422);
  const wordPage=await ok(`/children/${c.id}/words?limit=1`);assert.equal(wordPage.total,2);assert(wordPage.next_cursor);assert.equal(wordPage.items[0].annotations.favorite,false);
  const tagged=await ok(`/words/${wordPage.items[0].id}/annotations`,{expected_version:0,favorite:true},undefined,'PATCH');assert.equal(tagged.favorite,true);assert.equal((await ok(`/words/${wordPage.items[0].id}/annotations`)).favorite,true);
  assert.equal((await ok(`/children/${c.id}/words?mark=favorite&q=${wordPage.items[0].lemma}`)).total,1);
  assert.equal((await request(`/words/${wordPage.items[0].id}/annotations`,{expected_version:1,easy:true,error_prone:true},undefined,'PATCH')).status,422);
  const wordPage2=await ok(`/children/${c.id}/words?limit=1&cursor=${wordPage.next_cursor}`);assert.equal(wordPage2.items.length,1);assert.notEqual(wordPage.items[0].id,wordPage2.items[0].id);
  const exported=await ok(`/children/${c.id}/word-exports`,{word_ids:[wordPage.items[0].id]});assert.equal(exported.count,1);assert(exported.content.startsWith('\uFEFF'));
  assert.equal((await ok(`/children/${c.id}/word-exports`,{all:true,excluded_ids:[wordPage.items[0].id]})).count,1);
  assert.equal((await request(`/children/${c.id}/word-exports`,{all:true,word_ids:[]})).status,422);
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
  const favoriteSession=await ok(`/children/${c.id}/study-sessions`,{source:'favorites'});assert.equal(favoriteSession.total,1);await ok(`/study-sessions/${favoriteSession.id}/end`,{lease_generation:favoriteSession.lease_generation});
  assert.equal((await ok(`/children/${c.id}/monthly-quizzes/preview?month=${month}&scope=favorites`)).eligible_count,1);
  const preview=await ok(`/children/${c.id}/monthly-quizzes/preview?month=${month}`);assert.equal(preview.eligible_count,1);
  let quiz=await ok(`/children/${c.id}/monthly-quizzes`,{month,mode:'sample',sample_count:10});assert.equal(quiz.status,'preparing');
  for(let n=0;n<30&&quiz.status==='preparing';n++){await new Promise(r=>setTimeout(r,200));quiz=await ok(`/monthly-quizzes/${quiz.id}`);}
  assert.equal(quiz.status,'ready');
  assert.equal((await request(`/monthly-quizzes/${quiz.id}/results`)).status,409);
  const started=await ok(`/monthly-quizzes/${quiz.id}/resume`,{expected_version:quiz.version});
  const question=(await ok(`/monthly-quizzes/${quiz.id}/items?limit=50`)).items[0];
  assert.equal(typeof question.word.lemma,'string');assert.equal(typeof question.word.id,'string');assert.equal(question.word.version,1);assert(!('meaning_zh' in question.word));assert(!('correct_option_id' in question));
  const quizSpeech=await request('/audio',{word_id:question.word.id,content_version:question.word.version,accent:'en-GB',voice_id:'gb',speech_rate:1});assert([200,202].includes(quizSpeech.status));
  const answered=await ok(`/monthly-quizzes/${quiz.id}/items/${question.id}/answer`,{expected_version:question.answer_version,session_id:started.session.id,lease_generation:started.session.lease_generation,selected_option_id:question.options[0].id},undefined,'PUT');
  assert.equal(answered.answered_count,1);
  const scored=await ok(`/monthly-quizzes/${quiz.id}/submit`,{expected_version:answered.quiz_version,session_id:started.session.id,lease_generation:started.session.lease_generation,confirm_unanswered:false});assert.equal(scored.total_count,1);
  assert.equal((await ok(`/monthly-quizzes/${quiz.id}/results`)).items.length,1);
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const calendar=await ok(`/children/${c.id}/calendar?month=${month}`);assert(calendar.days.find(d=>d.date===today).wrong_words>=1);
  const share=await ok(`/children/${c.id}/checkin-share`,{date:today});assert.equal(share.studied_words,1);assert.equal(share.quotes.length,3);assert.equal(share.copy_source,'ai');assert.equal('child_id' in share,false);
  assert.deepEqual(await ok(`/children/${c.id}/checkin-share`,{date:today}),share);
  assert.equal((await request(`/children/${c.id}/checkin-share`,{date:today,nickname:'private'})).status,422);
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
  assert.equal(calendar.days.find(d=>d.date===today).reviewable_words,1);
  assert.equal((await request(`/children/${c.id}/study-sessions`,{source:'calendar',date:today,scope:'unknown'})).status,422);
  const historical=await ok(`/children/${c.id}/study-sessions`,{source:'calendar',date:today,scope:'studied'});assert.equal(historical.total,1);
  assert.equal((await ok(`/study-sessions/${historical.id}/cards`)).items[0].practice_only,true);
  await ok(`/study-sessions/${historical.id}/end`,{lease_generation:historical.lease_generation});
  const rangeQuery=`date_from=${today}&date_to=${today}&scope=studied`;
  assert.equal((await ok(`/children/${c.id}/history-range?${rangeQuery}`)).count,1);
  assert.equal((await request(`/children/${c.id}/history-range?${rangeQuery}&unexpected=1`)).status,422);
  assert.equal((await request(`/children/${c.id}/history-range?date_from=${today}&scope=studied`)).status,422);
  const rangeSession=await ok(`/children/${c.id}/study-sessions`,{source:'calendar',date_from:today,date_to:today,scope:'studied'});assert.equal(rangeSession.total,1);assert.equal(rangeSession.date_from,today);assert.equal(rangeSession.date_to,today);
  await ok(`/study-sessions/${rangeSession.id}/end`,{lease_generation:rangeSession.lease_generation});
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
  await ok('/me/privacy-consent',{confirm:true},undefined,'DELETE');
  assert.equal((await request(`/children/${c.id}/today`)).status,403);
  let management=await ok('/me/data-management');const childToDelete=management.families[0].children.find(item=>item.id===c.id);
  let deletion=await request(`/children/${c.id}`,{confirm_nickname:childToDelete.nickname,expected_version:childToDelete.version},undefined,'DELETE');assert.equal(deletion.status,202);const childDeletionId=deletion.data.id;
  for(let n=0;n<40&&deletion.data.status!=='succeeded';n++){await new Promise(r=>setTimeout(r,100));deletion=await request(`/lifecycle-jobs/${childDeletionId}`);}
  assert.equal(deletion.data.status,'succeeded',JSON.stringify(deletion));
  const dadToken=token;token=(await ok('/auth/dev',{code:'dev-outsider'})).access_token;
  assert.equal((await request(`/lifecycle-jobs/${childDeletionId}`)).status,404);token=dadToken;
  management=await ok('/me/data-management');const familyToDelete=management.families[0];
  let familyDeletion=await request(`/families/${f.id}`,{confirm_name:familyToDelete.name,expected_version:familyToDelete.version,confirm_data_deletion:true},undefined,'DELETE');assert.equal(familyDeletion.status,202);const familyDeletionId=familyDeletion.data.id;
  for(let n=0;n<40&&familyDeletion.data.status!=='succeeded';n++){await new Promise(r=>setTimeout(r,100));familyDeletion=await request(`/lifecycle-jobs/${familyDeletionId}`);}
  assert.equal(familyDeletion.data.status,'succeeded',JSON.stringify(familyDeletion));
  await ok('/auth/logout',{});assert.equal((await request('/me')).status,401);
  token=(await ok('/auth/dev',{code:'dev-dad',management_only:true})).access_token;
  assert.equal((await request('/voices')).error.code,'MANAGEMENT_SESSION_ONLY');
  assert.equal((await ok('/me/privacy-consent')).management_only,true);
  assert.equal((await ok('/me',{confirm:true},undefined,'DELETE')).deleted,true);
  assert.equal((await request('/me')).status,401);
  console.log('PASS: Nest/Express request parsing, validation, auth, word search/annotation, batch, real FSRS, review replay, lease end and monthly quiz worker/PUT/submit/results, calendar, wrong words practice async AI batch save, audio worker/cache/authorized binary download, privacy consent/withdrawal, management-only login, deletion receipts, logout and account erasure (in process; TCP not tested)');
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});rmSync(resolve('.local',name+'-spool'),{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
