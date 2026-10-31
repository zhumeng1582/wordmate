import {finishPrivacyAuthorization} from './privacy-authorization';
import Taro from '@tarojs/taro';
let sessionEpoch=0;
export const storage={get:(key:string)=>Taro.getStorageSync(key),set:(key:string,value:any)=>{if(key==='access_token')sessionEpoch++;Taro.setStorageSync(key,value);}};
export const clearAccountStorage=()=>{sessionEpoch++;finishPrivacyAuthorization(false);Taro.clearStorageSync();};
let privacyNavigation=false;
function platformFailureCode(error:unknown,stage:'request'|'login'='request'){
 const detail=error&&typeof error==='object'?error as {errMsg?:unknown;message?:unknown}:undefined;
 const raw=typeof detail?.errMsg==='string'?detail.errMsg:typeof detail?.message==='string'?detail.message:'';
 if(stage==='request'&&/url not in domain list|domain.*not.*allowed|不在.*合法域名/i.test(raw))return 'NETWORK_DOMAIN_NOT_ALLOWED';
 if(stage==='request'&&/certificate|\bssl\b|\btls\b|ERR_CERT/i.test(raw))return 'NETWORK_CERTIFICATE_INVALID';
 if(stage==='request'&&/ERR_NAME_NOT_RESOLVED|\bdns\b|name resolution|getaddrinfo/i.test(raw))return 'NETWORK_DNS_FAILED';
 if(/timeout|timed out/i.test(raw))return stage==='login'?'WECHAT_LOGIN_TIMEOUT':'NETWORK_TIMEOUT';
 return stage==='login'?'WECHAT_LOGIN_FAILED':'NETWORK_REQUEST_FAILED';
}
async function wechatLoginCode(){
 let result:Taro.login.SuccessCallbackResult;
 try{result=await Taro.login({timeout:10000});}catch(error){throw Error(platformFailureCode(error,'login'));}
 if(!result.code)throw Error('WECHAT_LOGIN_FAILED');
 return result.code;
}
export function eventId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});}
export async function api<T=any>(path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE'='GET',data?:any,key?:string,timeout=15000):Promise<T>{
  const token=storage.get('access_token'),epoch=sessionEpoch;
  // Avatar bytes stay in memory. Profile editors retain their retry key themselves.
  const pendingKey=key&&path!=='/me/profile'?`request:${token}:${path}:${JSON.stringify(data)}`:'';
  if(pendingKey){key=storage.get(pendingKey)||key;storage.set(pendingKey,key);}
  const response=await Taro.request<any>({url:API_BASE+path,method,data,timeout,header:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(key?{'Idempotency-Key':key}:{})}}).catch(error=>{throw Error(platformFailureCode(error));});
  if(epoch!==sessionEpoch||storage.get('access_token')!==token)throw Error('SESSION_CHANGED');
  if(response.statusCode>=400){if(response.statusCode===401)clearAccountStorage();if(pendingKey&&response.statusCode<500)Taro.removeStorageSync(pendingKey);const code=response.data?.error?.code??'请求失败';if(['PRIVACY_CONSENT_REQUIRED','MANAGEMENT_SESSION_ONLY'].includes(code)&&!privacyNavigation&&Taro.getCurrentPages().slice(-1)[0]?.route!=='pages/login/index'){privacyNavigation=true;void openLogin().catch(()=>{}).finally(()=>{privacyNavigation=false;});}throw Object.assign(Error(code),{status:response.statusCode});}if(pendingKey)Taro.removeStorageSync(pendingKey);return response.data.data;
}
export const openLogin=(identity='dev-dad',inviteFlow?:string)=>{const params=[...(DEV_AUTH?[`identity=${encodeURIComponent(identity)}`]:[]),...(inviteFlow?[`intent=join-family`,`flow=${encodeURIComponent(inviteFlow)}`]:[])];return Taro.navigateTo({url:`/pages/login/index${params.length?'?'+params.join('&'):''}`});};
export async function login(identity='dev-dad'){
  const policy=await api('/privacy/policy');
  if(!policy.publishable&&!DEV_AUTH)throw Error('PRIVACY_POLICY_NOT_READY');
  if(storage.get('privacy_decision')!==policy.hash){if(Taro.getCurrentPages().slice(-1)[0]?.route==='pages/login/index')throw Error('PRIVACY_POLICY_CHANGED');await openLogin(identity);throw Error('PRIVACY_REVIEW_REQUIRED');}
  const code=DEV_AUTH?identity:await wechatLoginCode();
  const inviteCode=storage.get('pending_referral_code');
  const data=await api(DEV_AUTH?'/auth/dev':'/auth/wechat','POST',{code,...(inviteCode?{invite_code:inviteCode}:{})});
  clearAccountStorage();
  storage.set('access_token',data.access_token);storage.set('families',data.families);
  if(data.is_new_user&&data.user&&!data.user.avatar_path)storage.set('registration_avatar_pending',data.user);
  Taro.removeStorageSync('child_id');Taro.removeStorageSync('review_pending');Taro.removeStorageSync('active_review_session');Taro.removeStorageSync('review_source');await api('/me/privacy-consent','PUT',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true});return data;
}
export async function loginForDataManagement(identity='dev-dad'){
 const code=DEV_AUTH?identity:await wechatLoginCode();
 const data=await api(DEV_AUTH?'/auth/dev':'/auth/wechat','POST',{code,management_only:true});
 clearAccountStorage();storage.set('access_token',data.access_token);storage.set('families',data.families);return data;
}
export const go=(page:string)=>Taro.navigateTo({url:`/pages/${page}/index`});
const errorMessages:Record<string,string>={
 NETWORK_DOMAIN_NOT_ALLOWED:'服务器域名未获微信授权，请联系运营者检查连接配置。',
 NETWORK_CERTIFICATE_INVALID:'服务器安全证书验证失败，请检查手机日期和时间，仍失败请联系运营者。',
 NETWORK_DNS_FAILED:'无法解析服务器地址，请切换 Wi-Fi 或移动网络后重试。',
 NETWORK_TIMEOUT:'连接服务器超时，请检查网络后重试。',
 NETWORK_REQUEST_FAILED:'无法连接服务器，请检查网络后重试。',
 WECHAT_LOGIN_FAILED:'微信身份验证未完成，请重新打开小程序后重试。',
 WECHAT_LOGIN_TIMEOUT:'微信身份验证超时，请检查网络后重试。',
 WECHAT_NOT_CONFIGURED:'微信登录尚未配置完成，请联系运营者。',
 WECHAT_UNAVAILABLE:'服务器暂时无法连接微信登录服务，请稍后重试。',
 WECHAT_CODE_INVALID:'微信登录凭证已失效，请再次点击登录。',
 AI_FAMILY_REQUIRED:'请先选择或创建家庭，系统 AI 余额由家庭共享。',
 PAYMENT_VERIFICATION_PENDING:'微信尚未确认此订单，后台会继续核对，请勿重复购买。',AI_SETTINGS_CHANGED:'AI 设置已变化，请刷新后重试。',AI_CONFIGURATION_BUSY:'还有生成任务正在使用当前配置，请完成后再修改。',AI_KEY_STORAGE_UNAVAILABLE:'私有 Key 存储尚未配置，请联系管理员。',AI_MODEL_UNAVAILABLE:'该模型暂不可用，请到 AI 设置重新选择。',AI_PRICE_NOT_CONFIGURED:'系统 AI 尚未配置价格或服务凭证，可选择自带 Key。',AI_KEY_REQUIRED:'请填写当前供应商的 API Key。',INVALID_AI_KEY:'Key 格式无效，请检查是否包含空格。',AI_VISION_UNAVAILABLE:'当前图片配置不支持图片识别，请选择千问或 OpenAI 视觉模型，或直接粘贴文字。',AI_INSUFFICIENT_BALANCE:'家庭共享额度不足以预留本次生成费用，请到 AI 额度与用量页面查看。',AI_SYSTEM_BUDGET_EXHAUSTED:'系统 AI 已达到今日费用上限，请稍后再试或使用自带 Key。',AI_USAGE_MISSING:'供应商未返回有效用量，本次不扣系统余额，请重试。',AI_USAGE_OVER_RESERVATION:'用量超过预计上限，本次不扣系统余额，请联系管理员。',AI_BILLING_OWNER_REQUIRED:'只有任务发起人可以重试，避免误用其他家长的余额或 Key。',AI_CALL_ALREADY_STARTED:'该次调用已发起，请刷新生成状态。',AI_BALANCE_REMAINS:'账号还有余额、欠款或冻结金额，请先联系服务方处理账务，再注销。',AI_PAYMENT_PENDING:'账号还有待确认支付订单，请在 AI 设置中核对后再注销。',PAYMENT_NOT_ENABLED:'充值暂未开放，可以先配置自带 Key。',PAYMENT_IOS_UNAVAILABLE:'当前暂未开通 iOS 购买。',PAYMENT_ORDER_LIMIT:'今天创建订单较多，请先核对已有订单。',PAYMENT_IDENTITY_MISMATCH:'支付身份与当前登录账号不一致，请重新登录。',PAYMENT_VERIFICATION_FAILED:'订单核验未通过，尚未增加余额，请稍后核对。',PAYMENT_ORDER_NOT_FOUND:'订单不存在或不属于当前账号。',PAYMENT_PRODUCT_UNAVAILABLE:'该充值档位已下架，请刷新后选择。',PAYMENT_UNAVAILABLE:'支付服务暂不可用；已支付订单会由后台继续核对，请勿重复购买。',

  PROFILE_CHANGED:'家长资料已在其他地方更新，请关闭后重新打开再保存。',
  INVALID_PROFILE:'请填写 1–40 个字的家长昵称。',
  INVALID_AVATAR:'头像格式或大小不支持，请重新选择。',
  AVATAR_NOT_FOUND:'头像已更新，请返回后重新加载。',
  SESSION_CHANGED:'登录状态已变化，请在当前账号重新操作。',
  STUDY_STORAGE_UNAVAILABLE:'本机暂时无法保存学习进度，请释放存储空间后重试。',
  STUDY_ANSWER_PENDING:'还有答案等待确认，请重试保存或暂存退出。',
  STUDY_NOT_FINISHED:'还有单词未完成，请继续本组学习。',
  STUDY_SESSION_CHANGED:'学习进度已在其他页面更新，请返回后继续。',
  WORD_NOT_FOUND:'这个单词已移除，请重新加载剩余内容。',
  EMPTY_NEW_QUEUE:'当前新词已学完，可以返回查看学习进度。',
  SESSION_NOT_FOUND:'上次学习已结束，已保存的进度会保留。',
  SESSION_NOT_OWNED:'这组学习由另一位家长开始，请返回后重新选择。',
  ANSWER_LOCKED:'这题已保存首次答案，请以服务器记录为准。',
  AUDIO_QUEUE_LIMIT:'待生成音频过多，请等待已有任务完成。',
  ACCOUNT_NOT_FOUND:'没有可管理的已有账号；仅登录管理不会创建新账号。',
  MANAGEMENT_SESSION_ONLY:'当前仅登录数据管理，可删除已有数据；主动同意后才能恢复学习。',
  PRIVACY_REVIEW_REQUIRED:'请先阅读隐私政策并确认监护人授权。',
  PRIVACY_CONSENT_REQUIRED:'请先同意当前隐私政策，仍可管理和删除已有数据。',
  PRIVACY_POLICY_CHANGED:'政策内容已更新，请重新阅读并同意。',
  PRIVACY_POLICY_NOT_READY:'运营者的隐私发布信息尚未补全，请稍后再试。',
  OWNER_REQUIRED:'此操作仅家庭管理员可以执行。',
  OWNER_TRANSFER_OR_DISSOLVE_REQUIRED:'请先转交管理员，或完成唯一成员家庭的解散，再继续。',
  FAMILY_HAS_OTHER_MEMBERS:'家庭还有其他有效成员，请先转交管理权或移除成员。',
  DELETION_IN_PROGRESS:'删除尚未完成，请在隐私与数据管理中查看进度或重试。',
  DELETION_NOT_FOUND:'删除任务不存在或不属于当前账号。',
  DELETION_REQUEST_CHANGED:'这项删除已提交，请查看现有任务进度。',
  CONFIRMATION_MISMATCH:'输入的名称不一致，未执行删除。',
  CHILD_CHANGED:'孩子档案已更新，请刷新后重新确认。',
  FAMILY_CHANGED:'家庭资料已更新，请刷新后重新确认。',
  INVALID_NEW_OWNER:'请选择另一位有效家庭成员接任管理员。',
  ACCOUNT_UNAVAILABLE:'账号已不可用，请重新登录。',
  IMPORT_PRIVACY_REQUIRED:'需要同意隐私保护指引后才能选择图片或文件。你仍可直接输入单词。',
  IMPORT_FILE_TOO_LARGE:'文件不能超过 4 MB，请压缩或拆分后重试。',
  IMPORT_IMAGE_TOO_LARGE:'图片像素过大，请裁剪后重试。',
  IMPORT_TEXT_TOO_LONG:'文字超过 8000 字符，请拆分材料；当前输入未被修改。',
  IMPORT_EMPTY:'没有识别到文字，请换一张清晰的学习材料图片或检查文件。',
  INVALID_IMPORT_FILE:'文件内容无效、加密或包含不支持的内容，请另存为普通文件。',
  INVALID_IMPORT_ENCODING:'文本文件需要使用 UTF-8 编码，请另存后重试。',
  IMPORT_FORMAT_UNSUPPORTED:'支持 JPG、PNG、TXT、CSV、TSV、XLSX、DOCX；其他文件请转换后导入。',
  IMPORT_FORMULA_UNSUPPORTED:'表格含公式，请复制并粘贴为数值后另存再导入。',
  OCR_NOT_CONFIGURED:'图片识别尚未开通，请联系管理员；仍可使用文本和文档导入。',
  OCR_FAILED:'图片识别未完成，请检查图片是否清晰，稍后重试。',
  IMPORT_BUSY:'上一张图片仍在识别，请稍后重试。',
  IMPORT_DAILY_LIMIT:'今天的图片识别额度已用完，请明天再试。',
  IMPORT_ATTEMPTS_EXHAUSTED:'这张图片已失败 3 次，请检查配置或更换清晰图片。',
  IMPORT_FAILED:'导入未完成，请稍后重试。',
  INVALID_EXPORT_SELECTION:'请选择需要导出的单词。',
  WORDBOOK_LIMIT:'一个孩子最多创建或加入 100 个单词本。',
  WORDBOOK_CHANGED:'词本已在其他设备更新，请刷新后重试。',
  WORDBOOK_NOT_FOUND:'这个词本已不可用，请刷新词本列表。',
  PUBLIC_SHARING_DISABLED:'首发暂不提供公开词本的发布、发现和加入。',
  SHARED_WORDBOOK_READ_ONLY:'共享词本只能学习和导出，不能编辑。',
  OWN_SHARED_WORDBOOK:'不能加入自己发布的共享词本。',
  SHARE_NOT_FOUND:'共享设置不存在，请刷新后重试。',
  SHARE_OWNER_REQUIRED:'只有发布者可以修改或停止共享。',
  EMPTY_WORDBOOK:'词本还是空的，添加单词后再发布共享。',
  SHARED_WORDBOOK_TOO_LARGE:'词本最多共享 3000 个单词，请拆分后发布。',
  SHARED_WORDBOOK_NOT_FOUND:'这个共享词本已停止共享或删除。',
  SHARED_WORDBOOK_INCOMPLETE:'共享词本内容不完整，请联系发布者重新发布。',
  NOT_SHARED_WORDBOOK:'这不是已加入的共享词本。',
  SUBSCRIPTION_NOT_FOUND:'共享词本订阅已不存在。',
  EXPORT_SELECTION_CHANGED:'选中的单词已变化，请刷新列表后重新选择。',
  EXPORT_EMPTY:'没有可导出的单词。',
  EXPORT_TOO_LARGE:'单次最多导出 10000 个单词，请分批勾选。',
  EXPORT_WECHAT_UPDATE_REQUIRED:'当前微信不支持文件分享，请升级微信后重试。',
  NO_LEARNING_TO_SHARE:'这一天还没有学习记录，学习后再来分享吧。',
  LEARNING_GOAL_CHANGED:'学习目标已被另一位家长更新，请重新选择。',
  INVALID_LEARNING_GOAL:'请输入 1 到 500 之间的整数。',
  QUERY_NOT_IMPLEMENTED:'当前服务暂不支持此筛选，请更新服务后重试。',
  INVALID_DATE_RANGE:'请选择有效的开始和结束日期。',
  AUDIO_SETTINGS_CHANGED:'设置已在其他设备更新，已刷新，请重新选择并保存。',
  VOICE_ACCENT_UNAVAILABLE:'当前音色不可用，请到“我的 → 发音设置”重新选择。',
  AUDIO_NOT_CONFIGURED:'语音尚未配置，请检查后端 TTS 和存储配置并重启。',
  AUDIO_OUTPUT_UNAVAILABLE:'无法启用发音，请退出后重新打开小程序再试。',
  AUDIO_PRICE_NOT_CONFIGURED:'发音服务价格尚未配置，请稍后重试。',
  AUDIO_WAIT_TIMEOUT:'音频仍在后台准备，可以稍后再次点击播放。',
  AUDIO_CONTENT_CHANGED:'单词或例句已更新，请刷新页面后播放。',
  AUDIO_DOWNLOAD_FAILED:'音频加载失败，请再次点击播放；若持续失败，请检查服务器存储权限。',
  AUDIO_STORAGE_ACCESS_DENIED:'音频存储权限不足，请检查 OSS 配置后重试。',
  AUDIO_STORAGE_UNAVAILABLE:'音频存储暂不可用，请稍后重试。',
  AUDIO_STORAGE_PROFILE_UNAVAILABLE:'这条音频的存储配置不可用，请联系管理员恢复配置。',
  AUDIO_TTS_CONFIGURATION_CHANGED:'任务使用的语音配置已变化，请恢复原配置后重试。',
  AUDIO_SYNTHESIS_FAILED:'语音生成失败，可再次点击重试（最多尝试 3 次）。',
  INVALID_AUDIO_RESPONSE:'语音服务返回的音频无效，请再次点击重试。',
  AUDIO_INTEGRITY_FAILED:'音频完整性校验失败，请再次点击重试。',
  AUDIO_ATTEMPTS_EXHAUSTED:'此音频已达到尝试上限，请联系管理员检查失败原因。',
  AUDIO_NOT_RETRYABLE:'此音频当前无法重试，请刷新状态。',

  INVITE_NOT_FOUND:'邀请不存在，请向邀请人索取新卡片或口令。',
  INVITE_UNAVAILABLE:'邀请已过期或已被领取，请向邀请人索取新邀请。',
  ALREADY_MEMBER:'你已是该家庭成员，无需再次加入。',
  NO_WORDS_FOUND:'未识别到可学习的词汇，请编辑输入内容后重新提交。',
  TOO_MANY_WORDS:'识别内容超过 30 项，请拆成几批提交；本次未保存。',
  UNSAFE_INPUT:'内容不适合词汇识别，请只提供要学习的词汇或材料。',
  SENSITIVE_INPUT:'输入疑似包含密钥或私钥，尚未发送给 AI，请先删除敏感信息。',
  INVALID_RAW_TEXT:'输入含不支持的控制字符，请粘贴纯文本后重试。',
  INVALID_INPUT_TYPE:'请先提取图片或文件中的文字，再生成单词。',
  GENERATION_NOT_EDITABLE:'任务状态已变化、已有保存结果或已达到尝试上限，请刷新记录。',
  DUPLICATE_GENERATION:'相同内容已有生成记录，请查看已有任务或修改输入。',
  AI_DAILY_LIMIT:'已达到最近 24 小时的 AI 调用额度，请稍后再试。',

  INPUT_REENTRY_REQUIRED:'旧任务未正确拆分单词，请重新编辑输入后提交，不要重试旧任务。',
  AI_NOT_CONFIGURED:'AI 尚未配置，请检查服务端密钥和模型配置并重启后端。',
  ACTIVE_GENERATION:'孩子已有一批正在生成，请刷新并等待完成。',
  AI_CONFIGURATION_CHANGED:'该任务的模型配置已变化，请恢复原供应商和模型配置后重试。',
  UPSTREAM_NETWORK_OR_TIMEOUT:'AI 连接失败或超时，可以重试未保存的单词。',
  UPSTREAM_HTTP_ERROR:'AI 服务拒绝或未完成请求，请检查账号额度、密钥及服务状态后重试。',
  GENERATED_CONTENT_REJECTED:'AI 返回内容未通过校验，未保存本次结果，请重试。',
  INVALID_GENERATED_JSON:'AI 返回格式不正确，请重试。',
  INCOMPLETE_GENERATION:'AI 返回内容不完整，请重试。',
  GENERATION_FAILED:'生成或保存未完成，未保存的单词可以重试。',
  GENERATION_SCOPE_UNAVAILABLE:'该任务对应的家庭、孩子或单词本已不可用。',
  GENERATION_NOT_RETRYABLE:'任务当前不能重试，请刷新状态。',
  GENERATION_ATTEMPTS_EXHAUSTED:'任务已达到尝试上限。',
  DUPLICATE_WORDS:'输入中有重复单词，请合并后重试。',

  EMPTY_REVIEW_QUEUE:'这个范围没有可练习的单词，可能已归档或暂无到期词。',
  NEW_WORD_LIMIT:'今天的新词额度已用完，请明天继续。',
  WORD_UNAVAILABLE:'选中的单词已归档或不可复习，请返回刷新错题集。',
  INVALID_DATE:'日期无效，请重新选择。',
  INVALID_MONTH:'月份无效，请选择当前或过去的月份。',
  ROUTE_NOT_IMPLEMENTED:'当前后端不支持此接口，请重启后端后重试。若刚创建过家庭，请勿重复创建。',
  QUIZ_DAILY_LIMIT:'今天已创建 5 次月测，请明天再试；未完成的测验可以继续。',
  QUIZ_NOT_SUBMITTED:'交卷后才能查看正确答案。',
  INVALID_OPTION:'选择不属于当前题目，请刷新后重试。',
  NO_STUDIED_WORDS:'这个月还没有实际学习过的单词。请先完成一次复习。',
  FUTURE_MONTH:'不能选择未来月份。',
  ACTIVE_QUIZ_EXISTS:'还有一份未完成的月测，请先继续或放弃。',
  QUIZ_NOT_READY:'题目尚未准备完成，请稍后重试。',
  QUIZ_VERSION_CONFLICT:'测验已更新，请刷新后继续。',
  ANSWER_VERSION_CONFLICT:'本题答案已更新，请刷新后继续。',
  CONFIRM_UNANSWERED:'还有未答题，请确认后交卷。',
  RESUME_QUIZ_FIRST:'请先继续测验，再选择放弃。',
  UNAUTHENTICATED:'登录已失效，请重新登录。',
  FAMILY_NOT_FOUND:'暂无该家庭的访问权限，请刷新家庭列表。',
  CHILD_BUSY:'孩子正在其他复习会话中，请结束该会话或稍后重试。',
  SESSION_EXPIRED:'离开时间较久，请继续剩余内容，已保存的学习记录会保留。',
  CARD_CONFLICT:'题目状态已变化，未保存的答案已清除，请重新开始本组。',
  INVALID_REQUEST_BODY:'输入信息不符合要求，请检查后重试。'
};
export const message=(e:unknown)=>{const code=e instanceof Error?e.message:e&&typeof e==='object'&&'errMsg' in e?platformFailureCode(e):'';return errorMessages[code]??(code||'请求失败，请重试');};
