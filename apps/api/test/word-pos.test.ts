import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {shortPos} from '../src/word-pos.ts';
import {mergeWordSenses} from '../src/word-senses.ts';
test('stored abbreviations and full names merge as the same sense',()=>{assert.deepEqual(mergeWordSenses([{part_of_speech:'n.',meaning_zh:'苹果'}],[{part_of_speech:'noun',meaning_zh:'苹果'}]),[{part_of_speech:'n.',meaning_zh:'苹果'}]);});
test('migration repairs existing labels, preserves learning fields and normalizes future writes',async()=>{const pg=new PGlite();try{await pg.exec("CREATE SCHEMA wordmate; CREATE TABLE wordmate.child_words(id int,part_of_speech text,meaning_zh text,version int,learned bool); CREATE TABLE wordmate.shared_wordbook_items(part_of_speech text); INSERT INTO wordmate.child_words VALUES(1,'noun；adjective','苹果；美丽',7,true); INSERT INTO wordmate.shared_wordbook_items VALUES('verb');");await pg.exec(readFileSync('apps/api/migrations/058_word_pos_abbreviations.sql','utf8'));assert.deepEqual((await pg.query('SELECT * FROM wordmate.child_words')).rows,[{id:1,part_of_speech:'n.；adj.',meaning_zh:'苹果；美丽',version:7,learned:true}]);for(const value of ['noun','N.','verb / adjective','adv','名词；副词','教材']){const sql=(await pg.query('SELECT wordmate.short_word_pos($1) value',[value])).rows[0].value;assert.equal(sql,shortPos(value));}await pg.query('INSERT INTO wordmate.child_words(part_of_speech) VALUES($1)',['pronoun']);assert.equal((await pg.query('SELECT part_of_speech FROM wordmate.child_words WHERE id IS NULL')).rows[0].part_of_speech,'pron.');assert.equal((await pg.query('SELECT part_of_speech FROM wordmate.shared_wordbook_items')).rows[0].part_of_speech,'v.');}finally{await pg.close();}});

test('textbook migration repairs the matching sense in personal words and shared copies and preserves freezing and progress fields', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE SCHEMA wordmate;
      CREATE TABLE wordmate.child_words(id int,lemma text,meaning_zh text,part_of_speech text,version int,learned bool);
      CREATE TABLE wordmate.shared_wordbook_items(LIKE wordmate.child_words);
      INSERT INTO wordmate.child_words VALUES
        (1,'red','红色的；红色','adj.；教材',7,true),
        (2,'you','你；你们','教材',3,true),
        (3,'Chinese','语文','教材',2,false),
        (4,'Chinese','中国的','教材',5,true),
        (5,'to','尚未核对的自定义释义','教材',1,false);
      INSERT INTO wordmate.shared_wordbook_items SELECT * FROM wordmate.child_words`);
    await pg.exec(readFileSync('apps/api/migrations/058_word_pos_abbreviations.sql','utf8'));
    const migration = readFileSync('apps/api/migrations/062_textbook_word_pos.sql','utf8');
    const before = (await pg.query('SELECT * FROM wordmate.child_words ORDER BY id')).rows;
    await pg.exec(migration);
    await pg.exec(migration);
    for (const table of ['child_words','shared_wordbook_items']) {
      const after = (await pg.query('SELECT * FROM wordmate.' + table + ' ORDER BY id')).rows;
      assert.deepEqual(after, before.map((row,i) => ({...row, part_of_speech: ['adj.；n.','pron.','n.','adj.','教材'][i]})));
    }
    const reviewed = await pg.query(`SELECT wordmate.textbook_word_pos('dad','爸爸') AS dad,
      wordmate.textbook_word_pos('happy','高兴的') AS happy`);
    assert.deepEqual(reviewed.rows,[{dad:'n.',happy:'adj.'}]);
    const escaped = (await pg.query("SELECT wordmate.resolved_word_pos($1,$2,$3) AS pos", ['you','教材；pron.','你\\；你们；你本人'])).rows[0];
    assert.equal(escaped.pos,'pron.；pron.');
    await pg.query("INSERT INTO wordmate.child_words VALUES(6,'to','（用于动词前）','教材',1,false)");
    assert.equal((await pg.query('SELECT part_of_speech FROM wordmate.child_words WHERE id=6')).rows[0].part_of_speech,'part.');
    for (const label of ['auxiliary verb','modal v.','情态动词','particle','contraction','限定词']) {
      assert.equal((await pg.query("SELECT wordmate.resolved_word_pos('test',$1,'test') pos",[label])).rows[0].pos,shortPos(label));
    }
  } finally {
    await pg.close();
  }
});
