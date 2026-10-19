# 몇 분 안에 닿는가 — 사람이 사는 곳(약 3km 격자)마다 가장 가까운 응급실까지 「자동차로 걸리는 시간」을 미리 계산한다.
# 실행: C:/Users/user/anaconda3/python.exe -I scripts/build-map-access.py   (인터넷 필요, 원자료는 운영체제 임시 폴더에)
# 결과: data/maps/access/access.json
#
# 원자료
#  1) 응급실이 있는 의료 기관 — 건강보험심사평가원 「전국 병의원 및 약국 현황 2026.6」(공공데이터포털 15051059 → HIRA 보건의료빅데이터개방시스템)
#     https://opendata.hira.or.kr/op/opc/selectOpenData.do?sno=11925  · 공공누리 제1유형(출처표시) · 로그인 없이 내려받음
#     이 누리집의 내려받기 단추는 브라우저 안의 업로드 도구(DEXT5)로만 움직여, 브라우저로 받은 zip 을 아래 HIRA_ZIP 자리에 둔다
#     (이 작업에서는 Playwright 로 그 단추를 눌러 받았다).
#     「3.의료기관별상세정보서비스_01_시설정보」의 응급실 병상 수가 1 이상인 곳 가운데 상급종합병원 · 종합병원 · 병원 · 보건의료원만 쓴다
#     (의원 · 치과 · 한방 · 정신병원 · 요양병원은 뺌). 위치는 「1.병원정보서비스」의 좌표.
#     ※ 법으로 지정된 권역 · 지역 응급의료센터 목록이 아니다 — 그 전국 목록은 로그인 없는 파일로 찾지 못했다(국립중앙의료원 오픈 API는 인증키 필요).
#  2) 인구 — WorldPop Global2 R2025A 2025년 대한민국 100m 인구(constrained, CC BY 4.0). 40×40칸(약 2.9km × 3.7km)으로 묶고,
#     한 묶음 안에서도 시·군·구가 다르면 나눈다. 출발점은 그 조각의 인구 가중 중심.
#  3) 시·군·구 경계 — 통계청 센서스용 행정구역경계 2018(southkorea-maps, topo-simple). 일반구는 시로 합치고(build-map-aging.mjs 와 같은 방식),
#     지도 투영도 같다(위도 36° 기준 정거 원통, 가로 560).
#  4) 길 · 시간 — OSRM 공개 시연 서버(router.project-osrm.org, OpenStreetMap 도로 자료, ODbL) 「table」 요청.
#     사용 규칙(1초에 한 번 이하 · 많이 쓰지 않기)을 지켜 한 번만 계산하고 결과를 저장한다(요청 사이 1.2초). 출발점마다 곧은 거리로 가까운
#     응급실을 등급마다 4곳씩 후보로 보내 가장 짧은 시간을 고른다. 시간은 막힘 없는 길의 자동차 시간(구급차 · 교통 체증 · 출동 시간 없음).
import io, json, math, os, re, sys, tempfile, time, zipfile, urllib.request, urllib.error, datetime
import numpy as np
import pandas as pd
import rasterio
from rasterio import features
from shapely.geometry import shape, mapping
from scipy.spatial import cKDTree

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'maps', 'access')
TMP = os.path.join(tempfile.gettempdir(), 'map-access-raw')
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
HIRA_ZIP = os.path.join(tempfile.gettempdir(), 'hira', 'h.zip')
WP = os.path.join(tempfile.gettempdir(), 'wp', 'kor_pop_2025.tif')
UA = {'User-Agent': 'soc-c-maps/1.0 (high-school geography class site nyuheatgis.com; one-time precompute)'}
B = 40  # 묶는 칸 수

SIDO = {11: '서울', 21: '부산', 22: '대구', 23: '인천', 24: '광주', 25: '대전', 26: '울산', 29: '세종', 31: '경기', 32: '강원', 33: '충북', 34: '충남', 35: '전북', 36: '전남', 37: '경북', 38: '경남', 39: '제주'}
BOX = {'lon0': 124.55, 'lat0': 38.65, 'lon1': 132.0, 'lat1': 33.05, 'w': 560}
KX = math.cos(math.radians(36)); S = BOX['w'] / ((BOX['lon1'] - BOX['lon0']) * KX)
BOX['h'] = round((BOX['lat0'] - BOX['lat1']) * S)
P = lambda lon, lat: ((lon - BOX['lon0']) * KX * S, (BOX['lat0'] - lat) * S)

def get(url, path):
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r:
            open(path, 'wb').write(r.read())
    return path

def units_from_topo():
    topo = json.load(open(get('https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json',
                              os.path.join(TMP, 'muni2018-topo.json')), encoding='utf-8'))
    tf = topo['transform']; arcs = []
    for a in topo['arcs']:
        x = y = 0; pts = []
        for dx, dy in a:
            x += dx; y += dy; pts.append((x * tf['scale'][0] + tf['translate'][0], y * tf['scale'][1] + tf['translate'][1]))
        arcs.append(pts)
    def ring(ids):
        out = []
        for k, i in enumerate(ids):
            seg = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(seg if k == 0 else seg[1:])
        return out
    units = {}
    for g in list(topo['objects'].values())[0]['geometries']:
        code = str(g['properties']['code'])
        sido = SIDO[int(code[:2])]
        name = re.sub(r'^(\S+?시)(\S+구)$', r'\1', g['properties']['name'])
        if name == '군위군': sido = '대구'
        if sido == '인천' and name == '남구': name = '미추홀구'
        key = '세종' if sido == '세종' else f'{sido}>{name}'
        u = units.setdefault(key, {'key': key, 'sido': sido, 'name': '세종특별자치시' if sido == '세종' else name, 'polys': []})
        for p in ([g['arcs']] if g['type'] == 'Polygon' else g['arcs']):
            rings = [ring(r) for r in p]
            rings = [r for r in rings if len(r) >= 4]
            if rings: u['polys'].append(rings)
    out = []
    for u in units.values():
        geom = shape({'type': 'MultiPolygon', 'coordinates': u['polys']}).buffer(0)
        d, best, cx, cy = '', 0, 0, 0
        for p in u['polys']:
            for r in p:
                pts, prev = [], None
                for lo, la in r:
                    q = P(lo, la)
                    if prev is None or abs(prev[0] - q[0]) + abs(prev[1] - q[1]) > 0.8:
                        pts.append(q); prev = q
                if len(pts) < 3: continue
                d += 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z'
                a = x_ = y_ = 0
                for i in range(len(pts)):
                    x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]; c = x0 * y1 - x1 * y0
                    a += c; x_ += (x0 + x1) * c; y_ += (y0 + y1) * c
                if abs(a) > best: best = abs(a); cx = x_ / (3 * a); cy = y_ / (3 * a)
        out.append({'key': u['key'], 'sido': u['sido'], 'name': u['name'], 'd': d.replace('.0,', ',').replace('.0L', 'L').replace('.0Z', 'Z'),
                    'cx': round(cx), 'cy': round(cy), 'geom': geom})
    out.sort(key=lambda u: u['key'])
    return out

def hospitals():
    z = zipfile.ZipFile(HIRA_ZIP)
    files = {re.match(r'(\d+)\.', i.filename.split('/')[-1]).group(1): i for i in z.infolist() if i.file_size and re.match(r'\d+\.', i.filename.split('/')[-1])}
    fac = pd.read_excel(io.BytesIO(z.read(files['3'])), usecols=['암호화요양기호', '요양기관명', '종별코드명', '응급실병상수'])
    base = pd.read_excel(io.BytesIO(z.read(files['1'])), usecols=['암호화요양기호', '시도코드명', '시군구코드명', '좌표(X)', '좌표(Y)'])
    er = fac[(fac['응급실병상수'] > 0) & fac['종별코드명'].isin(['상급종합', '종합병원', '병원', '보건의료원'])].merge(base, on='암호화요양기호')
    er = er.dropna(subset=['좌표(X)', '좌표(Y)']).rename(columns={'좌표(X)': 'lon', '좌표(Y)': 'lat'})
    tier = {'상급종합': 3, '종합병원': 2, '병원': 1, '보건의료원': 1}
    return [{'n': r.요양기관명, 'k': r.종별코드명, 't': tier[r.종별코드명], 'beds': int(r.응급실병상수), 'lon': float(r.lon), 'lat': float(r.lat)} for r in er.itertuples()]

def origins(units):
    with rasterio.open(WP) as src:
        pop = src.read(1).astype('float64'); tr = src.transform
    pop[(pop < 0) | ~np.isfinite(pop)] = 0
    H, W = pop.shape
    lab = features.rasterize([(mapping(u['geom']), i + 1) for i, u in enumerate(units)], out_shape=(H, W), transform=tr, fill=0, dtype='uint16', all_touched=False)
    # 경계 밖(해안선 단순화로 빠진 칸)의 인구는 가장 가까운 시·군·구로
    miss = (lab == 0) & (pop > 0)
    if miss.any():
        rr, cc = np.where(lab > 0); tree = cKDTree(np.c_[rr, cc])
        mr, mc = np.where(miss); _, j = tree.query(np.c_[mr, mc]); lab[mr, mc] = lab[rr[j], cc[j]]
    print('인구 합', round(pop.sum()), '경계 밖에서 옮긴 칸', int(miss.sum()))
    rows, cols = np.nonzero(pop)
    w = pop[rows, cols]; u = lab[rows, cols]
    lon = tr.c + (cols + 0.5) * tr.a; lat = tr.f + (rows + 0.5) * tr.e
    key = (rows // B).astype(np.int64) * 100000 + (cols // B) * 1000 + u  # 묶음 × 시·군·구
    order = np.argsort(key); key, w, u, lon, lat = key[order], w[order], u[order], lon[order], lat[order]
    cut = np.r_[0, np.nonzero(np.diff(key))[0] + 1, len(key)]
    o = []
    for a, b in zip(cut[:-1], cut[1:]):
        s = w[a:b].sum()
        o.append({'lon': float((lon[a:b] * w[a:b]).sum() / s), 'lat': float((lat[a:b] * w[a:b]).sum() / s), 'pop': float(s), 'u': int(u[a]) - 1})
    print('출발점', len(o))
    return o

def km(lon1, lat1, lon2, lat2):
    return math.hypot((lon2 - lon1) * 88.8, (lat2 - lat1) * 111.0)

def osrm(org, hos):
    cache_p = os.path.join(TMP, 'osrm-cache.json')
    cache = json.load(open(cache_p)) if os.path.exists(cache_p) else {}
    xy = lambda p: (p['lon'] * 0.794, p['lat'])
    trees = {t: (cKDTree([xy(h) for h in hos if h['t'] >= t]), [i for i, h in enumerate(hos) if h['t'] >= t]) for t in (1, 2, 3)}
    cand = []
    for p in org:
        c = set()
        for t, (tree, idx) in trees.items():
            _, j = tree.query(xy(p), k=4)
            c.update(idx[x] for x in np.atleast_1d(j))
        cand.append(c)
    # 공간 순서로 묶기(0.25° 칸 → 그 안에서 위도)
    order = sorted(range(len(org)), key=lambda i: (int(org[i]['lat'] / 0.25), int(org[i]['lon'] / 0.25), org[i]['lat']))
    batches, cur, dest = [], [], set()
    for i in order:
        nd = dest | cand[i]
        if cur and (len(cur) >= 110 or len(nd) > 85):
            batches.append((cur, dest)); cur, dest = [], set(); nd = set(cand[i])
        cur.append(i); dest = nd
    if cur: batches.append((cur, dest))
    print('요청', len(batches), '(저장해 둔 것', sum(1 for b in batches if f"{b[0][0]}-{len(b[0])}-{len(b[1])}" in cache), ')')
    res = [None] * len(org)
    for bi, (src_i, dst) in enumerate(batches):
        dst = sorted(dst)
        ck = f'{src_i[0]}-{len(src_i)}-{len(dst)}'
        if ck not in cache:
            coords = ';'.join(f"{org[i]['lon']:.5f},{org[i]['lat']:.5f}" for i in src_i) + ';' + ';'.join(f"{hos[j]['lon']:.5f},{hos[j]['lat']:.5f}" for j in dst)
            url = (f'https://router.project-osrm.org/table/v1/driving/{coords}?sources=' + ';'.join(map(str, range(len(src_i)))) +
                   '&destinations=' + ';'.join(map(str, range(len(src_i), len(src_i) + len(dst)))) + '&annotations=duration')
            for tries in range(4):
                try:
                    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
                    if r.get('code') == 'Ok': break
                except Exception as e:
                    print('  다시', bi, e); time.sleep(10 * (tries + 1))
            else:
                raise SystemExit('OSRM 실패')
            cache[ck] = {'src': src_i, 'dst': dst, 'dur': r['durations'], 'snap': [w['distance'] for w in r['sources']]}
            json.dump(cache, open(cache_p, 'w'))
            time.sleep(1.2)
            if bi % 10 == 0: print('  ', bi + 1, '/', len(batches))
        c = cache[ck]
        for a, i in enumerate(c['src']):
            res[i] = {'all': [(c['dur'][a][b], j) for b, j in enumerate(c['dst']) if c['dur'][a][b] is not None], 'snap': c['snap'][a]}
    return res

def route(pts):
    url = 'https://router.project-osrm.org/route/v1/driving/' + ';'.join(f"{p['lon']:.5f},{p['lat']:.5f}" for p in pts) + '?overview=false&steps=true'
    for tries in range(4):
        try:
            out = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
        except urllib.error.HTTPError as e:
            try: out = json.loads(e.read().decode())
            except Exception: out = {'code': 'HTTP%d' % e.code}
        except Exception as e:
            out = {'code': str(e)}
        time.sleep(1.2)
        if out.get('code') in ('Ok', 'NoRoute'): return out
        print('  다시', out.get('code'), out.get('message', '')); time.sleep(10 * (tries + 1))
    return out

def best_of(r, hos, t, ok=lambda j: True):
    b = [(v, j) for v, j in r['all'] if hos[j]['t'] >= t and ok(j)]
    return min(b) if b else None

def islands(units, org, hos):
    """다리로 이어지지 않은 섬 찾기 — OSRM 은 뱃길(OpenStreetMap route=ferry)도 길로 쓰므로, 섬에서 뭍으로 가는 길에 배가 끼는지 본다.
    섬(뭍과 떨어진 땅 조각)마다 사람이 가장 많은 출발점에서 가장 가까운 뭍 출발점까지 길을 묻고(route, steps), 배를 타는 구간이 있으면
    「다리로 이어지지 않은 섬」. 그런 섬의 출발점은 같은 섬 안의 응급실만 인정한다(섬 밖은 배 · 헬기로 가야 하므로 「길로 닿지 않음」).
    돌려주는 값: 출발점마다 땅 조각 번호(뭍 = 0)와, 다리 없는 섬이면 True"""
    from shapely.ops import unary_union
    from shapely.geometry import Point
    from shapely.strtree import STRtree
    land = unary_union([u['geom'] for u in units])
    parts = sorted(land.geoms, key=lambda g: -g.area)
    tree = STRtree(parts)
    def part_of(lon, lat):
        pt = Point(lon, lat)
        idx = tree.query(pt, predicate='intersects')
        if len(idx): return int(idx[0])
        j = int(tree.nearest(pt))
        return j if parts[j].distance(pt) < 0.01 else 10000 + len(parts) + int(round(lon * 20)) * 1000 + int(round(lat * 20))  # 지도에서 빠진 작은 섬
    op = [part_of(p['lon'], p['lat']) for p in org]
    hp = [part_of(h['lon'], h['lat']) for h in hos]
    main_i = [i for i, k in enumerate(op) if k == 0]
    mtree = cKDTree([(org[i]['lon'] * 0.794, org[i]['lat']) for i in main_i])
    groups = {}
    for i, k in enumerate(op):
        if k != 0: groups.setdefault(k, []).append(i)
    reps = []
    for k, ids in groups.items():
        r = max(ids, key=lambda i: org[i]['pop'])
        _, j = mtree.query((org[r]['lon'] * 0.794, org[r]['lat']))
        reps.append((k, r, main_i[j]))
    cache_p = os.path.join(TMP, 'osrm-ferry.json')
    cache = json.load(open(cache_p)) if os.path.exists(cache_p) else {}
    ferry = {}
    for s0 in range(0, len(reps), 40):
        chunk = reps[s0:s0 + 40]
        ck = ','.join(str(r[1]) for r in chunk)
        if ck not in cache:
            pts = []
            for _, r, m in chunk: pts += [org[r], org[m]]
            j = route(pts)
            if j.get('code') == 'Ok':
                legs = j['routes'][0]['legs']
                cache[ck] = [any(st.get('mode') == 'ferry' for st in legs[2 * a]['steps']) for a in range(len(chunk))]
            elif j.get('code') == 'NoRoute':  # 어느 섬은 뱃길조차 없다 → 하나씩 다시 묻는다
                one = []
                for _, r, m in chunk:
                    jj = route([org[r], org[m]])
                    one.append(True if jj.get('code') == 'NoRoute' else any(st.get('mode') == 'ferry' for st in jj['routes'][0]['legs'][0]['steps']))
                cache[ck] = one
            else:
                raise SystemExit('OSRM route 실패 ' + str(j.get('code')))
            json.dump(cache, open(cache_p, 'w'))
        for (k, _, _), f in zip(chunk, cache[ck]): ferry[k] = f
    nob = {k for k, f in ferry.items() if f}
    print('땅 조각(뭍 밖)', len(groups), '다리 없는 섬', len(nob), '그 인구', round(sum(org[i]['pop'] for k in nob for i in groups[k])))
    return op, hp, nob

def main():
    units = units_from_topo()
    print('시·군·구', len(units))
    hos = hospitals()
    print('응급실', len(hos), {k: sum(1 for h in hos if h['k'] == k) for k in ('상급종합', '종합병원', '병원', '보건의료원')})
    org = origins(units)
    res = osrm(org, hos)
    op, hp_, nob = islands(units, org, hos)
    cells, far = [], 0
    for i, (p, r) in enumerate(zip(org, res)):
        x, y = P(p['lon'], p['lat'])
        isl = op[i] in nob
        ts = []
        for t in (1, 2, 3):
            b = best_of(r, hos, t, (lambda j: hp_[j] == op[i]) if isl else (lambda j: True))
            if b is None or r['snap'] > 3000: ts.append(-1)  # 길로 닿지 않음(다리 없는 섬에서 섬 밖 · 길에서 3km 넘게 떨어진 곳)
            else: ts.append(round(b[0] / 60, 1))
        if r['snap'] > 3000: far += p['pop']
        cells.append([round(x, 1), round(y, 1), round(p['pop']), p['u']] + ts + [1 if isl else 0])
    print('길에서 3km 넘게 떨어진 출발점 인구', round(far))
    hp = []
    for h in hos:
        x, y = P(h['lon'], h['lat'])
        hp.append([round(x, 1), round(y, 1), h['t'], h['n'], h['k'], h['beds']])
    data = {'made': datetime.date.today().isoformat(), 'w': BOX['w'], 'h': BOX['h'],
            'units': [{k: u[k] for k in ('key', 'sido', 'name', 'd', 'cx', 'cy')} for u in units],
            'hosp': hp, 'cells': cells,
            'src': {'hira': '건강보험심사평가원 전국 병의원 및 약국 현황 2026.6', 'pop': 'WorldPop R2025A 2025 100m constrained', 'route': 'OSRM demo (OpenStreetMap)'}}
    p = os.path.join(OUT, 'access.json')
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(p, os.path.getsize(p))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
