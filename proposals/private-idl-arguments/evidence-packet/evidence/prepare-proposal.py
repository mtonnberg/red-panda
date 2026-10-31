from pathlib import Path
import hashlib,json,difflib
r=Path(__file__).resolve().parent.parent;base=r/'base';out=r/'evidence/proposed-files';out.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
changes={}
for filename in ['foundational-interface-realms.js','document-interface-realms.js']:
 p=base/'src'/filename;s=p.read_text();old=s
 kinds={'foundational-interface-realms.js':{'Node':13,'Element':32,'HTMLElement':0},'document-interface-realms.js':{'Document':26,'XMLDocument':0}}[filename]
 for kind,count in kinds.items():
  needle='\n '+kind+':{sha:';assert s.count(needle)==1
  s=s.replace(needle,'\n '+kind+':{privateArgumentArrays:'+str(count)+',sha:')
 needle=' const names=definition.names;';assert s.count(needle)==1
 replacement=""" // Generated conversion arguments are private implementation state. Keep the
 // original pinned body guard above, then change only its recognized private
 // argument-array allocation sites. Public functions still compile in the VM;
 // public arrays and all conversion/backend operations remain unchanged.
 const allocation='const args = [];',privateAllocation='const args = createPrivateIDLArguments();';
 if(body.split(allocation).length-1!==definition.privateArgumentArrays||body.includes('createPrivateIDLArguments'))throw new Error('Canonical private IDL argument allocation changed: '+kind);
 const publicBody=body.replaceAll(allocation,privateAllocation);
 const names=definition.privateArgumentArrays?[...definition.names,'createPrivateIDLArguments']:definition.names;
 const privateAllocator=definition.privateArgumentArrays?'\\nconst createPrivateIDLArguments = () => [];\\n':'';"""
 s=s.replace(needle,replacement)
 needle="return source+'\\nconst original";assert s.count(needle)==1
 s=s.replace(needle,"return source+privateAllocator+'\\nconst original")
 needle="JSON.stringify(body)";assert s.count(needle)==1;s=s.replace(needle,'JSON.stringify(publicBody)')
 p=out/'src'/filename;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s);changes[str(p.relative_to(out))]=(old,s)
foundationSHA=sha((out/'src/foundational-interface-realms.js').read_bytes())
for filename in ['manual-element-realms.test.js','document-interface-realms.test.js']:
 p=base/'test'/filename;s=p.read_text();old=s;needle='5c7a6b6fd2fbe5d7c9cbe14c465aff5573498b383ca41175a9ce6ee415ef7904';assert s.count(needle)==1;s=s.replace(needle,foundationSHA);p=out/'test'/filename;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s);changes[str(p.relative_to(out))]=(old,s)
diff=''
for p,(a,b) in sorted(changes.items()):diff+=''.join(difflib.unified_diff(a.splitlines(keepends=True),b.splitlines(keepends=True),fromfile='a/'+p,tofile='b/'+p))
(r/'evidence/private-arguments-intervention.patch').write_text(diff)
p='src/dom-wrapper-realms.js';old=(base/p).read_text();s=old
for needle in ['  if(isFoundationalInterface(kind))source=transformFoundationalInterface(source,kind,originalSource);\n','  if(isDocumentInterface(kind))source=transformDocumentInterface(source,kind,originalSource);\n']:
 assert s.count(needle)==1;s=s.replace(needle,'')
(r/'evidence/physical-negative-counterfactual.patch').write_text(''.join(difflib.unified_diff(old.splitlines(keepends=True),s.splitlines(keepends=True),fromfile='a/'+p,tofile='b/'+p)))
records=[];deps=Path('/workspace/red-panda/node_modules/jsdom/lib/jsdom/living/generated')
for kind,count in {'Node':13,'Element':32,'HTMLElement':0,'Document':26,'XMLDocument':0}.items():
 b=(deps/(kind+'.js')).read_bytes();s=b.decode();start=s.index('exports.install = (globalObject, globalNames) => {\n')+len('exports.install = (globalObject, globalNames) => {\n');body=s[start:s.index('};\n\nconst Impl = require(',start)];prior=body
 if kind=='Document':
  assert prior.count('exports.setup(Object.create(new.target.prototype),')==1
  prior=prior.replace('exports.setup(Object.create(new.target.prototype),','exports.setup(createShell(globalObject, new.target.prototype),')
  for method in ['createElement','createElementNS','createTextNode','createComment','createAttribute','createAttributeNS']:
   needle='esValue[implSymbol].'+method+'(...args)';assert prior.count(needle)==1
   prior=prior.replace(needle,'callFactory(globalObject, esValue[implSymbol], '+json.dumps(method)+', args)')
  needle='esValue[implSymbol].createDocumentFragment()';assert prior.count(needle)==1;prior=prior.replace(needle,'callFactory(globalObject, esValue[implSymbol], "createDocumentFragment", [])')
 assert prior.count('const args = [];')==count
 private=prior.replace('const args = [];','const args = createPrivateIDLArguments();')
 assert private.replace('const args = createPrivateIDLArguments();','const args = [];')==prior
 records.append({'kind':kind,'exactOriginalSourceSHA256':sha(b),'originalPublicBodySHA256':sha(body.encode()),'previousApprovedPublicBodySHA256':sha(prior.encode()),'newCompiledPublicBodySHA256':sha(private.encode()),'privateArgumentAllocationSites':count,'remainingPrivateVMLiteralSites':private.count('const args = [];'),'privateHostAllocatorSites':private.count('const args = createPrivateIDLArguments();'),'onlyAdditionalExecutablePublicBodyChangeIsPrivateArgumentAllocation':True})
assert sum(x['privateArgumentAllocationSites'] for x in records)==71
(r/'evidence/private-body-accounting.json').write_text(json.dumps({'runtimeExecuted':False,'totalPrivateArgumentsAllocations':71,'rows':records,'originalBodyPinsAndStrictPriorBodyGuardsRemainBeforePrivateAllocationRewrite':True,'newHostAllocatorCompiledInSameExistingCanonicalHostCJSModule':True,'publicResultArraysUnmodified':True,'proposalsUnapplied':True},indent=2)+'\n')
print(json.dumps({'proposalPaths':list(changes),'privateSites':71,'foundationProposedSHA256':foundationSHA,'interventionPatchSHA256':sha((r/'evidence/private-arguments-intervention.patch').read_bytes()),'proposalApplied':False,'runtimeExecuted':False}))
