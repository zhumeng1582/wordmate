// Only a definitively expired/missing session may be replaced. Network and permission
// failures must leave the existing session intact for a safe retry.
export async function enterReview(deps:{
 read:()=>any;
 clear:()=>void;
 heartbeat:(session:any)=>Promise<any>;
 create:()=>Promise<any>;
 save:(session:any)=>void;
}){
 let session=deps.read();
 if(session){try{await deps.heartbeat(session);}catch(error){
  if(error instanceof Error&&['SESSION_EXPIRED','SESSION_NOT_FOUND'].includes(error.message)){deps.clear();session=null;}else throw error;
 }}
 if(!session){session=await deps.create();deps.save(session);}
 return session;
}
