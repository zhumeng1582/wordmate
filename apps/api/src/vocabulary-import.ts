export const MAX_IMPORT_WORDS=8000;
export const MAX_IMPORT_TEXT=1000000;
export const GENERATION_CHUNK_SIZE=30;
export const VOCABULARY_IMPORT_PLAN_VERSION=2;

// A numbered/bulleted Markdown vocabulary document is a sequence of complete
// entries. Keep each headword, definition and examples together in one chunk.
function markdownEntries(raw:string):string[]|null{
 const lines=raw.split(/\r?\n/),starts:number[]=[],headings:number[]=[],otherLists:number[]=[];let fence='',style='';const numbers:number[]=[];
 for(let i=0;i<lines.length;i++){
  const marker=lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
  if(marker){if(!fence)fence=marker[1][0];else if(marker[1][0]===fence)fence='';continue;}
  if(fence)continue;
  if(/^ {0,3}(?:#{1,6}\s+|(?:注|备注|补充说明)[：:]|\d{4}-\d{2}-\d{2}\b.*说明[：:])/.test(lines[i]))headings.push(i);
  const list=lines[i].match(/^ {0,3}(?:(\d+)[.)、]|([-+*]))\s+(.+)$/);if(!list)continue;
  const word=list[3].match(/^(?:\*\*([A-Za-z][A-Za-z .’'-]{0,119})\*\*|__([A-Za-z][A-Za-z .’'-]{0,119})__)(?:\s|[|：:—–-]|$)/);
  if(!word){if(starts.length)otherLists.push(i);continue;}
  const nextStyle=list[1]?'numbered':'bulleted';if(style&&style!==nextStyle)return null;style=nextStyle;starts.push(i);if(list[1])numbers.push(Number(list[1]));
 }
 if(starts.length<2)return null;
 const last=starts[starts.length-1];
 // Notes in a separate section after the vocabulary are context, not more
 // entries. A mixed/unformatted list inside the entries still uses the full
 // text parser so that a target word is never silently dropped.
 if(otherLists.some(index=>index<last||!headings.some(heading=>heading>last&&heading<index)))return null;
 if(numbers.length&&!numbers.every(n=>n===1)&&!numbers.every((n,i)=>n===i+1))return null;
 if(starts.length>MAX_IMPORT_WORDS)throw Error('TOO_MANY_WORDS');
 return starts.map((start,i)=>lines.slice(start,starts[i+1]??lines.length).join('\n').trim());
}

// Preserve phrases and table rows; only split long prose at whitespace boundaries.
export function vocabularyImportChunks(raw:string):string[]{
 const document=markdownEntries(raw);
 if(document){
  const chunks:string[]=[];let group:string[]=[];
  for(const entry of document){if(entry.length>8000)throw Error('IMPORT_ENTRY_TOO_LONG');if(group.length&&(group.length===GENERATION_CHUNK_SIZE||group.join('\n\n').length+entry.length+2>8000)){chunks.push(group.join('\n\n'));group=[];}group.push(entry);}
  if(group.length)chunks.push(group.join('\n\n'));return chunks;
 }
 const rows=raw.split(/[\r\n,，、;；]+/).map(row=>row.trim()).filter(Boolean);
 const entries:string[]=[];
 for(const row of rows){
  if(row.length<=120&&(row.match(/[A-Za-z]+/g)??[]).length<=30){entries.push(row);continue;}
  const words=row.match(/\S+/g)??[];let part='',weight=0;
  for(const word of words){if(word.length>120)throw Error('IMPORT_ENTRY_TOO_LONG');const size=Math.max(1,(word.match(/[A-Za-z]+/g)??[]).length);if(part&&(part.length+word.length+1>120||weight+size>30)){entries.push(part);part='';weight=0;}part+=(part?' ':'')+word;weight+=size;}
  if(part)entries.push(part);
 }
 if(entries.length>MAX_IMPORT_WORDS)throw Error('TOO_MANY_WORDS');
 if(rows.length===1&&(raw.match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)??[]).length>MAX_IMPORT_WORDS)throw Error('TOO_MANY_WORDS');
 const chunks:string[]=[];let group:string[]=[],weight=0;
 for(const entry of entries){const size=Math.max(1,(entry.match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)??[]).length);if(group.length&&(group.length===GENERATION_CHUNK_SIZE||weight+size>GENERATION_CHUNK_SIZE||group.join('\n').length+entry.length+1>8000)){chunks.push(group.join('\n'));group=[];weight=0;}group.push(entry);weight+=size;}
 if(group.length)chunks.push(group.join('\n'));
 return chunks;
}
