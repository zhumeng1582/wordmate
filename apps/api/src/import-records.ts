import {randomUUID} from 'node:crypto';
import type {Sql,Row} from './ports.ts';
import {ensure} from './errors.ts';
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
 for(const row of rows){if(hasSentences&&row.kind==='sentences'&&row.actionable){const live=await one(q,'SELECT status FROM sentence_import_jobs WHERE id=$1',[row.source_id]);if(live)row.status=live.status;}if(row.kind==='words'&&row.actionable){const count=await one(q,"SELECT count(*) FILTER(WHERE i.child_word_id IS NOT NULL)::int saved,count(*) FILTER(WHERE i.status='needs_confirmation')::int pending FROM batch_items i JOIN generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE g.id=$1 OR g.payload->>'bulk_parent_id'=$1::text",[row.source_id]);row.saved_count=count.saved;if(count.pending>0&&!['queued','running','cancelled'].includes(row.status))row.status='ready';}}
 return {items:rows.slice(0,30),next_offset:rows.length>30?offset+30:null};
}
