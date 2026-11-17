import {shortPos} from './word-pos.ts';
// Accept one English headword, including ordinary contractions and hyphenated forms.
export const isSingleWord=(value:unknown):boolean=>typeof value==='string'&&/^[A-Za-z]+(?:[.'’\-][A-Za-z]+)*\.?$/.test(value.trim());
import type {Sql,Row} from './ports.ts';
import {ensure} from './errors.ts';
/** Pairs of parts of speech and meanings stored in the existing word columns. */
export type WordSense={part_of_speech:string;meaning_zh:string};

// Only multi-sense values use the escaped format. A legacy single-sense meaning
// can contain literal semicolons and backslashes and must be read unchanged.
const splitEscaped=(value:string):string[]=>{
 const result:string[]=[];let part='';
 for(let i=0;i<value.length;i++){
  const ch=value[i];
  if(ch==='\\'&&i+1<value.length&&(value[i+1]==='\\'||value[i+1]==='；'))part+=value[++i];
  else if(ch==='；'){result.push(part);part='';}
  else part+=ch;
 }
 result.push(part);return result;
};
const escapePart=(value:string)=>value.replace(/\\/g,'\\\\').replace(/；/g,'\\；');
export function parseWordSenses(pos:string,meaning:string):WordSense[]{
 const parts=splitEscaped(pos);
 if(parts.length===1)return [{part_of_speech:pos,meaning_zh:meaning}];
 const meanings=splitEscaped(meaning);
 // Never drop data when encountering an old or malformed value.
 if(meanings.length!==parts.length||parts.some(x=>!x.trim())||meanings.some(x=>!x.trim()))return [{part_of_speech:pos,meaning_zh:meaning}];
 return parts.map((part_of_speech,i)=>({part_of_speech,meaning_zh:meanings[i]}));
}
export function formatWordSenses(senses:WordSense[]):{part_of_speech:string;meaning_zh:string}{
 if(!senses.length||senses.some(x=>!x.part_of_speech.trim()||!x.meaning_zh.trim()))throw Error('INVALID_WORD_SENSES');
 if(senses.length===1)return {...senses[0]};
 return {part_of_speech:senses.map(x=>escapePart(x.part_of_speech)).join('；'),meaning_zh:senses.map(x=>escapePart(x.meaning_zh)).join('；')};
}
export function mergeWordSenses(existing:WordSense[],incoming:WordSense[]):WordSense[]{
 const result=existing.map(x=>({...x}));
 const norm=(v:string)=>v.normalize('NFKC').trim().toLowerCase();
 const terms=(v:string)=>norm(v).split(/[;,、/|]/u).map(x=>x.trim()).filter(Boolean);
 for(const sense of incoming){
  const pos=sense.part_of_speech.trim(),meaning=sense.meaning_zh.trim();if(!pos||!meaning)throw Error('INVALID_WORD_SENSES');
  const newTerms=terms(meaning);let merged=false;
  for(const old of result){
   const samePos=norm(shortPos(old.part_of_speech))===norm(shortPos(pos)),generic=old.part_of_speech==='教材'||pos==='教材';
   if(!samePos&&!generic)continue;
   const oldTerms=terms(old.meaning_zh);
   const newCovered=newTerms.length>0&&newTerms.every(t=>oldTerms.includes(t));
   const oldCovered=oldTerms.length>0&&oldTerms.every(t=>newTerms.includes(t));
   // 教材 is a source label, not a grammatical category. Only equate it
   // with another category when the meanings cover one another exactly.
   if(generic&&!samePos&&!(newCovered&&oldCovered))continue;
   if(newCovered||oldCovered){
    if(oldCovered&&!newCovered)old.meaning_zh=meaning;
    if(old.part_of_speech==='教材'&&pos!=='教材')old.part_of_speech=pos;
    merged=true;break;
   }
  }
  if(!merged)result.push({part_of_speech:pos,meaning_zh:meaning});
 }
 return result;
}
export function displayWordSenses(pos:string,meaning:string){
 const senses=parseWordSenses(pos,meaning);
 return {senses,part_of_speech:senses.map(s=>s.part_of_speech).join('；'),meaning_zh:senses.map(s=>s.meaning_zh).join('；')};
}

/** Caller must hold the child lock so concurrent imports cannot create duplicates. */
export async function mergeExistingWord(q:Sql,child:string,lemma:string,incoming:WordSense):Promise<Row|undefined>{
 let word=(await q.query('SELECT * FROM child_words WHERE child_id=$1 AND normalized_lemma=$2 AND archived_at IS NULL ORDER BY created_at,id LIMIT 1 FOR UPDATE',[child,lemma.toLowerCase()])).rows[0];
 if(!word)return undefined;
 const combined=formatWordSenses(mergeWordSenses(parseWordSenses(word.part_of_speech,word.meaning_zh),[incoming]));
 ensure(combined.part_of_speech.length<=240&&combined.meaning_zh.length<=4000,422,'WORD_SENSES_TOO_LONG');
 if(combined.part_of_speech!==word.part_of_speech||combined.meaning_zh!==word.meaning_zh)
  word=(await q.query('UPDATE child_words SET part_of_speech=$2,meaning_zh=$3,version=version+1 WHERE id=$1 RETURNING *',[word.id,combined.part_of_speech,combined.meaning_zh])).rows[0];
 return word;
}
