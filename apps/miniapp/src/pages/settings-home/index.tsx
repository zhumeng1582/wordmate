import {useState} from 'react';
import {View,Switch,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {storage} from '../../services/api';
import {readHomeSections,saveHomeSections,readHomeSectionOrder,saveHomeSectionOrder,type HomeSections,type HomeSection} from '../../services/home-sections';
import '../settings/index.css';

const labels:Record<HomeSection,string>={words:'英语单词',poems:'古诗词',hanzi:'汉字学习',sentences:'英语常用句'};
export default function SettingsHome(){
 const [account,setAccount]=useState(()=>String(storage.get('access_token')||''));
 const [sectionsVisible,setSectionsVisible]=useState<HomeSections>(()=>readHomeSections(storage,String(storage.get('access_token')||'')));
 const [order,setOrder]=useState(()=>readHomeSectionOrder(storage,String(storage.get('access_token')||'')));
 useDidShow(()=>{const token=String(storage.get('access_token')||'');setAccount(token);setSectionsVisible(readHomeSections(storage,token));setOrder(readHomeSectionOrder(storage,token));});
 const change=(key:keyof HomeSections,checked:boolean)=>{if(account!==String(storage.get('access_token')||''))return;const next={...sectionsVisible,[key]:checked};if(saveHomeSections(storage,account,next))setSectionsVisible(next);};
 const move=(key:HomeSection,offset:number)=>{if(account!==String(storage.get('access_token')||''))return;const index=order.indexOf(key),target=index+offset;if(index<0||target<0||target>=order.length)return;const next=[...order];[next[index],next[target]]=[next[target],next[index]];if(saveHomeSectionOrder(storage,account,next))setOrder(next);};
 return <View className='page settings-page'><View className='title'>首页显示</View>
 {!account?<View className='muted settings-hint'>请先登录后调整首页显示。</View>:<View className='card home-section-settings'><View className='muted small'>上移、下移调整首页顺序；关闭后保留位置，至少显示一项。设置自动保存在本机。</View>{order.map((key,index)=><View className='home-section-row' key={key}><View className='home-section-label'>{index+1}. {labels[key]}</View><View className='home-section-move'><Button className='text-action' aria-label={`上移${labels[key]}`} disabled={index===0} onClick={()=>move(key,-1)}>上移</Button><Button className='text-action' aria-label={`下移${labels[key]}`} disabled={index===order.length-1} onClick={()=>move(key,1)}>下移</Button></View><Switch aria-label={`首页显示${labels[key]}`} checked={sectionsVisible[key]} disabled={sectionsVisible[key]&&Object.values(sectionsVisible).filter(Boolean).length===1} onChange={e=>change(key,e.detail.value)}/></View>)}</View>}
 </View>;
}
