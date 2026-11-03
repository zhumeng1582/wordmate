export type AiCapability='text'|'vision';
export type AiMode='system'|'byok';
export type AiModel={id:string;label:string;provider:string;model:string;vision:boolean;system_available:boolean;max_charge_micros:number|null;input_yuan_per_million:string|null;output_yuan_per_million:string|null;cached_yuan_per_million:string|null;pricing_tiers:{up_to_input_tokens:number;input_yuan_per_million:string;output_yuan_per_million:string;cached_yuan_per_million?:string}[]|null};
export type AiSettings={capability:AiCapability;family_id:string|null;family_name:string|null;families:{id:string;name:string}[];mode:AiMode;model_id:string|null;version:number;has_key:boolean;byok_available:boolean;custom_provider:string|null;custom_model:string|null;available_micros:number;balance_micros:number;frozen_micros:number;gift_remaining_micros:number;legacy_balance_micros:number;welcome_credit_micros:number;models:AiModel[];audio_model?:string;audio_yuan_per_10000_characters?:string|null;tutor_prices?:{asr_yuan_per_minute:string|null;search_yuan_per_call:string|null;search_input_yuan_per_million:string|null;search_output_yuan_per_million:string|null;image_yuan_per_image:string|null}};
export const capabilityNames:Record<AiCapability,string>={text:'整理单词',vision:'识别图片'};
export const providerNames:Record<string,string>={qwen:'千问（百炼）',cosyvoice:'阿里云语音',deepseek:'DeepSeek',openai:'OpenAI'};
export const aiQuery=(capability:AiCapability='text',family?:string|null)=>`?capability=${capability}${family?'&family_id='+encodeURIComponent(family):''}`;
export const aiScope=(settings:AiSettings)=>({capability:settings.capability,...(settings.family_id?{family_id:settings.family_id}:{})});
export function aiMoney(micros:number,compact=false){
 const value=Number.isFinite(Number(micros))?Number(micros):0;
 if(compact&&Math.abs(value)>0&&Math.abs(value)<10000)return value<0?'欠费不足 ¥0.01':'不足 ¥0.01';
 const amount=compact?(value/1000000).toFixed(2):(value/1000000).toFixed(6).replace(/0+$/,'').replace(/\.$/,'.00');
 return `¥${amount}`;
}
export function aiModels(settings:AiSettings,mode:AiMode){return settings.models.filter(model=>(settings.capability==='text'||model.vision)&&(mode==='byok'||model.id!=='custom'&&model.system_available));}
export function defaultAiModel(settings:AiSettings,mode:AiMode){const models=aiModels(settings,mode);return models.find(model=>model.id===settings.model_id)??models[0];}
export function aiStatus(settings:AiSettings){
 const model=settings.models.find(item=>item.id===settings.model_id);
 if(!model)return {ready:false,label:'需要设置',detail:'还没有可用服务',action:'settings'} as const;
 if(settings.mode==='byok')return settings.has_key&&settings.byok_available?{ready:true,label:'已设置',detail:'使用我的 AI 账号',action:'start'} as const:{ready:false,label:'需要设置',detail:'请补充个人服务密钥',action:'settings'} as const;
 if(!model.system_available)return {ready:false,label:'暂不可用',detail:'默认服务尚未就绪',action:'settings'} as const;
 if(settings.available_micros<(model.max_charge_micros??0)||settings.available_micros<=0)return {ready:false,label:'额度不足',detail:'请先查看家庭额度',action:'usage'} as const;
 return {ready:true,label:'可使用',detail:'使用默认服务',action:'start'} as const;
}
export function aiCallLabel(call:{state:string;mode:string;charge_micros:number}){
 if(call.state==='failed')return {state:'未完成',cost:call.mode==='byok'?'服务商可能已计费':'未扣额度'};
 if(call.state==='uncertain')return {state:'结果待确认',cost:call.mode==='byok'?'费用以服务商账单为准':'未扣额度'};
 if(call.state==='running'||call.state==='ready')return {state:call.state==='ready'?'正在保存':'处理中',cost:call.mode==='byok'?'费用由个人账号承担':'结算中'};
 return {state:call.state==='succeeded'?'已完成':'待确认',cost:call.mode==='byok'?'费用由个人账号承担':`扣除 ${aiMoney(call.charge_micros)}`};
}
