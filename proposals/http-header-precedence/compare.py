import pathlib,json,urllib.parse,hashlib
r=pathlib.Path(__file__).parent
fields=['cookie','user-agent','accept-language','authorization','x-policy','access-control-request-headers']
native=json.loads((r/'native-same-site-policy.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def normalized_action(action,document):
 def origin(url):
  p=urllib.parse.urlsplit(url);value=p.scheme+'://'+p.netloc
  return next((key for key,actual in document['origins'].items()if actual==value),value)
 value=action.get('result',{}).get('result',{}).get('value')
 return {'requests':[{'method':row['method'],'origin':origin(row['url']),'path':urllib.parse.urlsplit(row['url']).path,'body':row['body'],'headers':{name:row['headers'].get(name)for name in fields}}for row in action['requests']], 'publicResult':{name:value.get(name)for name in ['ok','status','cookie']}if value else None}
report={'scope':'Bounded actual same-site HTTP precedence only; unspecified headers, other cookie-site policies and unrelated APIs are not claimed equivalent.','fields':fields,'nativeArtifact':'native-same-site-policy.json','nativeSHA256':sha(r/'native-same-site-policy.json'),'candidates':{}}
for name,file,binding in [('base','base-same-site-policy.json','base.json'),('working','working-same-site-policy.json','working.json'),('frozen','frozen-same-site-policy.json','frozen.json')]:
 if not(r/file).exists():continue
 d=json.loads((r/file).read_text());actions={x['name']:x for x in d['actions']if'name'in x};diff=[];matched=[]
 for n in native['actions']:
  if'name'not in n:continue
  actual=actions[n['name']];expected=normalized_action(n,native);observed=normalized_action(actual,d)
  if expected!=observed:diff.append({'name':n['name'],'native':expected,'candidate':observed,'candidateRawRuntimeResult':actual.get('result')})
  else:matched.append(n['name'])
 report['candidates'][name]={'artifact':file,'artifactSHA256':sha(r/file),'sourceBinding':binding,'sourceBindingSHA256':sha(r/binding),'matched':len(matched),'matchedActions':matched,'differences':diff}
(r/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
for name,item in report['candidates'].items():print(name,item['matched'],'matched',len(item['differences']),'different')
