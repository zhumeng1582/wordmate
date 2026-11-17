interface AccountStorage {get(key:string):any;set(key:string,value:any):void;remove(key:string):void;keys():string[];clear():void}
type Recovery={userId:string;token:string;family:string;child:string;tokens?:string[]};
// An expired session is recoverable only after WeChat confirms the same user ID.
// Never use the previous child's context while signed out.
export function suspendAccount(storage:AccountStorage){
 const token=storage.get('access_token');
 try{if(token)storage.set('expired_account',{userId:storage.get('account_user_id')||'',token,family:storage.get('family_id')||'',child:storage.get('child_id')||''} satisfies Recovery);}
 finally{for(const key of ['access_token','family_id','child_id','families'])storage.remove(key);}
}
function rebind(value:any,oldToken:string,newToken:string):any{
 if(typeof value==='string')return value===oldToken?newToken:value;
 if(Array.isArray(value))return value.map(item=>rebind(item,oldToken,newToken));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rebind(item,oldToken,newToken)]));
 return value;
}
export function establishAccount(storage:AccountStorage,userId:string,token:string,families:any[]){
 const recovery=storage.get('expired_account') as Recovery|undefined;
 const oldUser=storage.get('account_user_id')||recovery?.userId,oldToken=storage.get('access_token')||recovery?.token;
 if(userId&&oldUser===userId&&oldToken){
  const tokens=[...new Set<string>([oldToken,...(recovery?.tokens??[]),token])];
  const saved:Recovery=recovery??{userId,token:oldToken,family:storage.get('family_id')||'',child:storage.get('child_id')||''};
  // Keep aliases until migration finishes: a storage failure can be retried even
  // when some queues have already moved to a newly issued token.
  storage.set('expired_account',{...saved,tokens});
  // Session-scoped learning queues, pending event IDs and preferences survive renewal.
  for(const key of storage.keys()){
   if(['access_token','expired_account'].includes(key))continue;
   let nextKey=key,value=storage.get(key);
   for(const previous of tokens){nextKey=nextKey.split(previous).join(token);value=rebind(value,previous,token);}
   storage.set(nextKey,value);if(nextKey!==key)storage.remove(key);
  }
  if(recovery){storage.set('family_id',recovery.family);storage.set('child_id',recovery.child);}
 }else storage.clear();
 storage.set('account_user_id',userId);storage.set('access_token',token);storage.set('families',families);
 storage.remove('expired_account');
}
