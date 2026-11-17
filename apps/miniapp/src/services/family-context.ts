interface ContextStorage {get(key:string):any;set(key:string,value:any):void}
const selectionKey=(storage:ContextStorage,family:string)=>`selected_child:${storage.get('account_user_id')||storage.get('access_token')}:${family}`;
export function selectChildContext(storage:ContextStorage,id:string){
 storage.set('child_id',id);
 const family=storage.get('family_id');if(family)storage.set(selectionKey(storage,family),id);
}
export function selectFamilyContext(storage:ContextStorage,id:string){
 const previous=storage.get('family_id');
 if(previous!==id){
  if(previous&&storage.get('child_id'))storage.set(selectionKey(storage,previous),storage.get('child_id'));
  storage.set('child_id',id?storage.get(selectionKey(storage,id))||'':'');
 }
 storage.set('family_id',id);
}
export function reconcileFamilyChild(storage:ContextStorage,children:{id:string}[]){
 const child=children.find(c=>c.id===storage.get('child_id'))??children[0];
 selectChildContext(storage,child?.id??'');
 return child;
}
export function forgetChildContext(storage:ContextStorage&{keys():string[];remove(key:string):void},id:string){
 for(const key of storage.keys()){
  if(key.split(/[:/]/).includes(id)||key.startsWith('selected_child:')&&storage.get(key)===id)storage.remove(key);
 }
 if(storage.get('child_id')===id)storage.set('child_id','');
}
