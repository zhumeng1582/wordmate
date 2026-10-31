// Run only during an operator-controlled backup/restore maintenance window.
const fs=require('node:fs'),path=require('node:path');
const {connect}=require('../apps/api/dist/database.js');
const {Lifecycle}=require('../apps/api/dist/lifecycle.js');
const {audioRuntime}=require('../apps/api/dist/audio-runtime.js');
const {checkinShareImageCache}=require('../apps/api/dist/checkin-share-images.js');
(async()=>{
 const [operation,file]=process.argv.slice(2);
 if(!['export','replay'].includes(operation)||!file)throw Error('Usage: node --env-file=.env scripts/deletion-ledger.cjs export|replay FILE');
 if(operation==='replay'&&process.env.WORDMATE_MAINTENANCE!=='1')throw Error('Replay requires WORDMATE_MAINTENANCE=1 with public traffic and workers stopped');
 const connection=await connect(process.env.DATABASE_URL||'');
 try{
  if(operation==='export'){
   const ledger=await new Lifecycle(connection.db).exportLedger();fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,JSON.stringify(ledger),{mode:0o600});fs.chmodSync(file,0o600);console.log(JSON.stringify({exported:true,entries:ledger.entries.length}));
  }else{
   if(fs.statSync(file).size>10*1024*1024)throw Error('Ledger exceeds size limit');
   const runtime=await audioRuntime(process.env),images=await checkinShareImageCache(process.env,connection.db),life=new Lifecycle(connection.db,runtime,images);
   await life.restoreLedger(JSON.parse(fs.readFileSync(file,'utf8')));
   for(let n=0;n<100000;n++){const pending=await connection.db.query("SELECT 1 FROM wordmate.lifecycle_jobs WHERE status='queued' AND next_attempt_at<=now() OR status='running' AND lease_until<=now() LIMIT 1");if(!pending.rows.length)break;await life.processOne();}
   const result=(await connection.db.query("SELECT (SELECT count(*)::int FROM wordmate.lifecycle_jobs WHERE status<>'succeeded') unfinished,(SELECT count(*)::int FROM wordmate.families f JOIN wordmate.users u ON u.id=f.owner_user_id WHERE u.status='deleted') families_requiring_owner_reconciliation")).rows[0];
   console.log(JSON.stringify(result));if(result.unfinished||result.families_requiring_owner_reconciliation)process.exitCode=1;
  }
 }finally{await connection.source.destroy();}
})().catch(()=>{console.error('Deletion ledger operation failed. Keep restored service offline; check configuration, ledger and cleanup permissions.');process.exitCode=1;});
