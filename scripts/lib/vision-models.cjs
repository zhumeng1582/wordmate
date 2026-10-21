const {diagnostics}=require('./ocr-diagnostics.cjs');
async function checkVisionModels(env,fetcher=fetch){
 const workspace=env.OCR_WORKSPACE_ID,key=env.OCR_API_KEY,model=env.OCR_MODEL;
 if(!workspace||!/^[a-zA-Z0-9-]+$/.test(workspace)||!key||!/^qwen[a-zA-Z0-9._-]{1,95}$/.test(model??''))return {passed:false,code:'OCR_CONFIGURATION_INVALID'};
 const models=new Set();let total=0,count=0,complete=false;
 for(let page=1;page<=10;page++){
  const url=new URL(`https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v1/models/permissions`);
  url.search=new URLSearchParams({name:'qwen',authorization_scope:'AUTHORIZED',action:'INFERENCE',page_no:String(page),page_size:'200'}).toString();
  let response;
  try{response=await fetcher(url,{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch(e){const code=e?.cause?.code??e?.code;return {passed:false,code:'MODEL_QUERY_FAILED',network_code:['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(code)?code:'NETWORK_OR_TIMEOUT'};}
  if(!response.ok)return {passed:false,code:'MODEL_QUERY_FAILED',...await diagnostics(response)};
  const reader=response.body?.getReader();if(!reader)return {passed:false,code:'MODEL_QUERY_INVALID_RESPONSE'};
  let data;const chunks=[];let size=0;
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1024*1024)throw Error();chunks.push(Buffer.from(r.value));}data=JSON.parse(Buffer.concat(chunks).toString());}
  catch{return {passed:false,code:'MODEL_QUERY_INVALID_RESPONSE'};}
  finally{await reader.cancel().catch(()=>{});}
  const rows=data.output?.permissions;total=data.output?.total;
  if(data.success!==true||!Array.isArray(rows)||!Number.isInteger(total)||total<0||rows.length>200)return {passed:false,code:'MODEL_QUERY_INVALID_RESPONSE'};
  count+=rows.length;
  for(const row of rows)if(row.permissions?.inference===true&&/^qwen[a-zA-Z0-9._-]{1,95}$/.test(row.model??''))models.add(row.model);
  if(count>=total){complete=true;break;}if(rows.length===0)break;
 }
 return {passed:true,stage:'workspace_model_permissions',model,selected_model_authorized:models.has(model)?true:complete?false:null,vision_candidates:[...models].filter(m=>/-vl(?:-|$)|-ocr(?:-|$)/.test(m)).sort(),list_complete:complete,inference_tested:false};
}
module.exports={checkVisionModels};
