export type FamilyInviteNotice={id:string;name:string;state:'waiting'|'approved'|'unavailable'};
type Tracking={familyId:string;name?:string;account:string};
type Application={family_id:string;family_name?:string};
type Family={id:string;name?:string};
type AccountInfo={families?:Family[];family_applications?:Application[]};
type Result={notice:FamilyInviteNotice|null;clear?:true;track?:Tracking};

/** Resolves the notice without modifying storage, so callers can discard stale responses. */
export function familyInviteStatus(data:AccountInfo,saved:Tracking|null,account:string,currentFamily:string):Result{
 const tracked=saved?.account===account&&saved.familyId?saved:null;
 const applications=Array.isArray(data.family_applications)?data.family_applications:[];
 const pending=tracked?applications.find(item=>item.family_id===tracked.familyId):applications[0];
 const membership=tracked&&Array.isArray(data.families)?data.families.find(item=>item.id===tracked.familyId):null;
 if(membership&&currentFamily===membership.id)return {notice:null,clear:true};
 if(membership)return {notice:{id:membership.id,name:membership.name||tracked?.name||'家庭',state:'approved'}};
 if(pending)return {notice:{id:pending.family_id,name:pending.family_name||tracked?.name||'家庭',state:'waiting'},...(!tracked?{track:{familyId:pending.family_id,name:pending.family_name||'家庭',account}}:{})};
 if(tracked&&Array.isArray(data.families)&&Array.isArray(data.family_applications))return {notice:{id:tracked.familyId,name:tracked.name||'家庭',state:'unavailable'}};
 return {notice:null};
}
