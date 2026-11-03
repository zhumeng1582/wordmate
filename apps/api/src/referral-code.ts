import {DomainError,ensure} from './errors.ts';

/** Creates a WeChat mini-program code for the authenticated user's referral code. */
export class ReferralCodeImage {
 private token?:{value:string;expires:number};
 private cache=new Map<string,{base64:string;mime:string;expires:number}>();
 private env:Record<string,string|undefined>;private fetcher:typeof fetch;
 constructor(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch){this.env=env;this.fetcher=fetcher;}
 async create(code:string,requestId?:string){
  ensure(/^[a-zA-Z0-9_-]{6,32}$/.test(code),422,'REFERRAL_CODE_INVALID');
  const cached=this.cache.get(code);if(cached&&cached.expires>Date.now())return {code,base64:cached.base64,mime:cached.mime};
  ensure(this.env.WECHAT_APP_ID&&this.env.WECHAT_APP_SECRET,503,'WECHAT_NOT_CONFIGURED');
  let stage='token',upstreamCode:number|undefined;
  try{
   if(!this.token||this.token.expires<=Date.now()){
    const response=await this.fetcher('https://api.weixin.qq.com/cgi-bin/stable_token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credential',appid:this.env.WECHAT_APP_ID,secret:this.env.WECHAT_APP_SECRET,force_refresh:false}),signal:AbortSignal.timeout(10000)});
    const value=await response.json() as any;if(Number.isInteger(value.errcode))upstreamCode=value.errcode;ensure(response.ok&&typeof value.access_token==='string'&&typeof value.expires_in==='number',503,'REFERRAL_CODE_UNAVAILABLE');
    this.token={value:value.access_token,expires:Date.now()+Math.max(1,value.expires_in-120)*1000};
   }
   stage='code';upstreamCode=undefined;
   const endpoint=new URL('https://api.weixin.qq.com/wxa/getwxacodeunlimit');endpoint.searchParams.set('access_token',this.token.value);
   const version=this.env.WECHAT_QRCODE_ENV||'release';
   const request=(env_version:string,check_path:boolean)=>this.fetcher(endpoint.toString(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scene:code,page:'pages/home/index',width:280,check_path,env_version}),signal:AbortSignal.timeout(10000)});
   let response=await request(version,true);
   let type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(response.ok&&type==='application/json'){
    const result=await response.json() as {errcode?:number};if(Number.isInteger(result.errcode))upstreamCode=result.errcode;
    // WeChat checks the published page even for trial codes. An unpublished app
    // can generate a trial code only when the published-page check is disabled.
    if(result.errcode===41030){response=await request(version==='release'?'trial':version,false);type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();upstreamCode=undefined;if(response.ok&&type==='application/json'){const fallback=await response.json() as {errcode?:number};if(Number.isInteger(fallback.errcode))upstreamCode=fallback.errcode;}}
   }
   ensure(response.ok&&['image/png','image/jpeg'].includes(type),503,'REFERRAL_CODE_UNAVAILABLE');
   const bytes=Buffer.from(await response.arrayBuffer());ensure(bytes.length>0&&bytes.length<=512*1024,503,'REFERRAL_CODE_UNAVAILABLE');
   const base64=bytes.toString('base64');if(this.cache.size>=200)this.cache.delete(this.cache.keys().next().value!);this.cache.set(code,{base64,mime:type,expires:Date.now()+6*3600000});return {code,base64,mime:type};
  }catch{this.token=undefined;console.warn(JSON.stringify({event:'referral_code_failure',request_id:requestId||undefined,stage,upstream_code:upstreamCode}));throw new DomainError(503,'REFERRAL_CODE_UNAVAILABLE');}
 }
}
