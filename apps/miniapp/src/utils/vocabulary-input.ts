// Keep spaces inside phrases (e.g. "ice cream").
export const splitVocabularyInput=(raw:string):string[]=>raw.split(/[\r\n,，、;；]+/).map(x=>x.trim()).filter(Boolean);
