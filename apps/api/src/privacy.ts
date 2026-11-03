import {createHash} from 'node:crypto';
import {ensure} from './errors.ts';
import type {Database,Sql} from './ports.ts';
export const PRIVACY_VERSION='2026-11-03.1';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export class Privacy {
 readonly policy:any;private db:Database;private development:boolean;
 constructor(db:Database,env:Record<string,string|undefined>){
  this.db=db;this.development=env.NODE_ENV==='development';
  const llm=env.LLM_PROVIDER||'qwen',llmName=({qwen:'阿里云百炼/通义千问',openai:'OpenAI',deepseek:'DeepSeek'} as Record<string,string>)[llm]||'未配置的服务商',vendorReady=llm==='qwen'||!!env.PRIVACY_LLM_PROCESSING_REGION?.trim()&&/^https:\/\//.test(env.PRIVACY_LLM_POLICY_URL||'');
  const days=Number(env.PRIVACY_BACKUP_RETENTION_DAYS),ready=vendorReady&&!!env.PRIVACY_OPERATOR_NAME?.trim()&&!!env.PRIVACY_CONTACT?.trim()&&Number.isSafeInteger(days)&&days>=1&&days<=365;
  const content={version:PRIVACY_VERSION,operator:env.PRIVACY_OPERATOR_NAME?.trim()||'运营者信息待配置',contact:env.PRIVACY_CONTACT?.trim()||'联系渠道待配置',backup_retention_days:ready?days:null,publishable:ready,llm_provider:llmName,llm_processing_region:llm==='qwen'?'按北京工作空间配置':env.PRIVACY_LLM_PROCESSING_REGION||'处理地区待确认',sections:[
   {title:'账号与家庭共学',text:'微信登录后，我们保存账号标识及家庭成员关系。你可主动选择微信头像或其他头像、填写家长昵称，用于家庭内识别陪学成员；头像和昵称仅向本人、有效家庭成员及处理加入申请的家庭管理员展示，可修改或清除，注销账号时清除。家长为孩子填写昵称、可选年级和性别，保存词本、复习、错题、月测、学习目标与发音设置。请使用昵称，不提交学校、联系方式或无关身份信息。获批家庭成员可共同访问本家庭孩子的学习资料。'},
   {title:'AI、图片与语音',text:`主动录入的词汇或文本会发送给 ${llmName} 生成音标、释义、例句及翻译；图片由你选择的系统或私有图片模型（千问或 OpenAI）识别，播放文本可能发送给阿里云 CosyVoice。生成内容可能出错。原导入文件不长期保存，识别重试缓存最长约 25 小时；保存的学习内容持续保留至删除。生成音频与背景图存于私有 OSS，需授权访问。单词小老师会将当前词义和提问发送给所选文字服务；聊天记录、生成图片和讲解音频保存在服务端，家庭成员可访问，并可删除聊天。语音提问的录音发送给阿里云语音识别，仅在处理时使用，识别文字需确认后才能发送。联网搜索的问题发送给阿里云搜索服务；生成插图时当前单词及词义发送给阿里云图片服务。请勿在聊天中输入真实姓名、学校、联系方式等个人信息。`},
   {title:'AI 配置与消费',text:'选择自带 Key 后，录入内容发送给你选定的千问、DeepSeek 或 OpenAI 服务，适用该服务商的处理地区和政策；我们只在服务端加密保存 API Key，用于你主动发起的调用。你可以替换或删除 Key，注销时清除 Key。私有 Key 不可用时不会自动使用系统额度。文字与图片模型独立配置且默认使用系统模型。系统 AI 使用家庭共享余额，每个家庭一次性赠送 20 元，赠送额度不能退款；有效家庭成员均可消耗共享额度、查看系统消费和家庭账目，私有 Key 由各家长单独保管。充值时选定家庭，退款也从原家庭回收对应额度。文字与图片按公示的输入、输出和缓存用量价格结算，单词与例句及讲解的新发音按输入字符和公示语音价格从家庭共享余额结算；语音识别按音频时长、联网搜索按文字用量和搜索次数、生成插图按张数使用家庭共享额度，价格以用量页面和实际配置为准；生成并保存成功后扣费，已生成音频重复播放不重复扣费；平台内部失败尝试不向你扣款。最少消费、充值与退款账目不包含学习正文或密钥，按账务需要保留；账目关联随机账号标识；充值订单加密保留付款方微信标识，以便注销后仍可核实交易和退款，家庭账目仅对该家庭有效成员开放，Key 不向家庭成员展示。解散家庭前须处理真实充值余额、欠款、冻结金额和待核实支付；剩余赠送额度随家庭解散失效。家长退出或注销不会带走其他成员共享的钱。音色试听为系统提供的固定示例，不扣家庭额度。'},
   {title:'分享与邀请',text:'家庭邀请须经管理员批准。好友邀请会记录新用户首次邀请归因，不授予家庭权限。成果卡由你预览后主动转发，仅含日期、学习统计、鼓励语和背景。CSV 包含所选词汇及例句，不含账号和学习进度。你可以主动公开词本名称、作者名、简介、分类、单词、释义和例句，其他用户可搜索、预览并加入独立副本；不公开孩子或家庭信息。可随时停止共享，已加入的副本及学习进度保留；停止共享或删除源数据不远程删除其他家庭的独立副本。请勿共享无权分发的材料或个人资料。'},
   {title:'第三方服务',text:`微信提供登录和小程序运行；${llmName} 处理录入文本，阿里云百炼和 CosyVoice 处理图片或朗读文本；阿里云 OSS 保存生成文件。文本模型处理地区：${llm==='qwen'?'按北京工作空间配置':env.PRIVACY_LLM_PROCESSING_REGION||'待确认'}。供应商政策与服务条款请见下列链接。`},
   {title:'你的选择与删除',text:'你可拒绝或撤回同意。撤回后停止本账号学习、导入和生成，撤销陪学会话；仍可管理隐私、退出家庭及提出删除请求。撤回本账号同意不会删除其他监护人共同管理的孩子资料。管理员可删除孩子；唯一有效成员的管理员可解散家庭，其他情况先移除成员或转交。删除先冻结访问，再后台清理文件和记录；失败可查询和重试。账号注销清除微信身份与本机存储，不删除其他家长保留的家庭学习记录。系统临时文件由微信管理，已保存到相册或外发的副本需由你自行删除。'},
   {title:'保留与备份',text:`导入缓存按期清理；学习数据保留至你按权限删除。为限制付费服务滥用，最小调用用量记录按约 48 小时留存并定时清理，包含账号标识摘要、随机任务及孩子标识、调用类别与时间，不含录入文本；删除孩子或注销账号不会立即重置此短期额度。未完成的删除任务保持冻结，完成后只保留最少删除凭据及目标 UUID，用于恢复备份后重放删除。${ready?`生产备份最长保留 ${days} 天；恢复后须先重放删除清单，再开放服务。`:'生产备份期限尚未配置，本政策不能作为正式发布版本。'}已经转发给他人的文件和副本无法由本服务远程撤回。`},
   {title:'监护人声明',text:'本服务供家长陪伴孩子学习。提交孩子学习资料前，你需确认自己是监护人或已获监护人授权，并同意本政策所述处理。我们记录同意时的政策版本、内容摘要、监护人声明和时间；实质更新后需要重新同意。'}
  ],providers:[{name:'微信隐私保护指引',url:'https://weixin.qq.com/cgi-bin/readtemplate?lang=zh_CN&t=weixin_agreement&s=privacy'},{name:'阿里云隐私政策',url:'https://terms.aliyun.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202107091605_49213_5_4_26149.html'}]};
  if(llm!=='qwen'&&env.PRIVACY_LLM_POLICY_URL)content.providers.push({name:`${llmName} 隐私政策`,url:env.PRIVACY_LLM_POLICY_URL});
  content.providers.push({name:'DeepSeek 隐私政策',url:'https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html'},{name:'OpenAI 隐私政策',url:'https://openai.com/policies/privacy-policy/'});
  this.policy={...content,hash:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
 }
 async consent(actor:string){return this.db.transaction(q=>this.status(q,actor));}
 async status(q:Sql,actor:string){const event=await one(q,'SELECT policy_version,policy_hash,action,guardian_confirmed,created_at FROM wordmate.privacy_consent_events WHERE user_id=$1 ORDER BY id DESC LIMIT 1',[actor]);return {accepted:event?.action==='accepted'&&event.policy_hash===this.policy.hash&&event.guardian_confirmed===true,policy_version:this.policy.version,policy_hash:this.policy.hash,last_action:event?.action??null,updated_at:event?.created_at??null};}
 async assertConsent(q:Sql,actor:string){ensure(await one(q,"SELECT 1 FROM wordmate.users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'ACCOUNT_UNAVAILABLE');ensure((await this.status(q,actor)).accepted,403,'PRIVACY_CONSENT_REQUIRED');}
 async accept(actor:string,b:any){
  ensure(this.development||this.policy.publishable,503,'PRIVACY_POLICY_NOT_READY');
  ensure(b.policy_version===this.policy.version&&b.policy_hash===this.policy.hash&&b.guardian_confirmed===true,409,'PRIVACY_POLICY_CHANGED');
  return this.db.transaction(async q=>{ensure(await one(q,"SELECT 1 FROM wordmate.users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'ACCOUNT_UNAVAILABLE');if(!(await this.status(q,actor)).accepted)await q.query("INSERT INTO wordmate.privacy_consent_events(user_id,policy_version,policy_hash,action,guardian_confirmed,policy_snapshot) VALUES($1,$2,$3,'accepted',true,$4)",[actor,this.policy.version,this.policy.hash,JSON.stringify(this.policy)]);await q.query("UPDATE wordmate.generation_jobs SET status='failed',lease_until=NULL WHERE requested_by=$1 AND status='cancelled' AND error_code='PRIVACY_CONSENT_REQUIRED'",[actor]);await q.query("UPDATE wordmate.audio_assets SET status='failed',error_code='PRIVACY_CONSENT_REQUIRED' WHERE id IN (SELECT (payload->>'audio_id')::uuid FROM wordmate.generation_jobs WHERE requested_by=$1 AND kind='audio' AND error_code='PRIVACY_CONSENT_REQUIRED' AND payload ? 'audio_id')",[actor]);return this.status(q,actor);});
 }
 async withdraw(actor:string){return this.db.transaction(async q=>{
  // Keep the family -> user lock order used by business writes and deletion.
  await q.query('SELECT f.id FROM wordmate.families f JOIN wordmate.family_members m ON m.family_id=f.id WHERE m.user_id=$1 ORDER BY f.id FOR UPDATE OF f',[actor]);
  ensure(await one(q,"SELECT 1 FROM wordmate.users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'ACCOUNT_UNAVAILABLE');
  const latest=await this.status(q,actor);if(latest.last_action!=='withdrawn')await q.query("INSERT INTO wordmate.privacy_consent_events(user_id,policy_version,policy_hash,action,guardian_confirmed,policy_snapshot) VALUES($1,$2,$3,'withdrawn',false,$4)",[actor,this.policy.version,this.policy.hash,JSON.stringify(this.policy)]);
  await q.query("UPDATE wordmate.study_sessions SET status='revoked',ended_at=now() WHERE actor_user_id=$1 AND status='active'",[actor]);
  await q.query("UPDATE wordmate.generation_jobs SET status='failed',lease_until=NULL,error_code='PRIVACY_CONSENT_REQUIRED' WHERE requested_by=$1 AND status IN ('queued','running','partial')",[actor]);
  await q.query("UPDATE wordmate.family_invites SET status='revoked' WHERE (created_by=$1 OR claimed_by=$1) AND status IN ('pending','claimed')",[actor]);
  await q.query('UPDATE wordmate.shared_wordbooks SET published=false,version=version+1 WHERE publisher_user_id=$1 AND published',[actor]);
  await q.query("UPDATE wordmate.checkin_share_images SET status='failed',storage_key=NULL,lease_token=NULL,lease_until=NULL,error_code='PRIVACY_CONSENT_REQUIRED',expires_at=now() WHERE requested_by=$1 AND status IN ('pending','processing')",[actor]);
  return this.status(q,actor);
 });}
 async authorizePoster(q:Sql,actor:string,scope:string){
  const child=scope.split(':')[0];
  if(child){const family=await one(q,'SELECT f.id FROM wordmate.families f JOIN wordmate.children c ON c.family_id=f.id WHERE c.id=$1 AND c.archived_at IS NULL AND f.status=\'active\' FOR UPDATE OF f',[child]);ensure(family&&await one(q,"SELECT 1 FROM wordmate.family_members WHERE family_id=$1 AND user_id=$2 AND status='active'",[family?.id,actor]),404,'CHILD_NOT_FOUND');}
  await this.assertConsent(q,actor);
 }
}
