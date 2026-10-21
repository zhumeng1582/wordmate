// Minimal diagnostic-only OSS V4 signer (no SDK dependency).
// https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4/
const {createHash,createHmac}=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
function config(env){
 const fields=['OSS_BUCKET','OSS_REGION','OSS_ENDPOINT','OSS_AUDIO_PREFIX','ALIBABA_CLOUD_ACCESS_KEY_ID','ALIBABA_CLOUD_ACCESS_KEY_SECRET'];
 for(const k of fields)if(!env[k]?.trim())fail('MISSING_'+k);
 const bucket=env.OSS_BUCKET.trim(),region=env.OSS_REGION.trim().replace(/^oss-/,''),prefix=env.OSS_AUDIO_PREFIX.trim();
 if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))fail('INVALID_OSS_BUCKET');
 if(!/^[a-z]+-[a-z0-9-]+$/.test(region))fail('INVALID_OSS_REGION');
 let endpoint;try{endpoint=new URL(env.OSS_ENDPOINT.includes('://')?env.OSS_ENDPOINT:'https://'+env.OSS_ENDPOINT);}catch{fail('INVALID_OSS_ENDPOINT');}
 if(endpoint.protocol!=='https:'||endpoint.hostname!==`oss-${region}.aliyuncs.com`||endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/')fail('INVALID_OSS_ENDPOINT');
 if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/$/.test(prefix))fail('INVALID_OSS_PREFIX');
 const token=env.ALIBABA_CLOUD_SECURITY_TOKEN?.trim()||'',mode=env.OSS_CREDENTIAL_MODE|| (token?'sts':'ram_access_key');
 if(!['ram_access_key','sts'].includes(mode))fail('LOCAL_OSS_CREDENTIAL_MODE_UNSUPPORTED');
 if(mode==='sts'&&!token||mode==='ram_access_key'&&token)fail('OSS_CREDENTIAL_MODE_MISMATCH');
 return {bucket,region,prefix,host:`${bucket}.${endpoint.hostname}`,accessKeyId:env.ALIBABA_CLOUD_ACCESS_KEY_ID.trim(),accessKeySecret:env.ALIBABA_CLOUD_ACCESS_KEY_SECRET.trim(),token,mode};
}
function canonicalRequest({method,bucket,key,headers,additionalHeaders=[]}){
 const additional=additionalHeaders.slice().sort().join(';');
 const canonicalHeaders=Object.keys(headers).filter(k=>k.startsWith('x-oss-')||['content-type','content-md5'].includes(k)||additionalHeaders.includes(k)).sort().map(k=>`${k.toLowerCase()}:${headers[k].trim()}\n`).join('');
 const uri='/'+[bucket,...key.split('/')].map(x=>encodeURIComponent(x).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');
 return [method,uri,'',canonicalHeaders,additional,'UNSIGNED-PAYLOAD'].join('\n');
}
function sign({method,bucket,key,region,accessKeyId,accessKeySecret,token='',headers={},additionalHeaders=[],timestamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'')}){
 const date=timestamp.slice(0,8),scope=`${date}/${region}/oss/aliyun_v4_request`;
 const signed={...headers,'x-oss-content-sha256':'UNSIGNED-PAYLOAD','x-oss-date':timestamp,...(token?{'x-oss-security-token':token}:{})};
 const additional=additionalHeaders.slice().sort().join(';');
 const canonical=canonicalRequest({method,bucket,key,headers:signed,additionalHeaders});
 const stringToSign=['OSS4-HMAC-SHA256',timestamp,scope,hash(canonical)].join('\n');
 let derived=hmac('aliyun_v4'+accessKeySecret,date);for(const part of [region,'oss','aliyun_v4_request'])derived=hmac(derived,part);
 const signature=hmac(derived,stringToSign).toString('hex');
 return {...signed,Authorization:`OSS4-HMAC-SHA256 Credential=${accessKeyId}/${scope},${additional?'AdditionalHeaders='+additional+',':''}Signature=${signature}`};
}
module.exports={config,sign,hash,canonicalRequest};
// Return only enumerated diagnostic fields; never echo account IDs, tokens, or XML.
function deniedDetail(xml){
 const read=tag=>xml.match(new RegExp('<'+tag+'>([^<]*)</'+tag+'>'))?.[1];
 const known=(tag,values)=>values.includes(read(tag))?read(tag):null;
 const ec=read('EC');
 return {
  action:known('AuthAction',['oss:PutObject','oss:GetObject','oss:PutObjectAcl','oss:PutObjectTagging']),
  denial:known('NoPermissionType',['ExplicitDeny','ImplicitDeny']),
  policy_type:known('PolicyType',['AccountLevelIdentityBasedPolicy','ResourceGroupLevelIdentityBasedPolicy','ResourceBasedPolicy','SessionPolicy','ControlPolicy']),
  principal_type:known('AuthPrincipalType',['SubUser','AssumedRole','Anonymous','Account']),
  error_reference:ec&&/^\d{4}-\d{8}$/.test(ec)?ec:null
 };
}
module.exports.deniedDetail=deniedDetail;
