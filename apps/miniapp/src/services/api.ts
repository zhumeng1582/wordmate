import Taro from '@tarojs/taro';
export const storage={get:(key:string)=>Taro.getStorageSync(key),set:(key:string,value:any)=>Taro.setStorageSync(key,value)};
export function eventId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});}
export async function api<T=any>(path:string,method:'GET'|'POST'='GET',data?:any,key?:string):Promise<T>{
  const token=storage.get('access_token');
  const pendingKey=key?`request:${token}:${path}:${JSON.stringify(data)}`:'';
  if(pendingKey){key=storage.get(pendingKey)||key;storage.set(pendingKey,key);}
  const response=await Taro.request<any>({url:API_BASE+path,method,data,timeout:15000,header:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(key?{'Idempotency-Key':key}:{})}});
  if(response.statusCode>=400){if(response.statusCode===401)Taro.removeStorageSync('access_token');if(pendingKey&&response.statusCode<500)Taro.removeStorageSync(pendingKey);throw Error(response.data?.error?.code??'请求失败');}if(pendingKey)Taro.removeStorageSync(pendingKey);return response.data.data;
}
export async function login(identity='dev-dad'){
  const code=DEV_AUTH?identity:(await Taro.login()).code;
  const data=await api(DEV_AUTH?'/auth/dev':'/auth/wechat','POST',{code});
  storage.set('access_token',data.access_token);storage.set('families',data.families);Taro.removeStorageSync('child_id');Taro.removeStorageSync('review_pending');Taro.removeStorageSync('active_review_session');return data;
}
export const go=(page:string)=>Taro.navigateTo({url:`/pages/${page}/index`});
export const message=(e:unknown)=>e instanceof Error?e.message:'请求失败，请重试';
