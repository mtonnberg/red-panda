"""External process metadata/cleanup only; no browser/application imports."""
from pathlib import Path
import json
import os
import signal
import subprocess
import time

def identity(pid):
    try:
        raw=(Path('/proc')/str(pid)/'stat').read_text();fields=raw[raw.rfind(')')+2:].split()
        return {'pid':int(pid),'state':fields[0],'parent':int(fields[1]),'pgrp':int(fields[2]),'sid':int(fields[3]),'startTicks':int(fields[19])}
    except(OSError,ValueError,IndexError):return None

def collect(child,owned):
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit()and(row:=identity(entry.name))and(row['pgrp']==child.pid or row['sid']==child.pid):owned[(row['pid'],row['startTicks'])]=row
    result=[]
    for pid,start in owned:
        if(row:=identity(pid))and row['startTicks']==start:result.append(row)
    return result

def wait(child,seconds,owned):
    started=time.monotonic();last=started
    while child.poll()is None:
        rows=collect(child,owned);now=time.monotonic()
        if now-started>=seconds:raise subprocess.TimeoutExpired(child.args,seconds)
        if now-last>=20:
            print(json.dumps({'progress':'Owned original-budget fixture still running','pid':child.pid,'seconds':now-started,'owned':rows}),flush=True);last=now
        time.sleep(.1)
    collect(child,owned)

def cleanup(child,owned):
    before=collect(child,owned)
    for sig,seconds in [(signal.SIGTERM,2),(signal.SIGKILL,3)]:
        for row in collect(child,owned):
            if row['state']!='Z':
                try:os.kill(row['pid'],sig)
                except ProcessLookupError:pass
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            if not any(row['state']!='Z'for row in collect(child,owned)):break
            time.sleep(.05)
        if not any(row['state']!='Z'for row in collect(child,owned)):break
    child.wait(timeout=3)
    after=collect(child,owned)
    return {'before':before,'after':after,'observed':list(owned.values()),'liveRemaining':[row for row in after if row['state']!='Z']}
