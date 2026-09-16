#!/usr/bin/env python3
"""Desk 앱 「제작 요청」(desk/requests, status=pending) → Mac 인박스 파일 + 알림.
5분마다 LaunchAgent 로 실행. 인박스의 요청은 Claude 세션에서 TEXTBOOK_SYSTEM.md / SLIDE_SYSTEM.md 규칙으로 제작해 자료실(soc-c-private)에 올리고
status 를 done 으로 바꾼다(아래 mark_done 참고). 서비스 계정: ~/project/qna_push/firebase-key.json
"""
import json, os, sys, subprocess, datetime, pathlib, urllib.request, urllib.error, urllib.parse, uuid
from lifecycle import request_id, result_path, verified_artifact, transition, save_inbox, claim_inbox, received_inbox
HERE = pathlib.Path(__file__).resolve().parent; INBOX = HERE / 'inbox'; DB = 'https://soc-c-qna-default-rtdb.firebaseio.com'
LOG = pathlib.Path.home() / 'Library/Logs/desk-requests.log'
def log(m):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {m}"; print(line)
    try: LOG.open('a').write(line + '\n')
    except Exception: pass
def token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    info = json.load(open(os.path.expanduser('~/project/qna_push/firebase-key.json')))
    c = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email']); c.refresh(Request()); return c.token
def db(method, path, tk, body=None):
    req = urllib.request.Request(f"{DB}/{path}.json", data=json.dumps(body).encode() if body is not None else None, method=method, headers={'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read() or b'null')
def mutate(rid, tk, fn):
    request_id(rid);url=f"{DB}/desk/requests/{rid}.json"
    headers={'Authorization':'Bearer '+tk,'Content-Type':'application/json'}
    for _ in range(8):
        with urllib.request.urlopen(urllib.request.Request(url,headers={**headers,'X-Firebase-ETag':'true'}),timeout=20) as response:
            current=json.loads(response.read() or b'null');etag=response.headers.get('ETag')
        value=fn(current)
        if value==current:return current
        if not etag:raise RuntimeError('Missing ETag')
        try:
            request=urllib.request.Request(url,data=json.dumps(value).encode(),method='PUT',headers={**headers,'if-match':etag})
            with urllib.request.urlopen(request,timeout=20) as response:return json.loads(response.read() or b'null')
        except urllib.error.HTTPError as error:
            if error.code!=412:raise
    raise RuntimeError('Concurrent request update')

def notify(title, msg):
    script='on run argv\n display notification (item 2 of argv) with title (item 1 of argv)\nend run'
    subprocess.run(['osascript','-e',script,title,msg],capture_output=True)

def main():
    tk=token();reqs=db('GET','desk/requests',tk) or {};n=0
    for rid,r in reqs.items():
        try:
            if isinstance(r,dict) and r.get('status')=='canceled':
                request_id(rid);held=HERE/'canceled'
                for source in [INBOX/(rid+'.md'),*INBOX.glob(rid+'-*.md')]:
                    if source.is_file():
                        held.mkdir(parents=True,exist_ok=True);source.rename(held/(source.stem+'-'+str(uuid.uuid4())+'.md'))
                continue
            if not isinstance(r,dict) or r.get('status')!='pending':continue
            request_id(rid);kind=r.get('type','worksheet')
            if kind not in ('worksheet','slides'):continue
            title=(r.get('title') or '제목 없음').strip()
            instruction='~/project/docs/SLIDE_SYSTEM.md' if kind=='slides' else '~/project/docs/TEXTBOOK_SYSTEM.md'
            text=f"# 제작 요청 · {kind} · {title}\n\nid: {rid}\n지침: {instruction}\n상태: python3 ~/project/desk_requests/desk_requests.py state {rid} working\n완료: python3 ~/project/desk_requests/desk_requests.py done {rid} '수업/파일명'\n\n---\n\n{r.get('md','')}\n"
            now=int(datetime.datetime.now().timestamp()*1000);owner=str(uuid.uuid4())
            claimed=mutate(rid,tk,lambda current:claim_inbox(current,owner,now))
            if not claimed or claimed.get('inboxOwner')!=owner:continue
            path=INBOX/(rid+'.md');existed=path.exists()
            try:
                save_inbox(INBOX,rid,text)
                mutate(rid,tk,lambda current:received_inbox(current,owner,int(datetime.datetime.now().timestamp()*1000)))
                notify('Desk 제작 요청','새 요청이 Mac 인박스에 도착했습니다.');n+=1
            except Exception as error:
                # Keep manually edited files and isolate only this worker's just-created canceled item.
                current=db('GET','desk/requests/'+rid,tk)
                if (not current or current.get('status')=='canceled') and not existed and path.exists():
                    held=HERE/'canceled';held.mkdir(parents=True,exist_ok=True)
                    path.rename(held/(rid+'-'+owner+'.md'))
                log('개별 접수 보류: '+type(error).__name__)
        except Exception as error:
            log("개별 요청 처리 보류: "+type(error).__name__)
    log(f'접수 {n}건')

def mark_state(rid,status):
    if status not in ('working','blocked','failed','canceled'):raise ValueError('Invalid manual state')
    tk=token();now=int(datetime.datetime.now().timestamp()*1000)
    mutate(rid,tk,lambda current:transition(current,status,now))
    log('요청 상태 갱신')

def mark_done(rid,result):
    request_id(rid);path=result_path(result);tk=token()
    settings=db('GET','desk/settings/github',tk) or {}
    repo=settings.get('repo','');secret=settings.get('token','')
    if not repo or not secret:raise ValueError('Materials repository is not configured')
    url='https://api.github.com/repos/'+repo+'/contents/'+urllib.parse.quote(path,safe='/')
    request=urllib.request.Request(url,headers={'Authorization':'Bearer '+secret,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(request,timeout=20) as response:artifact=verified_artifact(path,json.loads(response.read()))
    artifact['repo']=repo;now=int(datetime.datetime.now().timestamp()*1000)
    mutate(rid,tk,lambda current:transition(current,'done',now,{'result':path,'artifact':artifact,'doneAt':now}))
    done=HERE/'done';done.mkdir(parents=True,exist_ok=True)
    for source in [INBOX/(rid+'.md'),*INBOX.glob(rid+'-*.md')]:
        if source.is_file():
            target=done/source.name
            if target.exists():target=done/(source.stem+'-'+str(now)+source.suffix)
            source.rename(target)
    log('검증된 산출물로 요청 완료')

if __name__=='__main__':
    try:
        if len(sys.argv)>=4 and sys.argv[1]=='done':mark_done(sys.argv[2],sys.argv[3])
        elif len(sys.argv)>=4 and sys.argv[1]=='state':mark_state(sys.argv[2],sys.argv[3])
        elif len(sys.argv)==1:main()
        else:raise ValueError('Usage: done ID FOLDER/FILE or state ID STATE')
    except Exception as error:log('오류: '+type(error).__name__);sys.exit(1)
