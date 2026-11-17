import {renderWordCopybook} from './word-copybook.ts';
import {renderWordListPdf} from './word-list-pdf.ts';
import {displayWordSenses} from './word-senses.ts';
import {ensure,uuid} from './errors.ts';
import type {Sql,Row} from './ports.ts';
import {libraryStatusSql,librarySelection,librarySelectionSql} from './library-status.ts';
export const wordColumns=`w.id,w.lemma,w.part_of_speech,w.meaning_zh,w.version,w.ipa_gb,w.ipa_us,w.dictionary_source,(SELECT json_build_object('id',s.id,'content_version',s.content_version,'text_en',s.text_en,'translation_zh',s.translation_zh) FROM sentences s JOIN sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=w.id AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1) example`;
export async function exportWords(q:Sql,child:string,b:any){
 ensure(b.format===undefined||['list','copybook'].includes(b.format),422,'INVALID_EXPORT_SELECTION');
 const selection=librarySelection(b.status??'all');
 const learned="EXISTS(SELECT 1 FROM review_cards r WHERE r.child_id=w.child_id AND r.child_word_id=w.id AND r.card_type='meaning' AND r.state<>'new')";
 const stateFilter=` AND ${librarySelectionSql(selection,libraryStatusSql('w.library_archived_at',learned),'w.library_archived_at')}`;
 const all=b.all===true,ids=all?b.excluded_ids??[]:b.word_ids;
 ensure(Array.isArray(ids)&&ids.length<=10000&&(all||ids.length>0)&&new Set(ids).size===ids.length,422,'INVALID_EXPORT_SELECTION');ids.forEach(uuid);
 const book=b.wordbook_id?uuid(b.wordbook_id):null;
 if(book)ensure(await q.query('SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[book,child]).then(r=>r.rows.length>0),404,'WORDBOOK_NOT_FOUND');
 // Selected IDs outside the current child's active list fail the whole export.
 const belongs=book?' AND EXISTS(SELECT 1 FROM wordbook_words bw WHERE bw.child_id=w.child_id AND bw.child_word_id=w.id AND bw.wordbook_id=$3)':'';
 if(ids.length){const count=(await q.query(`SELECT count(*)::int n FROM child_words w WHERE w.child_id=$1 AND w.archived_at IS NULL AND w.id=ANY($2::uuid[])${belongs}`,[child,ids,...(book?[book]:[])])).rows[0].n;ensure(count===ids.length,409,'EXPORT_SELECTION_CHANGED');}
 const rows=(await q.query(`SELECT ${wordColumns} FROM child_words w WHERE w.child_id=$1 AND w.archived_at IS NULL AND ${all?'NOT ':''}(w.id=ANY($2::uuid[]))${belongs}${all?stateFilter:''} ORDER BY ${book?'(SELECT bw.order_key FROM wordbook_words bw WHERE bw.child_word_id=w.id AND bw.wordbook_id=$3)':'w.order_key'},w.id LIMIT 10001`,[child,ids,...(book?[book]:[])])).rows;
 ensure(rows.length>0,422,'EXPORT_EMPTY');ensure(rows.length<=10000,422,'EXPORT_TOO_LARGE');
 const document=b.format==='copybook'?await renderWordCopybook(rows.map((w:Row)=>w.lemma)):await renderWordListPdf(rows.map((w:Row)=>({lemma:w.lemma,example:w.example,...displayWordSenses(w.part_of_speech,w.meaning_zh)})));
 return {filename:b.format==='copybook'?'英文字帖.pdf':'单词本.pdf',count:rows.length,mime_type:'application/pdf',base64:document.toString('base64')};
}
