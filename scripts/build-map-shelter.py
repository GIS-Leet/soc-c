# 서울 지진 대피 장소까지의 거리 — 서울의 지진 옥외 대피 장소와 인구 격자로 「가장 가까운 대피 장소까지의 직선 거리」를 칸마다 미리 잰다.
# 실행: C:/Users/user/anaconda3/python.exe -I scripts/build-map-shelter.py   (인터넷 필요, 원자료는 운영체제 임시 폴더에 받는다)
#
# 원자료
#  1) 서울시 지진옥외대피소 — 서울 열린데이터광장 OA-21063 (제공: 서울특별시, 원본: 행정안전부 재난안전데이터공유플랫폼, 매일 갱신)
#     https://data.seoul.go.kr/dataList/OA-21063/S/1/datasetView.do  · 공공누리 제1유형(출처표시)
#     로그인 없이 시트 내려받기(CSV) 주소로 받는다.
#  2) 인구 격자 — WorldPop Global2 R2025A, 2025년 대한민국 100m 격자 인구(건물 있는 곳에만 나눈 판, constrained)
#     https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/KOR/v1/100m/constrained/kor_pop_2025_CN_100m_R2025A_v1.tif
#     CC BY 4.0 · 인구 총조사 값을 위성 영상 · 건물 자료로 나눠 놓은 「추정」 격자다.
#  3) 서울 자치구 경계 — 통계청 센서스용 행정구역경계 2018(southkorea-maps 정리본, 자치구 경계는 그 뒤로 바뀌지 않음)
#     https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json
#
# 처리
#  - 격자 칸(위경도 0.000833°, 약 74m × 93m) 가운데 서울 안의 칸마다 가장 가까운 대피 장소까지의 직선 거리(m)를 잰다
#    (EPSG:5186 평면 좌표에서 kd-트리). 실제 걷는 길(도로 · 다리 · 담)은 반영하지 않는다.
#  - 화면용: grid.bin = [거리 코드 uint8 (20m 단위, 254 = 5,080m 이상, 255 = 서울 밖)] × 칸 수 + [인구 uint16 (사람 수 반올림)] × 칸 수
#  - 통계용: meta.json 의 구별 거리 막대(10m 칸마다 인구 합) — 화면에서 반지름 r 을 정하면 r 보다 먼 칸의 인구를 더한다.
#  - shelters.json: 대피 장소 이름 · 구 · 면적 · 위경도.
import csv, io, json, os, sys, tempfile, urllib.request, urllib.parse, datetime
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio import features
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from pyproj import Transformer
from scipy.spatial import cKDTree

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'maps', 'shelter')
TMP = os.path.join(tempfile.gettempdir(), 'map-shelter-raw')
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (soc-c maps build)'}

def get(url, path, data=None, referer=None):
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return path
    h = dict(UA)
    if referer: h['Referer'] = referer
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=600) as r, open(path, 'wb') as f:
        f.write(r.read())
    return path

def seoul_sheet(inf_id):
    """서울 열린데이터광장 시트 자료를 CSV(CP949)로 받는다 — 로그인 없음"""
    body = urllib.parse.urlencode({'srvType': 'S', 'infId': inf_id, 'serviceKind': 1, 'pageNo': 1, 'ssUserId': 'SAMPLE_VIEW',
                                   'strWhere': '', 'strOrderby': '', 'filterCol': '필터선택', 'txtFilter': ''}).encode()
    p = get('https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do', os.path.join(TMP, inf_id + '.csv'), body, 'https://data.seoul.go.kr/')
    return list(csv.DictReader(io.StringIO(open(p, 'rb').read().decode('cp949'))))

def topo_features(topo):
    """TopoJSON → [(properties, shapely geometry)]"""
    tf = topo.get('transform')
    arcs = []
    for a in topo['arcs']:
        x = y = 0; pts = []
        for p in a:
            if tf:
                x += p[0]; y += p[1]
                pts.append((x * tf['scale'][0] + tf['translate'][0], y * tf['scale'][1] + tf['translate'][1]))
            else:
                pts.append(tuple(p))
        arcs.append(pts)
    def ring(ids):
        out = []
        for i in ids:
            seg = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(seg if not out else seg[1:])
        return out
    obj = topo['objects'][list(topo['objects'])[0]]
    res = []
    for g in obj['geometries']:
        polys = [g['arcs']] if g['type'] == 'Polygon' else g['arcs']
        parts = []
        for p in polys:
            rings = [ring(r) for r in p]
            rings = [r for r in rings if len(r) >= 4]  # 단순화로 납작해진 작은 섬은 버린다
            if rings:
                parts.append(rings)
        geom = {'type': 'MultiPolygon', 'coordinates': parts}
        res.append((g['properties'], shape(geom).buffer(0)))
    return res

def main():
    # ── 1. 대피 장소 ──
    rows = seoul_sheet('OA-21063')
    sh = []
    for r in rows:
        try:
            lat, lon = float(r['위도']), float(r['경도'])
        except ValueError:
            continue
        if not (37.4 < lat < 37.72 and 126.75 < lon < 127.2):
            continue
        area = r.get('시설면적') or ''
        sh.append({'n': r['수용시설명'].strip(), 'g': r['시군구명'].strip(), 'a': round(float(area)) if area.replace('.', '', 1).isdigit() else None,
                   'lat': round(lat, 6), 'lon': round(lon, 6)})
    print('대피 장소', len(rows), '→ 좌표 있는 곳', len(sh))

    # ── 2. 서울 자치구 경계 ──
    mp = get('https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json',
             os.path.join(TMP, 'muni2018.json'))
    gus = [(p, g) for p, g in topo_features(json.load(open(mp, encoding='utf-8'))) if p['code'].startswith('11')]
    gus.sort(key=lambda x: x[0]['code'])
    seoul = unary_union([g for _, g in gus])
    print('자치구', len(gus))

    # ── 3. 인구 격자 잘라 내기 ──
    wp = get('https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/KOR/v1/100m/constrained/kor_pop_2025_CN_100m_R2025A_v1.tif',
             os.path.join(tempfile.gettempdir(), 'wp', 'kor_pop_2025.tif'))
    with rasterio.open(wp) as src:
        minx, miny, maxx, maxy = seoul.bounds
        win = from_bounds(minx - 0.002, miny - 0.002, maxx + 0.002, maxy + 0.002, src.transform).round_offsets().round_lengths()
        pop = src.read(1, window=win).astype('float64')
        tr = src.window_transform(win)
        nod = src.nodata
    pop[(pop == nod) | (pop < 0) | ~np.isfinite(pop)] = 0
    H, W = pop.shape
    gu_idx = features.rasterize([(mapping(g), i + 1) for i, (_, g) in enumerate(gus)], out_shape=(H, W), transform=tr, fill=0, dtype='uint8')
    inside = gu_idx > 0
    pop[~inside] = 0
    print('격자', W, 'x', H, '서울 안 칸', int(inside.sum()), '인구 합', round(pop.sum()))

    # ── 4. 가장 가까운 대피 장소까지 직선 거리 ──
    to5186 = Transformer.from_crs('EPSG:4326', 'EPSG:5186', always_xy=True)
    sx, sy = to5186.transform([s['lon'] for s in sh], [s['lat'] for s in sh])
    tree = cKDTree(np.c_[sx, sy])
    cols, rws = np.meshgrid(np.arange(W), np.arange(H))
    lon = tr.c + (cols + 0.5) * tr.a
    lat = tr.f + (rws + 0.5) * tr.e
    ii = np.where(inside)
    cx, cy = to5186.transform(lon[ii], lat[ii])
    d, _ = tree.query(np.c_[cx, cy])
    dist = np.full((H, W), np.inf)
    dist[ii] = d

    # ── 5. 화면용 격자 ──
    code = np.full((H, W), 255, dtype='uint8')
    code[ii] = np.minimum(np.round(d / 20), 254).astype('uint8')
    pop16 = np.minimum(np.round(pop), 65535).astype('<u2')
    with open(os.path.join(OUT, 'grid.bin'), 'wb') as f:
        f.write(code.tobytes())
        f.write(pop16.tobytes())

    # ── 6. 구별 거리 막대(10m 칸) ──
    NB = 600  # 0 ~ 6,000m, 마지막 칸은 그보다 먼 곳 모두
    def hist(mask):
        b = np.minimum((dist[mask] // 10).astype(int), NB - 1)
        h = np.bincount(b, weights=pop[mask], minlength=NB)
        return [round(x, 1) for x in h.tolist()]
    units = []
    for i, (p, g) in enumerate(gus):
        m = gu_idx == i + 1
        rr, cc = np.where(m)
        bb = [round(tr.f + (rr.max() + 1) * tr.e, 5), round(tr.c + cc.min() * tr.a, 5), round(tr.f + rr.min() * tr.e, 5), round(tr.c + (cc.max() + 1) * tr.a, 5)]
        units.append({'bb': bb, 'code': p['code'], 'name': p['name'], 'pop': round(float(pop[m].sum())), 'n': sum(1 for s in sh if s['g'] == p['name']),
                      'h': hist(m), 'dmax': round(float(dist[m].max()))})
    meta = {
        'made': datetime.date.today().isoformat(),
        'grid': {'w': W, 'h': H, 'west': tr.c, 'north': tr.f, 'dx': tr.a, 'dy': -tr.e, 'step': 20},
        'bin': 10, 'nb': NB,
        'all': {'pop': round(float(pop.sum())), 'h': hist(inside), 'dmax': round(float(d.max()))},
        'units': units,
        'source': {'shelter': 'OA-21063', 'shelterRows': len(rows), 'pop': 'WorldPop R2025A 2025 100m constrained'},
    }
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(sh, open(os.path.join(OUT, 'shelters.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for f in ('grid.bin', 'meta.json', 'shelters.json'):
        print(f, os.path.getsize(os.path.join(OUT, f)))
    print('가장 먼 칸', round(float(d.max())), 'm · 중앙값(인구 가중 아님)', round(float(np.median(d))), 'm')

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
