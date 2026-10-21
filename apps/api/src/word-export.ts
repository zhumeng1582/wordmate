import {ensure,uuid} from './errors.ts';
import type {Sql,Row} from './ports.ts';
export function csvCell(value:unknown){let s=String(value??'').replace(/\u0000/g,'');if(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export const wordColumns=`w.id,w.lemma,w.part_of_speech,w.meaning_zh,w.version,w.ipa_gb,w.ipa_us,w.dictionary_source,(SELECT json_build_object('id',s.id,'content_version',s.content_version,'text_en',s.text_en,'translation_zh',s.translation_zh) FROM sentences s JOIN sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=w.id AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1) example`;
export async function exportWords(q:Sql,child:string,b:any){
 const all=b.all===true,ids=all?b.excluded_ids??[]:b.word_ids;
 ensure(Array.isArray(ids)&&ids.length<=10000&&(all||ids.length>0)&&new Set(ids).size===ids.length,422,'INVALID_EXPORT_SELECTION');ids.forEach(uuid);
 // Selected IDs outside the current child's active list fail the whole export.
 if(ids.length){const count=(await q.query('SELECT count(*)::int n FROM child_words WHERE child_id=$1 AND archived_at IS NULL AND id=ANY($2::uuid[])',[child,ids])).rows[0].n;ensure(count===ids.length,409,'EXPORT_SELECTION_CHANGED');}
 const rows=(await q.query(`SELECT ${wordColumns} FROM child_words w WHERE w.child_id=$1 AND w.archived_at IS NULL AND ${all?'NOT':''}(w.id=ANY($2::uuid[])) ORDER BY w.created_at DESC,w.id DESC LIMIT 10001`,[child,ids])).rows;
 ensure(rows.length>0,422,'EXPORT_EMPTY');ensure(rows.length<=10000,422,'EXPORT_TOO_LARGE');
 const header=['单词','词性','中文释义','英式音标','美式音标','英文例句','例句翻译','内容来源'];
 const lines=[header,...rows.map((w:Row)=>[w.lemma,w.part_of_speech,w.meaning_zh,w.ipa_gb,w.ipa_us,w.example?.text_en,w.example?.translation_zh,String(w.dictionary_source).startsWith('ai:')?'AI 生成，仅供学习参考':w.dictionary_source])];
 return {filename:'单词本.csv',count:rows.length,content:'\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'};
}
