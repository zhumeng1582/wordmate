const {test}=require('node:test'),assert=require('node:assert/strict');
const {classify,diagnostics}=require('../lib/ocr-diagnostics.cjs');
test('OCR diagnostics distinguish model/workspace/path without exposing error messages',async()=>{
 const secret='sk-test-private-secret';
 assert.deepEqual(classify(JSON.stringify({error:{code:'ModelNotFound',message:secret}})),{response_format:'json',upstream_error:'model_not_found'});
 assert.equal(classify(JSON.stringify({code:'WorkSpaceNotFound'})).upstream_error,'workspace_not_found');
 assert.equal(classify('<html>'+secret+'</html>','text/html').response_format,'html');
 assert(!JSON.stringify(classify(JSON.stringify({code:secret,message:secret}))).includes(secret));
 assert.deepEqual(await diagnostics(new Response(JSON.stringify({error:{code:'model_not_found',message:secret}}),{status:404})),{http_status:404,response_format:'json',upstream_error:'model_not_found'});
 assert.deepEqual(await diagnostics(new Response('x'.repeat(65537),{status:404})),{http_status:404,response_format:'oversized_error'});
 const success=new Response('original response');assert.deepEqual(await diagnostics(success),{http_status:200});assert.equal(await success.text(),'original response');
});
