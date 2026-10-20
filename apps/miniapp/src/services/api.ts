import Taro from '@tarojs/taro';
export const storage={get:(key:string)=>Taro.getStorageSync(key),set:(key:string,value:any)=>Taro.setStorageSync(key,value)};
export function eventId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});}
export async function api<T=any>(path:string,method:'GET'|'POST'|'PUT'='GET',data?:any,key?:string):Promise<T>{
  const token=storage.get('access_token');
  const pendingKey=key?`request:${token}:${path}:${JSON.stringify(data)}`:'';
  if(pendingKey){key=storage.get(pendingKey)||key;storage.set(pendingKey,key);}
  const response=await Taro.request<any>({url:API_BASE+path,method,data,timeout:15000,header:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(key?{'Idempotency-Key':key}:{})}});
  if(response.statusCode>=400){if(response.statusCode===401)Taro.removeStorageSync('access_token');if(pendingKey&&response.statusCode<500)Taro.removeStorageSync(pendingKey);throw Error(response.data?.error?.code??'请求失败');}if(pendingKey)Taro.removeStorageSync(pendingKey);return response.data.data;
}
export async function login(identity='dev-dad'){
  const code=DEV_AUTH?identity:(await Taro.login()).code;
  const data=await api(DEV_AUTH?'/auth/dev':'/auth/wechat','POST',{code});
  storage.set('access_token',data.access_token);storage.set('families',data.families);Taro.removeStorageSync('child_id');Taro.removeStorageSync('review_pending');Taro.removeStorageSync('active_review_session');Taro.removeStorageSync('review_source');return data;
}
export const go=(page:string)=>Taro.navigateTo({url:`/pages/${page}/index`});
const errorMessages:Record<string,string>={
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
