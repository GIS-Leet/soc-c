#!/usr/bin/env python3
"""커밋 수와 무관하게 배포 빌드를 원자적으로 예약하고 project.yml을 갱신한다."""
import argparse
import fcntl
import os
import pathlib
import re
import tempfile

def reserve(project, counter, minimum=0):
    project=pathlib.Path(project);counter=pathlib.Path(counter)
    counter.parent.mkdir(parents=True,exist_ok=True)
    with counter.with_suffix('.lock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        text=project.read_text();match=re.search(r'CURRENT_PROJECT_VERSION: "(\d+)"',text)
        if not match:raise ValueError('Missing numeric project build')
        previous=int(counter.read_text()) if counter.exists() else 0
        number=max(int(match[1]),previous,minimum)+1
        # Reserve first. A failed project write can leave a harmless skipped build, never reuse one.
        for target,data in [(counter,str(number)),(project,text[:match.start(1)]+str(number)+text[match.end(1):])]:
            fd,name=tempfile.mkstemp(dir=target.parent)
            try:
                with os.fdopen(fd,'w') as handle:handle.write(data);handle.flush();os.fsync(handle.fileno())
                os.replace(name,target)
            finally:
                if os.path.exists(name):os.unlink(name)
        return number

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--project',default='project.yml');parser.add_argument('--minimum',type=int,default=0);parser.add_argument('--counter',default=str(pathlib.Path.home()/'.local/state/desk-release/build-number'))
    args=parser.parse_args();print(reserve(args.project,args.counter,args.minimum))
