// Extract only clear bilingual pairs. Ambiguous layouts stay with the model's
// quoted source translation and are checked against the actual input below.
export type SourceSentencePair={text_en:string;translation_zh:string};
export const sourceKey=(s:string)=>s.normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const stripList=(s:string)=>s.trim().replace(/^(?:\d+[.)、．]\s*|[-*•]\s+)/,'').replace(/^(?:英文(?:句子)?|English)\s*[:：]\s*/i,'').trim();
const translation=(s:string)=>s.trim().replace(/^(?:中文(?:译文)?|译文|翻译|Chinese|Translation)\s*[:：]\s*/i,'').trim();
export function sourceSentencePairs(raw:string):SourceSentencePair[]{
 const pairs:SourceSentencePair[]=[],ambiguous=new Set<number>();let pending='',lastPair=-1;const add=(pair:SourceSentencePair)=>{lastPair=pairs.length;pairs.push(pair);};
 for(const value of raw.split(/\r?\n/)){
  const line=stripList(value);if(!line)continue;
  const cells=line.split(/\t|\s*\|\s*/).filter(Boolean);
  if(cells.length===2&&/^[A-Za-z]/.test(cells[0])&&/\p{Script=Han}/u.test(cells[1])){add({text_en:cells[0].trim(),translation_zh:translation(cells[1])});pending='';continue;}
  const inline=line.match(/^([A-Za-z][^\p{Script=Han}]*[.!?])\s*(?:[-—:：]\s*)?((?:(?:中文(?:译文)?|译文|翻译)\s*[:：]\s*)?\p{Script=Han}[\s\S]*)$/u);
  if(inline){if(!/[A-Za-z][^\p{Script=Han}]*[.!?]/u.test(inline[2]))add({text_en:inline[1].trim(),translation_zh:translation(inline[2])});else lastPair=-1;pending='';continue;}
  if(/^[A-Za-z]/.test(line)&&!(/\p{Script=Han}/u.test(line))){lastPair=-1;pending=line.replace(/^\*\*([\s\S]*)\*\*$/,'$1').trim();continue;}
  const zh=translation(line);
  if(pending&&/^\p{Script=Han}/u.test(zh)&&!/^(?:请|请帮我|帮我)?(?:把这句|将这句|把它|将它)?(?:翻译|译)(?:成|为)?(?:中文|英文|汉语|英语)[。！!？?]?$/.test(zh)){add({text_en:pending,translation_zh:zh});pending='';}else{if(lastPair>=0&&/^\p{Script=Han}/u.test(zh))ambiguous.add(lastPair);lastPair=-1;pending='';}
 }
 return pairs.filter((_,i)=>!ambiguous.has(i));
}
// Return the exact source spelling/punctuation, including wrapped translations.
export function sourceLiteral(raw:string,quote:string):string|null{
 if(!quote.trim())return null;if(raw.includes(quote))return quote;
 let text='',offset=0;const starts:number[]=[],ends:number[]=[];
 for(const ch of raw){const normalized=ch.normalize('NFKC');for(const c of normalized){if(/\s/u.test(c))continue;text+=c;for(let i=0;i<c.length;i++){starts.push(offset);ends.push(offset+ch.length);}}offset+=ch.length;}
 const needle=quote.normalize('NFKC').replace(/\s/gu,''),index=text.indexOf(needle);return index<0?null:raw.slice(starts[index],ends[index+needle.length-1]).trim();
}
