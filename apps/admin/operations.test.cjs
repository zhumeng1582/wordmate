'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync,readdirSync} = require('node:fs');
const {randomUUID,createHash} = require('node:crypto');
const {PGlite} = require('../api/node_modules/@electric-sql/pglite');
const operations = require('./operations.cjs');
const audio = require('./content-audio.cjs');
const library = require('./library.cjs');
const {createServer} = require('./server.cjs');
const {repairHash,repairSpeechContext} = require('../api/dist/content-repairs.js');
const {poemSpeechText,poemAudioProfile} = require('../api/dist/poems.js');
const {hanziAudioProfile} = require('../api/dist/hanzi.js');
const params = value => new URLSearchParams(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = value => createHash('sha256').update(value).digest('hex');

test('operator queries cover four kinds, live task progress and current corrected audio without generation or private input dumps', async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
  for (const file of readdirSync('apps/api/migrations').filter(file => /^\d{3}_.+\.sql$/.test(file)).sort()) await pg.exec(readFileSync(`apps/api/migrations/${file}`,'utf8'));
  const pool = {query:async (sql,args) => {const result = await pg.query(sql,args); return {...result,rowCount:result.rows.length};}};
  const query = pool.query;
  const user = randomUUID(),family = randomUUID(),child = randomUUID();
  await query('INSERT INTO wordmate.users(id,wx_app_id,wx_open_id,display_name) VALUES($1,\'test\',\'test\',\'test\')',[user]);
  await query('BEGIN');
  await query('INSERT INTO wordmate.families(id,name,owner_user_id) VALUES($1,\'test\',$2)',[family,user]);
  await query("INSERT INTO wordmate.family_members(family_id,user_id,display_name) VALUES($1,$2,'test')",[family,user]);
  await query('COMMIT');
  await query('INSERT INTO wordmate.children(id,family_id,nickname) VALUES($1,$2,\'test\')',[child,family]);
  const word = (await query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) VALUES($1,'apple','apple','n','apple','苹果','test') RETURNING *",[child])).rows[0];
  const sentence = (await query("INSERT INTO wordmate.sentences(child_id,text_en,translation_zh,level,model,prompt_version,status) VALUES($1,'An apple is red.','苹果是红色的。','A1','test','test','validated') RETURNING *",[child])).rows[0];
  await query('INSERT INTO wordmate.sentence_library(child_id,sentence_id,normalized_en) VALUES($1,$2,\'an apple is red.\')',[child,sentence.id]);
  const poem = (await query("INSERT INTO wordmate.poems(child_id,title,author,dynasty,body) VALUES($1,'静夜思','李白','唐','床前明月光，疑是地上霜。') RETURNING *",[child])).rows[0];
  const hanzi = (await query("INSERT INTO wordmate.hanzi(child_id,character,pinyin,example,notes) VALUES($1,'行','háng','银行。','PRIVATE-NOTE') RETURNING *",[child])).rows[0];
  const records = {words:word,sentences:sentence,poems:poem,hanzi};

  await t.test('content filters and archive queries preserve active owner boundaries and omit notes',async () => {
    for (const [kind,row] of Object.entries(records)) {
      assert.equal((await operations.contents(pool,params({kind}))).items[0].id,row.id);
      const detail = await operations.contentDetail(pool,kind,row.id);
      assert.doesNotMatch(JSON.stringify(detail),/PRIVATE-NOTE|wx_open_id/);
    }
    await query('UPDATE wordmate.hanzi SET library_archived_at=now() WHERE id=$1',[hanzi.id]);
    assert.equal((await operations.contents(pool,params({kind:'hanzi',status:'active'}))).items.length,0);
    assert.equal((await operations.contents(pool,params({kind:'hanzi',status:'archived'}))).items.length,1);
    assert((await operations.contentDetail(pool,'hanzi',hanzi.id)).archived_at);
    await assert.rejects(audio.clips(pool,null,'hanzi',hanzi.id,'character'),{httpStatus:404});
    await query('UPDATE wordmate.hanzi SET library_archived_at=NULL WHERE id=$1',[hanzi.id]);
    await query("UPDATE wordmate.poem_books SET read_only=true WHERE child_id=$1",[child]);
    assert.equal((await operations.contents(pool,params({kind:'poems',origin:'shared_copy'}))).items.length,1);
    assert.equal((await operations.contents(pool,params({kind:'poems',origin:'personal'}))).items.length,0);
    assert.equal((await operations.contents(pool,params({kind:'words',q:"' OR true--"}))).items.length,0);
    await assert.rejects(operations.contents(pool,params({kind:'bad'})),{httpStatus:400});
    await assert.rejects(operations.imports(pool,params({child_id:'bad'})),{httpStatus:400});
    await assert.rejects(operations.repairs(pool,params({offset:'-1'})),{httpStatus:400});
    for (let i=0;i<51;i++) await query("INSERT INTO wordmate.hanzi(child_id,character) VALUES($1,$2)",[child,`字${i}`]);
    const first = await operations.contents(pool,params({kind:'hanzi'}));
    assert.equal(first.items.length,50); assert.equal(first.next_offset,50);
    const second = await operations.contents(pool,params({kind:'hanzi',offset:'50'}));
    assert.equal(second.items.length,2); assert.equal(second.next_offset,null);
  });

  await t.test('all task kinds use live status and word child batches expose failure and retry progress',async () => {
    const parent = randomUUID(),part = randomUUID(),poemTask = randomUUID(),hanziTask = randomUUID(),sentenceTask = randomUUID();
    const insertJob = (id,status,payload,error) => query("INSERT INTO wordmate.generation_jobs(id,child_id,requested_by,kind,dedupe_key,payload,status,error_code,attempts) VALUES($1::uuid,$2,$3,'sentences',$1::uuid::text,$4::jsonb,$5,$6,1)",[id,child,user,JSON.stringify(payload),status,error]);
    await insertJob(parent,'running',{flow:'vocabulary_bulk_v1'},null);
    await insertJob(part,'failed',{flow:'vocabulary_v1',bulk_parent_id:parent},'PROVIDER_DENIED');
    await query("INSERT INTO wordmate.poem_import_jobs(id,child_id,actor_id,input_hash,raw_text,chunks,request_ids,status,saved_count,error_code,source_base64) VALUES($1,$2,$3,'test','PRIVATE-INPUT','[]','[]','failed',2,'MODEL_ERROR','PRIVATE-BASE64')",[poemTask,child,user]);
    await query("INSERT INTO wordmate.hanzi_import_jobs(id,child_id,actor_id,input_hash,status,error_code) VALUES($1,$2,$3,'test','cancelled','USER_CANCELLED')",[hanziTask,child,user]);
    await query("INSERT INTO wordmate.sentence_import_jobs(id,child_id,actor_id,input_hash,status,saved_count) VALUES($1,$2,$3,'test','saved',3)",[sentenceTask,child,user]);
    // Sentence records are maintained by the domain transaction rather than a trigger.
    await query("INSERT INTO wordmate.import_records(kind,source_id,child_id,actor_id,status) VALUES('sentences',$1,$2,$3,'ready')",[sentenceTask,child,user]);
    let tasks = await operations.imports(pool,params({}));
    assert.equal(tasks.items.length,4);
    assert.doesNotMatch(JSON.stringify(tasks),/PRIVATE-INPUT|PRIVATE-BASE64|raw_text|payload/);
    assert.equal(tasks.items.find(item => item.id === poemTask).saved_count,2);
    assert.equal(tasks.items.find(item => item.id === hanziTask).status,'cancelled');
    assert.equal(tasks.items.find(item => item.id === sentenceTask).status,'saved');
    assert.equal(tasks.items.find(item => item.id === sentenceTask).saved_count,3);
    let bulk = tasks.items.find(item => item.id === parent);
    assert.equal(bulk.error_code,'PROVIDER_DENIED'); assert.equal(bulk.total_batches,1); assert.equal(bulk.status,'failed');
    await query("UPDATE wordmate.generation_jobs SET status='queued',error_code=NULL WHERE id=$1",[part]);
    tasks = await operations.imports(pool,params({kind:'words',status:'queued'}));
    assert.equal(tasks.items[0].id,parent); assert.equal(tasks.items[0].error_code,null);
    await query("UPDATE wordmate.generation_jobs SET status='succeeded' WHERE id=$1",[part]);
    await query("UPDATE wordmate.generation_jobs SET status='succeeded' WHERE id=$1",[parent]);
    bulk = (await operations.imports(pool,params({kind:'words'}))).items[0];
    assert.equal(bulk.completed_batches,1); assert.equal(bulk.status,'succeeded');
  });

  const oldBytes = Buffer.from('ID3-old'),fixedBytes = Buffer.from('ID3-fixed');
  const runtime = {profile:{model:'test'},stores:{test:{get:async () => oldBytes}},synthesize:async () => {throw Error('must not synthesize');}};
  const asset = (await query("INSERT INTO wordmate.audio_assets(child_id,child_word_id,content_version,content_hash,accent,voice_id,speech_rate,provider,provider_version,status,storage_key,storage_profile_id,sha256) VALUES($1,$2,1,'test','en-GB','test',1,'test','test','succeeded','old.mp3','test',$3) RETURNING id",[child,word.id,sha(oldBytes)])).rows[0].id;
  let repairId;
  const makeRepair = async (kind,row,part,accent,voice,rate=1) => (await query(`INSERT INTO wordmate.content_repairs(child_id,actor_id,kind,target_id,issue,status,source,source_version,source_hash,result,audio_kind,audio_target,audio_part,accent,voice_id,speech_rate,audio_context_hash,audio_bytes)
    VALUES($1,$2,$3,$4,'audio','succeeded',$5::jsonb,1,'test',$6::jsonb,$3,$4,$7,$8,$9,$10,$11,$12) RETURNING id`,[child,user,kind,row.id,JSON.stringify({content:row}),JSON.stringify({values:{},pronunciations:[{text:'行',alphabet:'pinyin',ph:'hang2'}]}),part,accent,voice,rate,repairHash(repairSpeechContext(kind,row)),fixedBytes])).rows[0].id;

  await t.test('audio uses latest correction, restores original after undo and rejects changed content',async () => {
    repairId = await makeRepair('words',word,'word','en-GB','test');
    assert.equal((await audio.clips(pool,runtime,'words',word.id,'word'))[0].id,repairId);
    assert.deepEqual(await library.audio(pool,runtime,asset),fixedBytes);
    assert.deepEqual(await audio.repairBytes(pool,repairId),fixedBytes);
    assert.equal((await operations.repairDetail(pool,repairId)).current_audio,true);
    await query("UPDATE wordmate.content_repairs SET status='undone' WHERE id=$1",[repairId]);
    assert.deepEqual(await library.audio(pool,runtime,asset),oldBytes);
    await assert.rejects(audio.repairBytes(pool,repairId),{httpStatus:404});
    await query("UPDATE wordmate.content_repairs SET status='succeeded' WHERE id=$1",[repairId]);
    await query("UPDATE wordmate.child_words SET meaning_zh='新释义' WHERE id=$1",[word.id]);
    await assert.rejects(audio.repairBytes(pool,repairId),{httpStatus:409});
    assert.deepEqual(await library.audio(pool,runtime,asset),oldBytes);
    await query("UPDATE wordmate.child_words SET meaning_zh='苹果' WHERE id=$1",[word.id]);
    const latest = await makeRepair('words',word,'word','en-GB','test');
    await query("UPDATE wordmate.content_repairs SET created_at=now()+interval '1 second' WHERE id=$1",[latest]);
    await assert.rejects(audio.repairBytes(pool,repairId),{httpStatus:409});
    assert.equal((await audio.clips(pool,runtime,'words',word.id,'word'))[0].id,latest);
    for (const [kind,row] of [['poems',poem],['hanzi',hanzi]]) {
      const part = kind === 'poems' ? 'body' : 'character';
      const text = kind === 'poems' ? poemSpeechText(row) : row.character;
      const profile = kind === 'poems' ? poemAudioProfile(runtime.profile) : hanziAudioProfile(runtime.profile);
      const table = kind === 'poems' ? 'poem_audio' : 'hanzi_audio';
      const owner = kind === 'poems' ? 'poem_id' : 'hanzi_id';
      const clip = (await query(`INSERT INTO wordmate.${table}(${owner},content_hash,voice_id,profile_key,state,content) VALUES($1,$2,'longxiaochun_v3',$3,'succeeded',$4) RETURNING id`,[row.id,digest(text),profile,oldBytes])).rows[0].id;
      assert.deepEqual(await audio.cachedBytes(pool,runtime,kind,row.id,part,clip),oldBytes);
      const repaired = await makeRepair(kind,row,part,'zh-CN','longxiaochun_v3',0.9);
      assert.equal((await audio.clips(pool,runtime,kind,row.id,part))[0].id,repaired);
      await assert.rejects(audio.cachedBytes(pool,runtime,kind,row.id,part,clip),{httpStatus:409});
    }
    const repairedSentence = await makeRepair('sentences',sentence,'body','en-US','repair-only');
    assert.equal((await audio.clips(pool,runtime,'sentences',sentence.id,'body'))[0].id,repairedSentence);
  });

  await t.test('repair audit separates missing provider cost and user charge and exposes only selected diffs',async () => {
    const id = (await query("INSERT INTO wordmate.content_repairs(child_id,kind,target_id,issue,status,source,source_version,source_hash,result,error_code) VALUES($1,'words',$2,'translation','failed',$3::jsonb,1,'test',$4::jsonb,'AI_REPAIR_UNCERTAIN') RETURNING id",[child,word.id,JSON.stringify({content:{meaning_zh:'旧释义',notes:'PRIVATE-NOTE'}}),JSON.stringify({values:{meaning_zh:'新释义',notes:'PRIVATE-NOTE'},diagnostic:{stage:'verify',reason:'uncertain',raw:'SECRET'}})])).rows[0].id;
    const list = await operations.repairs(pool,params({status:'failed'}));
    assert.equal(list.items[0].id,id); assert.equal(list.items[0].known_cost_micros,null);
    for (const [reference,cost,charge] of [[`content-repair:${id}`,100,200],[`content-repair-check:${id}`,null,300]]) {
      await query("INSERT INTO wordmate.ai_calls(reference,user_id,kind,mode,provider,model,settings_version,state,cost_micros,charge_micros,tariff) VALUES($1,$2,'vocabulary','system','test','test',1,'succeeded',$3,$4,'{}')",[reference,user,cost,charge]);
    }
    const billed = (await operations.repairs(pool,params({status:'failed'}))).items[0];
    assert.equal(billed.calls,2); assert.equal(billed.recorded_cost,1);
    assert.equal(billed.known_cost_micros,'100'); assert.equal(billed.charge_micros,'500');
    const detail = await operations.repairDetail(pool,id);
    assert.deepEqual(detail.changes,{meaning_zh:'新释义'});
    assert.deepEqual(detail.original,{meaning_zh:'旧释义'});
    assert.doesNotMatch(JSON.stringify(detail),/PRIVATE-NOTE|SECRET/);
  });

  await t.test('HTTP routes require credentials, reject writes and do not serve stale audio',async () => {
    const port = 18875,token = 'b'.repeat(64),server = createServer(pool,port,token,runtime);
    await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    try {
      const base = `http://127.0.0.1:${port}`,headers = {'X-Admin-Token':token};
      for (const path of ['/api/contents?kind=words','/api/import-tasks','/api/repair-records',`/api/content-detail?kind=poems&id=${poem.id}`,`/api/repair-detail?id=${repairId}`,`/api/content-clips?kind=words&id=${word.id}&part=word`]) {
        assert.equal((await fetch(base+path)).status,401);
        const response = await fetch(base+path,{headers});
        assert.equal(response.status,200,await response.text());
        assert.equal((await fetch(base+path,{headers:{...headers,Origin:'https://evil.example'}})).status,403);
        assert.equal((await fetch(base+path,{method:'POST',headers})).status,404);
      }
      await query('UPDATE wordmate.children SET archived_at=now() WHERE id=$1',[child]);
      assert.equal((await operations.repairs(pool,params({}))).items.length,0);
      assert.equal((await operations.imports(pool,params({}))).items.length,0);
      assert.equal((await fetch(`${base}/api/library-audio?id=${asset}`,{headers})).status,404);
      assert.equal((await fetch(`${base}/api/content-detail?kind=words&id=${word.id}`,{headers})).status,404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
