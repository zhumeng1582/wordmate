import type { Dictionary, Identity, Candidate, Scheduler } from './ports.ts';
import { DomainError, ensure } from './errors.ts';
export class WechatIdentity implements Identity {
  private appId: string; private secret: string;
  constructor(appId: string, secret: string) { ensure(appId && secret,503,'WECHAT_NOT_CONFIGURED');this.appId=appId;this.secret=secret; }
  async exchange(code: string) {
    const url=new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search=new URLSearchParams({appid:this.appId,secret:this.secret,js_code:code,grant_type:'authorization_code'}).toString();
    let result: any;
    try { const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'}); if(!response.ok)throw Error(); result=await response.json(); }
    catch { throw new DomainError(503,'WECHAT_UNAVAILABLE'); }
    ensure(typeof result.openid==='string' && !result.errcode,401,'WECHAT_CODE_INVALID');
    // session_key is deliberately neither returned nor logged.
    return {openId:result.openid,displayName:'家长'};
  }
}
export class DevIdentity implements Identity {
  async exchange(code: string) { ensure(['dev-dad','dev-mom','dev-outsider'].includes(code),401,'INVALID_DEV_IDENTITY');return {openId:code,displayName:code==='dev-dad'?'爸爸（开发）':code==='dev-mom'?'妈妈（开发）':'测试用户'}; }
}
export class FixtureDictionary implements Dictionary {
  async lookup(raw: string): Promise<Candidate[]> {
    const data: Record<string,[string,string]>={apple:['noun','苹果'],airport:['noun','机场'],luggage:['noun','行李'],delay:['noun','延迟'],book:['noun','书'],read:['verb','阅读'],cat:['noun','猫'],dog:['noun','狗'],school:['noun','学校'],travel:['verb','旅行']};
    const lemma=raw.trim().toLowerCase(), entry=data[lemma];
    return entry ? [{candidate_id:`fixture:${lemma}:1`,lemma,part_of_speech:entry[0],sense_key:`fixture:${lemma}:1`,meaning_zh:entry[1],source:'development-fixture',ipa_gb:null,ipa_us:null}]:[];
  }
}
export class UnconfiguredDictionary implements Dictionary { async lookup(): Promise<Candidate[]> { throw new DomainError(503,'DICTIONARY_NOT_CONFIGURED'); } }
// Lazy import keeps pure business tests separate from uninstalled production dependencies.
export async function createScheduler(): Promise<Scheduler> {
  const {fsrs,createEmptyCard,Rating,State}=await import('ts-fsrs');
  const engine=fsrs({request_retention:0.9,enable_fuzz:false});
  const labels: Record<number,string>={[State.New]:'new',[State.Learning]:'learning',[State.Review]:'review',[State.Relearning]:'relearning'};
  return {version:'ts-fsrs@5.2.3',parameterVersion:'fsrs-default-5.2.3-retention90-no-fuzz',
    empty:now=>createEmptyCard(now),
    next:(saved,rating,now)=>{
      const card={...saved,due:new Date(saved.due),last_review:saved.last_review ? new Date(saved.last_review):undefined};
      const grade=({again:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy} as const)[rating];
      const next=engine.repeat(card,now)[grade].card;
      return {state:next,label:labels[next.state],due:next.due};
    }};
}
