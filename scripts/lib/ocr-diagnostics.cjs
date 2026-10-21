// Never return arbitrary upstream messages: they can contain keys, URLs or input.
const codes=new Map([
 ['modelnotfound','model_not_found'],['model_not_found','model_not_found'],
 ['model_not_supported','model_not_supported'],['workspacenotfound','workspace_not_found'],
 ['invalidapikey','invalid_api_key'],['invalid_api_key','invalid_api_key'],
 ['accessdenied','access_denied'],['model.accessdenied','model_access_denied'],
 ['invalidparameter','invalid_parameter'],['invalid_parameter','invalid_parameter'],
 ['notfound','not_found'],['datainspectionfailed','content_rejected'],
 ['throttling','throttled'],['quotaexceeded','quota_exceeded']
]);
function classify(body,contentType=''){
 let result;
 try{result=JSON.parse(body);}catch{return {response_format:/html/i.test(contentType)||/^\s*<!doctype html|^\s*<html/i.test(body)?'html':'non_json',upstream_error:'unrecognized_error'};}
 const raw=result?.error?.code??result?.code;
 return {response_format:'json',upstream_error:typeof raw==='string'?codes.get(raw.toLowerCase())??'unrecognized_error':'unrecognized_error'};
}
async function diagnostics(response){
 const result={http_status:response.status};
 if(response.ok)return result;
 const reader=response.body?.getReader();if(!reader)return {...result,response_format:'empty'};
 const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536)return {...result,response_format:'oversized_error'};chunks.push(Buffer.from(value));}
 return {...result,...classify(Buffer.concat(chunks).toString('utf8'),response.headers.get('content-type')??'')};}
 catch{return {...result,response_format:'unreadable_error'};}
 finally{await reader.cancel().catch(()=>{});}
}
module.exports={classify,diagnostics};
