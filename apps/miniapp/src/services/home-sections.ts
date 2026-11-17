export type HomeSections={words:boolean;poems:boolean;hanzi:boolean;sentences:boolean};
const defaults:HomeSections={words:true,poems:true,hanzi:true,sentences:true};
type Store={get(key:string):any;set(key:string,value:any):void};
export function readHomeSections(storage:Store,account:string):HomeSections{
 if(!account)return {...defaults};
 const value=storage.get(`home_sections:${account}`);
 if(!value||typeof value!=='object'||typeof value.words!=='boolean'||typeof value.poems!=='boolean'||typeof value.hanzi!=='boolean'||!(value.words||value.poems||value.hanzi||value.sentences))return {...defaults};
 return {words:value.words,poems:value.poems,hanzi:value.hanzi,sentences:typeof value.sentences==='boolean'?value.sentences:true};
}
export function saveHomeSections(storage:Store,account:string,value:HomeSections){
 if(!account||!(value.words||value.poems||value.hanzi||value.sentences))return false;
 storage.set(`home_sections:${account}`,value);return true;
}

export type HomeSection=keyof HomeSections;
const defaultOrder:HomeSection[]=['words','poems','hanzi','sentences'];
export function readHomeSectionOrder(storage:Store,account:string):HomeSection[]{
 const value=account?storage.get(`home_section_order:${account}`):null;
 const order:HomeSection[]=Array.isArray(value)?value.filter((key,index)=>defaultOrder.includes(key)&&value.indexOf(key)===index):[];
 return [...order,...defaultOrder.filter(key=>!order.includes(key))];
}
export function saveHomeSectionOrder(storage:Store,account:string,order:HomeSection[]){
 if(!account||order.length!==defaultOrder.length||new Set(order).size!==defaultOrder.length||!order.every(key=>defaultOrder.includes(key)))return false;
 storage.set(`home_section_order:${account}`,[...order]);return true;
}
