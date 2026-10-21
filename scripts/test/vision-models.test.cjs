const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkVisionModels}=require('../lib/vision-models.cjs');
const env={OCR_WORKSPACE_ID:'test',OCR_API_KEY:'private-key',OCR_MODEL:'qwen3.7-flash-2026-07-15'};
test('permission query paginates, filters permissions, does not invoke or leak credentials',async()=>{
 let calls=0;const result=await checkVisionModels(env,async(url,init)=>{calls++;assert.equal(url.pathname,'/api/v1/models/permissions');assert.equal(url.searchParams.get('authorization_scope'),'AUTHORIZED');assert.equal(init.redirect,'error');return new Response(JSON.stringify({success:true,output:{total:3,permissions:calls===1?[{model:'qwen-vl-plus',permissions:{inference:true}},{model:'qwen3.7-flash-2026-07-15',permissions:{inference:true}}]:[{model:'qwen-plus',permissions:{inference:true}}]}}));});
 assert.equal(calls,2);assert.equal(result.selected_model_authorized,true);assert.deepEqual(result.vision_candidates,['qwen-vl-plus','qwen3.7-flash-2026-07-15']);assert.equal(result.inference_tested,false);assert(!JSON.stringify(result).includes(env.OCR_API_KEY));
});
test('errors remain safe and unknown schema never becomes empty authorized list',async()=>{
 const error=await checkVisionModels(env,async()=>new Response(JSON.stringify({code:'AccessDenied',message:env.OCR_API_KEY}),{status:403}));assert.equal(error.upstream_error,'access_denied');assert(!JSON.stringify(error).includes(env.OCR_API_KEY));
 assert.equal((await checkVisionModels(env,async()=>new Response('{}'))).passed,false);
 assert.equal((await checkVisionModels(env,async()=>{throw Object.assign(Error('private URL'),{cause:{code:'ENOTFOUND'}});})).network_code,'ENOTFOUND');
});
