from pathlib import Path
import json,sys
left=Path(sys.argv[1]);right=Path(sys.argv[2]);output=Path(sys.argv[3]);a=json.loads(left.read_text());b=json.loads(right.read_text());assert not a.get('failure')and not b.get('failure')
# Analysis only. Raw reports/wire remain unchanged. Compare actual values and
# errors, excluding only independently generated clock/URL/identity fields.
def clean(value):
 if isinstance(value,dict):return{k:clean(v)for k,v in value.items()if k not in ['started','delivered','timestamp','url','targetId','browserContextId']and not(k in ['context','target']and isinstance(v,str))}
 if isinstance(value,list):return[clean(v)for v in value]
 return value
rows=[]
assert len(a['rows'])==len(b['rows'])
for x,y in zip(a['rows'],b['rows']):
 assert x['name']==y['name'];xx=clean(x['value']);yy=clean(y['value']);rows.append({'name':x['name'],'equalAfterExplicitAnalysisNormalization':xx==yy,'Native':xx,'candidate':yy})
output.write_text(json.dumps({'rawModified':False,'normalization':'Only actual per-run timestamp/started/delivered/url/target/context identifiers; all scalars, brands, ordering, private backing, states and wire errors retained','rows':rows,'matching':sum(r['equalAfterExplicitAnalysisNormalization']for r in rows),'total':len(rows)},indent=2)+'\n')
print(json.dumps({'matching':sum(r['equalAfterExplicitAnalysisNormalization']for r in rows),'total':len(rows),'differences':[r['name']for r in rows if not r['equalAfterExplicitAnalysisNormalization']]}))
if any(not r['equalAfterExplicitAnalysisNormalization']for r in rows):sys.exit(1)
