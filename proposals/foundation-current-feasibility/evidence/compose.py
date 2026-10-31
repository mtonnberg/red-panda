from pathlib import Path
import json,subprocess,shutil,hashlib,difflib
r=Path(__file__).resolve().parent.parent;base=r/'base';c=r/'candidate';events=[]
packets={'foundations':Path('/workspace/shared/foundational-interface-handoff'),'manual19':Path('/workspace/shared/manual-element-handoff'),'Document':Path('/workspace/shared/document-interface-handoff'),'manualDocument9':Path('/workspace/shared/manual-document-handoff')}
def copynew(packet,path):
 assert not(c/path).exists(),path
 q=c/path;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(packets[packet]/'candidate'/path,q);events.append({'action':'exact new leaf','packet':packet,'path':path})
def edit(path,old,new,label):
 p=c/path;s=p.read_text();assert s.count(old)==1,(path,label,s.count(old));p.write_text(s.replace(old,new));events.append({'action':'single guarded context adaptation','path':path,'label':label,'old':old,'new':new})
def block(packet,path):
 p=packets[packet]/'candidate.patch';s=p.read_text();parts=s.split('--- ');matches=[]
 for part in parts[1:]:
  text='--- '+part
  if text.splitlines()[1]=='+++ b/'+path:matches.append(text)
 assert len(matches)==1,(packet,path)
 patch=r/'evidence'/('fragment-'+packet+'-'+path.replace('/','_')+'.patch');patch.write_text(matches[0]);check=subprocess.run(['git','apply','--check',str(patch)],cwd=c,text=True,capture_output=True);assert check.returncode==0,(path,check.stderr);subprocess.run(['git','apply',str(patch)],cwd=c,check=True);events.append({'action':'exact frozen narrow file fragment','packet':packet,'path':path,'fragment':str(patch.relative_to(r))})
def snapshot(name):
 paths=sorted(p for folder in ['src','test']for p in(c/folder).rglob('*')if p.is_file());diff=''
 for p in paths:
  n=str(p.relative_to(c));a=(base/n).read_bytes()if(base/n).exists()else b'';b=p.read_bytes()
  if a==b:continue
  try:aa=a.decode().splitlines(keepends=True);bb=b.decode().splitlines(keepends=True)
  except UnicodeDecodeError:raise Exception('Unexpected binary mutation '+n)
  diff+=''.join(difflib.unified_diff(aa,bb,fromfile='a/'+n if a else'/dev/null',tofile='b/'+n))
 (r/'evidence'/('tranche-'+name+'.patch')).write_text(diff)
# Smallest tranche: three exact new/hook paths; retain every current transform.
copynew('foundations','src/foundational-interface-realms.js');copynew('foundations','test/foundational-interface-realms.test.js')
edit('src/dom-wrapper-realms.js',"import {isAdditionalControlInterface,transformAdditionalControlInterface} from './additional-control-interface-realms.js';","import {isFoundationalInterface,transformFoundationalInterface} from './foundational-interface-realms.js';\nimport {isAdditionalControlInterface,transformAdditionalControlInterface} from './additional-control-interface-realms.js';",'prepend original foundation adapter beside current Additional/privateTarget/WebSocket imports')
anchor='  if(isAdditionalControlInterface(kind))source=transformAdditionalControlInterface(source,kind,originalSource);'
edit('src/dom-wrapper-realms.js',anchor,anchor+'\n  if(isFoundationalInterface(kind))source=transformFoundationalInterface(source,kind,originalSource);','append foundation body dispatch, preserving current node/event/privateTarget predicate order')
snapshot('1-foundations')
# Manual21 becomes manual19: current genuine VM scrolling source is untouched.
copynew('manual19','src/public-idl-member.js');copynew('manual19','test/manual-element-realms.test.js')
edit('src/layout.js',"import{installWindowViewport}from'./window-viewport.js';","import {captureIDLMemberFactory} from './public-idl-member.js';\nimport{installWindowViewport}from'./window-viewport.js';",'prepend allocation publisher without replacing viewport/scroll-event imports')
edit('src/layout.js','  const define = (target, name, descriptor) => Object.defineProperty(target, name, { configurable: true, enumerable: true, ...descriptor });',"  const member=captureIDLMemberFactory(window);\n  const define = (target, name, descriptor) => {\n    if(target===window.Element.prototype||target===window.HTMLElement.prototype){\n      descriptor={...descriptor};for(const slot of ['value','get','set'])if(typeof descriptor[slot]==='function')descriptor[slot]=member(name,slot,descriptor[slot]);\n    }\n    return Object.defineProperty(target, name, { configurable: true, enumerable: true, ...descriptor });\n  };",'replace publication-only helper, retain current layout producers and current scroll bridge')
block('manual19','src/dialogs.js');block('manual19','src/shadow.js')
edit('test/manual-element-realms.test.js',"assert.equal(Function.prototype.toString.call(f).includes('[native code]'),true);","if(!(kind==='Element'&&['scrollTop','scrollLeft'].includes(name)&&slot==='set'))assert.equal(Function.prototype.toString.call(f).includes('[native code]'),true);",'only nineteen newly native entries require native source; retain current genuine VM scroll setter source')
edit('test/manual-element-realms.test.js',"all21 measured late public members are genuine selectedVM native entries in main and frame","nineteen republished entries and two retained scroll setters have genuine selectedVM creation",'test description distinguishes retained new scroll pipeline')
snapshot('2-manual19')
# Original Document public bodies still have the same eight approved deltas.
copynew('Document','src/document-interface-realms.js');copynew('Document','test/document-interface-realms.test.js')
edit('src/dom-wrapper-realms.js',"import {isFoundationalInterface,transformFoundationalInterface} from './foundational-interface-realms.js';","import {isDocumentInterface,transformDocumentInterface} from './document-interface-realms.js';\nimport {isFoundationalInterface,transformFoundationalInterface} from './foundational-interface-realms.js';",'prepend Document adapter, retaining current canonical factory imports')
anchor='  if(isFoundationalInterface(kind))source=transformFoundationalInterface(source,kind,originalSource);'
edit('src/dom-wrapper-realms.js',anchor,anchor+'\n  if(isDocumentInterface(kind))source=transformDocumentInterface(source,kind,originalSource);','append Document dispatch before current private Event/EventTarget/WebSocket transforms')
snapshot('3-Document')
copynew('manualDocument9','src/document-member-realms.js');copynew('manualDocument9','test/manual-document-realms.test.js')
block('manualDocument9','src/collections.js');block('manualDocument9','src/document-xml.js');block('manualDocument9','src/styles.js')
edit('src/layout.js',"import {captureIDLMemberFactory} from './public-idl-member.js';","import {captureDocumentMemberFactory} from './document-member-realms.js';\nimport {captureIDLMemberFactory} from './public-idl-member.js';",'Document publisher import retains current viewport/event imports')
edit('src/layout.js','  const member=captureIDLMemberFactory(window);','  const member=captureIDLMemberFactory(window),documentMember=captureDocumentMemberFactory(window);','capture Document publisher alongside Element publisher')
edit('src/layout.js',"    if(target===window.Element.prototype||target===window.HTMLElement.prototype){","    if(target===window.Document.prototype){\n      descriptor={...descriptor};for(const slot of ['value','get','set'])if(typeof descriptor[slot]==='function')descriptor[slot]=documentMember(name,slot,descriptor[slot]);\n    }else if(target===window.Element.prototype||target===window.HTMLElement.prototype){",'Document-only branch; all original producer functions remain identical')
edit('src/isolated-world.js',"import {canonicalLocation,locationImplementation,installPrivateLocationUtils,prepareLocationContext,installLocationInterface,transformUtilityLocationInterfaces,createLocationAlias,installLocationWindowAlias} from './location-factory.js';","import {installDocumentXPathEntries} from './document-member-realms.js';\nimport {canonicalLocation,locationImplementation,installPrivateLocationUtils,prepareLocationContext,installLocationInterface,transformUtilityLocationInterfaces,createLocationAlias,installLocationWindowAlias} from './location-factory.js';",'prepend only new XPath publisher beside intact current Location/Target/WebSocket/viewport imports')
anchor=" Object.defineProperty(global,'document',{value:wrap(mainWindow.document),enumerable:true});"
edit('src/isolated-world.js',anchor,anchor+'\n installDocumentXPathEntries(global);','publish after genuine utility Document registration and before existing Location alias; direct-only Node/Target decisions untouched')
# Preserve current ordinary implementation-class predicate discipline.
edit('src/document-member-realms.js','const apply=Reflect.apply,define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor;','const apply=Reflect.apply,define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor,ordinaryHasInstance=Function.prototype[Symbol.hasInstance];\nconst isDocument=implementation=>apply(ordinaryHasInstance,DocumentImpl,[implementation]);','capture ordinary private implementation brand like current Target/scroll/viewport code')
edit('src/document-member-realms.js',' if(!(owner instanceof DocumentImpl)||!vm.isContext(owner._globalObject))return member;',' if(!isDocument(owner)||!vm.isContext(owner._globalObject))return member;','preserve real owner predicate without authored Symbol.hasInstance dispatch')
edit('src/document-member-realms.js',"   if(!(platformFactoryRecord(this)?.implementation instanceof DocumentImpl))throw new ErrorConstructor('Illegal invocation');","   if(!isDocument(platformFactoryRecord(this)?.implementation))throw new ErrorConstructor('Illegal invocation');",'ordinary implementation predicate plus successful frontend provenance')
snapshot('4-manualDocument9')
(r/'evidence/adaptations.json').write_text(json.dumps({'runtimeExecuted':False,'events':events,'frozenScrollPatchIntentionallyOmitted':True,'allRootSourcePreservedExceptNarrowPublicationHunks':True},indent=2)+'\n')
print(json.dumps({'events':len(events),'candidate':str(c),'runtimeExecuted':False}))
