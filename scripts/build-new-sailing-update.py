"""Generate the user-provided textbook corrections; omitted units remain unchanged."""
import json
from pathlib import Path

units=json.loads(Path('apps/api/data/textbooks/new-sailing-user-20261102.json').read_text())
meanings=dict(line.split('|',1) for line in Path('apps/api/data/textbooks/new-sailing-meanings.txt').read_text().splitlines())
def sql(value):
    return "'" + str(value).replace("'", "''") + "'"
if len(units)!=17:
    raise ValueError('Expected 17 supplied units')
rows=[]
for unit,words in units.items():
    if not words or len({word.lower() for word in words})!=len(words):
        raise ValueError(f'Invalid word list: {unit}')
    for ordinal,word in enumerate(words,1):
        meaning='中国的' if unit=='new-sailing-2-b-3' and word=='Chinese' else meanings[word.lower()]
        rows.append(f"({sql(unit)},{ordinal},{sql(word)},{sql(meaning)})")
update="-- Correct only the units supplied by the user; keep other units unchanged.\n"
update+="DELETE FROM wordmate.textbook_unit_words WHERE unit_id IN ("+','.join(map(sql,units))+");\n"
update+="INSERT INTO wordmate.textbook_unit_words(unit_id,ordinal,lemma,meaning_zh) VALUES\n"+",\n".join(rows)+";\n"
Path('apps/api/migrations/027_textbook_corrections.sql').write_text(update)
