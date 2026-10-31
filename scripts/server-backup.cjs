const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
process.umask(0o077);
const current=process.env.WORDMATE_CURRENT_RELEASE||'/var/www/wordmate-current',root=process.env.WORDMATE_BACKUP_ROOT||'/var/backups/wordmate';
function command(executable,args,options={}){
 const r=cp.spawnSync(executable,args,{encoding:'utf8',timeout:180000,...options});
 if(r.status!==0)throw Error('Backup operation failed: '+path.basename(executable));
 return r.stdout;
}
function ledger(){
 const dir=path.join(root,'deletion-ledger');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const temp=path.join(dir,'pending-'+crypto.randomUUID()+'.json');
 command('/usr/bin/node',['--env-file='+path.join(current,'production.env'),path.join(current,'scripts/deletion-ledger.cjs'),'export',temp]);
 fs.chmodSync(temp,0o600);fs.renameSync(temp,path.join(dir,'latest.json'));
 return path.join(dir,'latest.json');
}
function prune(days){
 const threshold=Date.now()-days*86400000;
 for(const parent of [root,path.join(root,'daily')]){
  if(!fs.existsSync(parent))continue;
  for(const entry of fs.readdirSync(parent,{withFileTypes:true})){
   if(!entry.isDirectory()||!/^\d{4}-\d{2}-\d{2}(?:T[0-9TZ-]+|\-domain-\d+)$/.test(entry.name))continue;
   const target=path.join(parent,entry.name);
   if(fs.statSync(target).mtimeMs<threshold)fs.rmSync(target,{recursive:true});
  }
 }
}
try{
 const envPath=path.join(current,'production.env'),env=parseEnv(fs.readFileSync(envPath,'utf8'));
 const days=Number(env.PRIVACY_BACKUP_RETENTION_DAYS);
 if(!Number.isInteger(days)||days<1||days>365)throw Error('Invalid backup retention');
 const operation=process.argv[2];
 if(!['backup','ledger'].includes(operation))throw Error('Expected backup or ledger');
 ledger();
 if(operation==='backup'){
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),directory=path.join(root,'daily',stamp);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const url=new URL(env.DATABASE_URL),dump=path.join(directory,'database.dump');
  const pgEnv={PATH:process.env.PATH,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGCONNECT_TIMEOUT:'10',PGSSLMODE:url.searchParams.get('sslmode')||'prefer'};
  command('/usr/lib/postgresql/16/bin/pg_dump',['--no-password','--format=custom','--file',dump],{env:pgEnv});
  command('/usr/lib/postgresql/16/bin/pg_restore',['--list',dump]);
  fs.chmodSync(dump,0o600);
  fs.copyFileSync(envPath,path.join(directory,'runtime.env'));fs.chmodSync(path.join(directory,'runtime.env'),0o600);
  fs.copyFileSync(ledger(),path.join(directory,'deletion-ledger.json'));
  const report={created_at:new Date().toISOString(),release:fs.realpathSync(current),retention_days:days,bytes:fs.statSync(dump).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(dump)).digest('hex')};
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({operation,passed:true,directory,bytes:report.bytes,retention_days:days}));
 }else console.log(JSON.stringify({operation,passed:true}));
 prune(days);
}catch(e){console.error('WORDMATE_BACKUP_FAILED',e.code||e.message);process.exitCode=1;}
