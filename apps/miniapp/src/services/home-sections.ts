export type HomeSections={words:boolean;poems:boolean;hanzi:boolean};
const defaults:HomeSections={words:true,poems:true,hanzi:true};
type Store={get(key:string):any;set(key:string,value:any):void};
export function readHomeSections(storage:Store,account:string):HomeSections{
 if(!account)return {...defaults};
 const value=storage.get(`home_sections:${account}`);
 if(!value||typeof value!=='object'||typeof value.words!=='boolean'||typeof value.poems!=='boolean'||typeof value.hanzi!=='boolean'||!(value.words||value.poems||value.hanzi))return {...defaults};
 return {words:value.words,poems:value.poems,hanzi:value.hanzi};
}
export function saveHomeSections(storage:Store,account:string,value:HomeSections){
 if(!account||!(value.words||value.poems||value.hanzi))return false;
 storage.set(`home_sections:${account}`,value);return true;
}
