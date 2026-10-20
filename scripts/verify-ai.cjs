// Real provider verification. Uses synthetic vocabulary only; never prints credentials.
const {resolve}=require('node:path');
const {mkdirSync,writeFileSync,existsSync}=require('node:fs');
const root=resolve(__dirname,'..');
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
(async()=>{
 const started=Date.now();let report;
 try{
  const {createTextGenerator}=await import('../packages/ai/src/index.ts');
  const {generateVocabulary,VOCABULARY_PROMPT_VERSION}=await import('../packages/ai/src/vocabulary.ts');
  const result=await generateVocabulary(createTextGenerator(),['airport','luggage','delay'],'一家人的机场旅行','小学高年级');
  if(result.data.items.some(item=>item.status!=='ok'))throw Object.assign(Error(),{code:'KNOWN_WORD_REJECTED'});
  report={passed:true,stage:'provider_generation_and_validation',provider:result.provider,model:result.model,prompt_version:VOCABULARY_PROMPT_VERSION,elapsed_ms:Date.now()-started,data:result.data,usage:result.usage,business_saved:false};
 }catch(e){report={passed:false,stage:'provider_generation_and_validation',code:e.code||'VERIFICATION_FAILED',http_status:e.status??null,elapsed_ms:Date.now()-started,business_saved:false};process.exitCode=1;}
 mkdirSync(resolve(root,'.local'),{recursive:true});
 writeFileSync(resolve(root,'.local/ai-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
 console.log('Report: .local/ai-verification.json (not tracked by Git). Database save and miniapp integration are not tested by this command.');
})();
