export type HanziCard={ordinal:number;hanzi_id:string;character?:string;pinyin?:string;meaning?:string;words?:string;example?:string;learned_at?:string;library_archived_at?:string};
type Answer={card:HanziCard;correct:boolean;selected:string;skipped?:boolean};
export type HanziFlow={format:1;roundId:string;source:string;phase:'learn'|'test'|'practice'|'summary';cards:HanziCard[];learnIndex:number;testIndex:number;results:Record<number,Answer>;awaiting?:Answer;queue:HanziCard[];feedback?:{correct:boolean;selected:string};revealed:boolean;turn:number};
const cardsFor=(round:any):HanziCard[]=>Array.isArray(round.items)?round.items:round.current?[round.current]:[];
export function mergeHanziFlow(previous:HanziFlow|null,round:any):HanziFlow{
 const fresh=():HanziFlow=>({format:1,roundId:round.id,source:round.source,phase:round.status==='completed'?'summary':round.source==='new'?'learn':'test',cards:cardsFor(round),learnIndex:0,testIndex:0,results:{},queue:[],revealed:false,turn:0});
 if(!previous||previous.format!==1||previous.roundId!==round.id||!Array.isArray(previous.cards)||!previous.results)return fresh();
 const live=new Map(cardsFor(round).map(card=>[card.ordinal,card]));
 let next={...previous,cards:previous.cards.map(card=>!previous.results[card.ordinal]&&live.has(card.ordinal)?live.get(card.ordinal)!:card)};
 if(next.awaiting&&round.answered_count>=next.awaiting.card.ordinal){next={...next,results:{...next.results,[next.awaiting.card.ordinal]:next.awaiting},awaiting:undefined};return next;}
 // Another device can advance the authoritative round while this device is away.
 if(!next.awaiting&&round.status==='completed'&&next.phase==='learn')return {...next,phase:'summary'};
 if(!next.awaiting&&round.current&&next.phase==='learn'){
  const current=next.cards[next.learnIndex],cards=next.cards.filter(card=>card.ordinal>=round.current.ordinal);
  if(!cards.length)return {...fresh(),results:next.results};
  next={...next,cards,learnIndex:Math.max(0,cards.findIndex(card=>card.hanzi_id===current?.hanzi_id))};
 }
 if(!next.awaiting&&next.phase==='test'&&!next.results[next.cards[next.testIndex]?.ordinal]){
  const index=next.cards.findIndex(card=>card.ordinal>=round.current?.ordinal&&!next.results[card.ordinal]);
  if(round.status==='completed')return {...next,phase:'summary'};
  if(index<0)return {...fresh(),results:next.results};
  next={...next,testIndex:index};
 }
 return next;
}
export function hanziFlowCard(flow:HanziFlow){return flow.phase==='learn'?flow.cards[flow.learnIndex]:flow.phase==='test'?flow.cards[flow.testIndex]:flow.phase==='practice'?flow.queue[0]:undefined;}
export function advanceHanziFlow(flow:HanziFlow,round:any):HanziFlow{
 if(flow.phase==='learn'){const index=flow.cards.findIndex((card,i)=>i>flow.learnIndex&&!flow.results[card.ordinal]);if(index>=0)return {...flow,learnIndex:index,revealed:false};const testIndex=flow.cards.findIndex(card=>!flow.results[card.ordinal]);return testIndex>=0?{...flow,phase:'test',testIndex,revealed:false}:round.status==='completed'?{...flow,phase:'summary'}:{...mergeHanziFlow(null,round),results:flow.results};}
 if(flow.phase==='practice'){
  if(!flow.feedback)return flow;const [card,...rest]=flow.queue,queue=flow.feedback.correct?rest:[...rest,card];return {...flow,queue,phase:queue.length?'practice':'summary',feedback:undefined,revealed:false,turn:flow.turn+1};
 }
 if(flow.phase!=='test'||flow.awaiting||!flow.results[flow.cards[flow.testIndex]?.ordinal])return flow;
 const next=flow.cards.findIndex(card=>card.ordinal>flow.cards[flow.testIndex].ordinal&&card.ordinal>=round.current?.ordinal&&!flow.results[card.ordinal]);
 if(next>=0)return {...flow,testIndex:next,revealed:false};
 if(round.status==='in_progress')return {...flow,phase:'summary',revealed:false};
 return {...flow,phase:'summary',revealed:false};
}
export function beginHanziPractice(flow:HanziFlow):HanziFlow{const queue=Object.values(flow.results).filter(answer=>!answer.correct&&!answer.skipped&&answer.card.character&&!answer.card.library_archived_at).map(answer=>answer.card);return queue.length?{...flow,phase:'practice',queue,feedback:undefined,revealed:false}:flow;}
const normalize=(value:unknown)=>String(value??'').normalize('NFC').trim().toLowerCase();
function shuffle<T>(values:T[],seed:string){let number=2166136261;for(const c of seed)number=Math.imul(number^c.charCodeAt(0),16777619)>>>0;const out=[...values];for(let i=out.length-1;i>0;i--){number=(Math.imul(number,1664525)+1013904223)>>>0;const j=number%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
export function hanziStudyQuestion(card:HanziCard,pool:HanziCard[],seed:string){
 const answer=normalize(card.pinyin),single=(p:string)=>/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿê]+$/i.test(p);
 if(single(answer)){
  const others=[...new Set(pool.filter(item=>item.character!==card.character&&!item.library_archived_at).map(item=>normalize(item.pinyin)).filter(p=>single(p)&&p!==answer))];
  if(others.length)return {kind:'pinyin',prompt:'这个字的拼音是哪一项？',answer,options:shuffle([answer,...shuffle(others,seed+':pool').slice(0,3)],seed)};
 }
 const terms=(value:unknown)=>String(value??'').split(/[、，,；;\n]/).map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=20),word=terms(card.words).find(s=>!!card.character&&s.includes(card.character));
 if(word){const others=[...new Set(pool.filter(item=>!item.library_archived_at).flatMap(item=>terms(item.words)).filter(s=>!s.includes(card.character!)))];if(others.length)return {kind:'words',prompt:'哪个词包含这个汉字？',answer:word,options:shuffle([word,...shuffle(others,seed+':pool').slice(0,3)],seed)};}
 return {kind:'self',prompt:'想一想这个字怎么读，是什么意思。',answer:card.pinyin||card.meaning||card.words||'查看汉字资料后自测',options:[] as string[]};
}
