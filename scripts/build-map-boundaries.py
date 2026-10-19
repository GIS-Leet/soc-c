# -*- coding: utf-8 -*-
"""통합사회 GIS 지도 · 「동아시아 바다의 경계」 자료 만들기 → data/maps/boundaries/boundaries.json

실행(내려받은 원자료를 다루므로 -I):
  C:/Users/user/anaconda3/python.exe -I scripts/build-map-boundaries.py <원자료 폴더>

원자료(받은 날 2026-10-20, 로그인 없음)
1) Marine Regions — VLIZ Maritime Boundaries Geodatabase, CC BY 4.0. https://www.marineregions.org
   WFS https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json&bbox=100,-2,152,52&typeName=…
     MarineRegions:eez            배타적 경제 수역 v12(2023)  → <폴더>/marine/full_eez.json
     MarineRegions:eez_12nm       영해 v4(2023)              → <폴더>/marine/full_eez_12nm.json
     MarineRegions:eez_boundaries 해양 경계선 v12(2023)       → <폴더>/marine/full_eez_boundaries.json
   지명 사전(gazetteer) 좌표: 독도 MRGID 48935(37.241667°N 131.866667°E), 이어도 MRGID 33988(32.116667°N 125.166667°E).
   이 자료에 한일 중간 수역 · 한중 잠정 조치 수역은 없다(gazetteer 검색 「Provisional」 「Intermediate」 「Joint Fishing」 결과 없음) → 그리지 않는다.
2) Natural Earth 1:10m Admin 0 – Countries(퍼블릭 도메인) → <폴더>/ne/ne10/ne_10m_admin_0_countries.shp
   육지 바탕, 남북 경계(군사 분계선 부근, 남한 · 북한 다각형이 맞닿는 선), 해안 사이 거리, 200해리 겹침 계산.

처리
- 도법: 람베르트 정각 원추(표준 위선 25° · 45°, 중심 30°N 125°E, 구 반지름 6371 km). 좌표 단위 = km. 화면(assets/map-boundaries.mjs)의 역산 식과 같아야 한다.
- 원자료가 독도 둘레 12해리 원을 별도 다각형(48955)으로 나눠 둔 것은 대한민국 영해 · 배타적 경제 수역에 합쳐 칠한다(대한민국 영토).
- 남북 사이 바다의 VLIZ 계산 중간선은 선으로 그리지 않는다(합의된 경계가 아님). 북방 한계선은 좌표를 공개 자료로 확인하지 못해 그리지 않는다.
- 겹침(계산): 나라(한반도는 남북을 하나로)마다 Natural Earth 해안선에서 200해리(370.4 km) 버퍼를 나라 가운데에 맞춘 정거 방위 도법으로 그린 뒤,
  둘 이상의 버퍼가 겹치는 바다를 구한다. 실제 EEZ는 기선(직선 기선 포함)에서 재므로 근삿값이다.
- 거리: 두 육지 사이 가장 가까운 두 점(정거 방위 도법에서 찾고 대권 거리로 다시 잼).
"""
import sys, os, json, math
import numpy as np
import geopandas as gpd
from shapely.geometry import shape, Point, LineString, Polygon, MultiPolygon, box, mapping
from shapely.ops import unary_union, transform as shp_transform, nearest_points
from pyproj import Transformer, CRS

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TEMP', '/tmp'), 'mapdl')
NM = 1.852
R = 6371.0088

LCC = '+proj=lcc +lat_1=25 +lat_2=45 +lat_0=30 +lon_0=125 +R=6371000 +units=m +no_defs'
to_lcc = Transformer.from_crs('EPSG:4326', CRS.from_proj4(LCC), always_xy=True)


def P(lon, lat):
    x, y = to_lcc.transform(lon, lat)
    return x / 1000, -y / 1000  # km, 화면은 아래로 +


def proj_geom(g):
    def f(xs, ys, zs=None):
        X, Y = to_lcc.transform(np.asarray(xs), np.asarray(ys))
        return X / 1000, -Y / 1000
    return shp_transform(f, g)


# 보이는 틀(동아시아 전체) — 위경도로 넉넉히 자른 뒤 투영해서 다시 사각형으로 자른다
LONLAT_CLIP = box(98, -4, 156, 54)
VIEWS = {}


def view_rect(lon0, lat0, lon1, lat1, pad=0):
    pts = [P(lo, la) for lo in np.linspace(lon0, lon1, 9) for la in (lat0, lat1)] + [P(lo, la) for la in np.linspace(lat0, lat1, 9) for lo in (lon0, lon1)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return [round(min(xs) - pad), round(min(ys) - pad), round(max(xs) - min(xs) + 2 * pad), round(max(ys) - min(ys) + 2 * pad)]


def path_of(g, tol=1.2, min_area=0.0, close=True):
    if g is None or g.is_empty:
        return ''
    g = g.simplify(tol, preserve_topology=True)
    out = []
    geoms = [g] if not hasattr(g, 'geoms') else list(g.geoms)
    for p in geoms:
        if isinstance(p, Polygon):
            if p.area < min_area:
                continue
            rings = [p.exterior, *p.interiors]
            for ring in rings:
                pts = _pts(ring.coords)
                if len(pts) >= 3:
                    out.append('M' + 'L'.join(pts) + 'Z')
        elif isinstance(p, LineString):
            pts = _pts(p.coords)
            if len(pts) >= 2:
                out.append('M' + 'L'.join(pts))
        elif hasattr(p, 'geoms'):
            out.append(path_of(p, tol=0, min_area=min_area))
    return ''.join(out)


def _pts(coords):
    res, last = [], None
    for x, y in coords:
        q = (round(x, 1), round(y, 1))
        if q != last:
            res.append(f'{q[0]:g},{q[1]:g}')
            last = q
    return res


def soft(g, r=1.2):
    """바다 쪽 면은 육지 아래에 깔리므로, 조금 부풀려 해안 쪽 들쭉날쭉함을 덮은 뒤 단순화한다(단위 km)"""
    return g.buffer(r, join_style=2)


def hav(a, b):
    (lo1, la1), (lo2, la2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = p2 - p1, math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def aeqd(lon, lat):
    crs = CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +R=6371008.8 +units=m +no_defs')
    return Transformer.from_crs('EPSG:4326', crs, always_xy=True), Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)


def tx(g, t):
    return shp_transform(lambda xs, ys, zs=None: t.transform(np.asarray(xs), np.asarray(ys)), g)


def nearest_pair(ga, gb):
    """두 위경도 도형 사이 가장 가까운 두 점 → (a(lon,lat), b(lon,lat), km)"""
    c = unary_union([ga, gb]).centroid
    fw, bw = aeqd(c.x, c.y)
    pa, pb = nearest_points(tx(ga, fw), tx(gb, fw))
    a = bw.transform(pa.x, pa.y)
    b = bw.transform(pb.x, pb.y)
    return [round(a[0], 4), round(a[1], 4)], [round(b[0], 4), round(b[1], 4)], round(hav(a, b), 1)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    M = os.path.join(SRC, 'marine')
    feats = lambda n: json.load(open(os.path.join(M, n), encoding='utf-8'))['features']
    ne = gpd.read_file(os.path.join(SRC, 'ne', 'ne10', 'ne_10m_admin_0_countries.shp'))

    VIEWS['ea'] = view_rect(103, 2, 150, 50)
    VIEWS['kr'] = view_rect(119, 30.5, 135, 43, pad=20)
    vx, vy, vw, vh = VIEWS['ea']
    CLIP = box(vx - 200, vy - 200, vx + vw + 200, vy + vh + 200)
    clip = lambda g: proj_geom(g.intersection(LONLAT_CLIP)).intersection(CLIP)

    SOV = {  # 원자료 sovereign1 → (부호, 한국어)
        'South Korea': ('KR', '대한민국'), 'North Korea': ('KP', '북한'), 'China': ('CN', '중국'), 'Japan': ('JP', '일본'),
        'Russia': ('RU', '러시아'), 'Taiwan': ('TW', '타이완'), 'Philippines': ('PH', '필리핀'), 'Vietnam': ('VN', '베트남'),
        'Malaysia': ('MY', '말레이시아'), 'Brunei': ('BN', '브루나이'), 'Indonesia': ('ID', '인도네시아'),
        'Palau': ('PW', '팔라우'), 'United States': ('US', '미국'), 'Thailand': ('TH', '타이'), 'Cambodia': ('KH', '캄보디아'),
        'Singapore': ('SG', '싱가포르'), 'Micronesia': ('FM', '미크로네시아'), 'Papua New Guinea': ('PG', '파푸아뉴기니'),
    }
    DOKDO_MRGID = 48955
    # ── 배타적 경제 수역 ──
    eez, special = [], []
    dokdo_circle = None
    kr_parts = []
    for f in feats('full_eez.json'):
        p = f['properties']
        g = shape(f['geometry'])
        if not g.intersects(LONLAT_CLIP):
            continue
        if p['mrgid'] == DOKDO_MRGID:
            dokdo_circle = g
            continue
        if p['pol_type'] == '200NM':
            code, ko = SOV.get(p['sovereign1'], (None, p['sovereign1']))
            if code == 'KR':
                kr_parts.append((p, g))
                continue
            d = path_of(soft(clip(g)), tol=2.5, min_area=6)
            if d:
                eez.append({'id': p['mrgid'], 'c': code, 'ko': ko, 'area': p['area_km2'], 'd': d})
        else:
            sovs = [p.get(k) for k in ('sovereign1', 'sovereign2', 'sovereign3') if p.get(k)]
            kind = 'joint' if p['pol_type'] == 'Joint regime' else 'claim'
            d = path_of(clip(g), tol=1.5, min_area=1)
            if d:
                special.append({'id': p['mrgid'], 'kind': kind, 'who': [SOV.get(s, (None, s))[1] for s in sovs], 'name': p['geoname'], 'area': p['area_km2'], 'd': d})
    # 대한민국 = 원자료의 대한민국 EEZ + 독도 둘레 원
    (kp, kg), = kr_parts
    kr_all = unary_union([kg, dokdo_circle])
    eez.insert(0, {'id': kp['mrgid'], 'c': 'KR', 'ko': '대한민국', 'area': kp['area_km2'] + 1624, 'd': path_of(soft(clip(kr_all)), tol=1.5, min_area=1)})

    # ── 영해 12해리 ──
    t12 = []
    for f in feats('full_eez_12nm.json'):
        p = f['properties']
        g = shape(f['geometry'])
        code, ko = SOV.get(p['sovereign1'], (None, p['sovereign1']))
        if code == 'KR':
            g = unary_union([g, dokdo_circle])
        gg = clip(g)
        d = path_of(soft(gg, 0.4), tol=1.0, min_area=1.5)
        if d:
            t12.append({'c': code, 'ko': ko, 'area': p['area_km2'] + (1624 if code == 'KR' else 0), 'd': d})

    # ── 경계선 ──
    TYPE = {'Treaty': 'treaty', 'Median line': 'median', 'Connection line': 'median', 'Unsettled median line': 'unsettled',
            'Unsettled median line (land)': 'unsettled', 'Unsettled': 'unsettled', 'Unsettled (land)': 'unsettled',
            '200 NM': 'limit', 'Joint regime': 'joint', 'Straight baseline': 'baseline', 'Archipelagic baseline': 'baseline'}
    lines = []
    for f in feats('full_eez_boundaries.json'):
        p = f['properties']
        t = TYPE.get(p['line_type'])
        if not t:
            continue
        a, b = p.get('sovereign1'), p.get('sovereign2')
        if {a, b} == {'South Korea', 'North Korea'}:
            continue  # 남북 사이 계산 중간선 — 그리지 않음
        g = shape(f['geometry'])
        if not g.intersects(LONLAT_CLIP):
            continue
        d = path_of(clip(g), tol=0.8, close=False)
        if not d:
            continue
        lines.append({'t': t, 'a': SOV.get(a, (None, a or ''))[1], 'b': SOV.get(b, (None, b or ''))[1] if b else '',
                      'len': round(p['length_km'] or 0), 'src': (p.get('source1') or '')[:160], 'date': p.get('doc_date'), 'd': d})

    # ── 육지 · 남북 경계 ──
    land = unary_union([g for g in ne.geometry if g.intersects(LONLAT_CLIP)])
    land_d = path_of(clip(land), tol=1.1, min_area=1.0)
    kor = ne[ne.ADM0_A3 == 'KOR'].geometry.iloc[0]
    prk = ne[ne.ADM0_A3 == 'PRK'].geometry.iloc[0]
    mdl = kor.boundary.intersection(prk.boundary)
    mdl_d = path_of(proj_geom(mdl), tol=0.3, close=False)

    # ── 200해리 겹침(계산) ──
    UNITS = {'KR': ['KOR', 'PRK'], 'CN': ['CHN', 'HKG', 'MAC'], 'JP': ['JPN'], 'RU': ['RUS'], 'TW': ['TWN'], 'PH': ['PHL'],
             'VN': ['VNM'], 'MY': ['MYS'], 'BN': ['BRN'], 'ID': ['IDN']}
    UNIT_KO = {'KR': '한반도', 'CN': '중국', 'JP': '일본', 'RU': '러시아', 'TW': '타이완', 'PH': '필리핀', 'VN': '베트남', 'MY': '말레이시아', 'BN': '브루나이', 'ID': '인도네시아'}
    REACH = box(95, -12, 165, 62)
    buf = {}
    for u, a3s in UNITS.items():
        g = unary_union([ne[ne.ADM0_A3 == a].geometry.iloc[0] for a in a3s]).intersection(REACH)
        c = g.centroid
        fw, bw = aeqd(c.x, c.y)
        b = tx(g, fw).simplify(2000).buffer(370400, resolution=24)
        buf[u] = tx(b, bw)
    land_ll = unary_union([g for g in ne.geometry if g.intersects(REACH)])
    pairs, ov = [], []
    keys = list(buf)
    laea = Transformer.from_crs('EPSG:4326', CRS.from_proj4('+proj=laea +lat_0=25 +lon_0=125 +R=6371008.8 +units=m'), always_xy=True)
    area_km2 = lambda g: tx(g, laea).area / 1e6
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            x = buf[a].intersection(buf[b]).difference(land_ll)
            if x.is_empty or x.area < 1e-4:
                continue
            ov.append(x)
            pairs.append({'a': UNIT_KO[a], 'b': UNIT_KO[b], 'area': round(area_km2(x), -2)})
    overlap = unary_union(ov)
    overlap_d = path_of(clip(overlap), tol=3, min_area=20)
    # 대한민국(남한) 해안 200해리 가운데 이웃 나라(중국 · 일본 · 러시아)의 200해리와 겹치는 몫
    c = kor.centroid
    fw, bw = aeqd(c.x, c.y)
    kr200 = tx(tx(kor, fw).simplify(2000).buffer(370400, resolution=24), bw)
    kr_sea = kr200.difference(land_ll)
    others = unary_union([buf['CN'], buf['JP'], buf['RU']])
    kr_ov = kr_sea.intersection(others)
    stat = {'kr200': round(area_km2(kr_sea), -2), 'krOverlap': round(area_km2(kr_ov), -2),
            'krEEZ': eez[0]['area'], 'krT12': next(t['area'] for t in t12 if t['c'] == 'KR')}
    kr200_d = path_of(clip(kr200.exterior if isinstance(kr200, Polygon) else kr200.boundary), tol=1.0, close=False)

    # ── 거리 재기 미리 셈 ──
    jpn = ne[ne.ADM0_A3 == 'JPN'].geometry.iloc[0]
    chn = ne[ne.ADM0_A3 == 'CHN'].geometry.iloc[0]
    def part_near(mp, lon, lat):
        pt = Point(lon, lat)
        return min(mp.geoms, key=lambda g: g.distance(pt))
    DOKDO = (131.866667, 37.241667)
    IEODO = (125.166667, 32.116667)
    dokdo_poly = part_near(kor, *DOKDO)
    ulleung = part_near(kor, 130.87, 37.50)
    jeju = part_near(kor, 126.55, 33.38)
    # 독도에서 가장 가까운 일본 땅
    jp_near_dokdo = min(jpn.geoms, key=lambda g: g.distance(Point(*DOKDO)))
    kr_main = unary_union([g for g in kor.geoms])
    presets = []
    def add(id_, label, ga, gb, note):
        a, b, km = nearest_pair(ga, gb)
        presets.append({'id': id_, 'label': label, 'a': a, 'b': b, 'km': km, 'note': note})
    add('krjp', '대한민국 ↔ 일본', kr_main, jpn, '두 나라 땅 사이 가장 가까운 곳')
    add('krcn', '대한민국 ↔ 중국', kr_main, chn, '황해를 사이에 둔 가장 가까운 곳')
    add('dokdo', '울릉도 ↔ 독도', ulleung, dokdo_poly, '')
    add('dokjp', '독도 ↔ 가장 가까운 일본 땅', dokdo_poly, jp_near_dokdo, '')
    ie = Point(*IEODO)
    for id_, label, g in (('ieokr', '이어도 ↔ 대한민국 땅', kr_main), ('ieocn', '이어도 ↔ 중국 땅', chn), ('ieojp', '이어도 ↔ 일본 땅', jpn)):
        a, b, km = nearest_pair(ie.buffer(1e-6), g)
        presets.append({'id': id_, 'label': label, 'a': [IEODO[0], IEODO[1]], 'b': b, 'km': km, 'note': ''})
    jp_name = None

    out = {
        'meta': {
            'marine': 'Marine Regions(VLIZ) — 배타적 경제 수역 v12(2023) · 영해 v4(2023) · 해양 경계선 v12(2023), CC BY 4.0, 받은 날 2026-10-20',
            'land': 'Natural Earth 1:10m Admin 0 – Countries(퍼블릭 도메인)',
            'places': 'Marine Regions 지명 사전 — 독도 MRGID 48935, 이어도 MRGID 33988',
            'built': '2026-10-20',
        },
        'proj': {'lat1': 25, 'lat2': 45, 'lat0': 30, 'lon0': 125, 'R': 6371.0},
        'views': VIEWS,
        'land': land_d, 'mdl': mdl_d,
        'eez': eez, 'special': special, 't12': t12, 'lines': lines,
        'overlap': {'d': overlap_d, 'pairs': sorted(pairs, key=lambda p: -p['area'])}, 'kr200': kr200_d,
        'stat': stat, 'presets': presets,
        'places': [
            {'id': 'dokdo', 'name': '독도', 'lon': DOKDO[0], 'lat': DOKDO[1]},
            {'id': 'ieodo', 'name': '이어도', 'lon': IEODO[0], 'lat': IEODO[1]},
        ],
    }
    os.makedirs(os.path.join(ROOT, 'data', 'maps', 'boundaries'), exist_ok=True)
    p = os.path.join(ROOT, 'data', 'maps', 'boundaries', 'boundaries.json')
    with open(p, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print('→', p, round(os.path.getsize(p) / 1024), 'KB')
    print('views', VIEWS)
    print('eez', [(e['ko'], len(e['d']) // 1000) for e in eez])
    print('special', [(s['name'], s['area']) for s in special])
    print('t12', [(t['ko'], len(t['d']) // 1000) for t in t12])
    print('lines', len(lines), sum(len(l['d']) for l in lines) // 1000, 'KB')
    print('land', len(land_d) // 1000, 'overlap', len(overlap_d) // 1000, 'mdl', len(mdl_d))
    print('stat', stat)
    print('pairs', pairs)
    for pr in presets:
        print(pr)


if __name__ == '__main__':
    main()
