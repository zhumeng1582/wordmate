'use strict';
const {createHash,randomUUID}=require('node:crypto');
const digest=b=>createHash('sha256').update(b).digest('hex');
const valid=b=>b&&b.length>=3&&b.length<=10485760&&((b[0]===73&&b[1]===68&&b[2]===51)||(b[0]===255&&(b[1]&224)===224));
const fail=(message,status=400)=>{const e=Error(message);e.httpStatus=status;throw e};
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function tx(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
async function selectFeedback(q,source,id){
 if(!uuid(id)||!['word','audio'].includes(source))fail('反馈无效');
 const query=source==='word'?`SELECT f.id,f.child_id,f.kind,f.audio_id,f.child_word_id,f.word_version,f.sentence_id,f.sentence_version FROM wordmate.word_feedback f WHERE f.id=$1 AND f.kind IN ('pronunciation','example_pronunciation')`:`SELECT f.id,f.child_id,'pronunciation' AS kind,f.audio_id,a.child_word_id,a.content_version AS word_version,a.sentence_id,a.content_version AS sentence_version FROM wordmate.audio_feedback f JOIN wordmate.audio_assets a ON a.id=f.audio_id WHERE f.id=$1`;
 const row=(await q.query(query,[id])).rows[0];if(!row)fail('未找到发音反馈',404);return row;
}
async function assets(pool,source,id){const f=await selectFeedback(pool,source,id);const word=f.kind==='pronunciation'&&!f.sentence_id;const rows=(await pool.query(`SELECT id,accent,voice_id,speech_rate,status,content_version,created_at,(SELECT r.voice_id FROM wordmate.admin_audio_repairs r WHERE r.audio_id=audio_assets.id AND r.status='applied' ORDER BY r.applied_at DESC,r.id DESC LIMIT 1) AS repaired_voice FROM wordmate.audio_assets WHERE child_id=$1 AND (status='succeeded' OR (status='failed' AND error_code='AUDIO_REPAIR_RECOVERY_REQUIRED')) AND ${word?'child_word_id=$2':'sentence_id=$2'} AND content_version=$3 ${f.audio_id?'AND id=$4':''} ORDER BY created_at DESC LIMIT 50`,f.audio_id?[f.child_id,word?f.child_word_id:f.sentence_id,word?f.word_version:f.sentence_version,f.audio_id]:[f.child_id,word?f.child_word_id:f.sentence_id,word?f.word_version:f.sentence_version])).rows;
 const repairs=(await pool.query(`SELECT id,audio_id,status,voice_id,accent,created_at,applied_at,error_code FROM wordmate.admin_audio_repairs WHERE ${source==='word'?'word_feedback_id':'audio_feedback_id'}=$1 ORDER BY created_at DESC LIMIT 30`,[id])).rows;return {assets:rows,repairs};}
async function generate(pool,runtime,x){
 if(!runtime?.synthesize||!runtime.stores[runtime.storageProfile])fail('发音服务未配置',503);
 if(!uuid(x.audio_id)||!runtime.voices.some(v=>v.id===x.voice_id&&v.accent===x.accent))fail('请选择有效的音频和音色');
 const f=await selectFeedback(pool,x.source,x.feedback_id);const options=await assets(pool,x.source,x.feedback_id);if(!options.assets.some(a=>a.id===x.audio_id&&a.accent===x.accent))fail('音频不存在或口音不匹配',409);
 const repairId=randomUUID(),key=`private/${f.child_id}/admin-repair/${repairId}.mp3`;
 const data=await tx(pool,async q=>{
  const family=(await q.query('SELECT family_id FROM wordmate.children WHERE id=$1',[f.child_id])).rows[0];if(!family)fail('孩子资料已删除',409);
  if(!(await q.query("SELECT id FROM wordmate.families WHERE id=$1 AND status='active' FOR UPDATE",[family.family_id])).rows.length)fail('家庭不可用',409);
  if(!(await q.query('SELECT id FROM wordmate.children WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[f.child_id])).rows.length)fail('孩子资料不可用',409);
  const current=await selectFeedback(q,x.source,x.feedback_id);const a=(await q.query("SELECT * FROM wordmate.audio_assets WHERE id=$1 AND child_id=$2 AND (status='succeeded' OR (status='failed' AND error_code='AUDIO_REPAIR_RECOVERY_REQUIRED')) FOR UPDATE",[x.audio_id,f.child_id])).rows[0];
  if(!a||!a.sha256||!a.storage_profile_id||!a.storage_key||!options.assets.some(z=>z.id===a.id)||current.audio_id&&current.audio_id!==a.id)fail('原音频已变化或存储信息不完整，请刷新',409);
  await q.query("UPDATE wordmate.admin_audio_repairs SET status='failed',error_code='GENERATION_TIMEOUT' WHERE audio_id=$1 AND status='generating' AND created_at<now()-interval '10 minutes'",[a.id]);
  if((await q.query("SELECT 1 FROM wordmate.admin_audio_repairs WHERE audio_id=$1 AND status='generating'",[a.id])).rows.length)fail('该音频正在生成，请稍后刷新',409);
  const resource=a.child_word_id?(await q.query('SELECT lemma AS text,version AS version FROM wordmate.child_words WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[a.child_word_id,f.child_id])).rows[0]:(await q.query("SELECT text_en AS text,content_version AS version FROM wordmate.sentences WHERE id=$1 AND child_id=$2 AND status='validated'",[a.sentence_id,f.child_id])).rows[0];
  if(!resource||resource.version!==a.content_version)fail('词条或例句已变更，请重新检查',409);
  await q.query(`INSERT INTO wordmate.admin_audio_repairs(id,child_id,audio_id,${x.source==='word'?'word_feedback_id':'audio_feedback_id'},status,voice_id,accent,original_sha256,content_version,new_storage_profile_id,new_storage_key) VALUES($1,$2,$3,$4,'generating',$5,$6,$7,$8,$9,$10)`,[repairId,f.child_id,a.id,f.id,x.voice_id,x.accent,a.sha256,a.content_version,runtime.storageProfile,key]);return {text:resource.text,rate:Number(a.speech_rate),originalSha:a.sha256};
 });
 try{const result=await runtime.synthesize({text:data.text.normalize('NFC').trim(),accent:x.accent,voiceId:x.voice_id,rate:data.rate});const bytes=Buffer.from(result.bytes);if(!valid(bytes))throw Error('INVALID_AUDIO');if(digest(bytes)===data.originalSha)fail('生成结果与原音频完全相同，请尝试其他音色；本次可能已产生费用',409);
  const updated=await pool.query("UPDATE wordmate.admin_audio_repairs SET status='ready',audio_bytes=$2,sha256=$3 WHERE id=$1 AND status='generating' AND EXISTS(SELECT 1 FROM wordmate.children c JOIN wordmate.families f ON f.id=c.family_id WHERE c.id=child_id AND c.archived_at IS NULL AND f.status='active') RETURNING id",[repairId,bytes,digest(bytes)]);if(!updated.rows.length)fail('反馈或用户资料已删除',409);return {id:repairId};
 }catch(e){await pool.query("UPDATE wordmate.admin_audio_repairs SET status='failed',error_code='AUDIO_GENERATION_FAILED' WHERE id=$1 AND status='generating'",[repairId]);if(e.httpStatus)throw e;fail('生成失败，请稍后重试；供应商可能已产生费用',503)}
}
async function preview(pool,id){if(!uuid(id))fail('音频无效');const r=(await pool.query("SELECT audio_bytes,sha256 FROM wordmate.admin_audio_repairs WHERE id=$1 AND status='ready'",[id])).rows[0];if(!r||!valid(r.audio_bytes)||digest(r.audio_bytes)!==r.sha256)fail('待试听音频不可用',404);return r.audio_bytes}
async function original(pool,runtime,source,feedbackId,id){
 const options=await assets(pool,source,feedbackId);if(!options.assets.some(a=>a.id===id))fail('音频不存在',404);
 const a=(await pool.query("SELECT storage_profile_id,storage_key,sha256 FROM wordmate.audio_assets WHERE id=$1 AND status='succeeded'",[id])).rows[0];const store=a&&runtime?.stores[a.storage_profile_id];if(!store)fail('音频存储不可用',503);const bytes=await store.get(a.storage_key);if(!valid(bytes)||digest(bytes)!==a.sha256)fail('原音频校验失败',503);return bytes;
}
async function apply(pool,runtime,id){if(!uuid(id))fail('音频无效');return tx(pool,async q=>{
 const initial=(await q.query('SELECT child_id FROM wordmate.admin_audio_repairs WHERE id=$1',[id])).rows[0];if(!initial)fail('修复记录不存在',404);const child=(await q.query('SELECT family_id FROM wordmate.children WHERE id=$1',[initial.child_id])).rows[0];if(!child)fail('孩子资料不存在',409);
 if(!(await q.query("SELECT id FROM wordmate.families WHERE id=$1 AND status='active' FOR UPDATE",[child.family_id])).rows.length)fail('家庭不可用',409);
 if(!(await q.query('SELECT id FROM wordmate.children WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[initial.child_id])).rows.length)fail('孩子资料不可用',409);
 const r=(await q.query('SELECT * FROM wordmate.admin_audio_repairs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r||r.status!=='ready'||!valid(r.audio_bytes)||digest(r.audio_bytes)!==r.sha256||!r.word_feedback_id&&!r.audio_feedback_id)fail('待替换音频或反馈不可用',409);
 const a=(await q.query("SELECT * FROM wordmate.audio_assets WHERE id=$1 AND child_id=$2 AND (status='succeeded' OR (status='failed' AND error_code='AUDIO_REPAIR_RECOVERY_REQUIRED')) FOR UPDATE",[r.audio_id,r.child_id])).rows[0];if(!a||a.sha256!==r.original_sha256||a.content_version!==r.content_version)fail('原音频已变化，请重新生成',409);
 const resource=a.child_word_id?(await q.query('SELECT version FROM wordmate.child_words WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[a.child_word_id,r.child_id])).rows[0]:(await q.query("SELECT content_version AS version FROM wordmate.sentences WHERE id=$1 AND child_id=$2 AND status='validated'",[a.sentence_id,r.child_id])).rows[0];if(!resource||resource.version!==r.content_version)fail('词条或例句已变化，请重新检查',409);
 const store=runtime?.stores[r.new_storage_profile_id];if(!store)fail('音频存储不可用',503);await store.put(r.new_storage_key,r.audio_bytes,'audio/mpeg');if(digest(await store.get(r.new_storage_key))!==r.sha256)fail('音频校验失败',503);
 await q.query("UPDATE wordmate.audio_assets SET storage_profile_id=$2,storage_key=$3,sha256=$4,size_bytes=$5,mime_type='audio/mpeg',status='succeeded',error_code=NULL WHERE id=$1",[a.id,r.new_storage_profile_id,r.new_storage_key,r.sha256,r.audio_bytes.length]);
 await q.query("UPDATE wordmate.generation_jobs SET status='succeeded',error_code=NULL,updated_at=now() WHERE kind='audio' AND payload->>'audio_id'=$1 AND status='failed' AND error_code='AUDIO_REPAIR_RECOVERY_REQUIRED'",[a.id]);
 await q.query("UPDATE wordmate.admin_audio_repairs SET status='applied',audio_bytes=NULL,old_storage_profile_id=$2,old_storage_key=$3,applied_at=now() WHERE id=$1",[id,a.storage_profile_id,a.storage_key]);
 if(r.word_feedback_id)await q.query("INSERT INTO wordmate.admin_feedback_actions(word_feedback_id,status,note) SELECT id,CASE WHEN audio_id=$2 THEN 'resolved' ELSE 'in_progress' END,CASE WHEN audio_id=$2 THEN '已试听并替换关联音频' ELSE '已替换所选音频；原反馈未指定音频，请继续核查' END FROM wordmate.word_feedback WHERE id=$1",[r.word_feedback_id,a.id]);
 if(r.audio_feedback_id)await q.query("INSERT INTO wordmate.admin_feedback_actions(audio_feedback_id,status,note) VALUES($1,'resolved','已试听并替换关联音频')",[r.audio_feedback_id]);return {ok:true};
 });}
module.exports={assets,generate,preview,original,apply};
