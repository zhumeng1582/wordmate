const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {sourceProvenance,ensureSourceUnchanged}=require('../release-provenance.cjs');
test('release provenance has a stable fingerprint and records whether the checkout is dirty',()=>{
 const a=sourceProvenance(),b=sourceProvenance();assert.match(a.source_commit,/^[a-f0-9]{40,64}$/);assert.match(a.source_fingerprint,/^[a-f0-9]{64}$/);assert.equal(a.source_fingerprint,b.source_fingerprint);assert.equal(typeof a.includes_uncommitted_changes,'boolean');
 if(a.includes_uncommitted_changes){const env={...process.env};delete env.WORDMATE_ALLOW_DIRTY_RELEASE;const result=spawnSync(process.execPath,['scripts/prepare-server-release.cjs'],{encoding:'utf8',env});assert.equal(result.status,1);assert.match(result.stderr,/未提交/);}
});

test('release builds reject a changing source tree',()=>{
 const before={source_fingerprint:'first'};
 assert.doesNotThrow(()=>ensureSourceUnchanged(before,{source_fingerprint:'first'}));
 assert.throws(()=>ensureSourceUnchanged(before,{source_fingerprint:'second'}),/源码在构建期间发生变化/);
});
