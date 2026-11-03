"""Extract explicitly identified core vocabulary from publisher lesson plans."""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

IDS = [234333, 234351, 234408, 234421, 234533, 233048, 233140, 233431, 233631, 233835, 234414, 234539, 234595, 235233, 235264, 235529, 235531, 235532, 235533, 235534]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
units = []
for i, source_id in enumerate(IDS):
    with zipfile.ZipFile(Path(f'/private/tmp/xqh-doc-{i}.docx')) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
    paragraphs = [''.join(t.text or '' for t in p.findall('.//w:t', NS)).strip()
                  for p in root.findall('.//w:p', NS)]
    words = []
    for j, text in enumerate(paragraphs[:-1]):
        if text not in ('【核心单词】', '【核心词汇】'):
            continue
        for raw in re.split('[,，]', paragraphs[j + 1]):
            word = raw.strip().rstrip('.。')
            if word and word.lower() not in {item.lower() for item in words}:
                words.append(word)
    if not words or not paragraphs[0].startswith(f'Unit {i % 5 + 1}'):
        raise ValueError(f'Unexpected document {i}')
    units.append({'grade': i // 10 + 1, 'term': '上册' if i // 5 % 2 == 0 else '下册',
                  'unit': i % 5 + 1, 'title': paragraphs[0],
                  'source_url': f'https://www.unischool.cn/unischool/file/download?ID={source_id}',
                  'words': words})
json.dump(units, sys.stdout, ensure_ascii=False, indent=2)
print()
