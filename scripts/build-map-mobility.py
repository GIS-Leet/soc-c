# 서울 지하철역의 승강기와 이동권 — 서울교통공사(1~8호선) 역마다 엘리베이터 · 휠체어 리프트가 몇 대, 어디에 있는지 모으고,
# 서울 시내버스 노선마다 저상 버스 비율을 모은다 → data/maps/mobility/mobility.json
# 실행: C:/Users/user/anaconda3/python.exe -I scripts/build-map-mobility.py   (인터넷 필요, 원자료는 운영체제 임시 폴더에 받는다)
#
# 원자료(모두 서울 열린데이터광장, 로그인 없이 시트 · 파일 내려받기, 공공누리 제1유형 — 출처표시)
#  1) 서울교통공사_교통약자_이용시설_승강기_가동현황 OA-15994 (매시 갱신) — 역마다 승강기 이름 · 운행 구간 · 설치 위치 · 운행 상태 · 구분
#     (EV 엘리베이터 · ES 에스컬레이터 · WL 휠체어 리프트 · MW 무빙워크). 서울교통공사가 맡은 1~8호선 구간만 들어 있다.
#     https://data.seoul.go.kr/dataList/OA-15994/S/1/datasetView.do
#  2) 서울시 역사마스터 정보 OA-21232 — 역 위경도. https://data.seoul.go.kr/dataList/OA-21232/S/1/datasetView.do
#  4) 바탕 경계(타일 지도 위 길잡이) — 통계청 센서스용 행정구역경계 2018 자치구(southkorea-maps 정리본)
#     https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-municipalities-2018-geo.json → seoul-gu.json
#  3) 서울시 저상버스 도입 노선 및 노선별 보유율 OA-22229 — 「(25.4.25)」 파일. https://data.seoul.go.kr/dataList/OA-22229/F/1/datasetView.do
#
# 처리
#  - 역 이름에서 괄호(호선 · 부역명)를 떼어 같은 이름의 역을 한 곳으로 묶는다(환승역은 서울교통공사 노선을 모두 합친다).
#  - 리프트의 「설치 위치 · 승강기 이름」에 환승 · 연결 계단 · 연결 통로가 들어 있으면 「갈아타는 길에 있는 리프트」로 나눈다.
#  - 운행 상태는 내려받은 시각 한 번의 값이다(매시 바뀐다).
import csv, io, json, os, re, sys, tempfile, urllib.request, urllib.parse, datetime
import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'maps', 'mobility')
TMP = os.path.join(tempfile.gettempdir(), 'map-mobility-raw')
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
UA = 'Mozilla/5.0 (soc-c maps build)'

def fetch(url, data=None, referer='https://data.seoul.go.kr/'):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Referer': referer})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()

def seoul_sheet(inf_id, fresh=False):
    p = os.path.join(TMP, inf_id + '.csv')
    if fresh or not os.path.exists(p):
        body = urllib.parse.urlencode({'srvType': 'S', 'infId': inf_id, 'serviceKind': 1, 'pageNo': 1, 'ssUserId': 'SAMPLE_VIEW',
                                       'strWhere': '', 'strOrderby': '', 'filterCol': '필터선택', 'txtFilter': ''}).encode()
        open(p, 'wb').write(fetch('https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do', body))
    return list(csv.DictReader(io.StringIO(open(p, 'rb').read().decode('cp949'))))

def seoul_file(inf_id, seq, name):
    p = os.path.join(TMP, name)
    if not os.path.exists(p):
        body = urllib.parse.urlencode({'infId': inf_id, 'seqNo': '', 'seq': seq, 'infSeq': 1}).encode()
        open(p, 'wb').write(fetch('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false', body,
                                  f'https://data.seoul.go.kr/dataList/{inf_id}/F/1/datasetView.do'))
    return p

LINE = {'01': '1', '02': '2', '03': '3', '04': '4', '25': '5', '26': '6', '27': '7', '28': '8'}
base = lambda s: re.sub(r'\([^)]*\)', '', s).replace(' ', '').strip()
# 갈아타는 길: 「환승」이 들어가거나 「2,3호선 연결계단」처럼 호선을 잇는 곳(삼성역 코엑스 연결 계단 · 상계역 연결 통로는 갈아타는 길이 아님)
TRANSFER = re.compile(r'환승|\d,\s?\d호선')
# 역사마스터에 옛 이름으로 남은 역
ALIAS = {'자양': '뚝섬유원지'}

def main():
    now = datetime.datetime.now()
    lifts = seoul_sheet('OA-15994', fresh=True)
    master = seoul_sheet('OA-21232')
    # ── 역 좌표: 이름(괄호 뗀 것) + 호선 ──
    pos = {}
    for m in master:
        ln = re.match(r'^(\d)호선$', m['호선'])
        key = base(m['역사명'])
        try:
            ll = (float(m['위도']), float(m['경도']))
        except ValueError:
            continue
        pos.setdefault((key, ln.group(1) if ln else m['호선']), ll)
        pos.setdefault((key, '*'), ll)
    others = {}  # 같은 이름의 역에 서울교통공사 밖 노선이 있는가
    for m in master:
        if not re.match(r'^[1-8]호선$', m['호선']):
            others.setdefault(base(m['역사명']), set()).add(m['호선'])
    # ── 역마다 승강기 모으기 ──
    st = {}
    for r in lifts:
        key = base(r['역명'])
        ln = LINE.get(r['역코드'][:2], '?')
        s = st.setdefault(key, {'name': key, 'lines': set(), 'ev': 0, 'evDown': 0, 'es': 0, 'wl': [], 'evList': []})
        s['lines'].add(ln)
        kind = r['승강기 구분']
        down = r['운행상태'] != '사용가능'
        if kind == 'EV':
            s['ev'] += 1; s['evDown'] += down
            s['evList'].append([r['운행구간'], r['설치위치'], int(down)])
        elif kind == 'ES':
            s['es'] += 1
        elif kind == 'WL':
            s['wl'].append({'at': r['설치위치'].strip(), 'span': r['운행구간'], 'down': int(down),
                            'tr': int(bool(TRANSFER.search(r['설치위치'])) or '환승' in r['승강기명'])})
    out, miss = [], []
    for key, s in st.items():
        ll, k2 = None, ALIAS.get(key, key)
        for ln in sorted(s['lines']):
            ll = ll or pos.get((k2, ln))
        ll = ll or pos.get((k2, '*'))
        if not ll:
            miss.append(key); continue
        out.append({'n': key, 'l': ''.join(sorted(s['lines'])), 'lat': round(ll[0], 5), 'lon': round(ll[1], 5), 'ev': s['ev'], 'evDown': s['evDown'],
                    'es': s['es'], 'wl': s['wl'], 'evs': s['evList'], 'other': sorted(others.get(key, []))})
    out.sort(key=lambda x: x['n'])
    print('역', len(st), '좌표 찾음', len(out), '못 찾음', miss)

    # ── 저상 버스 ──
    bp = seoul_file('OA-22229', 2, 'lowfloor-25.4.25.xlsx')
    d = pd.read_excel(bp)
    d.columns = ['route', 'all', 'low', 'ratio']
    d = d[pd.to_numeric(d['all'], errors='coerce').fillna(0) > 0]
    bus = [[str(r.route).strip(), int(r.all), int(r.low)] for r in d.itertuples()]
    print('버스 노선', len(bus), '대수', sum(b[1] for b in bus), '저상', sum(b[2] for b in bus))

    # ── 서울 자치구 경계(단순화) ──
    from shapely.geometry import shape, mapping
    gp = os.path.join(TMP, 'muni2018-geo.json')
    if not os.path.exists(gp):
        open(gp, 'wb').write(fetch('https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-municipalities-2018-geo.json'))
    gj = json.load(open(gp, encoding='utf-8'))
    feats = []
    for f in gj['features']:
        if not f['properties']['code'].startswith('11'):
            continue
        g = mapping(shape(f['geometry']).simplify(0.0004, preserve_topology=True))
        def rnd(c):
            return [rnd(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]
        feats.append({'type': 'Feature', 'properties': {'name': f['properties']['name']}, 'geometry': {'type': g['type'], 'coordinates': rnd(g['coordinates'])}})
    gu = os.path.join(OUT, 'seoul-gu.json')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(gu, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(gu, os.path.getsize(gu))

    data = {'made': now.strftime('%Y-%m-%d %H:%M'), 'stations': out, 'bus': bus, 'busDate': '2025-04-25',
            'count': {'rows': len(lifts), 'ev': sum(1 for r in lifts if r['승강기 구분'] == 'EV'), 'wl': sum(1 for r in lifts if r['승강기 구분'] == 'WL'),
                      'es': sum(1 for r in lifts if r['승강기 구분'] == 'ES')}}
    p = os.path.join(OUT, 'mobility.json')
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(p, os.path.getsize(p))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
