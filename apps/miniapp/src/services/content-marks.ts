import Taro from '@tarojs/taro';
import {storage} from './api';
// Restoring study changes only the archive flag; never reset cards or history.
export async function confirmMastery(archived:unknown,current:()=>boolean){
 if(!current())return false;
 if(archived)return true;
 const key=`mastery_notice:${storage.get('account_user_id')||storage.get('access_token')}`;
 if(storage.get(key))return current();
 const answer=await Taro.showModal({title:'标记已掌握',content:'标记后将移出日常学习和复习，原有学习记录会保留。可在“已掌握”列表中选择“恢复学习”。',confirmText:'标记掌握'});
 if(!current()||!answer.confirm)return false;
 storage.set(key,true);return true;
}
