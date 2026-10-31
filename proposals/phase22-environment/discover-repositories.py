import os,pathlib,json,subprocess,urllib.parse,hashlib
base=pathlib.Path('/workspace');prior=json.loads((base/'red-panda/.cache/validation/phase17/repository-discovery.json').read_text());known={row['root']:row for row in prior['roots']};found=[];links=[];errors=[]
for root,dirs,files in os.walk(base,onerror=lambda e:errors.append(str(e)),followlinks=False):
 for name in dirs+files:
  p=pathlib.Path(root)/name
  if name=='.git':found.append(str(p.parent))
  try:
   if p.is_symlink()and p.is_dir():
    target=p.resolve(strict=True);links.append({'path':str(p),'target':str(target),'insideWorkspace':target.is_relative_to(base)})
  except OSError as e:errors.append(str(e))
known['/workspace/shared/crypto-apply-check']={'root':'/workspace/shared/crypto-apply-check','classification':'validation-scratch','host':None,'name':None,'purpose':'Unborn no-remote9-file Web Crypto patch-application validation cache; retained, not a project checkout'}
for taskroot,purpose in [('/workspace/shared/joint-session-history','Owned temporary patch-construction/validation copy for frozen joint history18db; empty git only for apply/diff checks'),('/workspace/shared/navigation-public','Owned temporary patch-construction/validation copy for active Navigation companion; empty git only for apply/diff checks')]:
 known[taskroot]={'root':taskroot,'classification':'validation-scratch','host':None,'name':None,'purpose':purpose,'ownerConfirmation':'sync_xhr_recovery explicitly confirmed copied Root source/prerequisites; not independent user projects; no remote/commit/tracked files'}
assert set(found)==set(known),{'new':sorted(set(found)-set(known)),'missing':sorted(set(known)-set(found))}
rows=[]
for root in sorted(found):
 p=pathlib.Path(root);resolved=p.resolve(strict=True);assert resolved.is_relative_to(base);row={**known[root],'resolvedRoot':str(resolved)}
 if root=='/workspace':assert (p/'.git').is_dir()and not list((p/'.git').iterdir());rows.append(row);continue
 def read(*args):
  r=subprocess.run(['git','-C',root,*args],capture_output=True,text=True);assert r.returncode==0,(root,args);return r.stdout.strip()
 row['actualRoot']=read('rev-parse','--show-toplevel');assert pathlib.Path(row['actualRoot']).resolve()==resolved
 if row['classification']=='validation-scratch':
  branch=read('symbolic-ref','HEAD');assert branch=='refs/heads/master';assert not read('remote');probe=subprocess.run(['git','-C',root,'show-ref','--verify','--quiet',branch]);assert probe.returncode==1
  files={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest()for f in p.rglob('*')if f.is_file()and '.git'not in f.parts}
  if root=='/workspace/shared/crypto-apply-check':assert len(files)==9 and set(str(f).split('/')[0]for f in files)=={'src','test'}
  else:
   assert root in ['/workspace/shared/joint-session-history','/workspace/shared/navigation-public'] and not read('ls-files')
   assert (p/'src').is_dir() and (p/'test').is_dir() and files
  row.update({'commit':None,'symbolicBranch':branch,'unbornVerified':True,'remoteAbsentVerified':True,'validationInputSHA256':files});rows.append(row);continue
 row['commit']=read('rev-parse','--verify','HEAD^{commit}');remote=read('remote','get-url','origin');u=urllib.parse.urlsplit(remote)
 if u.scheme:host=u.hostname;identity=u.path.strip('/')
 else:host=remote.split('@',1)[1].split(':',1)[0];identity=remote.split(':',1)[1]
 if identity.endswith('.git'):identity=identity[:-4]
 assert host==row['host']and identity==row['name'],root;rows.append(row)
report={'roots':rows,'directoryLinks':links,'errors':errors,'outsideWorkspaceLinks':[x for x in links if not x['insideWorkspace']],'unknown':[x for x in rows if x.get('classification')in[None,'unknown']]};assert not errors and not report['outsideWorkspaceLinks']and not report['unknown'];projects=[x for x in rows if x['classification']=='project'];assert len(projects)==1 and projects[0]['commit']==subprocess.check_output(['git','-C',str(base/'red-panda'),'rev-parse','HEAD'],text=True).strip();(base/'red-panda/.cache/validation/phase22-onboarding/repository-discovery.json').write_text(json.dumps(report,indent=2));print(json.dumps({'roots':len(rows),'links':len(links),'projects':projects,'errors':0,'unknown':0,'outsideWorkspaceLinks':0}))
