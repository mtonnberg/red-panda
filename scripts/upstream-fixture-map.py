"""Read-only registration extraction. No Zig compilation/build-filter claim."""
from pathlib import Path
import hashlib,json,re,collections,argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
ROOT=args.source_root.resolve()
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def comments_out(s):
 out=[];i=0;string=False;escape=False
 while i<len(s):
  c=s[i]
  if string:
   out.append(c)
   if escape:escape=False
   elif c=='\\':escape=True
   elif c=='"':string=False
   i+=1
  elif c=='"':string=True;out.append(c);i+=1
  elif s[i:i+2]=='//':
   end=s.find('\n',i)
   if end<0:end=len(s)
   out.append(' '*(end-i));i=end
  else:out.append(c);i+=1
 return ''.join(out)
registrations=[];fixture_profiles=collections.defaultdict(list);profiles={};inputs={}
for file in sorted((ROOT/'src').rglob('*.zig')):
 s=comments_out(file.read_text())
 for match in re.finditer(r'\btesting\.htmlRunner\("([^"\n]+)"\s*,',s):
  end=match.end();depth=1;string=False;escape=False
  while end<len(s) and depth:
   c=s[end]
   if string:
    if escape:escape=False
    elif c=='\\':escape=True
    elif c=='"':string=False
   elif c=='"':string=True
   elif c=='(':depth+=1
   elif c==')':depth-=1
   end+=1
  options=s[match.end():end-1].strip();target=match.group(1);path=ROOT/'src/browser/tests'/target
  assert path.exists(),target
  fixtures=[path] if path.is_file() else sorted(x for x in path.iterdir() if x.is_file() and x.suffix=='.html')
  load=re.search(r'\.load_resources\s*=\s*\.\{([^}]*)\}',options,re.S)
  resources=sorted(re.findall(r'\.(\w+)\s*=\s*true',load[1])) if load else ['iframe','worker']
  ex=re.search(r'\.experimental_features\s*=\s*\.\{([^}]*)\}',options,re.S)
  experimental=dict((name,value=='true') for name,value in re.findall(r'\.(\w+)\s*=\s*(true|false)',ex[1])) if ex else {}
  timeout=re.search(r'\.timeout_ms\s*=\s*(\d+)',options);timeout=int(timeout[1]) if timeout else 2000
  inject=re.search(r'\.inject_script\s*=\s*("(?:\\.|[^"\\])*")',options);inject=json.loads(inject[1]) if inject else None
  profile={'resources':resources,'experimentalFeatures':experimental,'injectScript':inject,'sourceTimeoutMs':timeout}
  key=json.dumps(profile,sort_keys=True,separators=(',',':'));pid=hashlib.sha256(key.encode()).hexdigest()[:12]
  args=[item for resource in resources for item in ['--load-resources',resource]] or ['--load-resources','none']
  for feature,enabled in experimental.items():
   if enabled:args+=['--experimental-features',feature]
  profiles.setdefault(pid,{**profile,'id':pid,'nativeResourceAndFeatureArgs':args,'preloadViaCDP':inject,'fixtureCount':0})
  rid=len(registrations);source=str(file.relative_to(ROOT));inputs[source]=sha(file)
  registration={'id':rid,'source':source,'line':s.count('\n',0,match.start())+1,'sourceSHA256':inputs[source],'target':target,'targetKind':'file' if path.is_file() else 'directory-nonrecursive','profile':pid,'optionsRaw':options,'fixtureCount':len(fixtures)}
  registrations.append(registration)
  for fixture in fixtures:fixture_profiles[str(fixture.relative_to(ROOT/'src/browser/tests'))].append({'registration':rid,'profile':pid})
fixtures=[]
for path,rows in sorted(fixture_profiles.items()):
 pids=set(r['profile'] for r in rows);assert len(pids)==1,(path,rows)
 pid=next(iter(pids));profiles[pid]['fixtureCount']+=1
 fixtures.append({'path':path,'sha256':sha(ROOT/'src/browser/tests'/path),'profile':pid,'registrations':[r['registration'] for r in rows]})
for path in ['src/testing.zig','src/test_routes.zig','src/TestHTTPServer.zig','src/TestWSServer.zig','src/main_test_server.zig','src/Config.zig']:inputs[path]=sha(ROOT/path)
support={str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'src/browser/tests').rglob('*')) if p.is_file()}
data={'schemaVersion':1,'upstreamCommit':'948d773786380bae36f046639fc61e2ddddd212a','sourceRoot':str(ROOT),'counts':{'htmlRunnerCalls':len(registrations),'nondefaultCalls':sum(r['optionsRaw']!='.{}' for r in registrations),'registeredUniqueFixtures':len(fixtures),'profiles':len(profiles),'htmlFiles':sum(p.endswith('.html') for p in support)},'limits':['Literal active source syntax extraction, not a Zig compiled/import/build-filter inventory','Per-source 2000/8000ms budgets are preserved; any 15000ms diagnostic run must report a separate budget','Routes and support discovery do not establish successful or even observed runtime assertions','CORS experimental option is documented ignored upstream; it does not disable ordinary CORS'],'profiles':list(profiles.values()),'registrations':registrations,'fixtures':fixtures,'sourceSHA256':inputs,'fixtureAndSupportSHA256':support}
(OUT/'registered-fixtures.json').write_text(json.dumps([row['path'] for row in fixtures],indent=2)+'\n')
(OUT/'registration-map.json').write_text(json.dumps(data,indent=2)+'\n')
# Every dynamic matching branch with source line, exact/prefix rule and return.
s=(ROOT/'src/test_routes.zig').read_text();branches=[]
for line,text in enumerate(s.splitlines(),1):
 if 'path,' in text and any(x in text for x in ['std.mem.eql(', 'std.mem.startsWith(', 'std.mem.endsWith(']):
  branches.append({'sourceLine':line,'condition':text.strip(),'literalRoutes':re.findall(r'"([^"\n]+)"',text)})
(OUT/'route-source-map.json').write_text(json.dumps({'source':'src/test_routes.zig','sourceSHA256':sha(ROOT/'src/test_routes.zig'),'branches':branches,'staticHeaderSidecars':[p for p in support if p.endswith('.headers')],'rawResponses':['gzip','cacheable','revalidated','not_modified','large'],'webSocketSource':'src/TestWSServer.zig','webSocketSourceSHA256':sha(ROOT/'src/TestWSServer.zig'),'webSocketCommands':['force-close','get-cookie','get-origin','send-large:N','close:CODE:REASON','text echo- prefix','binary 0xEE prefix','close payload echo']},indent=2)+'\n')
print(json.dumps({'counts':data['counts'],'profiles':data['profiles']},indent=2))
