from pathlib import Path
import subprocess,json,time
out=Path('.cache/validation/phase19');status=[]
for name,cmd in [('strict84',['npm','run','build:automation','--','--strict','--pedantic-packages']),('puppeteer84',['npm','run','test:puppeteer'])]:
 start=time.monotonic()
 with(out/(name+'.log')).open('w')as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 status.append({'name':name,'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-start})
 if r.returncode:break
(out/'purescript-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if len(status)==2 and all(x['exit']==0 for x in status)else 1)
