const {test}=require('node:test'),assert=require('node:assert/strict');
const {config,sign,hash,canonicalRequest}=require('../lib/oss-probe.cjs');
const env={OSS_BUCKET:'examplebucket',OSS_REGION:'cn-beijing',OSS_ENDPOINT:'https://oss-cn-beijing.aliyuncs.com',OSS_AUDIO_PREFIX:'staging/audio/',ALIBABA_CLOUD_ACCESS_KEY_ID:'test-id',ALIBABA_CLOUD_ACCESS_KEY_SECRET:'test-secret'};
test('diagnostic validates endpoint and credential mode before sending credentials',()=>{
 assert.equal(config(env).mode,'ram_access_key');
 for(const url of ['http://oss-cn-beijing.aliyuncs.com','https://attacker.example','https://oss-cn-shanghai.aliyuncs.com','https://oss-cn-beijing.aliyuncs.com/?x=1'])assert.throws(()=>config({...env,OSS_ENDPOINT:url}),{code:'INVALID_OSS_ENDPOINT'});
 assert.throws(()=>config({...env,OSS_CREDENTIAL_MODE:'sts'}),{code:'OSS_CREDENTIAL_MODE_MISMATCH'});
 assert.throws(()=>config({...env,OSS_CREDENTIAL_MODE:'ecs_ram_role'}),{code:'LOCAL_OSS_CREDENTIAL_MODE_UNSUPPORTED'});
 assert.throws(()=>config({...env,OSS_AUDIO_PREFIX:'../'}),{code:'INVALID_OSS_PREFIX'});
 assert.equal(config({...env,OSS_CREDENTIAL_MODE:'sts',ALIBABA_CLOUD_SECURITY_TOKEN:'temporary-test'}).token,'temporary-test');
});
test('canonical request matches the published OSS V4 reference hash',()=>{
 const canonical=canonicalRequest({method:'PUT',bucket:'examplebucket',key:'exampleobject',headers:{'content-disposition':'attachment','content-length':'3','content-md5':'ICy5YqxZB1uWSwcVLSNLcA==','content-type':'text/plain','x-oss-content-sha256':'UNSIGNED-PAYLOAD','x-oss-date':'20250411T064124Z'},additionalHeaders:['content-disposition','content-length']});
 assert.equal(hash(canonical),'c46d96390bdbc2d739ac9363293ae9d710b14e48081fcb22cd8ad54b63136eca');
 const input={method:'GET',bucket:'examplebucket',key:'staging/audio/file.mp3',region:'cn-beijing',accessKeyId:'test',accessKeySecret:'test-secret',timestamp:'20250411T064124Z'};
 const ordinary=sign(input),temporary=sign({...input,token:'temporary-test'});
 assert.notEqual(ordinary.Authorization,temporary.Authorization);assert.equal(temporary['x-oss-security-token'],'temporary-test');assert(!ordinary.Authorization.includes('test-secret'));
 assert.notEqual(ordinary.Authorization,sign({...input,key:'other.mp3'}).Authorization);
 assert.notEqual(ordinary.Authorization,sign({...input,method:'PUT'}).Authorization);
});
