from pathlib import Path
import zipfile,json,hashlib,shutil
R=Path(__file__).resolve().parents[1];base=R.parent
files=[p for p in R.rglob('*') if p.is_file() and p.name not in ['.DS_Store','manifest.json'] and '__pycache__' not in p.parts]
manifest={'version':'0.1','date':'2026-10-20','files':{p.relative_to(R).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}}
(R/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
files.append(R/'manifest.json')
with zipfile.ZipFile(base/'wordmate-0.1.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,Path('wordmate-0.1')/p.relative_to(R))
with zipfile.ZipFile(base/'wordmate-0.1.zip') as z:assert z.testzip() is None
# 保持现有解压副本一致；只清除已明确被新交付替代的生成文件。
copy=base/'wordmate-0.1'
if copy.exists():
 for rel in ['build_docs.py','build_delivery.py','design/figma-build.js','design/screens-overview.png']:
  p=copy/rel
  if p.exists():p.unlink()
 for p in files:
  dest=copy/p.relative_to(R);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
print(json.dumps({'files':len(files),'bytes':(base/'wordmate-0.1.zip').stat().st_size,'archive':str(base/'wordmate-0.1.zip')},ensure_ascii=False))
