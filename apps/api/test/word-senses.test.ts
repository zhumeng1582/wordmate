import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWordSenses,formatWordSenses,mergeWordSenses} from '../src/word-senses.ts';
test('legacy semicolons are part of a single meaning',()=>{assert.deepEqual(parseWordSenses('noun','水壶；罐'),[{part_of_speech:'noun',meaning_zh:'水壶；罐'}]);});
test('multiple meanings round-trip escaped separators and backslashes',()=>{const data=[{part_of_speech:'noun',meaning_zh:'水壶；罐'}, {part_of_speech:'verb',meaning_zh:'写\\记'}];const encoded=formatWordSenses(data);assert.deepEqual(parseWordSenses(encoded.part_of_speech,encoded.meaning_zh),data);});
test('malformed existing data is returned intact',()=>{assert.deepEqual(parseWordSenses('noun；verb','拥抱'),[{part_of_speech:'noun；verb',meaning_zh:'拥抱'}]);});
test('merging retains distinct senses while skipping exact duplicates',()=>{const a={part_of_speech:'noun',meaning_zh:'橙子'},b={part_of_speech:'adjective',meaning_zh:'橙色'};assert.deepEqual(mergeWordSenses([a],[a,b]),[a,b]);});
test('length migration preserves data and supports multiple senses',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFileSync}=await import('node:fs');const pg=new PGlite();try{
  await pg.exec('CREATE SCHEMA wordmate; CREATE TABLE wordmate.child_words(part_of_speech varchar(24),meaning_zh varchar(500)); CREATE TABLE wordmate.shared_wordbook_items(part_of_speech varchar(24),meaning_zh varchar(500)); CREATE TABLE wordmate.word_tutor_sessions(part_of_speech varchar(80),meaning_zh varchar(500)); INSERT INTO wordmate.child_words VALUES (\'noun\',\'水壶；罐\')');
  await pg.exec(readFileSync('apps/api/migrations/042_word_sense_lengths.sql','utf8'));const old=(await pg.query('SELECT * FROM wordmate.child_words')).rows[0];assert.deepEqual(old,{part_of_speech:'noun',meaning_zh:'水壶；罐'});
  await pg.query('INSERT INTO wordmate.child_words VALUES ($1,$2)',['noun；adjective；verb；adverb','词'.repeat(600)]);
 }finally{await pg.close();}
});
