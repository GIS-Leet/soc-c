#!/usr/bin/env python3
"""Q&A 새 질문·학생 대댓글 → Desk 앱 푸시(APNs).
Firebase RTDB(questions)를 서비스 계정으로 읽어 마지막 확인 시각(desk/push/lastCheck) 이후 것만 골라
desk/push/tokens 에 등록된 기기에 보낸다. Mac LaunchAgent(2분마다)와 GitHub Actions(5분마다) 어디서든 이벤트·기기별 lease와 ACK를 공유한다. 전송 직후 종료되면 중복 가능성이 있는 at-least-once 방식이다.

설정(환경변수 또는 같은 폴더 config.json):
  APNS_KEY_PATH  .p8 파일 경로      APNS_KEY_ID  키 ID(10자)      APNS_TEAM_ID  팀 ID(JUD3Y3XYZ7)
  APNS_TOPIC     번들 ID(nyuheatgis) APNS_ENV     sandbox|production(개발 프로파일 설치본은 sandbox)
  FIREBASE_SA    서비스 계정 JSON 경로(또는 JSON 문자열)
  DATABASE_URL   https://soc-c-qna-default-rtdb.firebaseio.com
"""
import base64, json, os, re, subprocess, sys, time, datetime, pathlib
from delivery import deliver_pending, event_id

HERE = pathlib.Path(__file__).resolve().parent
LOG = pathlib.Path.home() / 'Library/Logs/qna-push.log' if sys.platform == 'darwin' else None

def log(msg):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line)
    if LOG:
        try: LOG.parent.mkdir(parents=True, exist_ok=True); LOG.open('a').write(line + '\n')
        except Exception: pass

def cfg(key, default=None):
    v = os.environ.get(key)
    if v: return v
    f = HERE / 'config.json'
    if f.exists():
        try: return json.loads(f.read_text()).get(key, default)
        except Exception: return default
    return default

# ── Firebase (서비스 계정 → OAuth 토큰) ──
def firebase_token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    sa = cfg('FIREBASE_SA')
    info = json.loads(sa) if sa and sa.strip().startswith('{') else json.load(open(os.path.expanduser(sa)))
    creds = service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'])
    creds.refresh(Request()); return creds.token

def db(method, path, token, body=None):
    import urllib.request
    url = f"{cfg('DATABASE_URL', 'https://soc-c-qna-default-rtdb.firebaseio.com')}/{path}.json"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read() or b'null')

# ── APNs (ES256 JWT + curl HTTP/2) ──
def apns_jwt():
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    key_pem = cfg('APNS_KEY') or open(os.path.expanduser(cfg('APNS_KEY_PATH')), 'rb').read()
    key = serialization.load_pem_private_key(key_pem if isinstance(key_pem, bytes) else key_pem.encode(), password=None)
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
    header = b64(json.dumps({'alg': 'ES256', 'kid': cfg('APNS_KEY_ID')}).encode()); payload = b64(json.dumps({'iss': cfg('APNS_TEAM_ID'), 'iat': int(time.time())}).encode())
    signing = f"{header}.{payload}".encode()
    r, s = decode_dss_signature(key.sign(signing, ec.ECDSA(hashes.SHA256())))
    return f"{header}.{payload}." + b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))

def send(token_hex, jwt, title, body, extra, environment=None):
    env = environment or cfg('APNS_ENV', 'sandbox')
    host = 'api.sandbox.push.apple.com' if env in ('sandbox', 'development') else 'api.push.apple.com'
    payload = {'aps': {'alert': {'title': title, 'body': body}, 'sound': 'default', 'badge': extra.get('badge', 1), 'thread-id': 'qna'}, **extra}
    options = [('url',f'https://{host}/3/device/{token_hex}'),('request','POST'),('header',f'authorization: bearer {jwt}'),('header',f"apns-topic: {cfg('APNS_TOPIC', 'nyuheatgis')}"),('header','apns-push-type: alert'),('header','apns-priority: 10'),('data',json.dumps(payload))]
    config = '\n'.join(k+' = '+json.dumps(v) for k,v in options)
    out = subprocess.run(['curl','--silent','--show-error','--http2','--max-time','25','--config','-','--write-out','\n%{http_code}'],input=config,capture_output=True,text=True,timeout=30)
    raw, _, code = out.stdout.rpartition('\n')
    try: reason = json.loads(raw).get('reason','') if raw else ''
    except (ValueError,TypeError): reason = 'InvalidResponse'
    return int(code) if code.isdigit() else 0, reason

def transaction(path, tk, change):
    import urllib.request, urllib.error
    url = f"{cfg('DATABASE_URL', 'https://soc-c-qna-default-rtdb.firebaseio.com')}/{path}.json"
    headers = {'Authorization':'Bearer '+tk,'Content-Type':'application/json'}
    for _ in range(8):
        with urllib.request.urlopen(urllib.request.Request(url,headers={**headers,'X-Firebase-ETag':'true'}),timeout=20) as response:
            current=json.loads(response.read() or b'null'); etag=response.headers.get('ETag')
        result=change(current)
        if result==current: return current
        if not etag: raise RuntimeError('Missing ETag')
        try:
            request=urllib.request.Request(url,data=json.dumps(result).encode(),method='PUT',headers={**headers,'if-match':etag})
            with urllib.request.urlopen(request,timeout=20) as response: return json.loads(response.read() or b'null')
        except urllib.error.HTTPError as error:
            if error.code != 412: raise
    raise RuntimeError('Concurrent update limit')

def parse_qtime(t):   # 'YYYY/MM/DD AM/PM h:mm' → ms(로컬 KST 기준)
    m = re.match(r'^(\d{4})/(\d{2})/(\d{2}) (AM|PM) (\d{1,2}):(\d{2})$', t or '')
    if not m: return 0
    h = int(m[5]) % 12 + (12 if m[4] == 'PM' else 0)
    kst = datetime.timezone(datetime.timedelta(hours=9))
    return int(datetime.datetime(int(m[1]), int(m[2]), int(m[3]), h, int(m[6]), tzinfo=kst).timestamp() * 1000)

def main():
    if not (cfg('APNS_KEY') or cfg('APNS_KEY_PATH')) or not cfg('APNS_KEY_ID'):
        log('APNs 설정 없음'); return 0
    tk=firebase_token(); now=int(time.time()*1000)
    last=db('GET','desk/push/lastCheck',tk) or 0
    cutoff=transaction('desk/push/discoveryFrom',tk,lambda value:value if value is not None else (max(0,last-60000) if last else now))
    cutoff=max(cutoff,now-14*86400*1000)
    tokens=db('GET','desk/push/tokens',tk) or {}
    if not tokens: log('등록된 기기 없음 · 미전송 사건 유지'); return 0
    qs=db('GET','questions',tk) or {}
    badge=sum(1 for q in qs.values() if isinstance(q,dict) and not q.get('replies'))
    discovered=[]
    for qid,q in qs.items():
        if not isinstance(q,dict): continue
        if (q.get('timestamp') or 0)>=cutoff:
            discovered.append((event_id('question',qid),'새 학생 질문','Desk에서 질문을 확인하세요.'))
        for rid,r in (q.get('replies') or {}).items():
            if not isinstance(r,dict): continue
            for sid,reply in (r.get('subReplies') or {}).items():
                if isinstance(reply,dict) and not reply.get('isTeacher') and parse_qtime(reply.get('time'))>=cutoff:
                    discovered.append((event_id('reply',qid,rid,sid),'학생의 추가 질문','Desk에서 이어진 질문을 확인하세요.'))
    # Every discovered event is durable before advancing the compatibility cursor.
    for eid,title,body in discovered:
        event={'title':title,'body':body,'badge':badge,'createdAt':now,'devices':{device:{'state':'pending','registeredAt':meta.get('at'),'env':meta.get('env',cfg('APNS_ENV','sandbox'))} for device,meta in tokens.items() if isinstance(meta,dict)}}
        transaction('desk/push/events/'+eid,tk,lambda current,event=event:current if current is not None else event)
    transaction('desk/push/lastCheck',tk,lambda value:max(value or 0,now))
    events=db('GET','desk/push/events',tk) or {}
    jwt=apns_jwt()
    def remove_token(device, registered):
        transaction('desk/push/tokens/'+device,tk,lambda value:None if isinstance(value,dict) and value.get('at')==registered else value)
    counts=deliver_pending(events,lambda path,change:transaction(path,tk,change),lambda device,event,item:send(device,jwt,event['title'],event['body'],{'qa':True,'badge':event['badge']},item.get('env')),time.time,remove_token)
    for eid,event in events.items():
        if event.get('createdAt',now)<now-14*86400*1000:
            transaction('desk/push/events/'+eid,tk,lambda current:None if current and current.get('devices') and all(d.get('state') in ('accepted','invalid') for d in current['devices'].values()) else current)
    log('APNs 수락 {accepted} · 재시도 {retry} · 영구 무효 {invalid}'.format(**counts))
    return 0

if __name__ == '__main__':
    try: sys.exit(main())
    except Exception as error: log('오류: '+type(error).__name__); sys.exit(1)
