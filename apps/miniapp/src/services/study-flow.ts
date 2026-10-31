export type StudySource={source:string;[key:string]:any};
export type StudyCard={id:string;version:number;child_word_id:string;word_version:number;lemma:string;meaning_zh?:string;part_of_speech?:string;ipa_gb?:string;ipa_us?:string;example?:{id:string;content_version:number;text_en:string;translation_zh?:string};[key:string]:any};
export type StudyResult={correct:boolean;selectedMeaning:string;meaning:string;saved:boolean;eventId:string};
export type StudyFlow={format:1;source:StudySource;session:any;sessionClosed:boolean;loaded:boolean;cards:StudyCard[];pool:{id:string;meaning_zh:string}[];phase:'learn'|'test'|'practice'|'summary';learnIndex:number;testIndex:number;results:Record<string,StudyResult>;baseDone:number;total:number;practiceQueue:string[];practiced:Record<string,boolean>;practiceTurn:number;practiceFeedback?:{correct:boolean;selectedMeaning:string};today?:any;startedAt:number;updatedAt:number};
export type StudyPending={body:any;card?:StudyCard;result?:StudyResult;legacyKey?:string};
export const studyKeys=(token:string,child:string)=>({resume:`study_resume:${token}:${child}`,pending:`study_pending:${token}:${child}`});
export function sourceIdentity(source:StudySource){return JSON.stringify(Object.fromEntries(Object.keys(source).sort().map(key=>[key,key==='word_ids'&&Array.isArray(source[key])?[...source[key]].sort():source[key]])));}
export function emptyStudy(source:StudySource,now=Date.now()):StudyFlow{return {format:1,source,session:null,sessionClosed:false,loaded:false,cards:[],pool:[],phase:source.source==='new_words'?'learn':'test',learnIndex:0,testIndex:0,results:{},baseDone:0,total:0,practiceQueue:[],practiced:{},practiceTurn:0,startedAt:now,updatedAt:now};}
export function studyCounts(flow:StudyFlow){const answers=Object.values(flow.results).filter(result=>result.saved),correct=answers.filter(result=>result.correct).length;return {done:Math.min(flow.total,flow.baseDone+answers.length),correct,wrong:answers.length-correct,total:flow.total};}
export const studyComplete=(flow:StudyFlow)=>flow.loaded&&studyCounts(flow).done>=flow.total;
export const studyCard=(flow:StudyFlow)=>flow.phase==='learn'?flow.cards[flow.learnIndex]:flow.phase==='test'?flow.cards[flow.testIndex]:flow.phase==='practice'?flow.cards.find(card=>card.id===flow.practiceQueue[0]):undefined;
export function nextUnanswered(flow:StudyFlow,after=flow.testIndex){for(let offset=1;offset<=flow.cards.length;offset++){const index=(after+offset)%flow.cards.length;if(!flow.results[flow.cards[index].id]?.saved)return index;}return -1;}
export function moveStudyForward(flow:StudyFlow):StudyFlow{
 if(flow.phase==='practice'){
  if(!flow.practiceFeedback)return flow;
  const [current,...rest]=flow.practiceQueue,correct=flow.practiceFeedback.correct,queue=correct?rest:[...rest,current];
  return {...flow,practiceQueue:queue,practiced:correct?{...flow.practiced,[current]:true}:flow.practiced,practiceFeedback:undefined,practiceTurn:flow.practiceTurn+1,phase:queue.length?'practice':'summary'};
 }
 if(flow.phase!=='test'||!flow.results[flow.cards[flow.testIndex]?.id]?.saved)return flow;
 const index=nextUnanswered(flow);return index<0?{...flow,phase:'summary'}:{...flow,testIndex:index};
}
export function beginStudyPractice(flow:StudyFlow):StudyFlow{if(!studyComplete(flow))return flow;const ids=flow.cards.filter(card=>flow.results[card.id]?.saved&&!flow.results[card.id].correct&&!flow.practiced[card.id]).map(card=>card.id);return ids.length?{...flow,phase:'practice',practiceQueue:ids,practiceFeedback:undefined}:flow;}
export function mergeStudyFlow(previous:StudyFlow,session:any,items:StudyCard[],pool:StudyFlow['pool'],counts:{total:number;remaining:number}):StudyFlow{
 const live=new Map(items.map(card=>[card.id,card])),kept=previous.cards.filter(card=>previous.results[card.id]?.saved||live.has(card.id)).map(card=>live.get(card.id)??card),known=new Set(kept.map(card=>card.id));
 const cards=[...kept,...items.filter(card=>!known.has(card.id))],baseDone=previous.loaded?previous.baseDone:Math.max(0,counts.total-counts.remaining),current=studyCard(previous);
 const results=Object.fromEntries(Object.entries(previous.results).filter(([id])=>cards.some(card=>card.id===id)));
 const extra=items.some(card=>!previous.cards.some(old=>old.id===card.id));
 const next={...previous,session,sessionClosed:false,loaded:true,cards,pool,results,baseDone,total:baseDone+cards.length,learnIndex:Math.max(0,cards.findIndex(card=>card.id===current?.id)),testIndex:Math.max(0,cards.findIndex(card=>card.id===current?.id))};
 if(!previous.loaded)next.total=counts.total;
 if(!cards.length)next.phase='summary';
 else if(previous.source.source==='new_words'&&previous.loaded&&extra)next.phase='learn';
 return next;
}
function seededShuffle<T>(values:T[],seed:string){let number=2166136261;for(const char of seed)number=Math.imul(number^char.charCodeAt(0),16777619)>>>0;const items=[...values];for(let index=items.length-1;index>0;index--){number=(Math.imul(number,1664525)+1013904223)>>>0;const pick=number%(index+1);[items[index],items[pick]]=[items[pick],items[index]];}return items;}
export function studyOptions(card:StudyCard,pool:StudyFlow['pool'],seed:string){const meaning=String(card.meaning_zh??'').trim();if(!meaning)return [];const alternatives=[...new Set(pool.filter(word=>word.id!==card.child_word_id).map(word=>String(word.meaning_zh??'').trim()).filter(value=>value&&value!==meaning))];return seededShuffle([meaning,...seededShuffle(alternatives,seed+':alternatives').slice(0,3)],seed);}
export function partOfSpeech(value?:string){const labels:Record<string,string>={noun:'名词',verb:'动词',adjective:'形容词',adverb:'副词',pronoun:'代词',preposition:'介词',conjunction:'连词',interjection:'感叹词',article:'冠词',numeral:'数词',phrase:'短语',other:'其他','n.':'名词','v.':'动词','adj.':'形容词','adv.':'副词'};return value?labels[value]??value:'';}
