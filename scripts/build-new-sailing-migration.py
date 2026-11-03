"""Build the initial textbook seed from the extracted publisher teaching plans."""
import json
from pathlib import Path

units = json.loads(Path('/private/tmp/new-sailing-units.json').read_text())
meanings = dict(line.split('|', 1) for line in Path('apps/api/data/textbooks/new-sailing-meanings.txt').read_text().splitlines())
if len(units) != 20:
    raise ValueError('Expected all twenty units')
def sql(value):
    return "'" + str(value).replace("'", "''") + "'"
output = ["""CREATE TABLE IF NOT EXISTS wordmate.textbook_units (
 id text PRIMARY KEY, grade integer NOT NULL, term text NOT NULL, unit integer NOT NULL,
 title text NOT NULL, source_url text NOT NULL, UNIQUE(grade,term,unit)
);
CREATE TABLE IF NOT EXISTS wordmate.textbook_unit_words (
 unit_id text NOT NULL REFERENCES wordmate.textbook_units(id),
 ordinal integer NOT NULL CHECK(ordinal>0), lemma text NOT NULL, meaning_zh text NOT NULL,
 PRIMARY KEY(unit_id,ordinal), UNIQUE(unit_id,lemma)
);
CREATE TABLE IF NOT EXISTS wordmate.textbook_joins (
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE, unit_id text NOT NULL REFERENCES wordmate.textbook_units(id),
 wordbook_id uuid NOT NULL, PRIMARY KEY(child_id,unit_id),
 FOREIGN KEY(wordbook_id,child_id) REFERENCES wordmate.wordbooks(id,child_id) ON DELETE CASCADE
);"""]
for u in units:
    key = f"new-sailing-{u['grade']}-{'a' if u['term']=='上册' else 'b'}-{u['unit']}"
    output.append(f"INSERT INTO wordmate.textbook_units(id,grade,term,unit,title,source_url) VALUES({sql(key)},{u['grade']},{sql(u['term'])},{u['unit']},{sql(u['title'])},{sql(u['source_url'])}) ON CONFLICT DO NOTHING;")
    for i, word in enumerate(u['words'], 1):
        meaning = meanings[word.lower()]
        output.append(f"INSERT INTO wordmate.textbook_unit_words(unit_id,ordinal,lemma,meaning_zh) VALUES({sql(key)},{i},{sql(word)},{sql(meaning)}) ON CONFLICT DO NOTHING;")
Path('apps/api/migrations/025_new_sailing.sql').write_text('\n'.join(output)+'\n')
