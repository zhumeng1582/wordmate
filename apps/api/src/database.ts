import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Database,Sql} from './ports';

export async function connect(url:string,options:{initializeLocal?:boolean}={}):Promise<{db:Database;source:{destroy():Promise<void>}}>{
  if(!url)throw Error('DATABASE_URL is required');
  if(url.startsWith('pglite:')){
    if(process.env.NODE_ENV!=='development'||process.env.AUTH_MODE!=='development')throw Error('Embedded database is only enabled for local development');
    const {PGlite}=await import('@electric-sql/pglite');
    const directory=resolve(__dirname,'../../..',url.slice('pglite:'.length));
    const localRoot=resolve(__dirname,'../../../.local');
    if(!directory.startsWith(localRoot+'/'))throw Error('Embedded database must be inside .local/');
    const initialize=options.initializeLocal!==false;
    if(initialize)mkdirSync(directory,{recursive:true});
    else if(!existsSync(resolve(directory,'PG_VERSION')))throw Error('Existing embedded database required for managed migrations');
    const pg=new PGlite(directory);await pg.waitReady;
    try{if(initialize){
    const exists=await pg.query("SELECT 1 FROM information_schema.schemata WHERE schema_name='wordmate'");
    if(!exists.rows.length)await pg.exec(readFileSync(resolve(__dirname,'../../../deliverables/0.1/database/001_schema.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/002_audio.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/003_audio_preferences.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/004_voice_previews.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/005_audio_autoplay.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/006_checkin_shares.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/007_import_attempts.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/008_shared_wordbooks.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/009_child_profiles.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/010_checkin_share_images.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/011_checkin_poster_pool.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/012_checkin_makeup.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/013_referrals.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/014_release_fixes.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/015_privacy_lifecycle.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/016_security_integrity.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/017_ai_accounts.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/018_family_ai.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/019_parent_profiles.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/020_audio_billing.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/021_vocabulary_bulk_index.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/022_shared_wordbook_author.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/023_wordbook_categories.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/024_textbook_sources.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/025_new_sailing.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/026_textbook_volumes.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/027_textbook_corrections.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/028_word_tutor.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/029_tutor_learning.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/030_audio_feedback.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/031_word_feedback.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/032_admin_feedback.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/033_admin_audio_repairs.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/034_poems.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/035_poem_fields.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/036_poem_import_ai.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/037_poem_import_jobs.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/038_poem_import_page_progress.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/039_poem_chat_audio.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/040_hanzi.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/041_hanzi_order.sql'),'utf8'));
    // 042 changes column types even when their widths already match. Replaying
    // it after 058 creates column-dependent triggers prevents a local reopen.
    // Inspect the actual schema; do not replay the ALTER or invent a baseline.
    const senseWidths = await pg.query<{ready:number}>(`
      SELECT count(*)::int AS ready
      FROM information_schema.columns
      WHERE table_schema='wordmate'
        AND table_name IN ('child_words','shared_wordbook_items','word_tutor_sessions')
        AND (
          (column_name='part_of_speech' AND character_maximum_length>=240)
          OR (column_name='meaning_zh' AND character_maximum_length>=4000)
        )
    `);
    if (senseWidths.rows[0]?.ready !== 6) {
      await pg.exec(readFileSync(resolve(__dirname,'../migrations/042_word_sense_lengths.sql'),'utf8'));
    }
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/043_library_archive.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/044_library_checkins.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/045_hanzi_learning.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/046_hanzi_review_cards.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/047_hanzi_monthly_quizzes.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/048_hanzi_quiz_lease.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/049_hanzi_makeup.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/050_hanzi_books.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/051_hanzi_study_sessions.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/052_learning_assistant.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/053_tutor_suggestions.sql'),'utf8'));
    for (const name of [
      '054_poem_books.sql','055_import_records.sql','056_import_order.sql',
      '057_sentence_learning.sql','058_word_pos_abbreviations.sql',
      '059_prepend_library_imports.sql','060_library_favorites.sql','061_content_repairs.sql','062_textbook_word_pos.sql',
    ]) {
      if (name === '058_word_pos_abbreviations.sql') {
        // Unlike the other local replay scripts, 058 uses CREATE TRIGGER
        // without DROP/IF EXISTS. Only skip when both expected triggers exist.
        const normalized = await pg.query<{ready:number}>(`
          SELECT count(*)::int AS ready
          FROM pg_trigger t
          JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='wordmate' AND NOT t.tgisinternal
            AND t.tgfoid=to_regprocedure('wordmate.normalize_word_pos()')
            AND (
              (c.relname='child_words' AND t.tgname='normalize_word_pos')
              OR (c.relname='shared_wordbook_items' AND t.tgname='normalize_shared_word_pos')
            )
        `);
        if (normalized.rows[0]?.ready === 2) {
          continue;
        }
      }
      await pg.exec(readFileSync(resolve(__dirname,'../migrations',name),'utf8'));
    }
    }}catch(error){await pg.close();throw error;}
    const db:Database={query:async(s,p)=>({rows:(await pg.query(s,p)).rows as any}),transaction:fn=>pg.transaction(tx=>fn({query:async(s,p)=>({rows:(await tx.query(s,p)).rows as any})}))};
    return {db,source:{destroy:()=>pg.close()}};
  }
  const {DataSource}=await import('typeorm');
  const source=new DataSource({type:'postgres',url,synchronize:false,logging:false,extra:{max:10}});await source.initialize();
  const wrap=(query:(s:string,p?:any[])=>Promise<any>):Sql=>({query:async(s,p)=>{const raw=await query(s,p);return {rows:Array.isArray(raw)&&raw.length===2&&Array.isArray(raw[0])&&typeof raw[1]==='number'?raw[0]:raw};}});
  return {source,db:{...wrap(source.query.bind(source)),transaction:fn=>source.transaction(manager=>fn(wrap(manager.query.bind(manager))))}};
}
