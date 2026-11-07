'use strict';
const {createHash}=require('node:crypto');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function error(message,status=400){const e=Error(message);e.httpStatus=status;throw e}
function offset(value){if(value===null||value==='')return 0;if(!/^\d+$/.test(value))error('页码无效');return Math.min(Number(value),100000)}
async function words(pool,params){
 const q=(params.get('q')||'').trim().slice(0,120),id=params.get('book_id'),type=params.get('book_type'),start=offset(params.get('offset'));
 if(!uuid(id)||!['personal','shared'].includes(type))error('请先选择单词本');
 if(type==='shared'){
  const rows=await pool.query(`SELECT i.id,i.lemma,i.part_of_speech,i.meaning_zh,i.example_en,i.example_zh,NULL::uuid AS sentence_id,'[]'::json AS word_audio,'[]'::json AS example_audio,s.title AS book_name FROM wordmate.shared_wordbook_items i JOIN wordmate.shared_wordbooks s ON s.id=i.shared_wordbook_id AND s.published WHERE s.id=$1 AND ($2='' OR position(lower($2) in lower(i.lemma))>0 OR position(lower($2) in lower(i.meaning_zh))>0) ORDER BY i.ordinal,i.id LIMIT 51 OFFSET $3`,[id,q,start]);return rows.rows;
 }
 const rows=await pool.query(`WITH page AS (SELECT w.id,w.child_id,w.lemma,w.part_of_speech,w.meaning_zh,w.version,w.created_at FROM wordmate.child_words w JOIN wordmate.children c ON c.id=w.child_id AND c.archived_at IS NULL JOIN wordmate.families f ON f.id=c.family_id AND f.status='active' WHERE w.archived_at IS NULL AND ($1='' OR position(lower($1) in lower(w.lemma))>0 OR position(lower($1) in lower(w.meaning_zh))>0) AND EXISTS(SELECT 1 FROM wordmate.wordbook_words bw JOIN wordmate.wordbooks b ON b.id=bw.wordbook_id AND b.child_id=bw.child_id AND b.archived_at IS NULL WHERE bw.child_word_id=w.id AND bw.child_id=w.child_id AND b.id=$2) ORDER BY w.created_at DESC,w.id DESC LIMIT 51 OFFSET $3)
 SELECT w.id,w.lemma,w.part_of_speech,w.meaning_zh,s.id AS sentence_id,s.text_en AS example_en,s.translation_zh AS example_zh,
 COALESCE((SELECT json_agg(json_build_object('id',x.id,'accent',x.accent,'voice_id',x.voice_id,'speech_rate',x.speech_rate) ORDER BY x.created_at DESC,x.id DESC) FROM (SELECT a.id,a.accent,a.voice_id,a.speech_rate,a.created_at FROM wordmate.audio_assets a WHERE a.child_id=w.child_id AND a.child_word_id=w.id AND a.content_version=w.version AND a.status='succeeded' AND a.storage_key IS NOT NULL AND a.sha256 IS NOT NULL ORDER BY a.created_at DESC,a.id DESC LIMIT 20) x),'[]'::json) AS word_audio,
 COALESCE((SELECT json_agg(json_build_object('id',x.id,'accent',x.accent,'voice_id',x.voice_id,'speech_rate',x.speech_rate) ORDER BY x.created_at DESC,x.id DESC) FROM (SELECT a.id,a.accent,a.voice_id,a.speech_rate,a.created_at FROM wordmate.audio_assets a WHERE a.child_id=w.child_id AND a.sentence_id=s.id AND a.content_version=s.content_version AND a.status='succeeded' AND a.storage_key IS NOT NULL AND a.sha256 IS NOT NULL ORDER BY a.created_at DESC,a.id DESC LIMIT 20) x),'[]'::json) AS example_audio
 FROM page w LEFT JOIN LATERAL (SELECT s.id,s.text_en,s.translation_zh,s.content_version FROM wordmate.sentences s JOIN wordmate.sentence_targets t ON t.sentence_id=s.id AND t.child_id=s.child_id WHERE t.child_word_id=w.id AND s.child_id=w.child_id AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1) s ON true ORDER BY w.created_at DESC,w.id DESC`,[q,id,start]);return rows.rows;
}
async function audio(pool,runtime,id){
 if(!uuid(id))error('音频无效');
 const sql=`SELECT a.storage_profile_id,a.storage_key,a.sha256 FROM wordmate.audio_assets a JOIN wordmate.children c ON c.id=a.child_id AND c.archived_at IS NULL JOIN wordmate.families f ON f.id=c.family_id AND f.status='active' LEFT JOIN wordmate.child_words w ON w.id=a.child_word_id AND w.child_id=a.child_id AND w.archived_at IS NULL LEFT JOIN wordmate.sentences s ON s.id=a.sentence_id AND s.child_id=a.child_id AND s.status='validated' WHERE a.id=$1 AND a.status='succeeded' AND ((w.id IS NOT NULL AND w.version=a.content_version) OR (s.id IS NOT NULL AND s.content_version=a.content_version))`;
 const row=(await pool.query(sql,[id])).rows[0];if(!row)error('音频不存在或已更新',404);const store=runtime?.stores[row.storage_profile_id];if(!store)error('音频存储不可用',503);
 let bytes;try{bytes=await store.get(row.storage_key)}catch{error('音频暂时无法读取',503)}
 if(!bytes||bytes.length<3||bytes.length>10485760||createHash('sha256').update(bytes).digest('hex')!==row.sha256)error('音频校验失败',503);
 const current=(await pool.query(sql,[id])).rows[0];if(!current||current.sha256!==row.sha256||current.storage_key!==row.storage_key||current.storage_profile_id!==row.storage_profile_id)error('音频已更新，请刷新后重试',409);return bytes;
}
module.exports={words,audio};
