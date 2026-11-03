import {useState} from 'react';
import {View,Switch} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {storage} from '../../services/api';
import {LearningGoal} from '../../components/LearningGoal';
import {AudioPreferences} from '../../components/AudioPreferences';
import '../settings/index.css';

export default function SettingsLearning(){
 const [signedIn,setSignedIn]=useState(()=>!!storage.get('access_token')),[hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id')),[account,setAccount]=useState(()=>storage.get('access_token')||''),[child,setChild]=useState(()=>storage.get('child_id')||'');
 const [autoNext,setAutoNext]=useState(()=>storage.get(`study_auto_next:${storage.get('access_token')}`)!==false);
 useDidShow(()=>{const token=storage.get('access_token'),currentChild=storage.get('child_id');setSignedIn(!!token);setAccount(token||'');setChild(currentChild||'');setHasChild(!!token&&!!currentChild);setAutoNext(storage.get(`study_auto_next:${token}`)!==false);});
 return <View className='page settings-page'><View className='title'>学习设置</View>
 {!signedIn&&<View className='muted settings-hint'>请先登录后调整学习设置。</View>}
 {signedIn&&<><View className='subtitle settings-section-title'>学习节奏</View><View className='card'><View className='autoplay-setting'><View>答题后自动切换<View className='muted small'>关闭后手动进入下一题；本机生效</View></View><Switch checked={autoNext} onChange={event=>{const value=event.detail.value;storage.set(`study_auto_next:${account}`,value);setAutoNext(value);}}/></View></View></>}
 {hasChild&&<><View className='subtitle settings-section-title'>学习目标</View><View className='card'><LearningGoal key={account+':'+child}/></View></>}
 {signedIn&&<><View className='subtitle settings-section-title'>发音设置</View><View className='card'><AudioPreferences key={account}/></View></>}
 </View>;
}
