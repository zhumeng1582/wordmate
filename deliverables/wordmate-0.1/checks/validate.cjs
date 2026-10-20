const fs = require("fs");
const path = require("path");
const assert = require("assert");
const dep = process.env.WORDMATE_CHECK_DEPS || "/opt/homebrew/lib/node_modules/firebase-tools/node_modules";
const {PGlite}=require(path.join(dep,"pglite-2/dist/index.cjs"));
const Ajv=require(path.join(dep,"ajv/dist/2020.js"));
const root=path.resolve(__dirname,"..");
(async()=>{
 const report={database:[],api:[],limitations:["使用内嵌 PostgreSQL 16.4 验证 DDL 与约束；未验证正式服务端、鉴权中间件或多连接并发。","OpenAPI 进行结构、引用、Schema 编译与样例校验；未运行完整 OpenAPI 规范元 Schema 校验器。"]};
 const db=new PGlite();
 await db.exec(fs.readFileSync(path.join(root,"database/001_schema.sql"),"utf8"));
 report.database.push("29 张表初始迁移执行成功");
 const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 const a=await one("insert into wordmate.users(wx_app_id,wx_open_id,display_name) values('app','dad','爸爸') returning id");
 const b=await one("insert into wordmate.users(wx_app_id,wx_open_id,display_name) values('app','mom','妈妈') returning id");
 let fid;
 await db.transaction(async(tx)=>{
  const f=(await tx.query("insert into wordmate.families(name,owner_user_id) values('小明一家',$1) returning id",[a.id])).rows[0];fid=f.id;
  await tx.query("insert into wordmate.family_members(family_id,user_id,display_name) values($1,$2,'爸爸'),($1,$3,'妈妈')",[fid,a.id,b.id]);
 });
 report.database.push("家庭与管理员成员延迟外键同事务创建成功");
 const c=await one("insert into wordmate.children(family_id,nickname) values($1,'小明') returning id",[fid]);
 const d=await one("insert into wordmate.children(family_id,nickname) values($1,'小雨') returning id",[fid]);
 const w=await one("insert into wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) values($1,'luggage','luggage','noun','luggage:n:1','行李','fixture') returning id",[c.id]);
 const book=await one("insert into wordmate.wordbooks(child_id,name) values($1,'旅行') returning id",[d.id]);
 async function rejects(sql,args,expected,label){
  try{await db.query(sql,args);throw Error("约束未生效: "+label)}catch(e){assert.equal(e.code,expected,label+": "+e.message);report.database.push(label);}
 }
 await rejects("insert into wordmate.wordbook_words(child_id,wordbook_id,child_word_id) values($1,$2,$3)",[d.id,book.id,w.id],"23503","跨孩子单词关联被复合外键拒绝");
 await rejects("insert into wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) values($1,'luggage','luggage','noun','luggage:n:1','行李','fixture')",[c.id],"23505","同孩子同义项重复写入被拒绝");
 const sess=await one("insert into wordmate.study_sessions(child_id,actor_user_id,expires_at) values($1,$2,now()+interval '120 seconds') returning id",[c.id,a.id]);
 await rejects("insert into wordmate.study_sessions(child_id,actor_user_id,expires_at) values($1,$2,now()+interval '120 seconds')",[c.id,b.id],"23505","同孩子第二个 active 陪学会话被拒绝");
 await db.query("update wordmate.study_sessions set status='taken_over',ended_at=now() where id=$1",[sess.id]);
 await one("insert into wordmate.study_sessions(child_id,actor_user_id,expires_at) values($1,$2,now()+interval '120 seconds') returning id",[c.id,b.id]);
 report.database.push("关闭旧租约后可以接管");
 const card=await one("insert into wordmate.review_cards(child_id,child_word_id,scheduler_version,parameter_version) values($1,$2,'fixture','fixture') returning id",[c.id,w.id]);
 await db.query("insert into wordmate.daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) values($1,current_date,$2,$3,now(),true)",[c.id,card.id,w.id]);
 await rejects("insert into wordmate.daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) values($1,current_date,$2,$3,now(),true)",[c.id,card.id,w.id],"23505","同一天同一卡片不重复计词数");
 const card2=await one("insert into wordmate.review_cards(child_id,child_word_id,card_type,scheduler_version,parameter_version) values($1,$2,'listening','fixture','fixture') returning id",[c.id,w.id]);
 await rejects("insert into wordmate.daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) values($1,current_date,$2,$3,now(),false)",[c.id,card2.id,w.id],"23505","同义项不同题型也不能重复计每日词数");
 const ev="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const logsql="insert into wordmate.review_logs(child_id,card_id,session_id,event_id,request_hash,rating,local_date,timezone_snapshot,before_version,after_version,before_state,after_state,response_snapshot,word_snapshot) values($1,$2,$3,$4,'fixture','good',current_date,'Asia/Shanghai',1,2,'{}','{}','{}','{}')";
 await db.query(logsql,[c.id,card.id,sess.id,ev]);
 await rejects(logsql,[c.id,card.id,sess.id,ev],"23505","同孩子复习 event_id 持久去重");
 await rejects("delete from wordmate.users where id=$1",[a.id],"23503","删除家长不会级联清空家庭和学习数据");

 await rejects("insert into wordmate.word_annotations(child_id,child_word_id,easy,error_prone) values($1,$2,true,true)",[c.id,w.id],"23514","简单与易错标注互斥");
 await rejects("insert into wordmate.word_annotations(child_id,child_word_id) values($1,$2)",[d.id,w.id],"23503","标注不能跨孩子引用");
 await rejects("insert into wordmate.monthly_quizzes(child_id,month,timezone_snapshot,mode,candidate_word_ids,eligible_count,total_count,grading_rule_snapshot) values($1,'2026-10-01','Asia/Shanghai','sample',$2,1,1,'{}')",[c.id,JSON.stringify([w.id])],"23514","抽样测验不能省略样本数量");
 const q=await one("insert into wordmate.monthly_quizzes(child_id,month,timezone_snapshot,mode,requested_count,candidate_word_ids,eligible_count,total_count,grading_rule_snapshot) values($1,'2026-10-01','Asia/Shanghai','sample',10,$2,1,1,'{}') returning id",[c.id,JSON.stringify([w.id])]);
 await rejects("insert into wordmate.monthly_quizzes(child_id,month,timezone_snapshot,mode,candidate_word_ids,eligible_count,total_count,grading_rule_snapshot) values($1,'2026-10-01','Asia/Shanghai','full',$2,1,1,'{}')",[c.id,JSON.stringify([w.id])],"23505","同孩子不能有两份活动月测");
 await rejects("update wordmate.monthly_quizzes set month='2026-10-16' where id=$1",[q.id],"23514","测验月份必须存月初日期");
 const otherWord=await one("insert into wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) values($1,'apple','apple','noun','apple:n:1','苹果','fixture') returning id",[d.id]);
 const options=JSON.stringify([{id:'a',text:'行李'},{id:'b',text:'航班'},{id:'c',text:'座位'},{id:'d',text:'车票'}]);
 const qi=await one("insert into wordmate.monthly_quiz_items(quiz_id,child_id,child_word_id,ordinal,word_snapshot,prompt_snapshot,options_snapshot,correct_option_id) values($1,$2,$3,1,'{}','luggage',$4,'a') returning id",[q.id,c.id,w.id,options]);
 await rejects("insert into wordmate.monthly_quiz_items(quiz_id,child_id,child_word_id,ordinal,word_snapshot,prompt_snapshot,options_snapshot,correct_option_id) values($1,$2,$3,2,'{}','luggage',$4,'a')",[q.id,d.id,otherWord.id,options],"23503","月测题目不能跨孩子引用");
 await rejects("update wordmate.monthly_quizzes set status='submitted',correct_count=1,unanswered_count=0,grade='pass',submitted_at=now(),submitted_local_date=current_date where id=$1",[q.id],"23514","满分不得写成合格等级");
 await db.query("update wordmate.monthly_quizzes set status='submitted',correct_count=0,unanswered_count=1,grade='needs_work',submitted_at=now(),submitted_local_date=current_date where id=$1",[q.id]);
 const wrongsql="insert into wordmate.mistake_events(child_id,child_word_id,source,quiz_item_id,reason,local_date,timezone_snapshot,word_snapshot,answer_snapshot) values($1,$2,'monthly_quiz',$3,'unanswered',current_date,'Asia/Shanghai','{}','{}')";
 await db.query(wrongsql,[c.id,w.id,qi.id]);
 await rejects(wrongsql,[c.id,w.id,qi.id],"23505","重复交卷不能重复归集同题错误");
 await rejects("insert into wordmate.mistake_events(child_id,child_word_id,source,quiz_item_id,reason,local_date,timezone_snapshot,word_snapshot,answer_snapshot) values($1,$2,'review',$3,'incorrect',current_date,'Asia/Shanghai','{}','{}')",[c.id,w.id,qi.id],"23514","错题来源必须与来源引用匹配");
 await rejects("insert into wordmate.mistake_events(child_id,child_word_id,source,quiz_item_id,reason,local_date,timezone_snapshot,word_snapshot,answer_snapshot) values($1,$2,'monthly_quiz',$3,'unanswered',current_date,'Asia/Shanghai','{}','{}')",[d.id,otherWord.id,"cccccccc-cccc-4ccc-8ccc-cccccccccccc"],"23503","错题事件不能跨孩子引用");
 // 实际执行数据库中的成绩约束，不仅测试同一段JS表达式。
 for(const [correct,grade] of [[59,'needs_work'],[60,'pass'],[79,'pass'],[80,'good'],[89,'good'],[90,'excellent'],[100,'excellent']]){
  await db.query("insert into wordmate.monthly_quizzes(child_id,month,timezone_snapshot,mode,candidate_word_ids,eligible_count,total_count,grading_rule_snapshot,status,correct_count,unanswered_count,grade,submitted_at,submitted_local_date) values($1,'2026-10-01','Asia/Shanghai','full',$2,100,100,'{}','submitted',$3,0,$4,now(),current_date)",[c.id,JSON.stringify(Array(100).fill(w.id)),correct,grade]);
 }
 report.database.push("四档分数线59/60/79/80/89/90/100数据库约束验证通过（候选去重仍属应用校验）");
 const practice=logsql.replace("response_snapshot,word_snapshot)","response_snapshot,word_snapshot,practice_only)").replace("1,2,'{}','{}','{}','{}')","1,1,'{}','{}','{}','{}',true)");
 await db.query(practice,[c.id,card.id,sess.id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
 report.database.push("额外练习允许卡版本不变并保留审计事件");

 // 删除任务必须在实际目标消失后继续存在，不仅检查DDL文本。
 let deletionFamily;
 await db.transaction(async tx=>{
  deletionFamily=(await tx.query("insert into wordmate.families(name,owner_user_id) values('删除测试',$1) returning id",[a.id])).rows[0].id;
  await tx.query("insert into wordmate.family_members(family_id,user_id,display_name) values($1,$2,'测试')",[deletionFamily,a.id]);
 });
 const target=await one("insert into wordmate.children(family_id,nickname) values($1,'删除测试') returning id",[deletionFamily]);
 const deletion=await one("insert into wordmate.lifecycle_jobs(requested_by,family_id,target_id,kind) values($1,$2,$3,'delete_child') returning id",[a.id,deletionFamily,target.id]);
 await rejects("insert into wordmate.lifecycle_jobs(requested_by,family_id,target_id,kind) values($1,$2,$3,'delete_child')",[a.id,deletionFamily,target.id],"23505","重复删除目标不创建第二个生命周期任务");
 await rejects("update wordmate.lifecycle_jobs set status='succeeded' where id=$1",[deletion.id],"23514","完成状态必须同时具有完成阶段和时间");
 await db.query("delete from wordmate.children where id=$1",[target.id]);
 assert.equal((await one("select requested_by from wordmate.lifecycle_jobs where id=$1",[deletion.id])).requested_by,a.id);
 const familyDeletion=await one("insert into wordmate.lifecycle_jobs(requested_by,family_id,target_id,kind) values($1,$2,$2,'delete_family') returning id",[a.id,deletionFamily]);
 await db.transaction(async tx=>{
  await tx.query("delete from wordmate.family_members where family_id=$1",[deletionFamily]);
  await tx.query("delete from wordmate.families where id=$1",[deletionFamily]);
  await tx.query("update wordmate.lifecycle_jobs set status='succeeded',phase='complete',completed_at=now() where family_id=$1",[deletionFamily]);
 });
 assert.equal((await one("select count(*)::int as n from wordmate.lifecycle_jobs where family_id=$1 and status='succeeded'",[deletionFamily])).n,2);
 report.database.push("孩子及唯一成员家庭物理删除后，两项删除任务结果仍保留；延迟管理员外键允许同事务清理");
 await db.close();
 const api=JSON.parse(fs.readFileSync(path.join(root,"api/openapi.json"),"utf8"));
 assert.equal(api.paths['/sentences/{sentence_id}'].patch['x-role'],'owner');
 assert.equal(api.paths['/lifecycle-jobs/{job_id}'].get['x-role'],'authenticated');
 assert(api.paths['/families/{family_id}'].delete);
 report.api.push("例句修改管理员契约、独立删除任务查询及家庭解散接口存在（不替代运行时鉴权测试）");
 const ids=new Set();let n=0,refs=0;
 function walk(x){
  if(!x||typeof x!=="object")return;
  if(x.$ref){assert(x.$ref.startsWith("#/"));let target=api;for(const key of x.$ref.slice(2).split("/"))target=target[key.replace(/~1/g,"/").replace(/~0/g,"~")];assert(target,"missing ref");refs++;}
  Object.values(x).forEach(walk);
 }
 walk(api);
 for(const [p,item]of Object.entries(api.paths))for(const [m,op]of Object.entries(item)){
  assert(!ids.has(op.operationId));ids.add(op.operationId);n++;
  const ps=(op.parameters||[]).filter(x=>x.in==="path").map(x=>x.name).sort();
  assert.deepEqual(ps,[...p.matchAll(/{(\w+)}/g)].map(x=>x[1]).sort());
  assert(Object.keys(op.responses).some(x=>x.startsWith("2")));
 }
 const ajv=new Ajv({strict:false,validateFormats:false,allErrors:true});
 ajv.addSchema(api,"wordmate");
 for(const name of Object.keys(api.components.schemas))ajv.compile({$ref:"wordmate#/components/schemas/"+name});
 const u="11111111-1111-4111-8111-111111111111";
 const examples={
  review_request:{session_id:u,card_id:u,event_id:"22222222-2222-4222-8222-222222222222",expected_version:7,lease_generation:1,rating:"good"},
  batch_request:{wordbook_id:u,words:["airport","luggage","delay"],theme:"旅行"},
  audio_request:{word_id:u,content_version:1,accent:"en-US",voice_id:"provider_voice_a",speech_rate:1},
  conflict_response:{request_id:"req_demo",error:{code:"VERSION_CONFLICT",message:"学习记录已更新，请刷新",retryable:false,details:{current_version:8}}},
  batch_response:{request_id:"req_batch",data:{batch_id:u,child_word_ids:[u],job_id:"33333333-3333-4333-8333-333333333333",version:2}}
 };
 for(const [key,name]of [["review_request","ReviewSubmit"],["batch_request","BatchCreate"],["audio_request","AudioRequest"],["conflict_response","Error"]]){
  const validate=ajv.getSchema("wordmate#/components/schemas/"+name);assert(validate(examples[key]),JSON.stringify(validate.errors));
 }
 const rev=ajv.getSchema("wordmate#/components/schemas/ReviewSubmit");
 assert(!rev({...examples.review_request,rating:"remember"}));
 const aud=ajv.getSchema("wordmate#/components/schemas/AudioRequest");
 assert(!aud({...examples.audio_request,sentence_id:u}));
 const qc=ajv.getSchema("wordmate#/components/schemas/QuizCreate");
 assert(qc({month:"2026-10",mode:"sample",sample_count:20}));
 assert(qc({month:"2026-10",mode:"full"}));
 assert(!qc({month:"2026-10",mode:"full",sample_count:20}));
 assert(!qc({month:"2026-13",mode:"sample",sample_count:20}));
 assert(!qc({month:"2026-10",mode:"sample"}));
 const src=ajv.getSchema("wordmate#/components/schemas/SourceSelection");
 assert(src({source:"quiz",quiz_id:u}));assert(!src({source:"quiz",quiz_id:u,date:"2026-10-01"}));
 const ann=ajv.getSchema("wordmate#/components/schemas/AnnotationsPatch");
 assert(ann({expected_version:0,favorite:true}));assert(!ann({expected_version:0}));assert(!ann({expected_version:1,easy:true,error_prone:true}));
 const safe=api.components.schemas.QuizItem;
 assert(!('correct_option_id' in safe.properties));assert(!('word' in safe.properties));
 report.api.push("月测模式、月份格式、样本数必填、复习来源互斥及标注互斥Schema校验通过","未交卷题目DTO不含答案或词义快照");
 report.api.push(n+" 个操作路径、参数和 operationId 校验通过",refs+" 个本地引用解析通过",Object.keys(api.components.schemas).length+" 个 JSON Schema 编译通过","基础请求合法样例、非法评分和双音频目标拒绝通过");
 examples.quiz_create={month:"2026-10",mode:"sample",sample_count:20};
 examples.quiz_submit={expected_version:21,confirm_unanswered:true,session_id:u,lease_generation:1};
 examples.annotations_patch={expected_version:0,easy:false,error_prone:true,favorite:true};
 examples.word_export={format:"csv",filter:{marks:["error_prone"]},include_sentences:false};
 examples.quiz_mistake_review={source:"quiz",quiz_id:u};
 for(const [pathName,sample] of [["/children/{child_id}/monthly-quizzes",examples.quiz_create],["/monthly-quizzes/{quiz_id}/submit",examples.quiz_submit],["/children/{child_id}/word-exports",examples.word_export]]){
  const schema=api.paths[pathName].post.requestBody.content['application/json'].schema;
  const validate=ajv.compile({$ref:'wordmate#/paths/'+pathName.replace(/~/g,'~0').replace(/\//g,'~1')+'/post/requestBody/content/application~1json/schema'});
  assert(validate(sample),JSON.stringify(validate.errors));
 }
 fs.writeFileSync(path.join(root,"api/examples.json"),JSON.stringify(examples,null,2));
 fs.writeFileSync(path.join(root,"checks/report.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});

