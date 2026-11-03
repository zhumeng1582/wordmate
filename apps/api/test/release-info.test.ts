import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readReleaseInfo} from '../src/release-info.ts';
test('release identity is exposed only when its executable matches the manifest',()=>{
 const root=mkdtempSync(join(tmpdir(),'wordmate-release-'));try{
  assert.equal(readReleaseInfo(root).integrity,'unavailable');mkdirSync(join(root,'apps/api/dist'),{recursive:true});writeFileSync(join(root,'apps/api/dist/main.js'),'build');
  const sha256=createHash('sha256').update('build').digest('hex');writeFileSync(join(root,'release-manifest.json'),JSON.stringify({releaseId:'v1',source_commit:'abc',source_fingerprint:'def',files:[{path:'apps/api/dist/main.js',sha256}]}));
  assert.deepEqual(readReleaseInfo(root),{id:'v1',source_commit:'abc',source_fingerprint:'def',integrity:'verified'});writeFileSync(join(root,'apps/api/dist/referral-code.js'),'code');const codeHash=createHash('sha256').update('code').digest('hex');writeFileSync(join(root,'release-manifest.json'),JSON.stringify({releaseId:'v1',files:[{path:'apps/api/dist/main.js',sha256},{path:'apps/api/dist/referral-code.js',sha256:codeHash}]}));assert.equal(readReleaseInfo(root).integrity,'verified');writeFileSync(join(root,'apps/api/dist/referral-code.js'),'patched');assert.equal(readReleaseInfo(root).integrity,'modified');writeFileSync(join(root,'apps/api/dist/main.js'),'patched');assert.equal(readReleaseInfo(root).integrity,'modified');assert.equal(readReleaseInfo(root).id,null);
 }finally{rmSync(root,{recursive:true,force:true});}
});
