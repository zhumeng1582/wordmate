const REFERRAL_TTL_MS=7*24*60*60*1000;
export function referralFromLaunch(query:any):string{
 let scene='';try{scene=typeof query?.scene==='string'?decodeURIComponent(query.scene):'';}catch{}
 const value=typeof query?.ref==='string'?query.ref:scene;
 return /^[a-zA-Z0-9_-]{6,32}$/.test(value)?value.toLowerCase():'';
}
export function validPendingReferral(value:any,now=Date.now()):string{
 if(!value||typeof value!=='object'||typeof value.code!=='string'||!Number.isFinite(value.capturedAt))return '';
 if(value.capturedAt>now||now-value.capturedAt>=REFERRAL_TTL_MS)return '';
 return /^[a-zA-Z0-9_-]{6,32}$/.test(value.code)?value.code.toLowerCase():'';
}
export function pendingReferral(code:string,previous:any,now=Date.now()){
 return validPendingReferral(previous,now)===code?previous:{code,capturedAt:now};
}
