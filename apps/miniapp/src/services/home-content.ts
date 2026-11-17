import type {LibraryKind} from './library-navigation';
export type HomeBook={id:string;name:string;read_only?:boolean;word_count?:number;poem_count?:number;hanzi_count?:number;sentence_count?:number};
export type HomeEmpty='empty'|'empty-book';
const countKeys={words:'word_count',poems:'poem_count',hanzi:'hanzi_count',sentences:'sentence_count'} as const;
export const homeContentCopy={
 words:{title:'英语单词',name:'单词',book:'词本',description:'录入课本里的单词，或找一本现成的词本。'},
 poems:{title:'古诗词',name:'古诗',book:'诗本',description:'把课内古诗放进诗本，每天读一读。'},
 hanzi:{title:'汉字学习',name:'汉字',book:'字本',description:'从正在学的生字开始，认字、读音、组词。'},
 sentences:{title:'英语常用句',name:'句子',book:'句子本',description:'添加日常用得到的句子，练习开口说英文。'}
} as const;
// Book totals include mastered items. Never infer emptiness from new/due queues.
export function homeEmptyState(kind:LibraryKind,total:number|null,books:HomeBook[],current:string):HomeEmpty|null{
 if(total!==0)return null;
 const field=countKeys[kind];
 // Unavailable counts in another book cannot prove that the child has no content.
 return books.some(book=>book.id!==current&&(!Number.isInteger(book[field])||Number(book[field])>0))?'empty-book':'empty';
}
export function validHomeTotals(total:unknown,learned:unknown){return Number.isInteger(total)&&Number.isInteger(learned)&&Number(total)>=0&&Number(learned)>=0&&Number(learned)<=Number(total);}
