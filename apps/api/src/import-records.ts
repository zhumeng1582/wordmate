import {randomUUID} from 'node:crypto';
import type {Sql,Row} from './ports.ts';
import {ensure} from './errors.ts';
import {vocabularyJobRetryable} from './vocabulary.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export async function manualImportRecord(q:Sql,actor:string,child:string,kind:'poems'|'hanzi',summary:string,count:number,book?:string|null,job?:string){
 if(!(await one(q,"SELECT to_regclass('wordmate.import_records') present"))?.present)return;
 if(job){await q.query('UPDATE import_records SET saved_count=$3,book_id=coalesce($4,book_id) WHERE kind=$1 AND source_id=$2',[kind,job,count,book??null]);return;}
 await q.query("INSERT INTO import_records(kind,source_id,child_id,actor_id,source,status,summary,saved_count,book_id) VALUES($1,$2,$3,$4,'manual','saved',$5,$6,$7)",[kind,randomUUID(),child,actor,summary.slice(0,120),count,book??null]);
}
export async function importRecords(q:Sql,actor:string,child:string,query:any){
 const kind=query.kind??'all',offset=Number(query.offset??0);ensure(['all','words','poems','hanzi','sentences'].includes(kind)&&Number.isInteger(offset)&&offset>=0&&offset<=100000,422,'INVALID_CURSOR');
 const hasSentences=!!(await one(q,"SELECT to_regclass('wordmate.sentence_import_jobs') present"))?.present;
 const rows=(await q.query(`SELECT r.*,CASE WHEN r.kind='words' THEN EXISTS(SELECT 1 FROM generation_jobs j WHERE j.id=r.source_id) ${hasSentences?"WHEN r.kind='sentences' THEN EXISTS(SELECT 1 FROM sentence_import_jobs j WHERE j.id=r.source_id AND j.actor_id=$4 AND j.created_at>now()-interval '48 hours')":''} WHEN r.kind='poems' THEN EXISTS(SELECT 1 FROM poem_import_jobs j WHERE j.id=r.source_id AND j.actor_id=$4 AND j.created_at>now()-interval '48 hours') ELSE EXISTS(SELECT 1 FROM hanzi_import_jobs j WHERE j.id=r.source_id AND j.actor_id=$4 AND j.created_at>now()-interval '48 hours') END AND r.source='task' actionable FROM import_records r WHERE r.child_id=$1 AND ($2='all' OR r.kind=$2) ORDER BY r.created_at DESC,r.kind,r.source_id DESC LIMIT 31 OFFSET $3`,[child,kind,offset,actor])).rows;
 for(const row of rows){
  row.retryable=false;row.can_review=false;row.error_code=null;
  if(!row.actionable)continue;
  if(row.kind==='words'){
   const parent=await one(q,"SELECT requested_by,status,error_code,attempts,max_attempts,payload->>'flow' flow,jsonb_build_object('validation_revision',payload->>'validation_revision') payload FROM generation_jobs WHERE id=$1",[row.source_id]);if(!parent)continue;
   const parts=parent.flow==='vocabulary_bulk_v1'?(await q.query("SELECT status,error_code,attempts,max_attempts,jsonb_build_object('validation_revision',payload->>'validation_revision') payload FROM generation_jobs WHERE payload->>'bulk_parent_id'=$1 ORDER BY updated_at DESC,id",[row.source_id])).rows:[parent];
   const count=await one(q,"SELECT count(*) FILTER(WHERE i.child_word_id IS NOT NULL)::int saved,count(*) FILTER(WHERE i.status='needs_confirmation')::int pending FROM batch_items i JOIN generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE g.id=$1 OR g.payload->>'bulk_parent_id'=$1::text",[row.source_id]);
   const running=parts.some(p=>p.status==='running'),active=parts.some(p=>['queued','running'].includes(p.status)),failures=parts.filter(p=>['failed','partial'].includes(p.status));
   row.saved_count=count.saved;row.pending_count=count.pending;row.status=parent.status==='cancelled'||parent.error_code==='USER_CANCELLED'?'cancelled':active?(running?'running':'queued'):count.pending>0?'ready':parent.status;
   row.can_review=count.pending>0&&!active&&row.status!=='cancelled';
   row.error_code=failures.find(p=>p.error_code&&p.error_code!=='BULK_PAUSED')?.error_code??null;
   row.retryable=parent.requested_by===actor&&!active&&row.status!=='cancelled'&&failures.some(vocabularyJobRetryable);
  }else{
   const table=row.kind==='poems'?'poem_import_jobs':row.kind==='sentences'?'sentence_import_jobs':'hanzi_import_jobs';
   const live=await one(q,`SELECT status,error_code${row.kind==='hanzi'?',(source_base64 IS NOT NULL) has_source':''} FROM ${table} WHERE id=$1`,[row.source_id]);if(!live)continue;
   row.status=live.error_code==='USER_CANCELLED'?'cancelled':live.status;row.error_code=row.status==='failed'?live.error_code:null;row.can_review=row.status==='ready';
   row.retryable=row.status==='failed'&&!['USER_CANCELLED','IMPORT_EXPIRED','POEM_BOUNDARY_REQUIRED','POEM_ENTRY_TOO_LONG','INVALID_TEXT','INVALID_TUTOR_INPUT','SENSITIVE_INPUT'].includes(live.error_code)&&(row.kind!=='hanzi'||!!live.has_source);
  }
 }
 return {items:rows.slice(0,30),next_offset:rows.length>30?offset+30:null};
}
