import type {ShareRecord} from './share-poster';
export function characterShareRecord(progress:any,date:string):ShareRecord{
 if(progress?.date!==date||!Number.isInteger(progress.completed)||progress.completed<0||!Number.isInteger(progress.goal)||progress.goal<1||typeof progress.checked_in!=='boolean'||!Number.isInteger(progress.streak_days)||progress.streak_days<0)throw Error('汉字学习进度暂不可用，请刷新后重试。');
 return {kind:'hanzi',date,studied_words:progress.completed,goal:progress.goal,checked_in:progress.checked_in,streak_days:progress.streak_days,streak_through:progress.streak_through??null,copy_source:'template',quotes:[{en:'One character, one small step.',zh:'多认识一个字，就多看懂一点世界。',theme:'growth'},{en:'Keep learning, little by little.',zh:'每天学一点，让认识的字慢慢变多。',theme:'perseverance'},{en:'Find something new in every character.',zh:'在一笔一画里，发现新的故事。',theme:'curiosity'}]};
}
