// Ephemeral localhost server and isolated development DB; never loads .env or cloud providers.
const {randomUUID}=require('node:crypto');const {rmSync}=require('node:fs');const {resolve}=require('node:path');
const {gzipSync,deflateSync,brotliCompressSync}=require('node:zlib');const assert=require('node:assert/strict');
for(const key of Object.keys(process.env))if(/^(OSS_|AUDIO_|COSYVOICE_|TTS_|OCR_|QWEN_|OPENAI_|DEEPSEEK_|LLM_|POSTER_)/.test(key))delete process.env[key];
const name='security-http-'+randomUUID();Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development',DICTIONARY_PROVIDER:'fixture',DATABASE_URL:'pglite:.local/'+name});
(async()=>{
 const {createRequire}=require('node:module'),r=createRequire(require.resolve('../apps/api/node_modules/@nestjs/platform-express/package.json')),e=createRequire(r.resolve('express'));
 assert.equal(e('body-parser/package.json').version,'2.4.0');
 const {createApplication}=require('../apps/api/dist/main.js'),{app,dispose}=await createApplication();
 try{
  await app.listen(0,'127.0.0.1');const port=app.getHttpServer().address().port,base=`http://127.0.0.1:${port}/api`;
  for(const [encoding,compress] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]]){
   const body=Buffer.concat([compress(Buffer.from('{}')),Buffer.from('malformed trailing bytes')]);
   const response=await fetch(base+'/families',{method:'POST',headers:{'content-type':'application/json','content-encoding':encoding},body});assert.equal(response.status,415);assert.equal((await response.json()).error.code,'CONTENT_ENCODING_UNSUPPORTED');
  }
  const response=await fetch(base+'/auth/dev',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'dev-dad'})});assert.equal(response.status,200);assert((await response.json()).data.access_token);
  assert.equal((await fetch(base+'/health')).status,200);
  console.log('PASS: patched body-parser loaded; real HTTP gzip/deflate/br with trailing bytes rejected before authentication; API remains alive and normal login works.');
 }finally{await dispose();rmSync(resolve('.local',name),{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
