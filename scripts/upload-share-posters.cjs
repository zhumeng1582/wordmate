// Run with the target environment loaded. Credentials never enter assets or output.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
async function main(){
 const [runtimeArg,assetsArg]=process.argv.slice(2),runtime=path.resolve(runtimeArg||path.join(__dirname,'..')),assets=path.resolve(assetsArg||path.join(__dirname,'../assets/share-posters/compressed'));
 const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'),'utf8'));if(manifest.version!=='compressed-v1'||manifest.files.length!==20)throw Error('INVALID_POSTER_MANIFEST');
 const {createOssStorage}=await import(pathToFileURL(path.join(runtime,'packages/ai/dist/index.js')).href);
 const storage=createOssStorage({...process.env,OSS_AUDIO_PREFIX:process.env.OSS_POSTER_PREFIX?.trim()||'checkin/posters/'});
 for(const file of manifest.files){
  if(!/^\d{2}-[a-z0-9-]+\.(jpg|webp)$/.test(file.file))throw Error('INVALID_POSTER_FILE');
  const bytes=fs.readFileSync(path.join(assets,file.file)),hash=b=>createHash('sha256').update(b).digest('hex');
  if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('POSTER_CHECKSUM_MISMATCH');
  const key=manifest.version+'/'+file.file,existing=await storage.stat(key);
  if(existing){if(hash(await storage.get(key))!==file.sha256)throw Error('EXISTING_POSTER_DIFFERS');}
  else await storage.put(key,bytes,file.file.endsWith('.webp')?'image/webp':'image/jpeg');
  if(hash(await storage.get(key))!==file.sha256)throw Error('OSS_POSTER_ROUNDTRIP_MISMATCH');
  console.log(file.file,file.bytes,existing?'verified existing':'uploaded and verified');
 }
 console.log('Verified 20 private OSS images; no existing object was overwritten.');
}
main().catch(error=>{console.error('Poster upload failed:',error.code||'UPLOAD_FAILED');process.exitCode=1;});
