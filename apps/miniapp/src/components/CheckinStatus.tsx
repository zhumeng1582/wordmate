import {View,Text,Button} from '@tarojs/components';
export function CheckinStatus({today,onShare,onChanged,kind='words'}:{today:any;onShare?:()=>void;onChanged:()=>void;kind?:'words'|'hanzi'}){
 const label=kind==='hanzi'?'汉字':'单词';
 return <View className='home-checkin'>
  <View className='home-checkin-row'><View><Text>{today.checked_in?`✓ 今日${label}已打卡`:`今日${label}未打卡`}</Text>{today.streak_days>0&&<Text className='home-checkin-streak'>连续 {today.streak_days} 天</Text>}{Number.isInteger(today.total_checkin_days)&&<Text className='home-checkin-streak'>累计 {today.total_checkin_days} 天</Text>}</View>
   {onShare&&today.completed_words>0&&<Button className='text-action' onClick={onShare}>{today.checked_in?'分享打卡':'分享进度'}</Button>}
  </View>

 </View>;
}
