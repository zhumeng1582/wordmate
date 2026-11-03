import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Sql,Row} from './ports.ts';
import type {CheckinShareImageCache,ShareImageStatus} from './checkin-share-images.ts';
import {ensure} from './errors.ts';
import {validDate,streak} from './history.ts';
export const ENCOURAGEMENT_THEMES=['growth','curiosity','perseverance','courage','discovery','calm'] as const;
export type EncouragementTheme=typeof ENCOURAGEMENT_THEMES[number];
export type Encouragement={en:string;zh:string;theme:EncouragementTheme};
export const CURATED:Encouragement[]=[
 {en:'Every word you learn is a small step forward.',zh:'每学会一个单词，都是向前迈出的一小步。',theme:'growth'},
 {en:'Keep learning, and let your curiosity grow.',zh:'坚持学习，让好奇心不断生长。',theme:'curiosity'},
 {en:'Small steps can lead to wonderful discoveries.',zh:'小小的脚步，也能走向美好的发现。',theme:'discovery'}
];
const THEME_FALLBACK:Record<EncouragementTheme,Encouragement>={
 growth:CURATED[0],curiosity:CURATED[1],discovery:CURATED[2],
 perseverance:{en:'Keep going, one steady step at a time.',zh:'继续向前，一步一步稳稳地走。',theme:'perseverance'},
 courage:{en:'Be brave enough to explore a new horizon.',zh:'勇敢一点，去探索新的天地。',theme:'courage'},
 calm:{en:'Take your time; every quiet step counts.',zh:'慢慢来，每一步都值得。',theme:'calm'}
};
export function validateEncouragement(value:any):Encouragement[]{
 ensure(value&&value.safe===true&&Array.isArray(value.quotes)&&value.quotes.length===3,422,'INVALID_SHARE_COPY');
 const quotes:Encouragement[]=value.quotes.map((q:any)=>{
  ensure(q&&Object.keys(q).sort().join(',')==='en,theme,zh'&&typeof q.en==='string'&&typeof q.zh==='string'&&ENCOURAGEMENT_THEMES.includes(q.theme),422,'INVALID_SHARE_COPY');
  const en=q.en.trim(),zh=q.zh.trim();
  ensure(en.length>=12&&en.length<=120&&en.split(/\s+/).length<=20&&/^[A-Za-z ,.!?'’\-]+$/.test(en)&&zh.length>=4&&zh.length<=60&&/[\u4e00-\u9fff]/.test(zh),422,'INVALID_SHARE_COPY');
  ensure(!/[0-9<>@\n\r]|https?:|www\.|[一二三四五六七八九十百千万]+[天次分岁]/i.test(en+zh),422,'INVALID_SHARE_COPY');
  ensure(!/\b(kill|hate|stupid|loser|sex|suicide|god|best|worst|must|failure)\b|自杀|笨蛋|蠢|废物|性行为|惩罚|必须|排名|第一名|最差/i.test(en+zh),422,'INVALID_SHARE_COPY');
  return {en,zh,theme:q.theme};
 });
 ensure(new Set(quotes.map(q=>q.theme)).size===3,422,'INVALID_SHARE_COPY');
 return quotes;
}
export type EncouragementProvider=(input:{checked_in:boolean})=>Promise<Encouragement[]>;
export async function encouragementProvider(env:Record<string,string|undefined>):Promise<EncouragementProvider|undefined>{
 const prefix=({openai:'OPENAI',deepseek:'DEEPSEEK',qwen:'QWEN'} as Record<string,string>)[env.LLM_PROVIDER||'qwen'];
 const provider=env.LLM_PROVIDER||'qwen',apiKey=provider==='qwen'?(env.QWEN_API_KEY||env.OCR_API_KEY):(prefix?env[`${prefix}_API_KEY`]:undefined),model=provider==='qwen'?(env.QWEN_MODEL||env.OCR_MODEL):(prefix?env[`${prefix}_MODEL`]:undefined);
 if(!prefix||!apiKey||!model)return;
 const adapter=await import(pathToFileURL(resolve(__dirname,'../../../packages/ai/dist/index.js')).href);
 const generator=adapter.createTextGenerator(env,(url:any,init:any)=>fetch(url,{...init,signal:AbortSignal.timeout(6500)}));
 return async input=>(await generator.generate({name:'checkin_encouragement_01',input,
  instructions:'Write exactly three different ORIGINAL short encouraging sentences for children learning English, each with a faithful natural Simplified Chinese translation. Use simple English, 6–16 words. Encourage curiosity and effort, never pressure, comparisons or rankings. Give each sentence one matching theme, and use a different theme for each quote: growth (steady progress; mountain scenery), curiosity (wonder; lake scenery), perseverance (keep going; desert scenery), courage (try bravely; ocean scenery), discovery (new things; open sky scenery), or calm (patient learning; underwater scenery). Pick the theme that best matches each sentence. Do not quote or name any author. No numbers, dates, measurable achievements, promises or claims of consecutive days. No personal information, links, advertising, politics, religion, violence or sexual content. checked_in only tells whether today\'s learning goal was met; encourage effort even if not met. Return JSON with safe=true only for child-appropriate content, and quotes [{en,zh,theme}].',
  schema:{type:'object',additionalProperties:false,required:['safe','quotes'],properties:{safe:{type:'boolean'},quotes:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['en','zh','theme'],properties:{en:{type:'string'},zh:{type:'string'},theme:{type:'string',enum:ENCOURAGEMENT_THEMES}}}}}},validate:validateEncouragement})).data;
}
interface Access{tx<T>(f:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>;day(q:Sql,c:Row):Promise<string>}
export class CheckinShare{
 private a:Access;private provider?:EncouragementProvider;private images?:CheckinShareImageCache;
 constructor(a:Access,provider?:EncouragementProvider,images?:CheckinShareImageCache){this.a=a;this.provider=provider;this.images=images;}
 async create(actor:string,child:string,body:any){
  const date=validDate(body.date);
  const prepared=await this.a.tx(async q=>{
   const c=await this.a.child(q,actor,child),today=await this.a.day(q,c);ensure(date<=today,422,'INVALID_DATE');
   const day=(await q.query('SELECT distinct_words,goal_snapshot FROM daily_activity WHERE child_id=$1 AND local_date=$2',[child,date])).rows[0];ensure(day&&day.distinct_words>0,422,'NO_LEARNING_TO_SHARE');
   const checked=day.distinct_words>=day.goal_snapshot;
   const historyStreak=!checked&&date<today?{streak_days:0,streak_through:null}:await streak(q,child,date);
   const stats={date,studied_words:day.distinct_words,goal:day.goal_snapshot,checked_in:checked,...historyStreak};
   const cached=(await q.query("SELECT quotes,source FROM checkin_share_quotes WHERE child_id=$1 AND local_date=$2 AND created_at>now()-interval '8 hours'",[child,date])).rows[0];
   if(cached)return {stats,...cached,generate:false};
   // Serialize the per-account spending check; repeated views and quote swaps cost nothing.
   await q.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[actor]);
   const count=(await q.query("SELECT count(*)::int n FROM checkin_share_quotes WHERE requested_by=$1 AND created_at>now()-interval '24 hours'",[actor])).rows[0].n;
   if(count>=20)return {stats,quotes:CURATED,source:'curated',generate:false};
   await q.query("INSERT INTO checkin_share_quotes(child_id,local_date,requested_by,quotes,source) VALUES($1,$2,$3,$4,'curated') ON CONFLICT(child_id,local_date) DO UPDATE SET requested_by=excluded.requested_by,quotes=excluded.quotes,source='curated',created_at=now()",[child,date,actor,JSON.stringify(CURATED)]);
   return {stats,quotes:CURATED,source:'curated',generate:!!this.provider&&body.local_poster!==true};
  });
  let quotes=prepared.quotes,source=prepared.source;
  if(prepared.generate){try{quotes=validateEncouragement({safe:true,quotes:await this.provider!({checked_in:prepared.stats.checked_in})});source='ai';}catch{/* Cached curated copy is the fallback; never block sharing on AI errors. */}}
  const result=await this.a.tx(async q=>{
   await this.a.child(q,actor,child); // Membership may have changed while AI was running.
   if(source==='ai')await q.query("UPDATE checkin_share_quotes SET quotes=$3,source='ai' WHERE child_id=$1 AND local_date=$2",[child,date,JSON.stringify(quotes)]);
   const themes:EncouragementTheme[]=['growth','curiosity','discovery'];
   const displayQuotes=(quotes||CURATED).map((quote:any,index:number)=>({...quote,theme:ENCOURAGEMENT_THEMES.includes(quote.theme)?quote.theme:themes[index%themes.length]}));
   return {...prepared.stats,quotes:displayQuotes,copy_source:source};
  });
  let image:ShareImageStatus|null=null;
  if(this.images&&body.local_poster!==true){try{const copy=result.quotes.map(q=>q.en+' '+q.zh).join(' ');image=await this.images.obtain(actor,result.quotes[0].theme,copy,`${child}:${date}`);const matching=result.quotes.findIndex(q=>q.theme===image!.theme);if(matching>0)result.quotes=[result.quotes[matching],...result.quotes.slice(0,matching),...result.quotes.slice(matching+1)];else if(matching<0)result.quotes=[THEME_FALLBACK[image.theme as EncouragementTheme],...result.quotes.slice(1)];}catch{/* The client reports the server error. */}}
  return {...result,image};
 }
 async imageStatus(actor:string,id:string){ensure(this.images,404,'SHARE_IMAGE_NOT_FOUND');return this.images.status(actor,id);}
 async imageContent(actor:string,id:string){ensure(this.images,404,'SHARE_IMAGE_NOT_FOUND');return this.images.content(actor,id);}
 processImageOne(){return this.images?.processOne()??Promise.resolve(false);}
}
