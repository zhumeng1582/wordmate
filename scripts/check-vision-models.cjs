// Read-only workspace permission query. No image, model inference, configuration writes or secret output.
const {readFileSync,existsSync}=require('node:fs'),{parseEnv}=require('node:util');
const {checkVisionModels}=require('./lib/vision-models.cjs');
(async()=>{
 const local=existsSync('.env')?parseEnv(readFileSync('.env','utf8')):{};
 const overrides=['OCR_API_KEY','OCR_WORKSPACE_ID','OCR_MODEL'].filter(k=>process.env[k]!==undefined&&local[k]!==undefined&&process.env[k]!==local[k]);
 const result=await checkVisionModels({...local,...process.env});console.log(JSON.stringify({...result,environment_overrides:overrides},null,2));if(!result.passed)process.exitCode=1;
})().catch(()=>{console.error(JSON.stringify({passed:false,code:'MODEL_QUERY_FAILED'}));process.exitCode=1;});
