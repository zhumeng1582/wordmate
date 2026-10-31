import {View} from '@tarojs/components';
import './index.css';

export default function Help(){
 return <View className='page help-page'>
  <View className='title'>应用说明</View>
  <View className='card'>
   <View className='help-heading'>从首页开始</View>
   <View className='help-text'>点击首页的学习按钮，就能开始今日学习。没学完也没关系，暂存退出后，下次可以接着学。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>复习安排</View>
   <View className='help-text'>优先复习到期单词，再分组学习新词，也可以先学新词。</View>
   <View className='help-text'>系统会根据每个单词首次作答的结果安排后续复习，答错的单词会更早再出现。</View>
   <View className='help-text'>本组结束后可以再练错词，巩固练习不会更改首次答题记录。</View>
  </View>
 </View>;
}
