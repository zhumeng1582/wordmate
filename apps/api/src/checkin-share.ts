import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Sql,Row} from './ports.ts';
import {ensure} from './errors.ts';
import {validDate,streak} from './history.ts';
export type Encouragement={en:string;zh:string};
export const CURATED:Encouragement[]=[
 {en:'Every word you learn is a small step forward.',zh:'每学会一个单词，都是向前迈出的一小步。'},
 {en:'Keep learning, and let your curiosity grow.',zh:'坚持学习，让好奇心不断生长。'},
 {en:'Small steps can lead to wonderful discoveries.',zh:'小小的脚步，也能走向美好的发现。'}
];
export function validateEncouragement(value:any):Encouragement[]{
 ensure(value&&value.safe===true&&Array.isArray(value.quotes)&&value.quotes.length===3,422,'INVALID_SHARE_COPY');
 return value.quotes.map((q:any)=>{
  ensure(q&&Object.keys(q).sort().join(',')==='en,zh'&&typeof q.en==='string'&&typeof q.zh==='string',422,'INVALID_SHARE_COPY');
  const en=q.en.trim(),zh=q.zh.trim();
  ensure(en.length>=12&&en.length<=120&&en.split(/\s+/).length<=20&&/^[A-Za-z ,.!?'’\-]+$/.test(en)&&zh.length>=4&&zh.length<=60&&/[\u4e00-\u9fff]/.test(zh),422,'INVALID_SHARE_COPY');
  ensure(!/[0-9<>@\n\r]|https?:|www\.|[一二三四五六七八九十百千万]+[天次分岁]/i.test(en+zh),422,'INVALID_SHARE_COPY');
  ensure(!/\b(kill|hate|stupid|loser|sex|suicide|god|best|worst|must|failure)\b|自杀|笨蛋|蠢|废物|性行为|惩罚|必须|排名|第一名|最差/i.test(en+zh),422,'INVALID_SHARE_COPY');
  return {en,zh};
 });
}
export type EncouragementProvider=(input:{checked_in:boolean})=>Promise<Encouragement[]>;
export async function encouragementProvider(env:Record<string,string|undefined>):Promise<EncouragementProvider|undefined>{
 const prefix=({openai:'OPENAI',deepseek:'DEEPSEEK',qwen:'QWEN'} as Record<string,string>)[env.LLM_PROVIDER||'deepseek'];
 if(!prefix||!env[`${prefix}_API_KEY`]||!env[`${prefix}_MODEL`])return;
 const adapter=await import(pathToFileURL(resolve(__dirname,'../../../packages/ai/dist/index.js')).href);
 const generator=adapter.createTextGenerator(env,(url:any,init:any)=>fetch(url,{...init,signal:AbortSignal.timeout(6500)}));
 return async input=>(await generator.generate({name:'checkin_encouragement_01',input,
  instructions:'Write exactly three different ORIGINAL short encouraging sentences for children learning English, each with a faithful natural Simplified Chinese translation. Use simple English, 6–16 words. Encourage curiosity and effort, never pressure, comparisons or rankings. Do not quote or name any author. No numbers, dates, measurable achievements, promises or claims of consecutive days. No personal information, links, advertising, politics, religion, violence or sexual content. checked_in only tells whether today\'s learning goal was met; encourage effort even if not met. Return JSON with safe=true only for child-appropriate content, and quotes [{en,zh}].',
  schema:{type:'object',additionalProperties:false,required:['safe','quotes'],properties:{safe:{type:'boolean'},quotes:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['en','zh'],properties:{en:{type:'string'},zh:{type:'string'}}}}}},validate:validateEncouragement})).data;
}
interface Access{tx<T>(f:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>;day(q:Sql,c:Row):Promise<string>}
export class CheckinShare{
 private a:Access;private provider?:EncouragementProvider;
 constructor(a:Access,provider?:EncouragementProvider){this.a=a;this.provider=provider;}
 async create(actor:string,child:string,body:any){
  const date=validDate(body.date);
  const prepared=await this.a.tx(async q=>{
   const c=await this.a.child(q,actor,child),today=await this.a.day(q,c);ensure(date<=today,422,'INVALID_DATE');
   const day=(await q.query('SELECT distinct_words,goal_snapshot FROM daily_activity WHERE child_id=$1 AND local_date=$2',[child,date])).rows[0];ensure(day&&day.distinct_words>0,422,'NO_LEARNING_TO_SHARE');
   const checked=day.distinct_words>=day.goal_snapshot;
   const historyStreak=!checked&&date<today?{streak_days:0,streak_through:null}:await streak(q,child,date);
   const stats={date,studied_words:day.distinct_words,goal:day.goal_snapshot,checked_in:checked,...historyStreak};
   const cached=(await q.query('SELECT quotes,source FROM checkin_share_quotes WHERE child_id=$1 AND local_date=$2',[child,date])).rows[0];
   if(cached)return {stats,...cached,generate:false};
   // Serialize the per-account spending check; repeated views and quote swaps cost nothing.
   await q.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[actor]);
   const count=(await q.query("SELECT count(*)::int n FROM checkin_share_quotes WHERE requested_by=$1 AND created_at>now()-interval '24 hours'",[actor])).rows[0].n;
   if(count>=20)return {stats,quotes:CURATED,source:'curated',generate:false};
   await q.query("INSERT INTO checkin_share_quotes(child_id,local_date,requested_by,quotes,source) VALUES($1,$2,$3,$4,'curated')",[child,date,actor,JSON.stringify(CURATED)]);
   return {stats,quotes:CURATED,source:'curated',generate:!!this.provider};
  });
  let quotes=prepared.quotes,source=prepared.source;
  if(prepared.generate){try{quotes=validateEncouragement({safe:true,quotes:await this.provider!({checked_in:prepared.stats.checked_in})});source='ai';}catch{/* Cached curated copy is the fallback; never block sharing on AI errors. */}}
  return this.a.tx(async q=>{
   await this.a.child(q,actor,child); // Membership may have changed while AI was running.
   if(source==='ai')await q.query("UPDATE checkin_share_quotes SET quotes=$3,source='ai' WHERE child_id=$1 AND local_date=$2",[child,date,JSON.stringify(quotes)]);
   return {...prepared.stats,quotes,copy_source:source};
  });
 }
}
