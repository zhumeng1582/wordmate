// Isolated business-flow verification. No existing family/child data is modified.
const {resolve}=require('node:path');
const {existsSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),offline=process.argv.includes('--offline'),databaseName=`ai-flow-${randomUUID()}`;
if(!offline&&existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development'});
const {connect}=require('../apps/api/dist/database.js');
const {Core}=require('../apps/api/dist/core.js');
const {vocabularyProvider}=require('../apps/api/dist/vocabulary.js');
const {DevIdentity,FixtureDictionary,createScheduler}=require('../apps/api/dist/providers.js');
const {StoredMeaningQuizBuilder}=require('../apps/api/dist/quiz.js');
(async()=>{
 let source,report;const originalFetch=global.fetch;const started=Date.now();
 try{
  const env=offline?{LLM_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'offline-only',DEEPSEEK_MODEL:'offline-flow'}:process.env;
  if(offline)global.fetch=async(url,init)=>{
   assert.equal(String(url),'https://api.deepseek.com/chat/completions');const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);
   const meanings={airport:'机场',luggage:'行李',delay:'延误'};
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({error:null,items:['airport','luggage','delay'].map((word,i)=>({input_index:i,input:word,status:'ok',lemma:word,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:meanings[word],sentence_en:`We talk about ${word}.`,sentence_zh:`我们谈论${meanings[word]}。`,reason:null}))})}}]});
  };
  const provider=await vocabularyProvider(env);assert(provider,'AI_NOT_CONFIGURED');
  const connection=await connect(`pglite:.local/${databaseName}`);source=connection.source;
  const core=new Core(connection.db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'ai-flow-test',()=>new Date(),provider);
  const dad=(await core.login('dev-dad')).user.id,f=await core.createFamily(dad,'family',{name:'隔离验收家庭'}),c=await core.createChild(dad,'child',f.id,{nickname:'验收'}),book=await core.createWordbook(dad,'book',c.id,{name:'验收词本'});
  const body={wordbook_id:book.id,source_type:'text',raw_text:'1. airport 机场\n2、luggage 行李\n3｜delay 延误',theme:'一家人的机场旅行'};
  const job=await core.vocabulary.create(dad,'batch',c.id,body);assert.equal(job.status,'queued');await core.vocabulary.processOne();
  const finished=await core.vocabulary.get(dad,job.id);if(finished.status!=='succeeded')throw Object.assign(Error(),{code:finished.error_code||'BATCH_NOT_FULLY_SAVED'});
  assert.equal((await core.vocabulary.create(dad,'repeat',c.id,body)).id,job.id);
  const words=(await core.words(dad,c.id)).items;assert.equal(words.length,3);assert(words.every(w=>w.ipa_gb&&w.ipa_us&&w.example?.text_en&&w.example?.translation_zh));
  const session=await core.startSession(dad,'session',c.id,{source:'scheduled'}),queue=await core.cards(dad,session.id);assert.equal(queue.remaining,3);
  const first=queue.items[0];const reviewed=await core.review(dad,{session_id:session.id,lease_generation:session.lease_generation,event_id:randomUUID(),card_id:first.id,expected_version:first.version,rating:'good'});assert.equal(reviewed.today.completed_words,1);await core.heartbeat(dad,session.id,{lease_generation:session.lease_generation},true);
  const month=new Date(Date.now()+8*3600000).toISOString().slice(0,7),quiz=await core.quizzes.create(dad,'quiz',c.id,{month,mode:'full'});await core.quizzes.prepare(new StoredMeaningQuizBuilder());assert.equal((await core.quizzes.get(dad,quiz.id)).status,'ready');
  report={passed:true,mode:offline?'offline_mock':'live_deepseek',provider:provider.provider,model:provider.model,elapsed_ms:Date.now()-started,business_saved:true,storage:'isolated test database; removed after verification',saved_words:words.length,review_cards:queue.remaining,review_saved:true,monthly_quiz_ready:true,duplicate_submission_reused:true,items:words};
 }catch(e){report={passed:false,mode:offline?'offline_mock':'live_deepseek',code:e.code||'AI_FLOW_VERIFICATION_FAILED',elapsed_ms:Date.now()-started,business_saved:false};process.exitCode=1;}
 finally{global.fetch=originalFetch;if(source)await source.destroy();rmSync(resolve(root,'.local',databaseName),{recursive:true,force:true});}
 mkdirSync(resolve(root,'.local'),{recursive:true});writeFileSync(resolve(root,'.local/ai-flow-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));
})();
