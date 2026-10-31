import json, pathlib, hashlib, sys
p=pathlib.Path(__file__).resolve().parent
out=pathlib.Path(sys.argv[1]).resolve()
native={
 'namespace-original':json.loads((p.parent/'programmatic-namespace/native-interfaces.json').read_text()),
 'state':json.loads((p/'native-state.json').read_text()),
}
expected={name:{'expressionSHA256':record['expressionSHA256'],'value':record['result']['value']}for name,record in native.items()}
expected.update({row['name']:{'expressionSHA256':row['expressionSHA256'],'value':row['value']}for row in json.loads((p/'native-four.json').read_text())['rows']})
def differences(wanted,actual,path=''):
 if type(wanted)!=type(actual):return [{'path':path,'native':wanted,'candidate':actual}]
 if isinstance(wanted,dict):
  result=[]
  for key in sorted(wanted.keys()|actual.keys()):
   if key not in wanted or key not in actual:result.append({'path':path+'/'+key,'native':wanted.get(key),'candidate':actual.get(key),'missingIn':'native'if key not in wanted else'candidate'})
   else:result.extend(differences(wanted[key],actual[key],path+'/'+key))
  return result
 if isinstance(wanted,list):
  result=[]
  for index in range(max(len(wanted),len(actual))):
   if index>=len(wanted)or index>=len(actual):result.append({'path':path+'/'+str(index),'native':wanted[index]if index<len(wanted)else None,'candidate':actual[index]if index<len(actual)else None,'missingIn':'native'if index>=len(wanted)else'candidate'})
   else:result.extend(differences(wanted[index],actual[index],path+'/'+str(index)))
  return result
 return []if wanted==actual else[{'path':path,'native':wanted,'candidate':actual}]
report={}
for stage in ['before','after']:
 record=json.loads((out/(stage+'.json')).read_text());rows={row['name']:row for row in record['rows']};comparisons={}
 for name,wanted in expected.items():
  actual=rows[name];assert wanted['expressionSHA256']==actual['expressionSHA256'],name
  comparisons[name]={'rows':len(wanted['value'])if isinstance(wanted['value'],list)else 1,'differences':differences(wanted['value'],actual.get('value',{'error':actual.get('error')}))}
 report[stage]={'sourceRoot':record['sourceRoot'],'stylesSHA256':record['stylesSHA256'],'comparisons':comparisons,'totalLeafDifferences':sum(len(c['differences'])for c in comparisons.values())}
(out/'native-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({stage:{'totalLeafDifferences':record['totalLeafDifferences'],'controls':{name:len(control['differences'])for name,control in record['comparisons'].items()}}for stage,record in report.items()}))
