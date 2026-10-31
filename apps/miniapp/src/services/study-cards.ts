export function mergeStudyCardWithWord(card:any,word:any){
 return {
  ...card,
  lemma:word.lemma,
  meaning_zh:word.meaning_zh,
  part_of_speech:word.part_of_speech,
  ipa_gb:word.ipa_gb,
  ipa_us:word.ipa_us,
  example:word.example??card.example
 };
}
