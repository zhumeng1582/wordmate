// Refresh the whole visible window, then replace it once. Returning from another
// page must not collapse a long list back to its first page and move the scroll.
export async function refreshVisiblePages<T extends {items:any[];next_cursor:string|null}>(read:(cursor?:string)=>Promise<T>,count:number,current:()=>boolean,start?:string):Promise<T|null>{
 let cursor=start,first:T|undefined;const items:any[]=[],seen=new Set<string>();
 do{
  if(!current())return null;
  const page=await read(cursor);if(!current())return null;
  first??=page;items.push(...page.items);cursor=page.next_cursor??undefined;
  if(!cursor||seen.has(cursor)||!page.items.length)break;seen.add(cursor);
 }while(items.length<count);
 return {...first!,items,next_cursor:cursor??null};
}
