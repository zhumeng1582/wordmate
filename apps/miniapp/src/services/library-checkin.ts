import Taro from '@tarojs/taro';
import {api,storage} from './api';
const pending=new Set<Promise<void>>();
/** Record only after the item has been loaded. Repeated views are idempotent. */
export function recordLibraryView(kind:'poems'|'hanzi',itemId:string){
 const child=String(storage.get('child_id')||''),token=String(storage.get('access_token')||'');
 if(!child||!token||!itemId)return;
 const task=api(`/children/${child}/library-checkins`,'POST',{kind,item_id:itemId}).then(()=>{}).catch(()=>{
  if(child===String(storage.get('child_id')||'')&&token===String(storage.get('access_token')||''))void Taro.showToast({title:'今日打卡未保存，请重新打开详情',icon:'none'});
 });
 pending.add(task);void task.finally(()=>pending.delete(task));
}
export async function waitForLibraryViews(){await Promise.all([...pending]);}
