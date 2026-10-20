import {History,streak,validDate,pageSize} from './history.ts';
import {MonthlyQuizzes} from './quiz.ts';
import {createHash, randomBytes} from 'node:crypto';
import type {Database, Sql, Identity, Dictionary, Scheduler, Row} from './ports.ts';
import {ensure, text, uuid, integer} from './errors.ts';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const stable=(v:any):string=>JSON.stringify(v===null || typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const childDto=(c:Row)=>({...Object.fromEntries(['id','family_id','nickname','accent','voice_id','level','timezone','daily_new_limit','daily_goal','version'].map(k=>[k,c[k]])),speech_rate:Number(c.speech_rate)});
export class Core {
  readonly quizzes:MonthlyQuizzes; readonly history:History;
  private db:Database; private identity:Identity; private dictionary:Dictionary; private scheduler:Scheduler; private appId:string; private clock:()=>Date;
  constructor(db:Database, identity:Identity, dictionary:Dictionary, scheduler:Scheduler, appId:string, clock:()=>Date=()=>new Date()){this.db=db;this.identity=identity;this.dictionary=dictionary;this.scheduler=scheduler;this.appId=appId;this.clock=clock;this.history=new History({tx:fn=>this.tx(fn),child:(...args)=>this.child(...args),day:(...args)=>this.day(...args)});this.quizzes=new MonthlyQuizzes({tx:fn=>this.tx(fn),write:(...args)=>this.write(...args),child:(...args)=>this.child(...args),now:()=>this.clock(),day:(...args)=>this.day(...args)});}
  private async tx<T>(fn:(q:Sql)=>Promise<T>) {return this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate, public');return fn(q);});}
  async login(code:unknown) {
    const identity=await this.identity.exchange(text(code,512));
    return this.tx(async q=>{
      const u=await one(q,`INSERT INTO users(wx_app_id,wx_open_id,display_name) VALUES($1,$2,$3) ON CONFLICT(wx_app_id,wx_open_id) DO UPDATE SET wx_open_id=excluded.wx_open_id RETURNING *`,[this.appId,identity.openId,identity.displayName]);
      ensure(u.status==='active',403,'ACCOUNT_UNAVAILABLE');
      const token=randomBytes(32).toString('base64url'), expires=new Date(this.clock().getTime()+7*86400000);
      await q.query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[u.id,hash(token),expires]);
      return {access_token:token,token_type:'Bearer',expires_at:expires.toISOString(),user:{id:u.id,display_name:u.display_name},families:await this.families(q,u.id)};
    });
  }
  async authenticate(token:string) {return this.tx(async q=>{const u=await one(q,`SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.status='active'`,[hash(token),this.clock()]);ensure(u,401,'UNAUTHENTICATED');return u.id as string;});}
  private async families(q:Sql,actor:string) {return (await q.query(`SELECT f.id,f.name,f.version,CASE WHEN f.owner_user_id=$1 THEN 'owner' ELSE 'parent' END role FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 AND m.status='active' AND f.status='active' ORDER BY f.created_at`,[actor])).rows;}
  private async family(q:Sql,actor:string,id:string) {
    const f=await one(q,`SELECT * FROM families WHERE id=$1 AND status='active' FOR UPDATE`,[uuid(id)]);
    ensure(f && await one(q,`SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'`,[id,actor]),404,'FAMILY_NOT_FOUND');return f;
  }
  private async child(q:Sql,actor:string,id:string) {
    const initial=await one(q,'SELECT family_id FROM children WHERE id=$1',[uuid(id)]);ensure(initial,404,'CHILD_NOT_FOUND');
    await this.family(q,actor,initial.family_id);
    const c=await one(q,'SELECT * FROM children WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id]);ensure(c,404,'CHILD_NOT_FOUND');return c;
  }
  // Scope and membership are checked before replaying any cached response.
  private async write(actor:string,key:string,op:string,payload:any,scope:(q:Sql)=>Promise<any>,fn:(q:Sql,s:any)=>Promise<any>) {
    text(key,128);return this.tx(async q=>{
      ensure(await one(q,`SELECT 1 FROM users WHERE id=$1 AND status='active'`,[actor]),401,'UNAUTHENTICATED');
      const s=await scope(q), digest=hash(stable(payload));
      await q.query(`INSERT INTO idempotency_keys(actor_user_id,operation,key,request_hash,status,expires_at) VALUES($1,$2,$3,$4,'running',$5) ON CONFLICT DO NOTHING`,[actor,op,key,digest,new Date(this.clock().getTime()+86400000)]);
      const row=await one(q,'SELECT * FROM idempotency_keys WHERE actor_user_id=$1 AND operation=$2 AND key=$3 FOR UPDATE',[actor,op,key]);
      ensure(row.request_hash===digest,409,'IDEMPOTENCY_CONFLICT');if(row.status==='completed')return row.response_body;
      const result=await fn(q,s);
      await q.query(`UPDATE idempotency_keys SET status='completed',http_status=200,response_body=$4 WHERE actor_user_id=$1 AND operation=$2 AND key=$3`,[actor,op,key,JSON.stringify(result)]);return result;
    });
  }
  async me(actor:string){return this.tx(async q=>({families:await this.families(q,actor)}));}
  async createFamily(actor:string,key:string,body:any){return this.write(actor,key,'family:create',body,async()=>null,async q=>{
    const f=await one(q,'INSERT INTO families(name,owner_user_id) VALUES($1,$2) RETURNING *',[text(body.name,40),actor]);
    await q.query('INSERT INTO family_members(family_id,user_id,display_name) SELECT $1,id,display_name FROM users WHERE id=$2',[f.id,actor]);return {id:f.id,name:f.name,version:f.version,role:'owner'};
  });}
  async members(actor:string,family:string){return this.tx(async q=>{await this.family(q,actor,family);return {items:(await q.query(`SELECT m.user_id,m.display_name,CASE WHEN f.owner_user_id=m.user_id THEN 'owner' ELSE 'parent' END role FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.family_id=$1 AND m.status='active' ORDER BY (f.owner_user_id=m.user_id) DESC,m.joined_at`,[family])).rows};});}
  async createInvite(actor:string,key:string,family:string){return this.write(actor,key,`invite:create:${family}`,{},q=>this.family(q,actor,family),async(q,f)=>{
    ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');const token=randomBytes(32).toString('base64url');
    const invite=await one(q,"INSERT INTO family_invites(family_id,created_by,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id,status,expires_at",[family,actor,hash(token),new Date(this.clock().getTime()+86400000)]);return {...invite,invite_token:token};
  });}
  async invites(actor:string,family:string){return this.tx(async q=>{const f=await this.family(q,actor,family);ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');return {items:(await q.query('SELECT i.id,i.status,i.expires_at,u.display_name AS applicant FROM family_invites i LEFT JOIN users u ON u.id=i.claimed_by WHERE i.family_id=$1 ORDER BY i.created_at DESC',[family])).rows};});}
  async claimInvite(actor:string,key:string,body:any){return this.write(actor,key,'invite:claim',body,async q=>{
    const initial=await one(q,'SELECT family_id FROM family_invites WHERE token_hash=$1',[hash(text(body.invite_token,256))]);ensure(initial,404,'INVITE_NOT_FOUND');
    ensure(await one(q,"SELECT 1 FROM families WHERE id=$1 AND status='active' FOR UPDATE",[initial.family_id]),404,'INVITE_NOT_FOUND');return initial;
  },async q=>{
    const i=await one(q,'SELECT * FROM family_invites WHERE token_hash=$1 FOR UPDATE',[hash(body.invite_token.trim())]);
    ensure(i.status==='pending'&&new Date(i.expires_at)>this.clock(),409,'INVITE_UNAVAILABLE');ensure(i.created_by!==actor,422,'ALREADY_MEMBER');
    ensure(!await one(q,"SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'",[i.family_id,actor]),422,'ALREADY_MEMBER');
    return one(q,"UPDATE family_invites SET status='claimed',claimed_by=$2,claimed_at=$3 WHERE id=$1 RETURNING id,status,expires_at",[i.id,actor,this.clock()]);
  });}
  async approveInvite(actor:string,key:string,id:string){return this.write(actor,key,`invite:approve:${id}`,{},async q=>{
    const i=await one(q,'SELECT * FROM family_invites WHERE id=$1',[uuid(id)]);ensure(i,404,'INVITE_NOT_FOUND');const f=await this.family(q,actor,i.family_id);ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');return one(q,'SELECT * FROM family_invites WHERE id=$1',[id]);
  },async(q,i)=>{
    ensure(i.status==='claimed'&&new Date(i.expires_at)>this.clock(),409,'INVITE_UNAVAILABLE');
    ensure(await one(q,"SELECT 1 FROM users WHERE id=$1 AND status='active'",[i.claimed_by]),409,'ACCOUNT_UNAVAILABLE');
    await q.query("INSERT INTO family_members(family_id,user_id,display_name) SELECT $1,id,display_name FROM users WHERE id=$2 ON CONFLICT(family_id,user_id) DO UPDATE SET status='active',revoked_at=NULL",[i.family_id,i.claimed_by]);
    return one(q,"UPDATE family_invites SET status='approved',approved_by=$2,approved_at=$3 WHERE id=$1 RETURNING id,status,expires_at",[id,actor,this.clock()]);
  });}
  async children(actor:string,family:string){return this.tx(async q=>{await this.family(q,actor,family);return {items:(await q.query('SELECT * FROM children WHERE family_id=$1 AND archived_at IS NULL ORDER BY created_at',[family])).rows.map(childDto)};});}
  async createChild(actor:string,key:string,family:string,body:any){return this.write(actor,key,`child:create:${family}`,body,q=>this.family(q,actor,family),async q=>{
    ensure(['en-US','en-GB'].includes(body.accent??'en-US'),422,'INVALID_ACCENT');
    const c=await one(q,'INSERT INTO children(family_id,nickname,accent) VALUES($1,$2,$3) RETURNING *',[family,text(body.nickname,40),body.accent??'en-US']);return childDto(c);
  });}
  async wordbooks(actor:string,child:string){return this.tx(async q=>{await this.child(q,actor,child);return {items:(await q.query(`SELECT b.id,b.child_id,b.name,b.version,count(w.child_word_id)::int word_count FROM wordbooks b LEFT JOIN wordbook_words w ON w.wordbook_id=b.id WHERE b.child_id=$1 AND b.archived_at IS NULL GROUP BY b.id ORDER BY b.created_at`,[child])).rows};});}
  async createWordbook(actor:string,key:string,child:string,body:any){return this.write(actor,key,`book:create:${child}`,body,q=>this.child(q,actor,child),async q=>{const b=await one(q,'INSERT INTO wordbooks(child_id,name,created_by) VALUES($1,$2,$3) RETURNING id,child_id,name,version',[child,text(body.name,60),actor]);return {...b,word_count:0};});}
  async createBatch(actor:string,key:string,child:string,body:any){
    ensure(Array.isArray(body.words)&&body.words.length>0&&body.words.length<=30,422,'INVALID_WORD_COUNT');
    const raw=body.words.map((w:unknown)=>text(w)), theme=body.theme===undefined?'':String(body.theme);ensure(theme.length<=80,422,'INVALID_THEME');
    // Permission before provider calls; repeated inside the write transaction.
    await this.tx(q=>this.child(q,actor,child));
    const candidates=await Promise.all(raw.map((w:string)=>this.dictionary.lookup(w)));
    return this.write(actor,key,`batch:create:${child}`,body,q=>this.child(q,actor,child),async q=>{
      ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[uuid(body.wordbook_id),child]),404,'WORDBOOK_NOT_FOUND');
      const b=await one(q,'INSERT INTO batches(child_id,wordbook_id,theme,created_by) VALUES($1,$2,$3,$4) RETURNING *',[child,body.wordbook_id,theme,actor]);
      for(let i=0;i<raw.length;i++)await q.query('INSERT INTO batch_items(batch_id,child_id,ordinal,raw_text,candidates,status) VALUES($1,$2,$3,$4,$5,$6)',[b.id,child,i+1,raw[i],JSON.stringify(candidates[i]),candidates[i].length?'needs_confirmation':'invalid']);
      return this.batchDto(q,b);
    });
  }
  private async batchDto(q:Sql,b:Row){return {id:b.id,child_id:b.child_id,wordbook_id:b.wordbook_id,theme:b.theme??'',status:b.status,version:b.version,items:(await q.query('SELECT id,raw_text,status,candidates,child_word_id AS existing_word_id FROM batch_items WHERE batch_id=$1 ORDER BY ordinal',[b.id])).rows};}
  async confirmBatch(actor:string,key:string,id:string,body:any){return this.write(actor,key,`batch:confirm:${id}`,body,async q=>{
    const b=await one(q,'SELECT * FROM batches WHERE id=$1',[uuid(id)]);ensure(b,404,'BATCH_NOT_FOUND');await this.child(q,actor,b.child_id);return one(q,'SELECT * FROM batches WHERE id=$1',[id]);
  },async(q,b)=>{
    ensure(b.status==='draft'&&b.version===integer(body.expected_version),409,'BATCH_CONFLICT');
    const items=(await q.query('SELECT * FROM batch_items WHERE batch_id=$1 ORDER BY ordinal',[id])).rows;
    const choices=body.selections;ensure(Array.isArray(choices)&&choices.length===items.length&&new Set(choices.map((s:any)=>s.item_id)).size===items.length,422,'INCOMPLETE_SELECTION');
    const ids:string[]=[];
    for(const item of items){const s=choices.find((x:any)=>x.item_id===item.id);ensure(s&&['skip','select'].includes(s.action),422,'INVALID_SELECTION');if(s.action==='skip')continue;
      const c=item.candidates.find((x:any)=>x.candidate_id===s.candidate_id);ensure(c,422,'INVALID_CANDIDATE');
      const w=await one(q,`INSERT INTO child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source,ipa_gb,ipa_us,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(child_id,normalized_lemma,part_of_speech,sense_key) DO UPDATE SET normalized_lemma=excluded.normalized_lemma RETURNING *`,[b.child_id,c.lemma,c.lemma.toLowerCase(),c.part_of_speech,c.sense_key,c.meaning_zh,c.source,c.ipa_gb,c.ipa_us,actor]);
      ensure(!w.archived_at,409,'WORD_ARCHIVED');
      await q.query('INSERT INTO wordbook_words(child_id,wordbook_id,child_word_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[b.child_id,b.wordbook_id,w.id]);
      await q.query('INSERT INTO review_cards(child_id,child_word_id,scheduler_state,scheduler_version,parameter_version,due_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[b.child_id,w.id,JSON.stringify(this.scheduler.empty(this.clock())),this.scheduler.version,this.scheduler.parameterVersion,this.clock()]);
      await q.query(`UPDATE batch_items SET status='confirmed',child_word_id=$2 WHERE id=$1`,[item.id,w.id]);ids.push(w.id);
    }
    ensure(ids.length,422,'EMPTY_SELECTION');await q.query(`UPDATE batches SET status='confirmed',version=version+1 WHERE id=$1`,[id]);
    const job=await one(q,`INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload) VALUES($1,$2,'sentences',$3,$4) RETURNING id`,[b.child_id,actor,`batch:${id}`,JSON.stringify({batch_id:id,word_ids:[...new Set(ids)]})]);
    return {batch_id:id,child_word_ids:[...new Set(ids)],job_id:job.id,version:b.version+1};
  });}
  async words(actor:string,child:string){return this.tx(async q=>{await this.child(q,actor,child);return {items:(await q.query('SELECT id,lemma,part_of_speech,meaning_zh,version FROM child_words WHERE child_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200',[child])).rows};});}
  async word(actor:string,child:string,id:string){return this.tx(async q=>{await this.child(q,actor,child);const w=await one(q,'SELECT id,lemma,meaning_zh,part_of_speech FROM child_words WHERE child_id=$1 AND id=$2 AND archived_at IS NULL',[child,uuid(id)]);ensure(w,404,'WORD_NOT_FOUND');return w;});}
  private async day(q:Sql,c:Row){return String((await one(q,`SELECT to_char($1::timestamptz AT TIME ZONE $2,'YYYY-MM-DD') AS local_day`,[this.clock(),c.timezone])).local_day);}
  private async todayDto(q:Sql,c:Row){const day=await this.day(q,c),a=await one(q,'SELECT * FROM daily_activity WHERE child_id=$1 AND local_date=$2',[c.id,day]);const active=await one(q,`SELECT s.id,s.actor_user_id,s.quiz_id,s.lease_generation,s.expires_at,u.display_name FROM study_sessions s JOIN users u ON u.id=s.actor_user_id WHERE s.child_id=$1 AND s.status='active' AND s.expires_at>$2`,[c.id,this.clock()]);return {...await streak(q,c.id,day),checked_in:(a?.distinct_words??0)>=(a?.goal_snapshot??c.daily_goal),active_session:active?JSON.parse(JSON.stringify(active)):null,child:childDto(c),completed_words:a?.distinct_words??0,new_words:a?.new_words??0,goal:a?.goal_snapshot??c.daily_goal,goal_reached:(a?.distinct_words??0)>=(a?.goal_snapshot??c.daily_goal),remaining_new_limit:Math.max(0,c.daily_new_limit-(a?.new_words??0)),due_count:Number((await one(q,`SELECT count(*) n FROM review_cards WHERE child_id=$1 AND due_at<=$2 AND suspended_at IS NULL`,[c.id,this.clock()])).n),synced_at:this.clock().toISOString()};}
  async today(actor:string,child:string){return this.tx(async q=>this.todayDto(q,await this.child(q,actor,child)));}
  async startSession(actor:string,key:string,child:string,body:any){return this.write(actor,key,`session:create:${child}`,body,q=>this.child(q,actor,child),async(q,c)=>{
    ensure(['scheduled','calendar','manual','quiz'].includes(body.source),422,'INVALID_SOURCE');const now=this.clock();
    if(body.source==='calendar')validDate(body.date);
    if(body.source==='manual')ensure(Array.isArray(body.word_ids)&&body.word_ids.length>0&&body.word_ids.length<=100&&new Set(body.word_ids).size===body.word_ids.length,422,'INVALID_WORD_COUNT');
    if(body.source==='manual')body.word_ids.forEach(uuid);
    if(body.source==='quiz')ensure(await one(q,"SELECT id FROM monthly_quizzes WHERE id=$1 AND child_id=$2 AND status='submitted'",[uuid(body.quiz_id),child]),404,'QUIZ_NOT_FOUND');
    await q.query(`UPDATE study_sessions SET status='expired',ended_at=$2 WHERE child_id=$1 AND status='active' AND expires_at<=$2`,[child,now]);
    ensure(!await one(q,`SELECT 1 FROM study_sessions WHERE child_id=$1 AND status='active'`,[child]),409,'CHILD_BUSY');
    const today=await this.todayDto(q,c);
    let candidates:Row[];
    if(body.source==='scheduled')candidates=(await q.query(`SELECT r.* FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.due_at<=$2 AND r.suspended_at IS NULL AND w.archived_at IS NULL ORDER BY (r.state='new'),r.due_at,r.id LIMIT 100`,[child,now])).rows;
    else {
      const filter=body.source==='calendar'?`EXISTS(SELECT 1 FROM mistake_events m WHERE m.child_word_id=r.child_word_id AND m.local_date=$2::date)`:body.source==='manual'?`r.child_word_id=ANY($2::uuid[])`:`EXISTS(SELECT 1 FROM monthly_quiz_items i WHERE i.child_word_id=r.child_word_id AND i.quiz_id=$2::uuid AND i.is_correct=false)`;
      candidates=(await q.query(`SELECT r.* FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.suspended_at IS NULL AND w.archived_at IS NULL AND ${filter} ORDER BY (r.state='new'),r.due_at,r.id`,[child,body.source==='calendar'?body.date:body.source==='manual'?body.word_ids:body.quiz_id])).rows;
      if(body.source==='manual')ensure(candidates.length===body.word_ids.length,422,'WORD_UNAVAILABLE');
    }
    let newRemaining=today.remaining_new_limit,excluded=0;
    const cards=candidates.filter(card=>{if(card.state!=='new')return true;if(newRemaining>0){newRemaining--;return true;}excluded++;return false;});
    ensure(cards.length>0,422,excluded?'NEW_WORD_LIMIT':'EMPTY_REVIEW_QUEUE');
    const s=await one(q,`INSERT INTO study_sessions(child_id,actor_user_id,started_at,expires_at,review_source,source_date,quiz_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[child,actor,now,new Date(now.getTime()+120000),body.source,body.source==='calendar'?body.date:null,body.source==='quiz'?body.quiz_id:null]);
    for(let i=0;i<cards.length;i++)await q.query('INSERT INTO study_session_items(session_id,child_id,card_id,ordinal,practice_only) VALUES($1,$2,$3,$4,$5)',[s.id,child,cards[i].id,i+1,body.source!=='scheduled'&&cards[i].state!=='new'&&new Date(cards[i].due_at)>now]);
    return {id:s.id,child_id:child,expires_at:s.expires_at,lease_generation:s.lease_generation,status:s.status,source:body.source,excluded_new_words:excluded,total:cards.length};
  });}
  private async session(q:Sql,actor:string,id:string){let s=await one(q,'SELECT * FROM study_sessions WHERE id=$1',[uuid(id)]);ensure(s,404,'SESSION_NOT_FOUND');const c=await this.child(q,actor,s.child_id);s=await one(q,'SELECT * FROM study_sessions WHERE id=$1',[id]);ensure(s.actor_user_id===actor,403,'SESSION_NOT_OWNED');return {s,c};}
  private live(s:Row,generation:number){ensure(s.status==='active'&&new Date(s.expires_at)>this.clock()&&s.lease_generation===generation,409,'SESSION_EXPIRED');}
  async heartbeat(actor:string,id:string,body:any,end=false){return this.tx(async q=>{const {s}=await this.session(q,actor,id);this.live(s,integer(body.lease_generation));return one(q,end?`UPDATE study_sessions SET status='ended',ended_at=$2 WHERE id=$1 RETURNING id,status,expires_at,lease_generation`:`UPDATE study_sessions SET expires_at=$2 WHERE id=$1 RETURNING id,status,expires_at,lease_generation`,[id,end?this.clock():new Date(this.clock().getTime()+120000)]);});}
  async cards(actor:string,id:string,query:any={}){return this.tx(async q=>{const {s}=await this.session(q,actor,id);this.live(s,s.lease_generation);const limit=pageSize(query.limit),cursor=query.cursor===undefined?0:Number(query.cursor);ensure(Number.isSafeInteger(cursor)&&cursor>=0,422,'INVALID_CURSOR');
    const rows=(await q.query(`SELECT r.id,r.version,r.state,r.due_at,r.child_word_id,w.lemma,w.part_of_speech,i.practice_only,i.ordinal FROM study_session_items i JOIN review_cards r ON r.id=i.card_id JOIN child_words w ON w.id=r.child_word_id WHERE i.session_id=$1 AND i.answered_event_id IS NULL AND i.ordinal>$2 ORDER BY i.ordinal LIMIT $3`,[id,cursor,limit+1])).rows;
    return {items:rows.slice(0,limit),next_cursor:rows.length>limit?String(rows[limit-1].ordinal):null,remaining:Number((await one(q,'SELECT count(*) n FROM study_session_items WHERE session_id=$1 AND answered_event_id IS NULL',[id])).n)};});}

  async review(actor:string,body:any){return this.tx(async q=>{
    const {s,c}=await this.session(q,actor,body.session_id),digest=hash(stable(body));uuid(body.event_id);uuid(body.card_id);
    const previous=await one(q,'SELECT * FROM review_logs WHERE child_id=$1 AND event_id=$2',[c.id,body.event_id]);
    if(previous){ensure(previous.actor_user_id===actor&&previous.request_hash===digest,409,'EVENT_CONFLICT');return previous.response_snapshot;}
    this.live(s,integer(body.lease_generation));ensure(['again','hard','good','easy'].includes(body.rating),422,'INVALID_RATING');
    const card=await one(q,`SELECT r.*,i.answered_event_id,i.practice_only FROM review_cards r JOIN study_session_items i ON i.card_id=r.id WHERE i.session_id=$1 AND r.id=$2 AND r.child_id=$3 FOR UPDATE OF r`,[s.id,body.card_id,c.id]);
    ensure(card&&!card.answered_event_id&&card.version===integer(body.expected_version),409,'CARD_CONFLICT');
    ensure(card.scheduler_version===this.scheduler.version&&card.parameter_version===this.scheduler.parameterVersion,409,'SCHEDULER_VERSION_MISMATCH');
    const day=await this.day(q,c),now=this.clock(),today=await this.todayDto(q,c);
    if(card.state==='new')ensure(today.remaining_new_limit>0,409,'NEW_WORD_LIMIT');
    const next=card.practice_only?{state:card.scheduler_state,label:card.state,due:new Date(card.due_at)}:this.scheduler.next(card.scheduler_state,body.rating,now),version=card.version+(card.practice_only?0:1),word=await one(q,'SELECT lemma,meaning_zh,part_of_speech,sense_key,version FROM child_words WHERE id=$1',[card.child_word_id]);
    if(!card.practice_only)await q.query('UPDATE review_cards SET scheduler_state=$2,state=$3,due_at=$4,last_review_at=$5,version=version+1 WHERE id=$1',[card.id,JSON.stringify(next.state),next.label,next.due,now]);
    await q.query('INSERT INTO daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[c.id,day,card.id,card.child_word_id,now,card.state==='new']);
    await q.query(`INSERT INTO daily_activity(child_id,local_date,distinct_words,new_words,goal_snapshot,timezone_snapshot) SELECT $1,$2,count(*)::int,count(*) FILTER(WHERE was_new)::int,$3,$4 FROM daily_word_activity WHERE child_id=$1 AND local_date=$2 ON CONFLICT(child_id,local_date) DO UPDATE SET distinct_words=excluded.distinct_words,new_words=excluded.new_words,updated_at=now()`,[c.id,day,c.daily_goal,c.timezone]);
    const result={event_id:body.event_id,card_id:card.id,version,due_at:next.due.toISOString(),state:next.label,practice_only:card.practice_only,today:await this.todayDto(q,c)};
    const log=await one(q,`INSERT INTO review_logs(child_id,card_id,session_id,actor_user_id,event_id,request_hash,rating,reviewed_at,local_date,timezone_snapshot,before_version,after_version,word_snapshot,before_state,after_state,response_snapshot,practice_only,review_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,[c.id,card.id,s.id,actor,body.event_id,digest,body.rating,now,day,c.timezone,card.version,version,JSON.stringify(word),JSON.stringify(card.scheduler_state),JSON.stringify(next.state),JSON.stringify(result),card.practice_only,s.review_source]);
    await q.query('UPDATE study_session_items SET answered_event_id=$3 WHERE session_id=$1 AND card_id=$2',[s.id,card.id,body.event_id]);
    if(body.rating==='again')await q.query(`INSERT INTO mistake_events(child_id,child_word_id,source,review_log_id,reason,occurred_at,local_date,timezone_snapshot,word_snapshot,answer_snapshot) VALUES($1,$2,'review',$3,'incorrect',$4,$5,$6,$7,$8)`,[c.id,card.child_word_id,log.id,now,day,c.timezone,JSON.stringify(word),JSON.stringify({rating:body.rating})]);
    return result;
  });}
}
