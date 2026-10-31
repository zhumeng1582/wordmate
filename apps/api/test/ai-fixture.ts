import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PGlite}=require('@electric-sql/pglite');
const {Core}=require('../dist/core.js');
const {DevIdentity,FixtureDictionary,createScheduler}=require('../dist/providers.js');
const {AiAccounts}=require('../dist/ai-accounts.js');
export const model={id:'qwen',provider:'qwen',model:'test-model',label:'Test model',vision:true,base_url:'https://dashscope.aliyuncs.com/compatible-mode/v1',input_yuan_per_million:'1',output_yuan_per_million:'2',cached_yuan_per_million:'0.25'};
export const aiEnv={LLM_PROVIDER:'qwen',QWEN_API_KEY:'system-secret-key',AI_CREDENTIAL_KEY:'10'.repeat(32),AI_MODEL_CATALOG:JSON.stringify([model]),AI_SYSTEM_DAILY_LIMIT_MICROS:'20000000'};
export const vocabItem=(word:string,i=0)=>({input_index:i,input:word,status:'ok',lemma:word,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:`测试${word}`,sentence_en:`I see the ${word}.`,sentence_zh:`我看到了${word}。`,reason:null});
export const response=(data:any={items:[vocabItem('cat')]},usage:any={prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:40}})=>new Response(JSON.stringify({id:'upstream-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage}),{status:200});
export async function fixture(fetcher:typeof fetch=async()=>response(),env:any=aiEnv,legacy=false){
 const pg=new PGlite();for(const p of ['deliverables/0.1/database/001_schema.sql','apps/api/migrations/007_import_attempts.sql','apps/api/migrations/016_security_integrity.sql','apps/api/migrations/017_ai_accounts.sql','apps/api/migrations/018_family_ai.sql'])if(!legacy||!p.includes('018_'))await pg.exec(readFileSync(p,'utf8'));
 if(!legacy)await pg.exec(readFileSync('apps/api/migrations/020_audio_billing.sql','utf8'));
 const db={query:async(s:string,p?:any[])=>pg.query(s,p),transaction:async(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
 const accounts=new AiAccounts(db,env,fetcher),core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'ai-test',()=>new Date(),undefined,undefined,undefined,undefined,undefined,undefined,accounts);
 const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id;
 const family=await core.createFamily(dad,'family',{name:'AI'}),child=await core.createChild(dad,'child',family.id,{nickname:'孩子'}),book=await core.createWordbook(dad,'book',child.id,{name:'词本'});
 const tx=async(fn:any)=>db.transaction(async(q:any)=>{await q.query('SET LOCAL search_path TO wordmate,public');return fn(q);});
 return {pg,db,accounts,core,dad,mom,family,child,book,tx,close:()=>pg.close()};
}
