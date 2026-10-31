interface ContextStorage {get(key:string):any;set(key:string,value:any):void}
export function selectFamilyContext(storage:ContextStorage,id:string){
 if(storage.get('family_id')!==id)storage.set('child_id','');
 storage.set('family_id',id);
}
export function reconcileFamilyChild(storage:ContextStorage,children:{id:string}[]){
 const child=children.find(c=>c.id===storage.get('child_id'))??children[0];
 if(storage.get('child_id')!==(child?.id??''))storage.set('child_id',child?.id??'');
 return child;
}
