import {View} from '@tarojs/components';
import './index.css';

export default function Help(){
 return <View className='page help-page'>
  <View className='title'>应用说明</View>
  <View className='card'>
   <View className='help-heading'>从首页开始</View>
   <View className='help-text'>点击首页的学习按钮，就能开始今日学习。没学完也没关系，返回后，下次可以接着学。</View>
   <View className='help-text'>新词按每日目标分轮学习：目标 10 个，每轮就是 10 个。完成后可继续下一轮，不受当天目标限制；剩余不足一轮时，学习剩余单词。每轮最多 100 个。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>复习安排</View>
   <View className='help-text'>优先复习到期单词，再分组学习新词，也可以先学新词。</View>
   <View className='help-text'>系统会根据每个单词首次作答的结果安排后续复习，答错的单词会更早再出现。</View>
   <View className='help-text'>本组结束后可以再练错词，巩固练习不会更改首次答题记录。</View>
   <View className='help-text'>点击首页“复习单词”或“继续复习”，再选择“按日期复习”，依次选择开始和结束日期，再点击“开始复习”。可以选择同一天或跨月范围，同一个词不会因跨天重复出现而重复加入。没有到期单词时，“复习单词”也会进入日期选择。</View>
   <View className='help-text'>错题集里的日期筛选只显示错词记录，也可按日期范围开始错词复习。</View>
   <View className='help-text'>未到复习时间的历史单词只作巩固，不改变复习计划；已到期的单词按本次作答更新计划。同一天重复复习同一个词，只计一次学习词数。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>英语常用句</View>
   <View className='help-text'>从首页进入句子本，按录入顺序学习新句，按到期安排复习。学习页直接显示英文和中文，点击英文前的播放图标听音跟读；熟悉后进入下一句，不熟悉时选择“还需巩固”。</View>
   <View className='help-text'>查看句子和听音不计进度，点击“下一句”“完成本轮”或“还需巩固”才保存进度。同一句每天只计一次；达到句子每日目标后自动打卡，与单词和汉字分别统计。</View>
   <View className='help-text'>句子与单词共用英语口音、音色和自动播放设置，可在设置的“学习设置”中调整。句子列表的详情箭头可进入详情，查看完整中英文并收藏、标记掌握或编辑。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>统一录入与词本</View>
   <View className='help-text'>录入学习内容和录入记录统一支持单词、句子、古诗及汉字。可输入文字、拍照或导入文件，AI 整理后先核对再保存；未完成的任务可在录入记录中继续处理。</View>
   <View className='help-text'>录入句子时，有中文译文优先保留用户提供的译文，没有时由 AI 补充；系统会检查中英文是否对应，疑似误译会展示原因和建议，由用户核对确认。保存前会校验重复，同一句不同译文会提示冲突，不会静默覆盖。</View>
   <View className='help-text'>词本管理与发现统一管理四类词本，支持共享与加入。加入共享词本后，个人学习进度独立，共享副本内容只读。首页显示可选择四类内容及排列顺序。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>古诗词</View>
   <View className='help-text'>从首页进入古诗词，粘贴文字、拍照或选择文件，通过 AI 整理后核对并保存。诗词可随时编辑、搜索或筛选，掌握后可标记已掌握。</View>
   <View className='help-text'>在诗词详情可听普通话朗读或使用 AI 学童了解诗词；诗词背诵不计入单词目标、打卡或连续天数。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>汉字学习</View>
   <View className='help-text'>从首页进入汉字库，可以手动录入、批量粘贴，或者拍照、选择图片和文件。文件在后台读取，可返回查看进度；材料中的汉字会列为候选，也可主动使用 AI 提取生字；AI 结果可能有遗漏，核对并排除不需要的字后保存。</View>
   <View className='help-text'>汉字可编辑、搜索和筛选，也可以标记已掌握或重点字。详情编辑页可以使用 AI 补充空白拼音，核对后保存，多音字请结合组词核对。汉字和例句支持普通话朗读，多音字请结合拼音和例句核对；可通过 AI 学童用文字或语音提问。汉字学习不计入单词目标、打卡或连续天数。</View>
  </View>
  <View className='card'>
   <View className='help-heading'>打卡与分享</View>
   <View className='help-text'>单词、句子和汉字达到各自每日目标后分别自动打卡，在首页查看进度与连续天数；单词支持分享打卡。补卡请前往设置里的“打卡与补卡”，在日历中选择过去漏打卡的日期；今天和未来不能补卡。</View>
   <View className='help-text'>单词、句子和汉字的补卡机会分别计算，各自连续实际达标 15 天可获得 1 次补卡机会；补卡只补记漏卡日期，不增加学习数量，也不用于重复领取奖励。</View>
  </View>
 </View>;
}
