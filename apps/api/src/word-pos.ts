const posLabels:Record<string,string>={n:'n.',v:'v.',adj:'adj.',adv:'adv.',pron:'pron.',prep:'prep.',conj:'conj.',interj:'interj.',art:'art.',det:'det.',num:'num.',phr:'phr.',noun:'n.',verb:'v.',adjective:'adj.',adverb:'adv.',pronoun:'pron.',preposition:'prep.',conjunction:'conj.',interjection:'interj.',article:'art.',determiner:'det.',numeral:'num.',number:'num.',phrase:'phr.','名词':'n.','动词':'v.','形容词':'adj.','副词':'adv.','代词':'pron.','介词':'prep.','连词':'conj.','感叹词':'interj.','冠词':'art.','数词':'num.','短语':'phr.'};
const compoundLabels: Record<string, string> = {
  'auxiliary verb': 'aux.', 'auxiliary v.': 'aux.', '助动词': 'aux.',
  'modal verb': 'mod.', 'modal v.': 'mod.', '情态动词': 'mod.',
  particle: 'part.', '助词': 'part.', contraction: 'contr.', '缩约形式': 'contr.',
  '限定词': 'det.',
};
export function shortPos(value: string): string {
  return String(value ?? '').normalize('NFC').trim()
    .replace(/\b(?:auxiliary|modal) (?:verb\b|v\.)|\b(?:particle|contraction)\b|助动词|情态动词|助词|缩约形式|限定词/giu,
      token => compoundLabels[token.toLowerCase()] ?? token)
    .replace(/[A-Za-z]+\.?|名词|动词|形容词|副词|代词|介词|连词|感叹词|冠词|数词|短语/gu,
      token => posLabels[token.toLowerCase().replace(/\.$/, '')] ?? token);
}
