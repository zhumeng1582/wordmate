from pathlib import Path
from html.parser import HTMLParser
import json,re,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parents[1]
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if (tag=='a' and k=='href') or (tag in ['img','script'] and k=='src'):self.links.append(v)
missing=[]
for p in R.rglob('*.html'):
 parser=Links();parser.feed(p.read_text())
 for x in parser.links:
  if x.startswith(('http:','https:','#','data:')):continue
  if not (p.parent/x.split('#')[0]).exists():missing.append((str(p),x))
assert not missing,missing
api=json.loads((R/'api/openapi.json').read_text());assert api['info']['version']=='0.1'
assert len(re.findall(r'CREATE TABLE ',(R/'database/001_schema.sql').read_text()))==29
assert sum(len(v) for v in api['paths'].values())==85
screens=json.loads((R/'design/screens.json').read_text());assert len(screens)==46
for i,s in enumerate(screens):
 file=R/'design/screens'/f'{i+1:02}-{s["id"]}'
 ET.parse(file.with_suffix('.svg'));assert file.with_suffix('.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
ET.parse(R/'design/overview.svg');ET.parse(R/'technical/architecture.svg')
for key in ['F'+str(i).zfill(2) for i in range(1,16)]:assert key in (R/'requirements/index.html').read_text()
print('交付检查通过：本地链接、46 SVG/PNG、架构图、15项需求、29表、85接口、版本0.1。')
