// Titles and text identify a work; punctuation and layout alone do not create a new one.
// Distinct texts with the same title and author (for example Du Fu's 绝句) stay distinct.
type Identity={id?:string;title:string;author:string;body:string};
const normalized=(value:string)=>value.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();
export function samePoem(a:Identity,b:Identity){
 const title=normalized(a.title),body=normalized(a.body),author=normalized(a.author),otherAuthor=normalized(b.author);
 return !!title&&!!body&&title===normalized(b.title)&&body===normalized(b.body)&&(!author||!otherAuthor||author===otherAuthor);
}
