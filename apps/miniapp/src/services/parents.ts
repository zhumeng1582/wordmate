export type ParentProfile={id:string;display_name:string;version:number;avatar_path:string|null;user_id?:string;is_self?:boolean;role?:'owner'|'parent'};
export type FamilyInvite={id:string;status:string;expires_at:string;applicant?:string;applicant_profile?:ParentProfile|null};
export function invitationState(invite:FamilyInvite,now=Date.now()){
 if(['pending','claimed'].includes(invite.status)&&new Date(invite.expires_at).getTime()<=now)return 'expired';
 return invite.status;
}
export const liveInvitations=(items:FamilyInvite[],now=Date.now())=>items.filter(item=>['pending','claimed'].includes(invitationState(item,now)));
export const parentName=(profile:Pick<ParentProfile,'display_name'>)=>profile.display_name.replace('（开发）','').trim()||'家长';
