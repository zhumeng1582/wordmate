// Build a server release from an explicit allowlist; never includes .env or local data.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {sourceProvenance,ensureSourceUnchanged}=require('./release-provenance.cjs');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2);
if(args.length>1){console.error('Usage: node scripts/prepare-server-release.cjs [api.example.com]');process.exit(1);}
const domain=args[0];
if(domain&&(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)||domain.endsWith('.localhost'))){
 console.error('Use a DNS hostname only: api.example.com, without scheme, port or path.');process.exit(1);
}
const provenance=sourceProvenance();
if(provenance.includes_uncommitted_changes&&process.env.WORDMATE_ALLOW_DIRTY_RELEASE!=='1'){console.error('工作区有未提交的改动。请先固定源码版本，或在确认范围后设置 WORDMATE_ALLOW_DIRTY_RELEASE=1。');process.exit(1);}
const build=spawnSync('corepack',['pnpm','build:api'],{cwd:root,stdio:'inherit'});
if(build.status!==0)process.exit(build.status??1);
const releaseId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
const output=path.join(root,'.local','server-releases',releaseId);
const release=path.join(output,'release');
fs.mkdirSync(release,{recursive:true,mode:0o700});
const files=[
 'package.json','pnpm-lock.yaml','pnpm-workspace.yaml',
 'apps/api/package.json','apps/api/dist','apps/api/migrations',
 'packages/ai/package.json','packages/ai/dist',
 'deliverables/0.1/database/001_schema.sql',
 'scripts/check-production-env.cjs','scripts/deletion-ledger.cjs','scripts/server-backup.cjs',
 'infra/nginx.wordmate.conf.example','infra/wordmate-api.service.example',
 'infra/production.env.example','infra/SERVER-DEPLOYMENT.txt'
];
const manifest=[];
function copy(relative){
 const source=path.join(root,relative),target=path.join(release,relative),stat=fs.lstatSync(source);
 if(stat.isSymbolicLink())throw Error('Release source must not contain symlinks: '+relative);
 if(stat.isDirectory()){for(const name of fs.readdirSync(source).sort())copy(path.join(relative,name));return;}
 if(!stat.isFile())throw Error('Unsupported release source: '+relative);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
 fs.chmodSync(target,0o644);
 manifest.push({path:relative,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')});
}
for(const relative of files)copy(relative);
if(domain){
 const nginx=fs.readFileSync(path.join(release,'infra/nginx.wordmate.conf.example'),'utf8')
  .replaceAll('REPLACE_WITH备案域名',domain)
  // Older distribution Nginx packages do not understand the separate http2 directive.
  .replace('    http2 on;\n','');
 const env=fs.readFileSync(path.join(release,'infra/production.env.example'),'utf8').replaceAll('REPLACE_WITH_DOMAIN',domain);
 for(const [name,value] of [['infra/nginx.wordmate.conf',nginx],['infra/production.env.template',env]]){
  fs.writeFileSync(path.join(release,name),value,{mode:0o600});
  manifest.push({path:name,sha256:crypto.createHash('sha256').update(value).digest('hex')});
 }
}
ensureSourceUnchanged(provenance,sourceProvenance());
fs.writeFileSync(path.join(release,'release-manifest.json'),JSON.stringify({releaseId,domain:domain??null,...provenance,build_node:process.version,files:manifest},null,2)+'\n');
const archive=path.join(output,'wordmate-server.tar.gz');
const tar=spawnSync('tar',['-czf',archive,'-C',release,'.'],{stdio:'inherit'});
if(tar.status!==0)process.exit(tar.status??1);
fs.chmodSync(archive,0o600);
const sha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(archive+'.sha256',sha256+'  wordmate-server.tar.gz\n');
console.log(JSON.stringify({archive,sha256,domain:domain??'pending',files:manifest.length,containsSecrets:false,deployed:false},null,2));
