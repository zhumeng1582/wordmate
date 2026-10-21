// Usage: corepack pnpm test:ocr:live -- /absolute/path/to/study-image.png
// Sends only the explicitly supplied image. No database or OSS writes.
const {readFileSync,statSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {basename}=require('node:path');
const {imageReader,parseFile}=require('../apps/api/dist/import-files.js');
(async()=>{
 const path=process.argv.slice(2).find(x=>x!=='--');if(!path)throw Error('IMAGE_PATH_REQUIRED');
 if(statSync(path).size>4*1024*1024)throw Error('IMPORT_FILE_TOO_LARGE');
 const env={...parseEnv(readFileSync('.env','utf8')),...process.env};const reader=imageReader(env);if(!reader)throw Error('OCR_NOT_CONFIGURED');
 const bytes=readFileSync(path),{mime}=parseFile(basename(path),bytes);if(!mime)throw Error('IMAGE_REQUIRED');
 const text=await reader.read(bytes,mime);console.log(JSON.stringify({passed:true,stage:'image_transcription',characters:text.length,business_saved:false,miniapp_tested:false}));
})().catch(e=>{console.error(JSON.stringify({passed:false,code:e.code||(['IMAGE_PATH_REQUIRED','OCR_NOT_CONFIGURED','IMAGE_REQUIRED','IMPORT_FILE_TOO_LARGE'].includes(e.message)?e.message:'OCR_VERIFICATION_FAILED')}));process.exitCode=1;});
