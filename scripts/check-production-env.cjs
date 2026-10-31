// Redacted production readiness check. Never prints secret values.
const failures=[];
const need=(key,ok=true)=>{if(!ok)failures.push(key);};
need('NODE_ENV=production',process.env.NODE_ENV==='production');
need('AUTH_MODE=wechat',process.env.AUTH_MODE==='wechat');
need('DATABASE_URL (PostgreSQL)',/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL||''));
need('WECHAT_APP_ID',!!process.env.WECHAT_APP_ID);
need('WECHAT_APP_SECRET',!!process.env.WECHAT_APP_SECRET);
need('DICTIONARY_PROVIDER must not be fixture',process.env.DICTIONARY_PROVIDER!=='fixture');
const base=process.env.MINIAPP_API_BASE;let parsed;try{parsed=new URL(base);}catch{}
need('MINIAPP_API_BASE (HTTPS /api URL)',!!parsed&&parsed.protocol==='https:'&&parsed.pathname.endsWith('/api')&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&!parsed.port&&!/^localhost$|^127\./.test(parsed.hostname));
const llm=process.env.LLM_PROVIDER||'qwen';
const prefix={qwen:'QWEN',openai:'OPENAI',deepseek:'DEEPSEEK'}[llm];
need('LLM_PROVIDER supported',!!prefix);
need(`${prefix||'LLM'}_API_KEY`,!!(llm==='qwen'?(process.env.QWEN_API_KEY||process.env.OCR_API_KEY):prefix&&process.env[`${prefix}_API_KEY`]));
need(`${prefix||'LLM'}_MODEL`,!!(llm==='qwen'?(process.env.QWEN_MODEL||process.env.OCR_MODEL):prefix&&process.env[`${prefix}_MODEL`]));
if(process.env.OCR_PROVIDER==='qwen'){
 need('OCR_WORKSPACE_ID',!!process.env.OCR_WORKSPACE_ID);need('OCR_API_KEY',!!process.env.OCR_API_KEY);need('OCR_MODEL',!!process.env.OCR_MODEL);
}else failures.push('OCR_PROVIDER=qwen (required for photo imports)');
need('TTS_PROVIDER=cosyvoice',process.env.TTS_PROVIDER==='cosyvoice');
need('COSYVOICE_API_KEY',!!process.env.COSYVOICE_API_KEY);
need('COSYVOICE_WORKSPACE_ID',!!process.env.COSYVOICE_WORKSPACE_ID);
const audioPrice=process.env.AUDIO_YUAN_PER_10000_CHARACTERS||((process.env.COSYVOICE_MODEL||'cosyvoice-v3-flash')==='cosyvoice-v3-flash'?'1':'');
need('AUDIO_YUAN_PER_10000_CHARACTERS (positive CNY price)',/^\d{1,7}(?:\.\d{1,6})?$/.test(audioPrice)&&Number(audioPrice)>0);
need('OSS_BUCKET',!!process.env.OSS_BUCKET);need('OSS_REGION',!!process.env.OSS_REGION);need('OSS_ENDPOINT (HTTPS)',/^https:\/\//.test(process.env.OSS_ENDPOINT||''));
need('OSS_AUDIO_PREFIX must be production-specific',!!process.env.OSS_AUDIO_PREFIX&&!/staging|verification/i.test(process.env.OSS_AUDIO_PREFIX));
need('AUDIO_STORAGE_PROFILE',!!process.env.AUDIO_STORAGE_PROFILE);
need('OSS_CREDENTIAL_MODE=ecs_ram_role',process.env.OSS_CREDENTIAL_MODE==='ecs_ram_role');
need('OSS_RAM_ROLE_NAME (valid role name)',/^[A-Za-z0-9_.-]{1,64}$/.test(process.env.OSS_RAM_ROLE_NAME||''));
need('PRIVACY_OPERATOR_NAME',!!process.env.PRIVACY_OPERATOR_NAME?.trim());
need('PRIVACY_CONTACT',!!process.env.PRIVACY_CONTACT?.trim());
const backupDays=Number(process.env.PRIVACY_BACKUP_RETENTION_DAYS);
need('PRIVACY_BACKUP_RETENTION_DAYS (1–365)',Number.isSafeInteger(backupDays)&&backupDays>=1&&backupDays<=365);
if(llm!=='qwen'){need('PRIVACY_LLM_PROCESSING_REGION',!!process.env.PRIVACY_LLM_PROCESSING_REGION?.trim());need('PRIVACY_LLM_POLICY_URL (HTTPS)',/^https:\/\//.test(process.env.PRIVACY_LLM_POLICY_URL||''));}
need('AI_CREDENTIAL_KEY (32-byte hex)',/^[a-fA-F0-9]{64}$/.test(process.env.AI_CREDENTIAL_KEY||''));
if(process.env.AI_RECHARGE_ENABLED==='true'){for(const key of ['AI_MODEL_CATALOG','WECHAT_VIRTUAL_OFFER_ID','WECHAT_VIRTUAL_APP_KEY','WECHAT_VIRTUAL_NOTIFY_TOKEN','WECHAT_VIRTUAL_AES_KEY','WECHAT_VIRTUAL_PRODUCTS'])need(key,!!process.env[key]);}
const result={passed:failures.length===0,failed_checks:failures};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
