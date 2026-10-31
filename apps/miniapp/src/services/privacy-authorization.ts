import Taro from '@tarojs/taro';
type Resolve=(options:{event:'exposureAuthorization'|'agree'|'disagree';buttonId?:string})=>void;
let installed=false,opening=false;
const pending=new Set<Resolve>();
export const PRIVACY_AGREE_BUTTON='wordmate-privacy-agree';
export const hasPendingPrivacyAuthorization=()=>pending.size>0;
export function exposePrivacyAuthorization(){for(const resolve of pending)resolve({event:'exposureAuthorization'});}
export function finishPrivacyAuthorization(agree:boolean){
 for(const resolve of pending)resolve(agree?{event:'agree',buttonId:PRIVACY_AGREE_BUTTON}:{event:'disagree'});
 pending.clear();Taro.eventCenter.trigger('wordmate:privacy-authorization');
}
export function installPrivacyAuthorization(){
 if(installed||!Taro.canIUse('onNeedPrivacyAuthorization')||!Taro.canIUse('button.open-type.agreePrivacyAuthorization'))return;
 installed=true;Taro.onNeedPrivacyAuthorization(resolve=>{
  pending.add(resolve);Taro.eventCenter.trigger('wordmate:privacy-authorization');
  if(Taro.getCurrentPages().slice(-1)[0]?.route==='pages/login/index')Taro.nextTick(exposePrivacyAuthorization);
  else if(!opening){opening=true;void Taro.navigateTo({url:'/pages/login/index'}).then(exposePrivacyAuthorization,()=>finishPrivacyAuthorization(false)).finally(()=>{opening=false;});}
 });
}
