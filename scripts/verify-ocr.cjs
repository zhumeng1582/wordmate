// Usage: corepack pnpm test:ocr:live -- /absolute/path/to/study-image.png
// Sends only the explicitly supplied image. No database or OSS writes.
const {readFileSync,statSync,mkdirSync,writeFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {basename}=require('node:path');
const {imageReader,parseFile}=require('../apps/api/dist/import-files.js');
const {diagnostics:readDiagnostics}=require('./lib/ocr-diagnostics.cjs');
const diagnostics={};
const report=result=>{const data={...result,...diagnostics};mkdirSync('.local/ocr-verification',{recursive:true});writeFileSync('.local/ocr-verification/report.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data));};
const fetcher=async(url,init)=>{try{const response=await fetch(url,init);Object.assign(diagnostics,await readDiagnostics(response));return response;}catch(e){const code=e?.cause?.code??e?.code;if(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code))diagnostics.network_code=code;else diagnostics.network_code='NETWORK_OR_TIMEOUT';throw e;}};
(async()=>{
 const path=process.argv.slice(2).find(x=>!x.startsWith('--'));
 const expected=(process.argv.find(x=>x.startsWith('--expect='))??'').slice(9).split(',').filter(Boolean);if(!path)throw Error('IMAGE_PATH_REQUIRED');
 if(statSync(path).size>4*1024*1024)throw Error('IMPORT_FILE_TOO_LARGE');
 const env={...parseEnv(readFileSync('.env','utf8')),...process.env};if(/^[a-zA-Z0-9._-]{1,100}$/.test(env.OCR_MODEL??''))diagnostics.model=env.OCR_MODEL;const reader=imageReader(env,fetcher);if(!reader)throw Error('OCR_NOT_CONFIGURED');
 const bytes=readFileSync(path),{mime}=parseFile(basename(path),bytes);if(!mime)throw Error('IMAGE_REQUIRED');
 const generated=await reader.readVocabulary(bytes,mime,'','');const text=generated.text,matched=expected.every(word=>text.toLowerCase().includes(word.toLowerCase())),itemsMatched=expected.every(word=>generated.items.some(item=>item.input.toLowerCase().includes(word.toLowerCase())));if(!matched)throw Error('OCR_EXPECTED_TEXT_MISSING');if(!generated.items.length||!itemsMatched)throw Error('VOCABULARY_ITEMS_MISSING');report({passed:true,stage:'single_call_image_transcription_and_vocabulary_generation',model:env.OCR_MODEL,characters:text.length,generated_items:generated.items.length,expected_words_checked:expected.length,business_saved:false,miniapp_tested:false});
})().catch(e=>{report({passed:false,code:e.code||(['IMAGE_PATH_REQUIRED','OCR_NOT_CONFIGURED','IMAGE_REQUIRED','IMPORT_FILE_TOO_LARGE','OCR_EXPECTED_TEXT_MISSING','VOCABULARY_ITEMS_MISSING'].includes(e.message)?e.message:'OCR_VERIFICATION_FAILED'),...(typeof e.ocrStage==='string'?{ocr_stage:e.ocrStage}:{}),...(typeof e.ocrPayloadIssue==='string'?{ocr_payload_issue:e.ocrPayloadIssue}:{}),...(typeof e.ocrValidationIssue==='string'?{ocr_validation_issue:e.ocrValidationIssue}:{})});process.exitCode=1;});
