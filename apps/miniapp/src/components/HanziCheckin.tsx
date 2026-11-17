import {View,Text} from '@tarojs/components';
export function HanziCheckin({progress,onChanged}:{progress:any;onChanged:()=>void}){
 if(!progress)return <View className='home-checkin'>汉字进度暂不可用</View>;
 return <View className='home-checkin'><View className='home-checkin-row'><View><Text>{progress.checked_in?'✓ 已达目标':'今日累计'} {progress.completed} / {progress.goal} 字</Text>{progress.streak_days>0&&<Text className='home-checkin-streak'>连续 {progress.streak_days} 天</Text>}{Number.isInteger(progress.total_days)&&<Text className='home-checkin-streak'>累计 {progress.total_days} 天</Text>}</View></View></View>;
}
