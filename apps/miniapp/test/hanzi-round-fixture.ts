export function roundFixture(read:(path:string,method:string,body:any)=>Promise<any>,options:{failFirstAnswer?:boolean}={}){
 let round:any=null,lease:any=null,fail=options.failFirstAnswer;const dto=()=>({...round,total_count:round.items.length,answered_count:round.items.filter((x:any)=>x.action).length,current:round.items.find((x:any)=>!x.action)||null,items:round.items.filter((x:any)=>!x.action).slice(0,100),correct_count:round.items.filter((x:any)=>x.correct===true).length,wrong_count:round.items.filter((x:any)=>x.correct===false).length});
 return async(path:string,method:string,body:any)=>{
  if(path.endsWith('/hanzi-books'))return {items:[{id:'hanzi-default',name:'我的汉字本'}]};
  if(!path.includes('/hanzi-study-rounds'))return read(path,method,body);
  const base=path.endsWith('/hanzi-study-rounds');
  if(base&&method==='GET')return {round:round&&round.status==='in_progress'?dto():null};
  if(base&&method==='POST'){
   const all=(await read('/fixture-characters','GET',body)).items;round={id:'round',source:body.source,book_id:body.book_id??null,status:'in_progress',version:1,active_session:null,items:body.ids.map((id:string,i:number)=>({...(all.find((x:any)=>x.id===id)||{character:id}),ordinal:i+1,hanzi_id:id,action:null}))};lease={id:'lease',lease_generation:1};round.active_session={id:lease.id,owner_name:'家人'};return {round:dto(),session:lease};
  }
  if(path.endsWith('/answer')){if(fail){fail=false;throw Error('NETWORK_TIMEOUT');}const item=round.items.find((x:any)=>x.ordinal===body.ordinal);item.action=body.action;item.correct=body.correct;if(round.items.every((x:any)=>x.action))round.status='completed';return dto();}
  if(path.endsWith('/end')){if(round)round.active_session=null;return {ended:true};}
  if(path.endsWith('/heartbeat'))return {ended:false};
  if(path.endsWith('/resume')||path.endsWith('/takeover')){lease={id:'lease2',lease_generation:2};round.active_session={id:lease.id,owner_name:'家人'};return {round:dto(),session:lease};}
  if(path.endsWith('/abandon')){round.status='abandoned';return round;}
  return dto();
 };
}
