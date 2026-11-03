export type VocabularyTarget={surface:string;start:number;end:number};
const irregularNouns:Record<string,string[]>={
 child:['children'],person:['people','persons'],man:['men'],woman:['women'],foot:['feet'],tooth:['teeth'],mouse:['mice'],goose:['geese'],ox:['oxen'],
 knife:['knives'],wife:['wives'],life:['lives'],leaf:['leaves'],wolf:['wolves'],calf:['calves'],half:['halves'],loaf:['loaves'],shelf:['shelves'],thief:['thieves'],elf:['elves'],
 potato:['potatoes'],tomato:['tomatoes'],hero:['heroes'],echo:['echoes'],quiz:['quizzes'],
 sheep:['sheep'],deer:['deer'],fish:['fish','fishes'],series:['series'],species:['species'],scissors:['scissors'],trousers:['trousers'],clothes:['clothes']
};
function nounPlurals(lemma:string){
 // Handle a single noun or the final word of a space-separated compound.
 // Other phrases retain exact matching rather than guessing their grammar.
 const match=/^(.*\s)?([a-z]+)$/.exec(lemma.toLowerCase());if(!match)return [];
 const prefix=match[1]??'',word=match[2],forms=irregularNouns[word]??[/[^aeiou]y$/.test(word)?word.slice(0,-1)+'ies':/(?:s|x|z|ch|sh)$/.test(word)?word+'es':word+'s'];
 return forms.map(form=>prefix+form);
}
export function locateVocabularyTarget(sentence:string,lemma:string,partOfSpeech?:string):VocabularyTarget|null{
 if(typeof sentence!=='string'||typeof lemma!=='string'||!lemma.trim())return null;
 const forms=[...new Set([lemma,...(partOfSpeech==='noun'?nounPlurals(lemma):[])])].sort((a,b)=>b.length-a.length);
 const escaped=forms.map(form=>form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
 const match=new RegExp(`(^|[^a-z])(${escaped})(?=[^a-z]|$)`,'i').exec(sentence);if(!match)return null;
 const start=match.index+match[1].length;return {surface:match[2],start,end:start+match[2].length};
}
