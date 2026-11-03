const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function git(args){const result=spawnSync('git',args,{cwd:root,encoding:null,maxBuffer:64*1024*1024});if(result.status!==0)throw Error('Cannot read Git provenance; build from a Git checkout.');return result.stdout;}
function sourceProvenance(){
 const commit=git(['rev-parse','HEAD']).toString().trim();
 const diff=git(['diff','--binary','HEAD','--']);
 const files=git(['ls-files','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean).sort();
 const hash=crypto.createHash('sha256').update('wordmate-source-v1\0').update(commit).update('\0').update(diff);
 for(const file of files){const full=path.join(root,file),stat=fs.lstatSync(full);hash.update('\0').update(file).update('\0');if(stat.isSymbolicLink())hash.update('symlink\0').update(fs.readlinkSync(full));else if(stat.isFile())hash.update('file\0').update(fs.readFileSync(full));else throw Error('Unexpected untracked entry');}
 return {source_commit:commit,source_fingerprint:hash.digest('hex'),includes_uncommitted_changes:diff.length>0||files.length>0};
}
function ensureSourceUnchanged(before,after){if(before.source_fingerprint!==after.source_fingerprint)throw Error('源码在构建期间发生变化，请重新构建。');}
module.exports={sourceProvenance,ensureSourceUnchanged};
