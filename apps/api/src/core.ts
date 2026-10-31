import {parentDto,decodeAvatar} from './parent-profile.ts';
import type {AiAccounts} from './ai-accounts.ts';
import {FileImports,type ImageReader} from './import-files.ts';
import {wordColumns,exportWords} from './word-export.ts';
import {CheckinShare,type EncouragementProvider} from './checkin-share.ts';
import type {CheckinShareImageCache} from './checkin-share-images.ts';
import {AudioService} from './audio.ts';
import type {AudioRuntime} from './audio-runtime.ts';
import {Vocabulary} from './vocabulary.ts';
import type {VocabularyProvider} from './vocabulary.ts';
import {History,streak,validDate,pageSize} from './history.ts';
import {MonthlyQuizzes} from './quiz.ts';
import {createHash, randomBytes} from 'node:crypto';
import type {Database, Sql, Identity, Dictionary, Scheduler, Row} from './ports.ts';
import {DomainError, ensure, text, uuid, integer} from './errors.ts';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const stable=(v:any):string=>JSON.stringify(v===null || typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const childDto=(c:Row)=>({...Object.fromEntries(['id','family_id','nickname','school_grade','gender','accent','voice_id','level','timezone','daily_new_limit','daily_goal','version'].map(k=>[k,c[k]])),speech_rate:Number(c.speech_rate)});
export const newWordsGroupSize=(available:number)=>available<=9?available:8;
export class Core {
  readonly imports:FileImports; readonly checkinShare:CheckinShare; readonly audio:AudioService; readonly vocabulary:Vocabulary; readonly quizzes:MonthlyQuizzes; readonly history:History;
  private db:Database; private identity:Identity; private dictionary:Dictionary; private scheduler:Scheduler; private appId:string; private clock:()=>Date;private access?: (q:Sql,actor:string)=>Promise<void>;
  constructor(db:Database, identity:Identity, dictionary:Dictionary, scheduler:Scheduler, appId:string, clock:()=>Date=()=>new Date(),vocabulary?:VocabularyProvider,audio?:AudioRuntime,encouragement?:EncouragementProvider,reader?:ImageReader,shareImages?:CheckinShareImageCache,access?:(q:Sql,actor:string)=>Promise<void>,accounts?:AiAccounts){this.access=access;this.imports=new FileImports({tx:fn=>this.tx(fn),child:(...args)=>this.child(...args)},reader,accounts);this.db=db;this.identity=identity;this.dictionary=dictionary;this.scheduler=scheduler;this.appId=appId;this.clock=clock;this.checkinShare=new CheckinShare({tx:fn=>this.tx(fn),child:(...args)=>this.child(...args),day:(...args)=>this.day(...args)},encouragement,shareImages);this.audio=new AudioService({tx:fn=>this.tx(fn),write:(...args)=>this.write(...args),child:(...args)=>this.child(...args),now:()=>this.clock(),day:(...args)=>this.day(...args)},audio);this.vocabulary=new Vocabulary({tx:fn=>this.tx(fn),write:(...args)=>this.write(...args),child:(...args)=>this.child(...args),now:()=>this.clock(),day:(...args)=>this.day(...args)},scheduler,vocabulary,accounts);this.history=new History({tx:fn=>this.tx(fn),child:(...args)=>this.child(...args),day:(...args)=>this.day(...args)});this.quizzes=new MonthlyQuizzes({tx:fn=>this.tx(fn),write:(...args)=>this.write(...args),child:(...args)=>this.child(...args),now:()=>this.clock(),day:(...args)=>this.day(...args)});}
  private async tx<T>(fn:(q:Sql)=>Promise<T>) {return this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate, public');return fn(q);});}
  async requirePrivacy(actor:string){return this.tx(async q=>{await this.access?.(q,actor);});}
  async login(code:unknown,inviteCode?:unknown,managementOnly=false) {
    const identity=await this.identity.exchange(text(code,512));
    return this.tx(async q=>{
      const referralCode=randomBytes(8).toString('hex');
      const u=managementOnly?await one(q,"SELECT * FROM users WHERE wx_app_id=$1 AND wx_open_id=$2 AND status='active' FOR UPDATE",[this.appId,identity.openId]):await one(q,`INSERT INTO users(wx_app_id,wx_open_id,display_name,referral_code) VALUES($1,$2,$3,$4) ON CONFLICT(wx_app_id,wx_open_id) DO UPDATE SET wx_open_id=excluded.wx_open_id RETURNING *, (xmax=0) AS newly_registered`,[this.appId,identity.openId,identity.displayName,referralCode]);
      ensure(u,404,'ACCOUNT_NOT_FOUND');
      const invite=typeof inviteCode==='string'?inviteCode.trim().toLowerCase():'';
      if(u.newly_registered&&invite){
        const inviter=await one(q,"SELECT id FROM users WHERE lower(referral_code)=lower($1) AND status='active'",[invite]);
        if(inviter&&inviter.id!==u.id)await q.query('INSERT INTO user_referrals(invited_user_id,inviter_user_id,referral_code) VALUES($1,$2,$3)',[u.id,inviter.id,invite]);
      }
      ensure(u.status==='active',403,'ACCOUNT_UNAVAILABLE');
      const token=randomBytes(32).toString('base64url'), expires=new Date(this.clock().getTime()+7*86400000);
      if(managementOnly)await q.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,scope) VALUES($1,$2,$3,'data_management')",[u.id,hash(token),expires]);else await q.query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[u.id,hash(token),expires]);
      return {access_token:token,token_type:'Bearer',expires_at:expires.toISOString(),is_new_user:!managementOnly&&u.newly_registered===true,user:parentDto(u),families:await this.families(q,u.id)};
    });
  }
  async managementOnly(token:string){return this.tx(async q=>(await one(q,'SELECT scope FROM auth_sessions WHERE token_hash=$1',[hash(token)]))?.scope==='data_management');}
  async upgradeSession(actor:string,token:string){await this.tx(q=>q.query("UPDATE auth_sessions SET scope='full' WHERE user_id=$1 AND token_hash=$2",[actor,hash(token)]));}
  async authenticate(token:string) {return this.tx(async q=>{const u=await one(q,`SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.status='active'`,[hash(token),this.clock()]);ensure(u,401,'UNAUTHENTICATED');return u.id as string;});}
  private async families(q:Sql,actor:string) {return (await q.query(`SELECT f.id,f.name,f.version,CASE WHEN f.owner_user_id=$1 THEN 'owner' ELSE 'parent' END role FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 AND m.status='active' AND f.status='active' ORDER BY f.created_at`,[actor])).rows;}
  private async family(q:Sql,actor:string,id:string) {
    const f=await one(q,`SELECT * FROM families WHERE id=$1 AND status='active' FOR UPDATE`,[uuid(id)]);
    ensure(f && await one(q,`SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'`,[id,actor]),404,'FAMILY_NOT_FOUND');await this.access?.(q,actor);return f;
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
      const s=await scope(q), digest=hash(stable(payload));await this.access?.(q,actor);
      await q.query(`INSERT INTO idempotency_keys(actor_user_id,operation,key,request_hash,status,expires_at) VALUES($1,$2,$3,$4,'running',$5) ON CONFLICT DO NOTHING`,[actor,op,key,digest,new Date(this.clock().getTime()+86400000)]);
      const row=await one(q,'SELECT * FROM idempotency_keys WHERE actor_user_id=$1 AND operation=$2 AND key=$3 FOR UPDATE',[actor,op,key]);
      ensure(row.request_hash===digest,409,'IDEMPOTENCY_CONFLICT');if(row.status==='completed')return row.response_body;
      const result=await fn(q,s);
      await q.query(`UPDATE idempotency_keys SET status='completed',http_status=200,response_body=$4 WHERE actor_user_id=$1 AND operation=$2 AND key=$3`,[actor,op,key,JSON.stringify(result)]);return result;
    });
  }
  async audioSettings(actor:string){const catalog=await this.audio.voices();return this.tx(async q=>{
    const user=await one(q,"SELECT audio_accent,audio_voice_id,audio_auto_play,audio_settings_version FROM users WHERE id=$1 AND status='active'",[actor]);ensure(user,401,'ACCOUNT_UNAVAILABLE');
    return {accent:user.audio_accent,voice_id:user.audio_voice_id??catalog.items.find(v=>v.accent===user.audio_accent)?.id??null,auto_play:user.audio_auto_play,version:user.audio_settings_version};
  });}
  async saveAudioSettings(actor:string,key:string,b:any){
    return this.write(actor,key,'me:audio-settings',b,q=>one(q,"SELECT * FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),async(q,u)=>{
      ensure(u,401,'ACCOUNT_UNAVAILABLE');ensure(u.audio_settings_version===b.expected_version,409,'AUDIO_SETTINGS_CHANGED');
      const catalog=await this.audio.voices();ensure(catalog.items.some(v=>v.id===b.voice_id&&v.accent===b.accent),422,'VOICE_ACCENT_UNAVAILABLE');
      const r=await one(q,'UPDATE users SET audio_accent=$2,audio_voice_id=$3,audio_auto_play=$4,audio_settings_version=audio_settings_version+1 WHERE id=$1 RETURNING audio_settings_version',[actor,b.accent,b.voice_id,b.auto_play??u.audio_auto_play]);
      return {accent:b.accent,voice_id:b.voice_id,auto_play:b.auto_play??u.audio_auto_play,version:r.audio_settings_version};
    });
  }
  async me(actor:string){return this.tx(async q=>{
    const u=await one(q,"SELECT id,display_name,profile_version,avatar_revision,avatar_mime,referral_code FROM users WHERE id=$1 AND status='active'",[actor]);ensure(u,401,'ACCOUNT_UNAVAILABLE');
    const applications=(await q.query("SELECT i.id,i.family_id,f.name family_name,i.status,i.expires_at FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.claimed_by=$1 AND i.status='claimed' AND i.expires_at>$2 AND f.status='active' ORDER BY i.claimed_at DESC",[actor,this.clock()])).rows;
    return {user:parentDto(u),families:await this.families(q,actor),family_applications:applications,referral_code:u.referral_code};
  });}
  async saveProfile(actor:string,key:string,b:any){
    const name=text(b.display_name,40).trim();ensure(name.length>0&&!/[\u0000-\u001f\u007f]/.test(name),422,'INVALID_PROFILE');
    ensure(!(b.remove_avatar&&b.avatar_base64!==undefined),422,'INVALID_AVATAR');
    const avatar=b.avatar_base64===undefined?null:decodeAvatar(b.avatar_base64,b.avatar_mime),changeAvatar=!!avatar||b.remove_avatar===true;
    return this.write(actor,key,'me:profile',b,q=>one(q,"SELECT profile_version FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),async(q,user)=>{
      ensure(user&&user.profile_version===b.expected_version,409,'PROFILE_CHANGED');
      const result=await one(q,`UPDATE users SET display_name=$2,profile_version=profile_version+1,avatar_revision=avatar_revision+CASE WHEN $3 THEN 1 ELSE 0 END,avatar_bytes=CASE WHEN $3 THEN $4::bytea ELSE avatar_bytes END,avatar_mime=CASE WHEN $3 THEN $5 ELSE avatar_mime END WHERE id=$1 RETURNING id,display_name,profile_version,avatar_revision,avatar_mime`,[actor,name,changeAvatar,avatar?.bytes??null,avatar?.mime??null]);
      await q.query("UPDATE family_members SET display_name=$2 WHERE user_id=$1 AND status='active'",[actor,name]);return parentDto(result);
    });
  }
  async parentAvatar(actor:string,target:string,revision?:string){return this.tx(async q=>{
    await this.access?.(q,actor);uuid(target);
    const user=await one(q,`SELECT u.avatar_bytes,u.avatar_mime,u.avatar_revision FROM users u WHERE u.id=$2 AND u.status='active' AND (u.id=$1 OR EXISTS(SELECT 1 FROM family_members mine JOIN family_members theirs ON theirs.family_id=mine.family_id JOIN families f ON f.id=mine.family_id WHERE mine.user_id=$1 AND theirs.user_id=u.id AND mine.status='active' AND theirs.status='active' AND f.status='active') OR EXISTS(SELECT 1 FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.claimed_by=u.id AND i.status='claimed' AND i.expires_at>$3 AND f.owner_user_id=$1 AND f.status='active'))`,[actor,target,this.clock()]);
    ensure(user?.avatar_bytes&&(!revision||String(user.avatar_revision)===revision),404,'AVATAR_NOT_FOUND');return {bytes:Buffer.from(user.avatar_bytes),mime:user.avatar_mime};
  });}
  async createFamily(actor:string,key:string,body:any){return this.write(actor,key,'family:create',body,async()=>null,async q=>{
    const f=await one(q,'INSERT INTO families(name,owner_user_id) VALUES($1,$2) RETURNING *',[text(body.name,40),actor]);
    await q.query('INSERT INTO family_members(family_id,user_id,display_name) SELECT $1,id,display_name FROM users WHERE id=$2',[f.id,actor]);return {id:f.id,name:f.name,version:f.version,role:'owner'};
  });}
  async members(actor:string,family:string){return this.tx(async q=>{await this.family(q,actor,family);const rows=(await q.query(`SELECT u.id,u.display_name,u.profile_version,u.avatar_revision,u.avatar_mime,CASE WHEN f.owner_user_id=m.user_id THEN 'owner' ELSE 'parent' END role FROM family_members m JOIN families f ON f.id=m.family_id JOIN users u ON u.id=m.user_id WHERE m.family_id=$1 AND m.status='active' AND u.status='active' ORDER BY (f.owner_user_id=m.user_id) DESC,m.joined_at`,[family])).rows;return {items:rows.map(user=>({...parentDto(user),user_id:user.id,role:user.role,is_self:user.id===actor}))};});}
  async createInvite(actor:string,key:string,family:string){return this.write(actor,key,`invite:create:${family}`,{},q=>this.family(q,actor,family),async(q,f)=>{
    ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');const token=randomBytes(32).toString('base64url');
    const invite=await one(q,"INSERT INTO family_invites(family_id,created_by,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id,status,expires_at",[family,actor,hash(token),new Date(this.clock().getTime()+86400000)]);return {...invite,invite_token:token};
  });}
  async invites(actor:string,family:string){return this.tx(async q=>{const f=await this.family(q,actor,family);ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');const rows=(await q.query("SELECT i.id,i.status,i.expires_at,u.display_name AS applicant,u.id applicant_id,u.status user_status,u.profile_version,u.avatar_revision,u.avatar_mime FROM family_invites i LEFT JOIN users u ON u.id=i.claimed_by WHERE i.family_id=$1 ORDER BY i.created_at DESC",[family])).rows;return {items:rows.map(item=>({id:item.id,status:item.status,expires_at:item.expires_at,applicant:item.applicant,applicant_profile:item.applicant_id&&item.user_status==='active'?parentDto({...item,id:item.applicant_id,display_name:item.applicant}):null}))};});}
  async resolveInvite(actor:string,body:any){return this.tx(async q=>{
    const token=text(body.invite_token,256);ensure(/^[A-Za-z0-9_-]{43}$/.test(token),422,'INVALID_REQUEST_BODY');
    const invite=await one(q,"SELECT i.*,f.name family_name FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.token_hash=$1 AND f.status='active' FOR UPDATE OF f",[hash(token)]);
    if(!invite)return {state:'unavailable'};
    await this.access?.(q,actor);
    const family={id:invite.family_id,name:invite.family_name};
    // Membership survives expiry or use of the original one-person invitation.
    if(await one(q,"SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'",[family.id,actor])){
      const children=(await q.query('SELECT id FROM children WHERE family_id=$1 AND archived_at IS NULL ORDER BY created_at,id',[family.id])).rows;
      return {state:'member',family,children};
    }
    if(new Date(invite.expires_at)<=this.clock()||!['pending','claimed'].includes(invite.status))return {state:'unavailable'};
    if(invite.status==='claimed'&&invite.claimed_by!==actor)return {state:'unavailable'};
    const application=await one(q,"SELECT id,expires_at FROM family_invites WHERE family_id=$1 AND claimed_by=$2 AND status='claimed' AND expires_at>$3 ORDER BY claimed_at LIMIT 1",[family.id,actor,this.clock()]);
    return application?{state:'waiting',family,expires_at:application.expires_at}:{state:'ready',family,expires_at:invite.expires_at};
  });}
  async claimInvite(actor:string,key:string,body:any){return this.write(actor,key,'invite:claim',body,async q=>{
    const initial=await one(q,'SELECT family_id FROM family_invites WHERE token_hash=$1',[hash(text(body.invite_token,256))]);ensure(initial,404,'INVITE_NOT_FOUND');
    ensure(await one(q,"SELECT 1 FROM families WHERE id=$1 AND status='active' FOR UPDATE",[initial.family_id]),404,'INVITE_NOT_FOUND');return initial;
  },async q=>{
    const i=await one(q,'SELECT * FROM family_invites WHERE token_hash=$1 FOR UPDATE',[hash(body.invite_token.trim())]);
    ensure(i.status==='pending'&&new Date(i.expires_at)>this.clock(),409,'INVITE_UNAVAILABLE');ensure(i.created_by!==actor,422,'ALREADY_MEMBER');
    ensure(!await one(q,"SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'",[i.family_id,actor]),422,'ALREADY_MEMBER');
    const existing=await one(q,"SELECT id,status,expires_at FROM family_invites WHERE family_id=$1 AND claimed_by=$2 AND status='claimed' AND expires_at>$3 ORDER BY claimed_at LIMIT 1",[i.family_id,actor,this.clock()]);if(existing)return existing;
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
  async createChild(actor:string,key:string,family:string,body:any){return this.write(actor,key,`child:create:${family}`,body,async q=>{const f=await this.family(q,actor,family);ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');return f;},async q=>{
    ensure(['en-US','en-GB'].includes(body.accent??'en-US'),422,'INVALID_ACCENT');
    ensure([undefined,'unspecified','girl','boy'].includes(body.gender),422,'INVALID_GENDER');
    const grade=String(body.school_grade??'').trim();ensure(grade.length<=24&&!/[\u0000-\u001f\u007f]/.test(grade),422,'INVALID_SCHOOL_GRADE');
    const c=await one(q,'INSERT INTO children(family_id,nickname,school_grade,gender,accent) VALUES($1,$2,$3,$4,$5) RETURNING *',[family,text(body.nickname,40),grade,body.gender??'unspecified',body.accent??'en-US']);return childDto(c);
  });}
  async wordbooks(actor:string,child:string){return this.tx(async q=>{await this.child(q,actor,child);return {items:(await q.query(`SELECT b.id,b.child_id,b.name,b.version,b.read_only,b.shared_source_id,b.shared_source_version,count(w.child_word_id)::int word_count,coalesce(sb.published,false) shared_published,coalesce(sb.publisher_user_id=$2,false) shared_can_unpublish,sb.title shared_title,sb.description shared_description,sb.target_level shared_target_level,sb.version shared_current_version FROM wordbooks b LEFT JOIN wordbook_words w ON w.wordbook_id=b.id LEFT JOIN shared_wordbooks sb ON sb.id=coalesce(b.shared_source_id,(SELECT s.id FROM shared_wordbooks s WHERE s.source_wordbook_id=b.id)) WHERE b.child_id=$1 AND b.archived_at IS NULL GROUP BY b.id,sb.id ORDER BY b.created_at`,[child,actor])).rows};});}
  async createWordbook(actor:string,key:string,child:string,body:any){return this.write(actor,key,`book:create:${child}`,body,q=>this.child(q,actor,child),async q=>{ensure(Number((await one(q,'SELECT count(*)::int n FROM wordbooks WHERE child_id=$1 AND archived_at IS NULL',[child])).n)<100,422,'WORDBOOK_LIMIT');const b=await one(q,'INSERT INTO wordbooks(child_id,name,created_by) VALUES($1,$2,$3) RETURNING id,child_id,name,version,read_only',[child,text(body.name,60),actor]);return {...b,word_count:0};});}
  async renameWordbook(actor:string,key:string,child:string,id:string,body:any){return this.write(actor,key,`book:rename:${id}`,body,q=>this.child(q,actor,child),async q=>{const b=await one(q,'SELECT * FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL FOR UPDATE',[uuid(id),child]);ensure(b,404,'WORDBOOK_NOT_FOUND');ensure(!b.read_only,403,'SHARED_WORDBOOK_READ_ONLY');ensure(b.version===integer(body.expected_version),409,'WORDBOOK_CHANGED');return one(q,'UPDATE wordbooks SET name=$2,version=version+1 WHERE id=$1 RETURNING id,child_id,name,version,read_only',[id,text(body.name,60)]);});}
  async archiveWordbook(actor:string,key:string,child:string,id:string){return this.write(actor,key,`book:archive:${id}`,{},q=>this.child(q,actor,child),async q=>{const b=await one(q,'SELECT * FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL FOR UPDATE',[uuid(id),child]);ensure(b,404,'WORDBOOK_NOT_FOUND');ensure(!b.read_only,403,'SHARED_WORDBOOK_READ_ONLY');ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE child_id=$1 AND payload->>'wordbook_id'=$2 AND status IN ('queued','running')",[child,id]),409,'ACTIVE_GENERATION');await q.query('UPDATE shared_wordbooks SET published=false,version=version+1,updated_at=$2 WHERE source_wordbook_id=$1 AND published',[id,this.clock()]);await q.query('DELETE FROM wordbook_words WHERE wordbook_id=$1',[id]);await q.query('UPDATE wordbooks SET archived_at=$2,version=version+1 WHERE id=$1',[id,this.clock()]);await q.query("UPDATE child_words w SET archived_at=$2 WHERE w.child_id=$1 AND w.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM wordbook_words x JOIN wordbooks b ON b.id=x.wordbook_id WHERE x.child_word_id=w.id AND b.archived_at IS NULL)",[child,this.clock()]);await q.query("UPDATE review_cards r SET suspended_at=$2 WHERE r.child_id=$1 AND EXISTS(SELECT 1 FROM child_words w WHERE w.id=r.child_word_id AND w.archived_at=$2)",[child,this.clock()]);return {id,archived:true};});}
  // First release permits historical unpublish/leave only. Check before idempotency replay.
  async shareWordbook(actor:string,key:string,child:string,id:string,body:any){
    ensure(body.published===false,403,'PUBLIC_SHARING_DISABLED');
    return this.write(actor,key,`book:share:${id}`,body,q=>this.child(q,actor,child),async q=>{
      const b=await one(q,'SELECT * FROM wordbooks WHERE id=$1 AND child_id=$2 FOR UPDATE',[uuid(id),child]);
      ensure(b,404,'WORDBOOK_NOT_FOUND');ensure(!b.read_only,403,'SHARED_WORDBOOK_READ_ONLY');
      const current=await one(q,'SELECT * FROM shared_wordbooks WHERE source_wordbook_id=$1 FOR UPDATE',[id]);
      ensure(current,404,'SHARED_WORDBOOK_NOT_FOUND');ensure(current.publisher_user_id===actor,403,'SHARE_OWNER_REQUIRED');
      const off=current.published?await one(q,'UPDATE shared_wordbooks SET published=false,version=version+1,updated_at=$2 WHERE id=$1 RETURNING *',[current.id,this.clock()]):current;
      return {id:off.id,published:false,version:off.version,title:off.title,description:off.description,target_level:off.target_level,word_count:off.word_count};
    });
  }
  async searchSharedWordbooks(_actor:string,_query:any={}):Promise<any>{throw new DomainError(403,'PUBLIC_SHARING_DISABLED');}
  async sharedWordbook(_actor:string,_id:string):Promise<any>{throw new DomainError(403,'PUBLIC_SHARING_DISABLED');}
  async joinSharedWordbook(_actor:string,_key:string,_child:string,_id:string):Promise<any>{throw new DomainError(403,'PUBLIC_SHARING_DISABLED');}
  async leaveSharedWordbook(actor:string,key:string,child:string,id:string){return this.write(actor,key,`book:leave:${id}`,{},q=>this.child(q,actor,child),async q=>{const b=await one(q,'SELECT * FROM wordbooks WHERE (id=$1 OR shared_source_id=$1) AND child_id=$2 AND archived_at IS NULL AND read_only=true FOR UPDATE',[uuid(id),child]);ensure(b,404,'WORDBOOK_NOT_FOUND');ensure(b.shared_source_id,422,'NOT_SHARED_WORDBOOK');const sub=await one(q,'SELECT * FROM shared_wordbook_subscriptions WHERE local_wordbook_id=$1 AND child_id=$2 AND active FOR UPDATE',[b.id,child]);ensure(sub,404,'SUBSCRIPTION_NOT_FOUND');await q.query('DELETE FROM wordbook_words WHERE wordbook_id=$1',[b.id]);await q.query('UPDATE wordbooks SET archived_at=$2,version=version+1 WHERE id=$1',[b.id,this.clock()]);await q.query('UPDATE shared_wordbook_subscriptions SET active=false WHERE id=$1',[sub.id]);await q.query("UPDATE child_words w SET archived_at=$2 WHERE w.child_id=$1 AND w.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM wordbook_words x JOIN wordbooks wb ON wb.id=x.wordbook_id WHERE x.child_word_id=w.id AND wb.archived_at IS NULL)",[child,this.clock()]);await q.query("UPDATE review_cards r SET suspended_at=$2 WHERE r.child_id=$1 AND EXISTS(SELECT 1 FROM child_words w WHERE w.id=r.child_word_id AND w.archived_at=$2)",[child,this.clock()]);return {id:b.id,removed:true};});}
  async createBatch(actor:string,key:string,child:string,body:any){
    ensure(Array.isArray(body.words)&&body.words.length>0&&body.words.length<=30,422,'INVALID_WORD_COUNT');
    const raw=body.words.map((w:unknown)=>text(w)), theme=body.theme===undefined?'':String(body.theme);ensure(theme.length<=80,422,'INVALID_THEME');
    // Permission before provider calls; repeated inside the write transaction.
    await this.tx(q=>this.child(q,actor,child));
    const candidates=await Promise.all(raw.map((w:string)=>this.dictionary.lookup(w)));
    return this.write(actor,key,`batch:create:${child}`,body,q=>this.child(q,actor,child),async q=>{
      ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL AND read_only=false',[uuid(body.wordbook_id),child]),404,'WORDBOOK_NOT_FOUND');
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
    ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL AND read_only=false',[b.wordbook_id,b.child_id]),403,'SHARED_WORDBOOK_READ_ONLY');
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
  async words(actor:string,child:string,query:any={}){return this.tx(async q=>{
    await this.child(q,actor,child);const limit=pageSize(query.limit),cursor=query.cursor?uuid(query.cursor):null;
    const search=query.q===undefined?'':String(query.q).trim();ensure(search.length<=120,422,'INVALID_SEARCH');
    const mark=query.mark??null;ensure(mark===null||['easy','error_prone','favorite','needs_correction'].includes(mark),422,'INVALID_MARK');
    const pattern=search||null;
    if(cursor)ensure(await one(q,'SELECT 1 FROM child_words WHERE child_id=$1 AND id=$2',[child,cursor]),422,'INVALID_CURSOR');
    ensure(!/[\u0000-\u001f\u007f]/.test(search),422,'INVALID_SEARCH');
    const selectedBook=query.wordbook_id?uuid(query.wordbook_id):null;if(selectedBook)ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[selectedBook,child]),404,'WORDBOOK_NOT_FOUND');
    const base=`w.child_id=$1 AND w.archived_at IS NULL AND ($2::text IS NULL OR position(lower($2) in lower(w.lemma))>0 OR position(lower($2) in lower(w.meaning_zh))>0) AND ($3::text IS NULL OR (CASE $3 WHEN 'easy' THEN coalesce(a.easy,false) WHEN 'error_prone' THEN coalesce(a.error_prone,false) WHEN 'favorite' THEN coalesce(a.favorite,false) ELSE coalesce(a.manual_needs_correction,false) OR EXISTS(SELECT 1 FROM word_corrections wc WHERE wc.child_word_id=w.id AND wc.status='pending') END)) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM wordbook_words bw WHERE bw.child_word_id=w.id AND bw.wordbook_id=$4 AND bw.child_id=$1))`;
    const select=`${wordColumns},coalesce(a.easy,false) annotation_easy,coalesce(a.error_prone,false) annotation_error_prone,coalesce(a.favorite,false) annotation_favorite,coalesce(a.manual_needs_correction,false) annotation_manual_correction,coalesce(a.version,0) annotation_version,EXISTS(SELECT 1 FROM word_corrections wc WHERE wc.child_word_id=w.id AND wc.status='pending') annotation_pending`;
    const rows=(await q.query(`SELECT ${select} FROM child_words w LEFT JOIN word_annotations a ON a.child_word_id=w.id AND a.child_id=w.child_id WHERE ${base} AND ($5::uuid IS NULL OR (w.created_at,w.id)<(SELECT created_at,id FROM child_words WHERE id=$5 AND child_id=$1)) ORDER BY w.created_at DESC,w.id DESC LIMIT $6`,[child,pattern,mark,selectedBook,cursor,limit+1])).rows;
    const total=(await q.query(`SELECT count(*)::int n FROM child_words w LEFT JOIN word_annotations a ON a.child_word_id=w.id AND a.child_id=w.child_id WHERE ${base}`,[child,pattern,mark,selectedBook])).rows[0].n;
    const progress=(await one(q,`SELECT count(*)::int total,count(*) FILTER(WHERE coalesce(r.state,'new')<>'new' AND r.suspended_at IS NULL)::int learned FROM child_words w LEFT JOIN review_cards r ON r.child_id=w.child_id AND r.child_word_id=w.id WHERE w.child_id=$1 AND w.archived_at IS NULL AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM wordbook_words bw WHERE bw.child_id=w.child_id AND bw.child_word_id=w.id AND bw.wordbook_id=$2))`,[child,selectedBook]));
    const firstUnlearned=await one(q,`WITH ordered AS (SELECT w.id,row_number() OVER(ORDER BY w.created_at DESC,w.id DESC)::int rn,coalesce(r.state,'new') state FROM child_words w LEFT JOIN review_cards r ON r.child_id=w.child_id AND r.child_word_id=w.id WHERE w.child_id=$1 AND w.archived_at IS NULL AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM wordbook_words bw WHERE bw.child_id=w.child_id AND bw.child_word_id=w.id AND bw.wordbook_id=$2))) SELECT target.id,CASE WHEN target.rn<=$3 THEN NULL ELSE (SELECT id FROM ordered WHERE rn=((target.rn-1)/$3)*$3) END cursor FROM ordered target WHERE target.state='new' ORDER BY target.rn LIMIT 1`,[child,selectedBook,limit]);
    return {items:rows.slice(0,limit).map((w:Row)=>{const {annotation_easy,annotation_error_prone,annotation_favorite,annotation_manual_correction,annotation_version,annotation_pending,...word}=w;return {...word,annotations:{easy:annotation_easy,error_prone:annotation_error_prone,favorite:annotation_favorite,manual_needs_correction:annotation_manual_correction,needs_correction:annotation_manual_correction||annotation_pending,version:annotation_version}};}),next_cursor:rows.length>limit?rows[limit-1].id:null,total,book_total:progress.total,learned_count:progress.learned,first_unlearned_id:firstUnlearned?.id??null,first_unlearned_cursor:firstUnlearned?.cursor??null};
  });}
  async exportWords(actor:string,child:string,b:any){return this.tx(async q=>{await this.child(q,actor,child);return exportWords(q,child,b);});}
  async word(actor:string,child:string,id:string){return this.tx(async q=>{await this.child(q,actor,child);const w=await one(q,"SELECT w.id,w.lemma,w.meaning_zh,w.part_of_speech,w.ipa_gb,w.ipa_us,(SELECT json_build_object('id',s.id,'content_version',s.content_version,'text_en',s.text_en,'translation_zh',s.translation_zh) FROM sentences s JOIN sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=w.id AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1) example FROM child_words w WHERE w.child_id=$1 AND w.id=$2 AND w.archived_at IS NULL",[child,uuid(id)]);ensure(w,404,'WORD_NOT_FOUND');return w;});}
  async patchWordAnnotations(actor:string,key:string,id:string,b:any){return this.write(actor,key,`word:annotations:${id}`,b,async q=>{const initial=await one(q,'SELECT child_id FROM child_words WHERE id=$1 AND archived_at IS NULL',[uuid(id)]);ensure(initial,404,'WORD_NOT_FOUND');await this.child(q,actor,initial.child_id);const w=await one(q,'SELECT child_id FROM child_words WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id]);ensure(w,404,'WORD_NOT_FOUND');return {child_id:w.child_id,current:await one(q,'SELECT * FROM word_annotations WHERE child_word_id=$1 AND child_id=$2 FOR UPDATE',[id,w.child_id])};},async(q,s)=>{
    const current=s.current,version=current?.version??0;ensure(version===b.expected_version,409,'ANNOTATIONS_CHANGED');
    let easy=b.easy??current?.easy??false,errorProne=b.error_prone??current?.error_prone??false;const favorite=b.favorite??current?.favorite??false,manual=b.manual_needs_correction??current?.manual_needs_correction??false;
    if(b.easy===true)errorProne=false;if(b.error_prone===true)easy=false;
    ensure(!(easy&&errorProne),422,'INVALID_ANNOTATIONS');
    const r=await one(q,`INSERT INTO word_annotations(child_id,child_word_id,easy,error_prone,favorite,manual_needs_correction,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8) ON CONFLICT(child_id,child_word_id) DO UPDATE SET easy=excluded.easy,error_prone=excluded.error_prone,favorite=excluded.favorite,manual_needs_correction=excluded.manual_needs_correction,version=word_annotations.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING *`,[s.child_id,id,easy,errorProne,favorite,manual,actor,this.clock()]);
    const pending=await one(q,"SELECT 1 FROM word_corrections WHERE child_word_id=$1 AND status='pending' LIMIT 1",[id]);return {easy:r.easy,error_prone:r.error_prone,favorite:r.favorite,manual_needs_correction:r.manual_needs_correction,needs_correction:r.manual_needs_correction||!!pending,version:r.version};
  });}
  private async day(q:Sql,c:Row){return String((await one(q,`SELECT to_char($1::timestamptz AT TIME ZONE $2,'YYYY-MM-DD') AS local_day`,[this.clock(),c.timezone])).local_day);}
  private async todayDto(q:Sql,c:Row){const day=await this.day(q,c),a=await one(q,'SELECT * FROM daily_activity WHERE child_id=$1 AND local_date=$2',[c.id,day]);const active=await one(q,`SELECT s.id,s.actor_user_id,s.quiz_id,s.lease_generation,s.expires_at,u.display_name FROM study_sessions s JOIN users u ON u.id=s.actor_user_id WHERE s.child_id=$1 AND s.status='active' AND s.expires_at>$2`,[c.id,this.clock()]);const newCount=Number((await one(q,`SELECT count(*) n FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.state='new' AND r.suspended_at IS NULL AND w.archived_at IS NULL`,[c.id])).n);const reviewDue=Number((await one(q,`SELECT count(*) n FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.state<>'new' AND r.due_at<=$2 AND r.suspended_at IS NULL AND w.archived_at IS NULL`,[c.id,this.clock()])).n);const makeupCredits=Number((await one(q,'SELECT count(*)::int n FROM checkin_makeup_credits WHERE child_id=$1 AND used_for_date IS NULL',[c.id])).n);return {...await streak(q,c.id,day),makeup_credits:makeupCredits,checked_in:(a?.distinct_words??0)>=(a?.goal_snapshot??c.daily_goal)||(await one(q,'SELECT 1 FROM checkin_makeup_credits WHERE child_id=$1 AND used_for_date=$2',[c.id,day]))!==undefined,active_session:active?JSON.parse(JSON.stringify(active)):null,child:childDto(c),completed_words:a?.distinct_words??0,new_words:a?.new_words??0,goal:a?.goal_snapshot??c.daily_goal,goal_reached:(a?.distinct_words??0)>=(a?.goal_snapshot??c.daily_goal),remaining_new_limit:Math.max(0,c.daily_new_limit-(a?.new_words??0)),new_count:newCount,due_count:reviewDue,synced_at:this.clock().toISOString()};}
  private async awardMakeupMilestones(q:Sql,child:string,day:string){
    const current=await streak(q,child,day,false);if(current.streak_days<15||!current.streak_through)return;
    const start=new Date(Date.parse(`${current.streak_through}T00:00:00Z`)-(current.streak_days-1)*86400000).toISOString().slice(0,10);
    for(let milestone=15;milestone<=current.streak_days;milestone+=15){
      const date=new Date(Date.parse(`${start}T00:00:00Z`)+(milestone-1)*86400000).toISOString().slice(0,10);
      await q.query('INSERT INTO checkin_makeup_credits(child_id,streak_start,milestone_days,milestone_date) VALUES($1,$2,$3,$4) ON CONFLICT(child_id,streak_start,milestone_days) DO NOTHING',[child,start,milestone,date]);
    }
  }
  async useCheckinMakeup(actor:string,key:string,child:string,body:any){return this.write(actor,key,`checkin-makeup:${child}:${body.date}`,body,q=>this.child(q,actor,child),async(q,c)=>{
    const date=validDate(body.date),today=await this.day(q,c);ensure(date<today,422,'MAKEUP_DATE_NOT_PAST');
    const existing=await one(q,`SELECT 1 FROM daily_activity WHERE child_id=$1 AND local_date=$2 AND distinct_words>=goal_snapshot UNION ALL SELECT 1 FROM checkin_makeup_credits WHERE child_id=$1 AND used_for_date=$2 LIMIT 1`,[child,date]);ensure(!existing,409,'CHECKIN_ALREADY_COMPLETE');
    const credit=await one(q,'SELECT id FROM checkin_makeup_credits WHERE child_id=$1 AND used_for_date IS NULL ORDER BY earned_at,id LIMIT 1 FOR UPDATE',[child]);ensure(credit,409,'NO_MAKEUP_CREDIT');
    await q.query('UPDATE checkin_makeup_credits SET used_for_date=$2,used_at=$3,used_by=$4 WHERE id=$1',[credit.id,date,this.clock(),actor]);
    const remaining=Number((await one(q,'SELECT count(*)::int n FROM checkin_makeup_credits WHERE child_id=$1 AND used_for_date IS NULL',[child])).n);
    return {date,makeup:true,makeup_credits:remaining,...await streak(q,child,today)};
  });}
  private async learningGoalDto(q:Sql,c:Row){const date=await this.day(q,c),a=await one(q,'SELECT goal_snapshot FROM daily_activity WHERE child_id=$1 AND local_date=$2',[c.id,date]);return {child_id:c.id,nickname:c.nickname,daily_goal:c.daily_goal,today_goal:a?.goal_snapshot??c.daily_goal,effective_from:a?new Date(Date.parse(date)+86400000).toISOString().slice(0,10):date,version:c.version};}
  async learningGoal(actor:string,child:string){return this.tx(async q=>this.learningGoalDto(q,await this.child(q,actor,child)));}
  async setLearningGoal(actor:string,key:string,child:string,b:any){return this.write(actor,key,`learning-goal:${child}`,b,q=>this.child(q,actor,child),async(q,c)=>{
    const goal=integer(b.daily_goal);ensure(goal>=1&&goal<=500,422,'INVALID_LEARNING_GOAL');ensure(c.version===b.expected_version,409,'LEARNING_GOAL_CHANGED');
    const updated=await one(q,'UPDATE children SET daily_goal=$2,version=version+1 WHERE id=$1 RETURNING *',[child,goal]);return this.learningGoalDto(q,updated);
  });}
  async today(actor:string,child:string){return this.tx(async q=>this.todayDto(q,await this.child(q,actor,child)));}
  async startSession(actor:string,key:string,child:string,body:any){return this.write(actor,key,`session:create:${child}`,body,q=>this.child(q,actor,child),async(q,c)=>{
    ensure(['scheduled','review','new_words','calendar','manual','quiz'].includes(body.source),422,'INVALID_SOURCE');const now=this.clock();
    if(body.source==='calendar')validDate(body.date);
    if(body.source==='manual')ensure(Array.isArray(body.word_ids)&&body.word_ids.length>0&&body.word_ids.length<=100&&new Set(body.word_ids).size===body.word_ids.length,422,'INVALID_WORD_COUNT');
    if(body.source==='manual')body.word_ids.forEach(uuid);
    if(body.source==='quiz')ensure(await one(q,"SELECT id FROM monthly_quizzes WHERE id=$1 AND child_id=$2 AND status='submitted'",[uuid(body.quiz_id),child]),404,'QUIZ_NOT_FOUND');
    await q.query(`UPDATE study_sessions SET status='expired',ended_at=$2 WHERE child_id=$1 AND status='active' AND expires_at<=$2`,[child,now]);
    ensure(!await one(q,`SELECT 1 FROM study_sessions WHERE child_id=$1 AND status='active'`,[child]),409,'CHILD_BUSY');
    const today=await this.todayDto(q,c);
    let candidates:Row[];
    if(body.source==='scheduled')candidates=(await q.query(`SELECT r.* FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.due_at<=$2 AND r.suspended_at IS NULL AND w.archived_at IS NULL ORDER BY (r.state='new'),r.due_at,r.id LIMIT 100`,[child,now])).rows;
    else if(body.source==='review')candidates=(await q.query(`SELECT r.* FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.state<>'new' AND r.due_at<=$2 AND r.suspended_at IS NULL AND w.archived_at IS NULL ORDER BY r.due_at,r.id LIMIT 100`,[child,now])).rows;
    else if(body.source==='new_words'){
      ensure(today.remaining_new_limit>0,422,'NEW_WORD_LIMIT');
      const available=Number((await one(q,`SELECT count(*) n FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.state='new' AND r.suspended_at IS NULL AND w.archived_at IS NULL`,[child])).n);
      const allowed=Math.min(available,today.remaining_new_limit);ensure(allowed>0,422,'EMPTY_NEW_QUEUE');
      // An orphan final word joins the preceding batch: 17 -> 8 + 9, 9 -> 9.
      const take=newWordsGroupSize(allowed);
      candidates=(await q.query(`SELECT r.* FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.state='new' AND r.suspended_at IS NULL AND w.archived_at IS NULL ORDER BY w.created_at,w.id LIMIT $2`,[child,take])).rows;
    }
    else {
      const filter=body.source==='calendar'?`EXISTS(SELECT 1 FROM mistake_events m WHERE m.child_word_id=r.child_word_id AND m.local_date=$2::date)`:body.source==='manual'?`r.child_word_id=ANY($2::uuid[])`:`EXISTS(SELECT 1 FROM monthly_quiz_items i WHERE i.child_word_id=r.child_word_id AND i.quiz_id=$2::uuid AND i.is_correct=false)`;
      candidates=(await q.query(`SELECT r.* FROM review_cards r JOIN child_words w ON w.id=r.child_word_id WHERE r.child_id=$1 AND r.suspended_at IS NULL AND w.archived_at IS NULL AND ${filter} ORDER BY (r.state='new'),r.due_at,r.id`,[child,body.source==='calendar'?body.date:body.source==='manual'?body.word_ids:body.quiz_id])).rows;
      if(body.source==='manual')ensure(candidates.length===body.word_ids.length,422,'WORD_UNAVAILABLE');
    }
    let newRemaining=today.remaining_new_limit,excluded=0;
    const cards=candidates.filter(card=>{if(card.state!=='new')return true;if(newRemaining>0){newRemaining--;return true;}excluded++;return false;});
    ensure(cards.length>0,422,excluded?'NEW_WORD_LIMIT':'EMPTY_REVIEW_QUEUE');
    await q.query('INSERT INTO daily_activity(child_id,local_date,goal_snapshot,timezone_snapshot) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[child,await this.day(q,c),c.daily_goal,c.timezone]);
    const storedSource=['review','new_words'].includes(body.source)?'scheduled':body.source;
    const s=await one(q,`INSERT INTO study_sessions(child_id,actor_user_id,started_at,expires_at,review_source,source_date,quiz_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[child,actor,now,new Date(now.getTime()+120000),storedSource,body.source==='calendar'?body.date:null,body.source==='quiz'?body.quiz_id:null]);
    for(let i=0;i<cards.length;i++)await q.query('INSERT INTO study_session_items(session_id,child_id,card_id,ordinal,practice_only) VALUES($1,$2,$3,$4,$5)',[s.id,child,cards[i].id,i+1,body.source!=='scheduled'&&cards[i].state!=='new'&&new Date(cards[i].due_at)>now]);
    return {id:s.id,child_id:child,expires_at:s.expires_at,lease_generation:s.lease_generation,status:s.status,source:body.source,excluded_new_words:excluded,total:cards.length};
  });}
  private async session(q:Sql,actor:string,id:string){let s=await one(q,'SELECT * FROM study_sessions WHERE id=$1',[uuid(id)]);ensure(s,404,'SESSION_NOT_FOUND');const c=await this.child(q,actor,s.child_id);s=await one(q,'SELECT * FROM study_sessions WHERE id=$1',[id]);ensure(s.actor_user_id===actor,403,'SESSION_NOT_OWNED');return {s,c};}
  private live(s:Row,generation:number){ensure(s.status==='active'&&new Date(s.expires_at)>this.clock()&&s.lease_generation===generation,409,'SESSION_EXPIRED');}
  async heartbeat(actor:string,id:string,body:any,end=false){return this.tx(async q=>{const {s}=await this.session(q,actor,id);this.live(s,integer(body.lease_generation));return one(q,end?`UPDATE study_sessions SET status='ended',ended_at=$2 WHERE id=$1 RETURNING id,status,expires_at,lease_generation`:`UPDATE study_sessions SET expires_at=$2 WHERE id=$1 RETURNING id,status,expires_at,lease_generation`,[id,end?this.clock():new Date(this.clock().getTime()+120000)]);});}
  async cards(actor:string,id:string,query:any={}){return this.tx(async q=>{const {s}=await this.session(q,actor,id);this.live(s,s.lease_generation);await q.query('DELETE FROM study_session_items i USING review_cards r,child_words w WHERE i.session_id=$1 AND i.card_id=r.id AND r.child_word_id=w.id AND i.answered_event_id IS NULL AND (r.suspended_at IS NOT NULL OR w.archived_at IS NOT NULL)',[id]);const limit=pageSize(query.limit),cursor=query.cursor===undefined?0:Number(query.cursor);ensure(Number.isSafeInteger(cursor)&&cursor>=0,422,'INVALID_CURSOR');
    const rows=(await q.query(`SELECT r.id,r.version,r.state,r.due_at,r.child_word_id,w.version AS word_version,w.lemma,w.part_of_speech,w.ipa_gb,w.ipa_us,(SELECT json_build_object('id',e.id,'content_version',e.content_version,'text_en',e.text_en) FROM sentences e JOIN sentence_targets t ON t.sentence_id=e.id WHERE t.child_word_id=w.id AND e.status='validated' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) example,i.practice_only,i.ordinal FROM study_session_items i JOIN review_cards r ON r.id=i.card_id JOIN child_words w ON w.id=r.child_word_id WHERE i.session_id=$1 AND i.answered_event_id IS NULL AND i.ordinal>$2 ORDER BY i.ordinal LIMIT $3`,[id,cursor,limit+1])).rows;
    const counts=await one(q,'SELECT count(*)::int total,count(*) FILTER(WHERE answered_event_id IS NULL)::int remaining FROM study_session_items WHERE session_id=$1',[id]);return {items:rows.slice(0,limit),next_cursor:rows.length>limit?String(rows[limit-1].ordinal):null,total:counts.total,remaining:counts.remaining};});}

  async review(actor:string,body:any){return this.tx(async q=>{
    const {s,c}=await this.session(q,actor,body.session_id),digest=hash(stable(body));uuid(body.event_id);uuid(body.card_id);
    const previous=await one(q,'SELECT * FROM review_logs WHERE child_id=$1 AND event_id=$2',[c.id,body.event_id]);
    if(previous){ensure(previous.actor_user_id===actor&&previous.request_hash===digest,409,'EVENT_CONFLICT');return previous.response_snapshot;}
    this.live(s,integer(body.lease_generation));ensure(['again','hard','good','easy'].includes(body.rating),422,'INVALID_RATING');
    const card=await one(q,`SELECT r.*,i.answered_event_id,i.practice_only,w.archived_at FROM review_cards r JOIN child_words w ON w.id=r.child_word_id JOIN study_session_items i ON i.card_id=r.id WHERE i.session_id=$1 AND r.id=$2 AND r.child_id=$3 FOR UPDATE OF r`,[s.id,body.card_id,c.id]);
    ensure(card&&!card.answered_event_id&&card.version===integer(body.expected_version),409,'CARD_CONFLICT');ensure(!card.suspended_at&&!card.archived_at,409,'WORD_UNAVAILABLE');
    ensure(card.scheduler_version===this.scheduler.version&&card.parameter_version===this.scheduler.parameterVersion,409,'SCHEDULER_VERSION_MISMATCH');
    const day=await this.day(q,c),now=this.clock(),today=await this.todayDto(q,c);
    if(card.state==='new')ensure(today.remaining_new_limit>0,409,'NEW_WORD_LIMIT');
    const next=card.practice_only?{state:card.scheduler_state,label:card.state,due:new Date(card.due_at)}:this.scheduler.next(card.scheduler_state,body.rating,now),version=card.version+(card.practice_only?0:1),word=await one(q,'SELECT lemma,meaning_zh,part_of_speech,sense_key,version FROM child_words WHERE id=$1',[card.child_word_id]);
    if(!card.practice_only)await q.query('UPDATE review_cards SET scheduler_state=$2,state=$3,due_at=$4,last_review_at=$5,version=version+1 WHERE id=$1',[card.id,JSON.stringify(next.state),next.label,next.due,now]);
    await q.query('INSERT INTO daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[c.id,day,card.id,card.child_word_id,now,card.state==='new']);
    await q.query(`INSERT INTO daily_activity(child_id,local_date,distinct_words,new_words,goal_snapshot,timezone_snapshot) SELECT $1,$2,count(*)::int,count(*) FILTER(WHERE was_new)::int,$3,$4 FROM daily_word_activity WHERE child_id=$1 AND local_date=$2 ON CONFLICT(child_id,local_date) DO UPDATE SET distinct_words=excluded.distinct_words,new_words=excluded.new_words,updated_at=now()`,[c.id,day,c.daily_goal,c.timezone]);
    await this.awardMakeupMilestones(q,c.id,day);
    const result={event_id:body.event_id,card_id:card.id,version,due_at:next.due.toISOString(),state:next.label,practice_only:card.practice_only,today:await this.todayDto(q,c)};
    const log=await one(q,`INSERT INTO review_logs(child_id,card_id,session_id,actor_user_id,event_id,request_hash,rating,reviewed_at,local_date,timezone_snapshot,before_version,after_version,word_snapshot,before_state,after_state,response_snapshot,practice_only,review_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,[c.id,card.id,s.id,actor,body.event_id,digest,body.rating,now,day,c.timezone,card.version,version,JSON.stringify(word),JSON.stringify(card.scheduler_state),JSON.stringify(next.state),JSON.stringify(result),card.practice_only,s.review_source]);
    await q.query('UPDATE study_session_items SET answered_event_id=$3 WHERE session_id=$1 AND card_id=$2',[s.id,card.id,body.event_id]);
    if(body.rating==='again')await q.query(`INSERT INTO mistake_events(child_id,child_word_id,source,review_log_id,reason,occurred_at,local_date,timezone_snapshot,word_snapshot,answer_snapshot) VALUES($1,$2,'review',$3,'incorrect',$4,$5,$6,$7,$8)`,[c.id,card.child_word_id,log.id,now,day,c.timezone,JSON.stringify(word),JSON.stringify({rating:body.rating})]);
    return result;
  });}
}
