import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export type ReleaseInfo={id:string|null;source_commit:string|null;source_fingerprint:string|null;integrity:'verified'|'modified'|'unavailable'};
/** A copied or patched release must never claim to be the original build. */
export function readReleaseInfo(root=resolve(__dirname,'../../..')):ReleaseInfo{
 const unavailable:ReleaseInfo={id:null,source_commit:null,source_fingerprint:null,integrity:'unavailable'};
 try{
  const manifest=JSON.parse(readFileSync(resolve(root,'release-manifest.json'),'utf8'));
  if(!Array.isArray(manifest.files)||!manifest.files.some((file:any)=>file.path==='apps/api/dist/main.js'))return unavailable;
  for(const file of manifest.files){
   if(typeof file.path!=='string'||typeof file.sha256!=='string'||!/^[-a-zA-Z0-9_./]+$/.test(file.path)||file.path.split('/').some((part:string)=>part==='..'||!part))return unavailable;
   const actual=createHash('sha256').update(readFileSync(resolve(root,file.path))).digest('hex');
   if(actual!==file.sha256)return {...unavailable,integrity:'modified'};
  }
  return {id:typeof manifest.releaseId==='string'?manifest.releaseId:null,source_commit:typeof manifest.source_commit==='string'?manifest.source_commit:null,source_fingerprint:typeof manifest.source_fingerprint==='string'?manifest.source_fingerprint:null,integrity:'verified'};
 }catch{return unavailable;}
}
