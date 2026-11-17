import type {Sql,Row} from './ports.ts';
type Kind='word'|'poem'|'hanzi'|'assistant';
const column=(kind:Kind)=>({word:'word_message_id',poem:'poem_message_id',hanzi:'hanzi_message_id',assistant:'assistant_message_id'})[kind];
const available=async(q:Sql)=>!!(await q.query("SELECT to_regclass('wordmate.tutor_reply_suggestions') present")).rows[0]?.present;
export async function saveTutorSuggestions(q:Sql,kind:Kind,id:string,suggestions:unknown){
 if(!Array.isArray(suggestions)||!suggestions.length||!await available(q))return;
 const clean=[...new Set(suggestions.filter(s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=40&&!/[\u0000-\u001f\u007f]/.test(s)).map(s=>s.trim()))].slice(0,3);if(!clean.length)return;
 const key=column(kind);await q.query(`INSERT INTO tutor_reply_suggestions(${key},suggestions) VALUES($1,$2) ON CONFLICT(${key}) DO UPDATE SET suggestions=EXCLUDED.suggestions`,[id,JSON.stringify(clean)]);
}
export async function tutorMessages(q:Sql,kind:Kind,messages:Row[]):Promise<Row[]>{
 if(!messages.length||!await available(q))return messages;
 const rows=(await q.query(`SELECT ${column(kind)} message_id,suggestions FROM tutor_reply_suggestions WHERE ${column(kind)}=ANY($1::uuid[])`,[messages.map(m=>m.id)])).rows;
 const byId=new Map(rows.map(r=>[r.message_id,r.suggestions]));return messages.map(m=>({...m,suggestions:byId.get(m.id)??[]}));
}
