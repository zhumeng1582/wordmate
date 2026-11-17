import type {Sql,Row} from './ports.ts';
import {ensure,uuid} from './errors.ts';
type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>};
export const searchTypes=['words','poems','hanzi','sentences','books'] as const;
export function searchSnippet(text:unknown,term:string,max=90){const value=String(text??'').replace(/\s+/g,' ').trim(),at=value.toLowerCase().indexOf(term.toLowerCase()),start=Math.max(0,at-22);return (start?'…':'')+value.slice(start,start+max)+(value.length>start+max?'…':'');}
const candidates=`
 SELECT 'words' type,'word' kind,w.id::text id,w.lemma title,concat_ws(' · ',w.part_of_speech,w.meaning_zh) subtitle,w.meaning_zh body,'mine' source,
 coalesce((SELECT string_agg(b.name,'、' ORDER BY b.name) FROM wordbook_words x JOIN wordbooks b ON b.id=x.wordbook_id AND b.child_id=x.child_id WHERE x.child_word_id=w.id AND x.child_id=$1 AND b.archived_at IS NULL),'') book_names,
 w.library_archived_at IS NOT NULL archived,0::int item_count,NULL::text joined_book_id
 FROM child_words w WHERE w.child_id=$1 AND w.archived_at IS NULL AND ($3='all' OR w.library_archived_at IS NULL)
 UNION ALL
 SELECT 'poems','poem',p.id::text,p.title,concat_ws(' · ',p.dynasty,p.author),p.body,'mine','',p.library_archived_at IS NOT NULL,0,NULL
 FROM poems p WHERE p.child_id=$1 AND ($3='all' OR p.library_archived_at IS NULL)
 UNION ALL
 SELECT 'hanzi','hanzi',h.id::text,h.character,h.pinyin,concat_ws(' ',h.meaning,h.words,h.example),'mine',
 coalesce((SELECT string_agg(b.name,'、' ORDER BY b.name) FROM hanzi_book_items x JOIN hanzi_books b ON b.id=x.book_id AND b.child_id=x.child_id WHERE x.hanzi_id=h.id AND x.child_id=$1 AND b.archived_at IS NULL),''),h.library_archived_at IS NOT NULL,0,NULL
 FROM hanzi h WHERE h.child_id=$1 AND NOT h.book_orphaned AND ($3='all' OR h.library_archived_at IS NULL)
 UNION ALL
 SELECT 'books','wordbook',b.id::text,b.name,concat_ws(' · ',b.grade,b.textbook,b.category),
 coalesce((SELECT string_agg(w.lemma||' '||w.meaning_zh,' ') FROM wordbook_words x JOIN child_words w ON w.id=x.child_word_id AND w.child_id=x.child_id WHERE x.wordbook_id=b.id AND x.child_id=$1 AND w.archived_at IS NULL),''),'mine','',false,
 (SELECT count(*)::int FROM wordbook_words x JOIN child_words w ON w.id=x.child_word_id WHERE x.wordbook_id=b.id AND x.child_id=$1 AND w.archived_at IS NULL),NULL
 FROM wordbooks b WHERE b.child_id=$1 AND b.archived_at IS NULL AND $8 IN ('all','mine')
 UNION ALL
 SELECT 'books','hanzi_book',b.id::text,b.name,concat_ws(' · ',b.grade,b.textbook,b.category),
 coalesce((SELECT string_agg(h.character||' '||h.pinyin||' '||h.meaning,' ') FROM hanzi_book_items x JOIN hanzi h ON h.id=x.hanzi_id AND h.child_id=x.child_id WHERE x.book_id=b.id AND x.child_id=$1),''),'mine','',false,
 (SELECT count(*)::int FROM hanzi_book_items x WHERE x.book_id=b.id AND x.child_id=$1),NULL
 FROM hanzi_books b WHERE b.child_id=$1 AND b.archived_at IS NULL AND $8 IN ('all','mine')
 UNION ALL
 SELECT 'books','shared_wordbook',s.id::text,s.title,concat_ws(' · ',s.author,s.grade,s.textbook,s.category),concat_ws(' ',s.description,(SELECT string_agg(i.lemma||' '||i.meaning_zh,' ') FROM shared_wordbook_items i WHERE i.shared_wordbook_id=s.id)),
 'public','',false,s.word_count,(SELECT b2.id::text FROM wordbooks b2 WHERE b2.child_id=$1 AND b2.shared_source_id=s.id AND b2.archived_at IS NULL LIMIT 1)
 FROM shared_wordbooks s JOIN wordbooks b ON b.id=s.source_wordbook_id AND b.child_id=s.source_child_id JOIN children c ON c.id=s.source_child_id JOIN families f ON f.id=c.family_id
 WHERE s.published AND b.archived_at IS NULL AND c.archived_at IS NULL AND f.status='active' AND s.source_child_id<>$1 AND $8 IN ('all','public')
 UNION ALL
 SELECT 'books','shared_hanzi_book',s.id::text,s.title,concat_ws(' · ',s.author,s.grade,s.textbook,s.category),concat_ws(' ',s.description,(SELECT string_agg(i.character||' '||i.pinyin||' '||i.meaning,' ') FROM shared_hanzi_book_items i WHERE i.shared_book_id=s.id)),
 'public','',false,(SELECT count(*)::int FROM shared_hanzi_book_items i WHERE i.shared_book_id=s.id),(SELECT j.local_book_id::text FROM shared_hanzi_book_joins j JOIN hanzi_books b2 ON b2.id=j.local_book_id WHERE j.shared_book_id=s.id AND j.child_id=$1 AND b2.archived_at IS NULL LIMIT 1)
 FROM shared_hanzi_books s JOIN hanzi_books b ON b.id=s.source_book_id AND b.child_id=s.source_child_id JOIN children c ON c.id=s.source_child_id JOIN families f ON f.id=c.family_id
 WHERE s.published AND b.archived_at IS NULL AND c.archived_at IS NULL AND f.status='active' AND s.source_child_id<>$1 AND $8 IN ('all','public')
 UNION ALL
 SELECT 'books','textbook','new-sailing-'||u.grade||'-'||CASE WHEN u.term='上册' THEN 'a' ELSE 'b' END,
 '新起航英语 '||CASE u.grade WHEN 1 THEN '一' WHEN 2 THEN '二' ELSE u.grade::text END||'年级'||u.term,
 '教材词本',string_agg(w.lemma||' '||w.meaning_zh,' '),'textbook','',false,count(DISTINCT (w.lemma,w.meaning_zh))::int,
 (SELECT b.id::text FROM textbook_volume_joins j JOIN wordbooks b ON b.id=j.wordbook_id AND b.child_id=j.child_id WHERE j.child_id=$1 AND j.volume_id='new-sailing-'||u.grade||'-'||CASE WHEN u.term='上册' THEN 'a' ELSE 'b' END AND b.archived_at IS NULL LIMIT 1)
 FROM textbook_units u JOIN textbook_unit_words w ON w.unit_id=u.id WHERE $8 IN ('all','textbook') GROUP BY u.grade,u.term
`;
const poemBookCandidates=`
 UNION ALL SELECT 'books','poem_book',b.id::text,b.name,concat_ws(' · ',b.grade,b.textbook,b.category),coalesce((SELECT string_agg(p.title||' '||p.body,' ') FROM poem_book_items i JOIN poems p ON p.id=i.poem_id WHERE i.book_id=b.id),''),'mine','',false,(SELECT count(*)::int FROM poem_book_items i JOIN poems p ON p.id=i.poem_id WHERE i.book_id=b.id),NULL FROM poem_books b WHERE b.child_id=$1 AND b.archived_at IS NULL AND $8 IN ('all','mine')
 UNION ALL SELECT 'books','shared_poem_book',s.id::text,s.title,concat_ws(' · ',s.author,s.grade,s.textbook,s.category),concat_ws(' ',s.description,(SELECT string_agg(concat_ws(' ',i.content->>'title',i.content->>'body'),' ') FROM shared_poem_book_items i WHERE i.shared_book_id=s.id)),'public','',false,(SELECT count(*)::int FROM shared_poem_book_items i WHERE i.shared_book_id=s.id),(SELECT j.local_book_id::text FROM shared_poem_book_joins j JOIN poem_books b2 ON b2.id=j.local_book_id WHERE j.shared_book_id=s.id AND j.child_id=$1 AND b2.archived_at IS NULL LIMIT 1) FROM shared_poem_books s JOIN poem_books b ON b.id=s.source_book_id JOIN children c ON c.id=s.source_child_id JOIN families f ON f.id=c.family_id WHERE s.published AND b.archived_at IS NULL AND c.archived_at IS NULL AND f.status='active' AND s.source_child_id<>$1 AND $8 IN ('all','public')
`;
const sentenceCandidates=`
 UNION ALL SELECT 'sentences','sentence',l.sentence_id::text,s.text_en,s.translation_zh,s.translation_zh,'mine',coalesce((SELECT string_agg(b.name,'、') FROM sentence_book_items i JOIN sentence_books b ON b.id=i.book_id WHERE i.sentence_id=l.sentence_id AND b.archived_at IS NULL),''),l.archived_at IS NOT NULL,0,(SELECT i.book_id::text FROM sentence_book_items i JOIN sentence_books b ON b.id=i.book_id WHERE i.sentence_id=l.sentence_id AND b.archived_at IS NULL ORDER BY b.created_at,b.id LIMIT 1) FROM sentence_library l JOIN sentences s ON s.id=l.sentence_id WHERE l.child_id=$1 AND ($3='all' OR l.archived_at IS NULL) AND EXISTS(SELECT 1 FROM sentence_book_items i JOIN sentence_books b ON b.id=i.book_id WHERE i.sentence_id=l.sentence_id AND b.archived_at IS NULL)
 UNION ALL SELECT 'books','sentence_book',b.id::text,b.name,'英语句子',coalesce((SELECT string_agg(s.text_en||' '||s.translation_zh,' ') FROM sentence_book_items i JOIN sentences s ON s.id=i.sentence_id WHERE i.book_id=b.id),''),'mine','',false,(SELECT count(*)::int FROM sentence_book_items i WHERE i.book_id=b.id),NULL FROM sentence_books b WHERE b.child_id=$1 AND b.archived_at IS NULL AND $8 IN ('all','mine')
 UNION ALL SELECT 'books','shared_sentence_book',s.id::text,s.title,s.author,concat_ws(' ',s.description,(SELECT string_agg(i.text_en||' '||i.translation_zh,' ') FROM shared_sentence_book_items i WHERE i.shared_book_id=s.id)),'public','',false,(SELECT count(*)::int FROM shared_sentence_book_items i WHERE i.shared_book_id=s.id),(SELECT j.local_book_id::text FROM shared_sentence_book_joins j JOIN sentence_books b2 ON b2.id=j.local_book_id WHERE j.shared_book_id=s.id AND j.child_id=$1 AND b2.archived_at IS NULL LIMIT 1) FROM shared_sentence_books s JOIN sentence_books b ON b.id=s.source_book_id JOIN children c ON c.id=s.source_child_id JOIN families f ON f.id=c.family_id WHERE s.published AND b.archived_at IS NULL AND c.archived_at IS NULL AND f.status='active' AND s.source_child_id<>$1 AND $8 IN ('all','public')
`;
export class UnifiedSearch{
 private access:Access;constructor(access:Access){this.access=access;}
 async search(actor:string,child:string,query:any){
  uuid(child);ensure(typeof query.q==='string'&&query.q.length<=100&&!/[\u0000-\u001f\u007f]/.test(query.q),422,'INVALID_SEARCH');
  const term=query.q.normalize('NFKC').trim(),type=query.type??'all',archive=query.archive??'active',bookScope=query.book_scope??'all';
  ensure(term.length<=100,422,'INVALID_SEARCH');
  ensure(['all',...searchTypes].includes(type)&&['active','all'].includes(archive)&&['all','mine','public','textbook'].includes(bookScope),422,'INVALID_SEARCH');
  const limit=query.limit===undefined?20:Number(query.limit);ensure(Number.isInteger(limit)&&limit>=1&&limit<=50,422,'INVALID_PAGE');
  const signature=JSON.stringify([child,term.toLowerCase(),type,archive,bookScope]);let boundary:any=null;
  if(query.cursor!==undefined){try{ensure(type!=='all'&&typeof query.cursor==='string'&&query.cursor.length<=1500,422,'INVALID_CURSOR');boundary=JSON.parse(Buffer.from(query.cursor,'base64url').toString());ensure(boundary.signature===signature&&Number.isInteger(boundary.rank)&&boundary.rank>=0&&boundary.rank<=3&&typeof boundary.title==='string'&&typeof boundary.key==='string',422,'INVALID_CURSOR');}catch{ensure(false,422,'INVALID_CURSOR');}}
  return this.access.tx(async q=>{await this.access.child(q,actor,child);if(!term)return {query:term,counts:Object.fromEntries(searchTypes.map(t=>[t,0])),groups:[],type,next_cursor:null};
   const hasPoems=(await q.query("SELECT to_regclass('wordmate.poem_books') present")).rows[0]?.present;
   let allCandidates=hasPoems?candidates.replace("p.body,'mine','',p.library_archived_at", "p.body,'mine',coalesce((SELECT string_agg(b.name,'、') FROM poem_book_items i JOIN poem_books b ON b.id=i.book_id WHERE i.poem_id=p.id AND b.archived_at IS NULL),''),p.library_archived_at").replace("FROM poems p WHERE p.child_id=$1 AND", "FROM poems p WHERE NOT p.book_orphaned AND p.child_id=$1 AND")+poemBookCandidates:candidates;
   if((await q.query("SELECT to_regclass('wordmate.sentence_library') present")).rows[0]?.present)allCandidates+=sentenceCandidates;
   const rows=(await q.query(`WITH candidates AS (${allCandidates}),matched AS (
    SELECT *,kind||':'||id key,lower(title) sort_title,CASE WHEN lower(title)=lower($2) THEN 0 WHEN position(lower($2) in lower(title))=1 THEN 1 WHEN position(lower($2) in lower(title))>0 THEN 2 ELSE 3 END rank
    FROM candidates WHERE position(lower($2) in lower(title))>0 OR position(lower($2) in lower(subtitle))>0 OR position(lower($2) in lower(body))>0
   ),ranked AS(SELECT *,row_number() OVER(PARTITION BY type ORDER BY rank,sort_title,key) ordinal FROM matched),page AS(
    SELECT * FROM ranked WHERE type=$4 AND ($5::int IS NULL OR (rank,sort_title,key)>($5::int,$6::text,$7::text)) ORDER BY rank,sort_title,key LIMIT $9
   ),selected AS(SELECT * FROM ranked WHERE $4='all' AND ordinal<=3 UNION ALL SELECT * FROM page WHERE $4<>'all')
   SELECT t.type,(SELECT count(*)::int FROM matched m WHERE m.type=t.type) total,
    coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY rank,sort_title,key) FROM selected s WHERE s.type=t.type),'[]'::jsonb) items
   FROM (VALUES('words'),('poems'),('hanzi'),('sentences'),('books')) t(type)`,[child,term,archive,type,boundary?.rank??null,boundary?.title??null,boundary?.key??null,bookScope,limit+1])).rows;
   const counts=Object.fromEntries(rows.map(r=>[r.type,r.total]));let cursor:string|null=null;
   const groups=rows.filter(r=>r.total>0&&(type==='all'||r.type===type)).map(r=>{
    const items=type==='all'?r.items:r.items.slice(0,limit);if(type!=='all'&&r.items.length>limit){const last=items.at(-1);cursor=Buffer.from(JSON.stringify({signature,rank:last.rank,title:last.sort_title,key:last.key})).toString('base64url');}
    return {type:r.type,total:r.total,items:items.map((item:any)=>({id:item.id,key:item.key,kind:item.kind,title:item.title,subtitle:item.subtitle,snippet:searchSnippet(item.body,term),source:item.source,book_names:item.book_names,archived:item.archived,item_count:item.item_count,joined_book_id:item.joined_book_id}))};
   });return {query:term,type,counts,groups,next_cursor:cursor};
  });
 }
}
