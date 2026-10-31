// Isolated live OCR-to-wordbook verification. It never touches an existing user DB.
const {resolve,basename}=require('node:path');
const {existsSync,readFileSync,mkdirSync,writeFileSync,statSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),databaseName=`ocr-flow-${randomUUID()}`;
if(!existsSync(resolve(root,'.env')))throw Error('LOCAL_ENV_REQUIRED');
process.loadEnvFile(resolve(root,'.env'));
Object.assign(process.env,{NODE_ENV:'development',AUTH_MODE:'development'});
const env={...parseEnv(readFileSync(resolve(root,'.env'),'utf8')),...process.env};
const reportPath=resolve(root,'.local/ocr-flow-verification.json');
const imagePath=process.argv.slice(2).find(x=>!x.startsWith('--'));
const expected=(process.argv.find(x=>x.startsWith('--expect='))??'').slice(9).split(',').filter(Boolean).map(x=>x.trim().toLowerCase());
const started=Date.now();let source,code='OCR_FLOW_FAILED',modelRequests=0;
const report=value=>{mkdirSync(resolve(root,'.local'),{recursive:true});writeFileSync(reportPath,JSON.stringify(value,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(value,null,2));};
(async()=>{
 try{
  assert(imagePath,'IMAGE_PATH_REQUIRED');assert(statSync(imagePath).size<=4*1024*1024,'IMPORT_FILE_TOO_LARGE');assert(expected.length>0,'EXPECTED_WORDS_REQUIRED');
  assert(env.OCR_PROVIDER==='qwen'&&env.OCR_API_KEY&&env.OCR_WORKSPACE_ID&&env.OCR_MODEL,'OCR_NOT_CONFIGURED');
  const originalFetch=global.fetch;global.fetch=async(...args)=>{modelRequests++;return originalFetch(...args);};
  const {connect}=require('../apps/api/dist/database.js');
  const {Core}=require('../apps/api/dist/core.js');
  const {imageReader}=require('../apps/api/dist/import-files.js');
  const {vocabularyProvider}=require('../apps/api/dist/vocabulary.js');
  const {DevIdentity,FixtureDictionary,createScheduler}=require('../apps/api/dist/providers.js');
  const provider=await vocabularyProvider(env);assert(provider&&provider.validate,'AI_NOT_CONFIGURED');
  const connection=await connect(`pglite:.local/${databaseName}`);source=connection.source;
  const core=new Core(connection.db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'ocr-flow-test',()=>new Date(),provider,undefined,undefined,imageReader(env));
  // DevIdentity only permits the same fixture identities used by the other flow tests.
  const dad=(await core.login('dev-dad')).user.id,family=await core.createFamily(dad,'ocr-flow-family',{name:'OCR 隔离验收'}),child=await core.createChild(dad,'ocr-flow-child',family.id,{nickname:'验收'}),book=await core.createWordbook(dad,'ocr-flow-book',child.id,{name:'图片导入验收'});
  const image=readFileSync(imagePath),imported=await core.imports.extract(dad,child.id,{name:basename(imagePath),base64:image.toString('base64')});
  assert.equal(imported.source,'image');assert(Array.isArray(imported.prepared_items)&&imported.prepared_items.length>0,'NO_PREPARED_ITEMS');
  const actual=imported.prepared_items.map(item=>String(item.input).toLowerCase());for(const word of expected)assert(actual.includes(word),`EXPECTED_WORD_MISSING:${word}`);
  const job=await core.vocabulary.create(dad,randomUUID(),child.id,{wordbook_id:book.id,source_type:'vision',raw_text:imported.text,prepared_items:imported.prepared_items,theme:'airport vocabulary'});
  assert.equal(job.status,'queued');await core.vocabulary.processOne();const finished=await core.vocabulary.get(dad,job.id);assert.equal(finished.status,'succeeded',finished.error_code||'BATCH_NOT_SAVED');
  const saved=(await core.words(dad,child.id,{limit:100})).items, savedWords=saved.map(word=>String(word.lemma).toLowerCase());for(const word of expected)assert(savedWords.includes(word),`WORD_NOT_PERSISTED:${word}`);
  assert.equal(modelRequests,1,'EXPECTED_SINGLE_MODEL_REQUEST');
  report({passed:true,stage:'single_call_image_import_and_wordbook_persistence',provider:provider.provider,model:env.OCR_MODEL,expected_words_checked:expected.length,generated_items:imported.prepared_items.length,saved_words:expected.length,model_requests:modelRequests,business_saved:true,storage:'isolated test database; removed after verification',miniapp_tested:false,elapsed_ms:Date.now()-started});
 }catch(e){report({passed:false,code:typeof e.message==='string'&&/^[A-Z0-9_:-]+$/.test(e.message)?e.message:code,...(typeof e.ocrStage==='string'?{ocr_stage:e.ocrStage}:{}),...(typeof e.ocrPayloadIssue==='string'?{ocr_payload_issue:e.ocrPayloadIssue}:{}),...(typeof e.ocrValidationIssue==='string'?{ocr_validation_issue:e.ocrValidationIssue}:{}),model:env.OCR_MODEL,model_requests:modelRequests,business_saved:false,miniapp_tested:false,elapsed_ms:Date.now()-started});process.exitCode=1;}
 finally{if(source)await source.destroy();require('node:fs').rmSync(resolve(root,'.local',databaseName),{recursive:true,force:true});}
})();
