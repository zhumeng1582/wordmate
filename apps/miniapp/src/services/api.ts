import Taro from '@tarojs/taro';
export const storage={get:(key:string)=>Taro.getStorageSync(key),set:(key:string,value:any)=>Taro.setStorageSync(key,value)};
export function eventId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});}
export async function api<T=any>(path:string,method:'GET'|'POST'|'PUT'='GET',data?:any,key?:string):Promise<T>{
  const token=storage.get('access_token');
  const pendingKey=key?`request:${token}:${path}:${JSON.stringify(data)}`:'';
  if(pendingKey){key=storage.get(pendingKey)||key;storage.set(pendingKey,key);}
  const response=await Taro.request<any>({url:API_BASE+path,method,data,timeout:15000,header:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(key?{'Idempotency-Key':key}:{})}});
  if(response.statusCode>=400){if(response.statusCode===401)Taro.removeStorageSync('access_token');if(pendingKey&&response.statusCode<500)Taro.removeStorageSync(pendingKey);throw Object.assign(Error(response.data?.error?.code??'请求失败'),{status:response.statusCode});}if(pendingKey)Taro.removeStorageSync(pendingKey);return response.data.data;
}
export async function login(identity='dev-dad'){
  const code=DEV_AUTH?identity:(await Taro.login()).code;
  const data=await api(DEV_AUTH?'/auth/dev':'/auth/wechat','POST',{code});
  storage.set('access_token',data.access_token);storage.set('families',data.families);Taro.removeStorageSync('child_id');Taro.removeStorageSync('review_pending');Taro.removeStorageSync('active_review_session');Taro.removeStorageSync('review_source');return data;
}
export const go=(page:string)=>Taro.navigateTo({url:`/pages/${page}/index`});
const errorMessages:Record<string,string>={
  QUERY_NOT_IMPLEMENTED:'当前服务暂不支持此筛选，请更新服务后重试。',
  INVALID_DATE_RANGE:'请选择有效的开始和结束日期。',
  AUDIO_SETTINGS_CHANGED:'设置已在其他设备更新，已刷新，请重新选择并保存。',
  VOICE_ACCENT_UNAVAILABLE:'当前音色不可用，请到“我的 → 发音设置”重新选择。',
  AUDIO_NOT_CONFIGURED:'语音尚未配置，请检查后端 TTS 和存储配置并重启。',
  AUDIO_DAILY_LIMIT:'已达到最近 24 小时的新音频生成额度。已缓存音频仍可播放。',
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
  INVALID_INPUT_TYPE:'目前只支持文本；图片和表格文件上传尚未开放。',
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
  SESSION_EXPIRED:'本次复习会话已过期，请重新开始。',
  INVALID_REQUEST_BODY:'输入信息不符合要求，请检查后重试。'
};
export const message=(e:unknown)=>{const code=e instanceof Error?e.message:'';return errorMessages[code]??(code||'请求失败，请重试');};
