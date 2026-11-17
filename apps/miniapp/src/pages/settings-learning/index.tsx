import {useState} from 'react';
import {View,Switch} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {api,storage} from '../../services/api';
import {LearningGoal} from '../../components/LearningGoal';
import {AudioPreferences} from '../../components/AudioPreferences';
import '../settings/index.css';

export default function SettingsLearning(){
 const [signedIn,setSignedIn]=useState(()=>!!storage.get('access_token')),[hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id')),[account,setAccount]=useState(()=>storage.get('access_token')||''),[child,setChild]=useState(()=>storage.get('child_id')||'');
 const [voicePrice,setVoicePrice]=useState('');
 const [autoNext,setAutoNext]=useState(()=>storage.get(`study_auto_next:${storage.get('access_token')}`)!==false);
 useDidShow(()=>{const token=storage.get('access_token');if(token)void api('/me/ai-settings').then(data=>{if(storage.get('access_token')===token)setVoicePrice(data.tutor_prices?.asr_yuan_per_minute||'');}).catch(()=>{});});
 useDidShow(()=>{const token=storage.get('access_token'),currentChild=storage.get('child_id');setSignedIn(!!token);setAccount(token||'');setChild(currentChild||'');setHasChild(!!token&&!!currentChild);setAutoNext(storage.get(`study_auto_next:${token}`)!==false);});
 return <View className='page settings-page'><View className='title'>学习设置</View>
 {!signedIn&&<View className='muted settings-hint'>请先登录后调整学习设置。</View>}
 {signedIn&&!hasChild&&<View className='muted settings-hint'>选择孩子后可设置每日目标。</View>}
 {hasChild&&<><View className='subtitle settings-section-title'>每日目标</View><View className='card'><View className='settings-goal-group'><View className='settings-group-title'>英语单词</View><LearningGoal key={account+':'+child}/></View><View className='settings-goal-group'><View className='settings-group-title'>英语常用句</View><LearningGoal key={account+':'+child+':sentences'} kind='sentences'/></View><View className='settings-goal-group'><View className='settings-group-title'>汉字学习</View><LearningGoal key={account+':'+child+':hanzi'} kind='hanzi'/></View><View className='muted small'>单词、句子和汉字的学习数量、打卡与连续天数分别统计。</View></View></>}
 {signedIn&&<><View className='subtitle settings-section-title'>英语发音</View><View className='card'><AudioPreferences key={account}/></View></>}
 {signedIn&&<><View className='subtitle settings-section-title'>学习交互</View><View className='card'><View className='autoplay-setting'><View>单词答题后自动切换<View className='muted small'>日常单词练习答对后自动继续，答错后停留查看；关闭后手动切换。本机生效，句子学习始终手动进入下一句。</View></View><Switch aria-label='单词答题后自动切换' checked={autoNext} onChange={event=>{if(account!==storage.get('access_token'))return;const value=event.detail.value;storage.set(`study_auto_next:${account}`,value);setAutoNext(value);}}/></View></View></>}
 <View className='subtitle settings-section-title'>普通话朗读</View><View className='card'><View className='settings-group-title'>汉字</View><View className='muted small'>朗读：普通话。多音字请结合拼音和例句核对。</View><View className='settings-group-title settings-group-spaced'>古诗词</View><View className='muted small'>朗读：标准普通话。诗词背诵不计入单词每日目标、打卡或连续天数。</View><View className='muted small'>汉字和诗词朗读不受英语发音设置影响。</View></View>
 <View className='subtitle settings-section-title'>AI 学童 · 语音提问</View><View className='card'><View>长按录音，松手发送，上滑取消</View><View className='muted small'>录音会发送给语音识别服务，识别后的文字会自动发送给 AI 学童。语音识别{voicePrice?`按 ¥${voicePrice}/分钟`:'按当前语音识别价格'}使用家庭额度，AI 回答另按所选服务计费。取消的录音不发送，请勿说出姓名、学校或联系方式。首次录音需授权微信使用麦克风。</View></View>
 </View>;
}
