import {useState} from 'react';
import {View,Switch} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {storage} from '../../services/api';
import {readHomeSections,saveHomeSections,type HomeSections} from '../../services/home-sections';
import '../settings/index.css';

const options: [keyof HomeSections,string][]=[['words','英语单词'],['poems','古诗词'],['hanzi','汉字学习']];
export default function SettingsHome(){
 const [account,setAccount]=useState(()=>String(storage.get('access_token')||''));
 const [sectionsVisible,setSectionsVisible]=useState<HomeSections>(()=>readHomeSections(storage,String(storage.get('access_token')||'')));
 useDidShow(()=>{const token=String(storage.get('access_token')||'');setAccount(token);setSectionsVisible(readHomeSections(storage,token));});
 const change=(key:keyof HomeSections,checked:boolean)=>{if(account!==String(storage.get('access_token')||''))return;const next={...sectionsVisible,[key]:checked};if(saveHomeSections(storage,account,next))setSectionsVisible(next);};
 return <View className='page settings-page'><View className='title'>首页显示</View>
 {!account?<View className='muted settings-hint'>请先登录后调整首页显示。</View>:<View className='card home-section-settings'><View className='muted small'>选择首页显示的学习内容，至少保留一项；设置仅在本机生效。</View>{options.map(([key,label])=><View className='home-section-row' key={key}><View>{label}</View><Switch aria-label={`首页显示${label}`} checked={sectionsVisible[key]} disabled={sectionsVisible[key]&&Object.values(sectionsVisible).filter(Boolean).length===1} onChange={e=>change(key,e.detail.value)}/></View>)}</View>}
 </View>;
}
