"""제작 요청 ID·상태·결과 경로와 인박스의 내구성을 검증한다."""
import json
import os
import pathlib
import re

STATES={'pending','received','working','blocked','failed','done','canceled'}

def request_id(value):
    if not re.fullmatch(r'[-A-Za-z0-9_]{1,120}',value): raise ValueError('Invalid request ID')
    return value

def result_path(value):
    value=value.removeprefix('자료실/')
    parts=value.split('/')
    if len(parts)<2 or parts[0] not in ('수업','평가','학습자료') or any(p in ('','.','..') or '\\' in p for p in parts):
        raise ValueError('Result must be a file under the materials folders')
    return '/'.join(parts)

def verified_artifact(path, metadata):
    if metadata.get('type')!='file' or metadata.get('path')!=path or not re.fullmatch(r'[0-9a-f]{40,64}',metadata.get('sha','')):
        raise ValueError('Artifact is missing or invalid')
    return {'path':path,'sha':metadata['sha'],'size':metadata.get('size',0)}

def transition(current, status, now, fields=None):
    if not isinstance(current,dict): raise ValueError('Request no longer exists')
    if status not in STATES: raise ValueError('Invalid state')
    old=current.get('status','pending')
    if old in ('done','canceled') and status!=old: raise ValueError('Terminal request cannot be replaced')
    if status=='received' and old!='pending': return current
    return {**current,**(fields or {}),'status':status,'updatedAt':now}

def save_inbox(directory, rid, text):
    request_id(rid);directory=pathlib.Path(directory);directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    path=directory/(rid+'.md')
    try: fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    except FileExistsError: return path
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as handle:
            handle.write(text);handle.flush();os.fsync(handle.fileno())
    except BaseException:
        path.unlink(missing_ok=True);raise
    fd=os.open(directory,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
    return path


def claim_inbox(current, owner, now):
    if not isinstance(current,dict) or current.get('status')!='pending' or current.get('inboxLeaseUntil',0)>now:
        return current
    return {**current,'inboxOwner':owner,'inboxLeaseUntil':now+120000}

def received_inbox(current, owner, now):
    if not isinstance(current,dict) or current.get('status')!='pending' or current.get('inboxOwner')!=owner:
        raise ValueError('Request canceled or claim lost')
    return transition(current,'received',now,{'receivedAt':now,'inboxLeaseUntil':0})
