import {View} from '@tarojs/components';
import './index.css';

export default function Help(){
 return <View className='page help-page'>
  <View className='title'>应用说明</View>
  <View className='card'>
   <View className='help-heading'>从首页开始</View>
   <View className='help-text'>点击首页的学习按钮，就能开始今日学习。没学完也没关系，暂存退出后，下次可以接着学。</View>
   <View className='help-text'>新词按每日目标分轮学习：目标 10 个，每轮就是 10 个。完成后可继续下一轮，不受当天目标限制；剩余不足一轮时，学习剩余单词。每轮最多 100 个。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>复习安排</View>
   <View className='help-text'>优先复习到期单词，再分组学习新词，也可以先学新词。</View>
   <View className='help-text'>系统会根据每个单词首次作答的结果安排后续复习，答错的单词会更早再出现。</View>
   <View className='help-text'>本组结束后可以再练错词，巩固练习不会更改首次答题记录。</View>
   <View className='help-text'>点击首页“按日期复习”，依次选择开始和结束日期，再点击“开始复习”。可以选择同一天或跨月范围，同一个词不会因跨天重复出现而重复加入。没有到期单词时，“复习单词”也会进入日期选择。</View>
   <View className='help-text'>错题集里的日期筛选只显示错词记录，也可按日期范围开始错词复习。</View>
   <View className='help-text'>未到复习时间的历史单词只作巩固，不改变复习计划；已到期的单词按本次作答更新计划。同一天重复复习同一个词，只计一次学习词数。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>打卡与分享</View>
   <View className='help-text'>完成当天学习目标后自动打卡，在首页查看连续天数、分享打卡。补卡入口会在有可用机会时显示。</View>
   <View className='help-text'>连续实际达标 15 天可获得 1 次补卡机会；补卡只恢复连续记录，不增加学习词数，也不用于重复领取奖励。</View>
  </View>
 </View>;
}
