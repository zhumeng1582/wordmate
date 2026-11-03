import {connect} from './database';
import {applyMigrations,baselineMigrations,migrationStatus} from './migration-ledger';
async function main(){
 const args=process.argv.slice(2),mode=args[0]??'status';
 if(!['status','apply','baseline'].includes(mode))throw Error('Use status, apply, or baseline');
 if(mode==='baseline'&&(!/^\d{3}$/.test(args[1]??'')||args[2]!=='--confirm-schema-verified'||args.length!==3))throw Error('Baseline requires a verified version and --confirm-schema-verified');
 if(mode!=='baseline'&&args.length>1)throw Error('Unexpected arguments');
 const {db,source}=await connect(process.env.DATABASE_URL??'',{initializeLocal:false});try{
  if(mode==='status')console.log(JSON.stringify(await migrationStatus(db)));
  else if(mode==='apply')console.log(JSON.stringify({applied:await applyMigrations(db)}));
  else{await baselineMigrations(db,Number(args[1]));console.log(JSON.stringify({baseline:Number(args[1])}));}
 }finally{await source.destroy();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Migration failed');process.exitCode=1;});
