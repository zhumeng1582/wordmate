// Exercises compiled Nest HTTP handlers + real FSRS + a separate on-disk development database.
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..'),port=3137,base=`http://127.0.0.1:${port}/api`;
const server=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:root,env:{...process.env,NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:`pglite:.local/smoke-${randomUUID()}`,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b.toString());server.stderr.on('data',b=>output+=b.toString());
let token='';
async function request(path,body,key=randomUUID()){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'Idempotency-Key':key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 const data=await res.json();if(!res.ok)throw Error(`${res.status} ${data.error?.code}`);return data.data;
}
(async()=>{try{
 let ready=false;
 for(let n=0;n<80;n++){if(server.exitCode!==null)throw Error('Server exited before ready');if(output.includes('API ready')){ready=true;break;}await new Promise(r=>setTimeout(r,250));}
 assert(ready,'Server startup timed out');
 const login=await request('/auth/dev',{code:'dev-dad'});token=login.access_token;
 const family=await request('/families',{name:'HTTP 验收家庭'});
 const child=await request(`/families/${family.id}/children`,{nickname:'验收孩子',accent:'en-GB'});
 const book=await request(`/children/${child.id}/wordbooks`,{name:'验收词本'});
 const batch=await request(`/children/${child.id}/batches`,{wordbook_id:book.id,words:['apple','book']});
 await request(`/batches/${batch.id}/confirm`,{expected_version:1,selections:batch.items.map(i=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
 const session=await request(`/children/${child.id}/study-sessions`,{source:'scheduled'});
 const cards=await request(`/study-sessions/${session.id}/cards`);assert.equal(cards.items.length,2);
 const event={session_id:session.id,card_id:cards.items[0].id,event_id:randomUUID(),expected_version:1,rating:'again',lease_generation:session.lease_generation};
 const saved=await request('/reviews',event);assert.equal(saved.version,2);assert.equal(saved.today.completed_words,1);
 assert.deepEqual(await request('/reviews',event),saved);
 await request(`/study-sessions/${session.id}/end`,{lease_generation:session.lease_generation});
 console.log('PASS: compiled HTTP login, family, batch, FSRS review, replay, and session end');
 }catch(e){console.error(output);console.error(e);process.exitCode=1;}finally{server.kill('SIGTERM');}})();
