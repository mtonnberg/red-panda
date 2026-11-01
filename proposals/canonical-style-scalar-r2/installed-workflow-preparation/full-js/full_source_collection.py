from pathlib import Path
import hashlib,re
def tokens(source):
 result=[];i=0
 while i<len(source):
  c=source[i]
  if c.isspace():i+=1;continue
  if source.startswith('//',i):
   end=source.find('\n',i);i=len(source)if end<0 else end+1;continue
  if source.startswith('/*',i):
   end=source.find('*/',i+2);i=len(source)if end<0 else end+2;continue
  if c in "\"'`":
   start=i;i+=1
   while i<len(source):
    if source[i]=='\\':i+=2;continue
    if source[i]==c:i+=1;break
    i+=1
   result.append(('literal',source[start:i],start));continue
  match=re.match(r'[A-Za-z_$][\w$]*',source[i:])
  if match:result.append(('identifier',match.group(),i));i+=len(match.group());continue
  result.append(('punctuation',c,i));i+=1
 return result

def collect(root,names):
    root=Path(root);records=[]
    for name in names:
        data=(root/name).read_bytes();source=data.decode();ts=tokens(source);sites=[]
        for i,(kind,value,start)in enumerate(ts):
            if kind!='identifier'or value!='test'or i+1>=len(ts)or ts[i+1][1]!='(':continue
            if i and ts[i-1][1]in ['.','function']:continue
            sites.append({'line':source.count('\n',0,start)+1,'labelSource':ts[i+2][1]if i+2<len(ts)and ts[i+2][0]=='literal'else'<computed>'})
        records.append({'path':name,'SHA256':hashlib.sha256(data).hexdigest(),'lexicalRegistrationSites':len(sites),'sites':sites})
    return {'tentative':True,'tentativeSiteCount':sum(x['lexicalRegistrationSites']for x in records),'fileCount':len(records),'files':records,'actualTAPIsAuthoritative':True,'limits':'Lexical sites only, not JS binding/loop evaluation; actual counts may differ and never reject a complete otherwise-passing suite solely for that difference.'}
