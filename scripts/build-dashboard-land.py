# 도시 · 인구 변화 실험(ai_dashboard.html) 가운데 「도시화와 녹지」 자료 만들기
#   → data/dashboard/land.json, data/dashboard/land-<id>.png
#
# 원자료(모두 로그인 · 인증키 없이 받는다. 받은 날 2026-10-20):
#   1) ESA WorldCover 10m 2021 v200 — 토지 피복 11가지, 10m 칸. CC BY 4.0
#      https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N36E126_Map.tif
#      (N33E126 · N33E129 도). 출처 표기: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021)
#      processed by ESA WorldCover consortium.
#   2) GHSL GHS-BUILT-S R2023A — 칸(3초 ≈ 90m)마다 건물이 덮은 넓이(m²), 1975~2020 5년 간격. CC BY 4.0
#      https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_S_GLOBE_R2023A/GHS_BUILT_S_E{해}_GLOBE_R2023A_4326_3ss/V1-0/tiles/
#      GHS_BUILT_S_E{해}_GLOBE_R2023A_4326_3ss_V1_0_R6_C31.zip  (2025 · 2030 판은 예측값이라 쓰지 않는다)
#      Pesaresi M., Politis P. (2023): GHS-BUILT-S R2023A. European Commission, Joint Research Centre.
#   3) Landsat 8 · 9 Collection 2 Level-2 지표면 온도(ST_B10)와 QA_PIXEL — 미국 지질조사국(USGS), 저작권 없음(public domain).
#      Microsoft Planetary Computer STAC(https://planetarycomputer.microsoft.com/api/stac/v1)에서 찾고,
#      익명 SAS 토큰(…/api/sas/v1/token/landsat-c2-l2, 로그인 없음)으로 필요한 창만 읽는다.
#   4) 경계: southkorea-maps kostat 2018(옛 통계청 2018 경계) skorea-provinces-2018-geo.json · skorea-municipalities-2018-geo.json
#      https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/
#
# 처리:
#   · 도시 경계 안 칸만 센다. 칸 넓이는 위도에 따라 cos(위도)로 맞춘다(R = 6,371,008.8m).
#   · 토지 피복 비율: WorldCover 11가지를 여섯 무리로 묶는다(시가지 50 · 나무 10 · 농경지 40 · 풀과 덤불 20 30 90 95 100 · 물 80 · 맨땅 60 70).
#   · 건물 넓이: GHS-BUILT-S 값(m²)을 경계 안에서 더한다. 지도에는 칸의 건물 비율이 처음 BUILT_T 이상이 된 해를 담는다.
#   · 지표면 온도: 6월~9월 중순 장면 가운데 경계 안 구름 없는 칸이 가장 많은 장면 하나. K = DN × 0.00341802 + 149.0.
#     QA_PIXEL 0~4비트(채움 · 구름 가장자리 · 권운 · 구름 · 구름 그림자)가 하나라도 켜진 칸은 뺀다.
#     ST_B10 값이 0인 칸(USGS가 지표면 온도를 내지 못한 칸 — 화성 · 광주는 경계의 17~18%)도 뺀다. valid = 값이 있는 몫.
#     토지 피복 무리별 평균은 WorldCover를 Landsat 30m 칸으로 옮겨(가장 많은 값) 낸다.
#   · 지도 그림: 웹 메르카토르(EPSG:3857) 약 PX_M m 칸의 RGB PNG 하나에 세 겹을 담는다.
#       R = 토지 피복 무리(1~6, 0 = 경계 밖) · G = 건물 비율이 처음 BUILT_T 이상이 된 해의 차례(1 = 1975 … 10 = 2020, 0 = 2020까지 못 미침)
#       B = 지표면 온도 1 + round((°C − tmin) × 4) (0 = 구름 · 자료 없음). 화면(assets/dashboard-land.mjs)이 풀어 칠한다.
#
# 실행: python -I scripts/build-dashboard-land.py <원자료 폴더> [--preview <폴더>]
#   원자료 폴더: wc/WC_2021_N36E126.tif …, ghs/GHS_BUILT_S_E1975_R6_C31.zip …, skorea-*-2018-geo.json
import sys, os, json, math, glob, zipfile, urllib.request, datetime
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.features import rasterize
from rasterio.warp import transform_geom
from rasterio.windows import from_bounds
from rasterio.transform import from_origin
import geopandas as gpd
from shapely.geometry import box, shape, mapping
from shapely.ops import transform as shp_transform
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
RAW = sys.argv[1]
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'dashboard')
R = 6371008.8
PX_M = 55            # 지도 그림 한 칸(땅 위 거리, m)
BUILT_T = 0.15       # 칸 넓이 가운데 건물이 덮은 몫이 이 값 이상이면 「건물이 들어선 칸」
EPOCHS = [1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020]
GROUPS = [('built', '시가지', [50]), ('tree', '나무', [10]), ('crop', '농경지', [40]),
          ('grass', '풀 · 덤불', [20, 30, 90, 95, 100]), ('water', '물', [80]), ('bare', '맨땅', [60, 70])]
# id, 이름, 경계 종류, 코드, 잘라 낼 사각형(없으면 None)
CITIES = [
    ('seoul', '서울특별시', 'prov', '11', None),
    ('hwaseong', '화성시', 'mun', '31240', None),
    ('sejong', '세종특별자치시', 'prov', '29', None),
    ('gwangju', '광주', 'prov', '24', None),
    ('busan', '부산광역시', 'prov', '21', None),
    ('jeju', '제주시', 'mun', '39010', (126.0, 33.1, 127.0, 33.62)),  # 제주섬 부분만(추자도 빼고)
]
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
TOKEN_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2'
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
os.environ.setdefault('GDAL_HTTP_MAX_RETRY', '4')


def row_area(tr, rows):
    """칸 넓이(km²) — 줄마다"""
    lat = tr.f + tr.e * (np.arange(rows) + 0.5)
    return (R * math.radians(abs(tr.e))) * (R * math.radians(tr.a)) * np.cos(np.radians(lat)) / 1e6


def city_geom(kind, code, clip):
    f = os.path.join(RAW, 'skorea-provinces-2018-geo.json' if kind == 'prov' else 'skorea-municipalities-2018-geo.json')
    g = gpd.read_file(f)
    geom = g[g.code == code].geometry.unary_union
    if clip:
        geom = geom.intersection(box(*clip))
    return geom


def sample(src, src_tr, src_crs, dst_tr, dst_crs, shape_, k=1, how='nearest', nodata=0):
    """dst 칸마다 k×k 점을 찍어 src 에서 가장 가까운 칸 값을 읽고 모은다(how: nearest · mode · mean).
    rasterio.warp.reproject 가 nodata 와 섞이면 덩어리째 비우는 일이 있어 직접 셈한다."""
    from pyproj import Transformer
    H, W = shape_
    off = (np.arange(k) + 0.5) / k
    tf = Transformer.from_crs(dst_crs, src_crs, always_xy=True)
    inv_src = ~src_tr
    vals = []
    for oy in off:
        for ox in off:
            cols, rows = np.meshgrid(np.arange(W) + ox, np.arange(H) + oy)
            x, y = dst_tr * (cols, rows)
            sx, sy = tf.transform(x, y)
            c, r = inv_src * (sx, sy)
            c, r = np.floor(c).astype(np.int64), np.floor(r).astype(np.int64)
            ok = (r >= 0) & (r < src.shape[0]) & (c >= 0) & (c < src.shape[1])
            v = np.full((H, W), nodata, dtype=src.dtype)
            v[ok] = src[r[ok], c[ok]]
            vals.append(v)
    if how == 'nearest' or k == 1:
        return vals[0] if k == 1 else vals[len(vals) // 2]
    st = np.stack(vals)
    if how == 'mean':
        with np.errstate(all='ignore'):
            return np.nanmean(st, axis=0).astype(np.float32)
    classes = np.unique(st)
    classes = classes[classes != nodata]
    best = np.full((H, W), nodata, dtype=src.dtype)
    bestn = np.zeros((H, W), np.int32)
    for cl in classes:
        n = (st == cl).sum(axis=0)
        upd = n > bestn
        best[upd] = cl
        bestn[upd] = n[upd]
    return best


# ── 1) WorldCover ──
def worldcover(geom):
    w, s, e, n = geom.bounds
    tiles = sorted({(int(math.floor(la / 3) * 3), int(math.floor(lo / 3) * 3)) for la in (s, n) for lo in (w, e)})
    srcs = [rasterio.open(os.path.join(RAW, 'wc', f'WC_2021_N{la:02d}E{lo:03d}.tif')) for la, lo in tiles]
    arr, tr = merge(srcs, bounds=(w, s, e, n), nodata=0)
    for x in srcs:
        x.close()
    a = arr[0]
    grp = np.zeros(a.shape, np.uint8)
    for i, (_, _, codes) in enumerate(GROUPS, 1):
        grp[np.isin(a, codes)] = i
    mask = rasterize([(mapping(geom), 1)], out_shape=a.shape, transform=tr, fill=0, dtype='uint8').astype(bool)
    grp[~mask] = 0
    ra = row_area(tr, a.shape[0])
    total = float((mask.sum(axis=1) * ra).sum())
    share = {}
    for i, (gid, _, _) in enumerate(GROUPS, 1):
        share[gid] = float(((grp == i).sum(axis=1) * ra).sum()) / total
    return grp, tr, total, share


# ── 2) GHSL ──
def ghsl(geom):
    w, s, e, n = geom.bounds
    first = None
    rows = []
    tr0 = None
    for k, y in enumerate(EPOCHS, 1):
        z = os.path.join(RAW, 'ghs', f'GHS_BUILT_S_E{y}_R6_C31.zip')
        name = [m for m in zipfile.ZipFile(z).namelist() if m.endswith('.tif')][0]
        with rasterio.open(f'zip://{z}!{name}') as d:
            win = from_bounds(w, s, e, n, d.transform).round_offsets().round_lengths()
            v = d.read(1, window=win).astype(np.float64)
            tr = d.window_transform(win)
        if first is None:
            mask = rasterize([(mapping(geom), 1)], out_shape=v.shape, transform=tr, fill=0, dtype='uint8').astype(bool)
            ra = row_area(tr, v.shape[0])
            cell = np.repeat(ra[:, None], v.shape[1], axis=1) * 1e6  # m²
            first = np.zeros(v.shape, np.uint8)
            land = float((mask.sum(axis=1) * ra).sum())
            tr0 = tr
        v[v >= 65535] = 0
        km2 = float(v[mask].sum()) / 1e6
        frac = v / cell
        first[(first == 0) & (frac >= BUILT_T) & mask] = k
        rows.append({'y': y, 'km2': round(km2, 2), 'share': round(km2 / land, 4)})
    return first, tr0, rows, land


# ── 3) Landsat 지표면 온도 ──
_token = None


def token():
    global _token
    if _token is None:
        _token = json.load(urllib.request.urlopen(TOKEN_URL, timeout=60))['token']
    return _token


def stac_items(geom):
    body = {'collections': ['landsat-c2-l2'], 'intersects': mapping(geom.envelope), 'datetime': '2021-06-01/2025-09-15',
            'query': {'eo:cloud_cover': {'lt': 20}, 'platform': {'in': ['landsat-8', 'landsat-9']}}, 'limit': 200}
    req = urllib.request.Request(STAC, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    d = json.load(urllib.request.urlopen(req, timeout=120))
    out = []
    for f in d['features']:
        dt = f['properties']['datetime'][:10]
        mo, dd = int(dt[5:7]), int(dt[8:10])
        if not (6 <= mo <= 8 or (mo == 9 and dd <= 15)):
            continue
        if not shape(f['geometry']).buffer(-0.02).contains(geom.envelope):
            continue
        out.append(f)
    out.sort(key=lambda f: f['properties']['eo:cloud_cover'])
    return out


def read_band(item, band, geom_utm, crs):
    href = item['assets'][band]['href'] + '?' + token()
    with rasterio.open(href) as d:
        w, s, e, n = geom_utm.bounds
        win = from_bounds(w - 60, s - 60, e + 60, n + 60, d.transform).round_offsets().round_lengths()
        return d.read(1, window=win), d.window_transform(win), d.crs


def landsat(geom, grp, grp_tr):
    best = None
    for f in stac_items(geom)[:14]:
        crs = f'EPSG:{f["properties"]["proj:epsg"]}'
        g_utm = shape(transform_geom('EPSG:4326', crs, mapping(geom)))
        qa, tr, _ = read_band(f, 'qa_pixel', g_utm, crs)
        mask = rasterize([(mapping(g_utm), 1)], out_shape=qa.shape, transform=tr, fill=0, dtype='uint8').astype(bool)
        clear = mask & ((qa & 0b11111) == 0)
        frac = clear.sum() / mask.sum()
        print('    ', f['id'], f['properties']['eo:cloud_cover'], round(float(frac), 4))
        key = (round(float(frac), 3), f['properties']['datetime'])
        if best is None or key > best[0]:
            best = (key, f, crs, g_utm, qa, tr, mask, clear)
        if frac >= 0.995:
            break
    _, f, crs, g_utm, qa, tr, mask, clear = best
    st, tr2, _ = read_band(f, 'lwir11', g_utm, crs)
    assert tr2 == tr and st.shape == qa.shape
    t = st.astype(np.float32) * 0.00341802 + 149.0 - 273.15
    t[(st == 0) | ~clear] = np.nan
    # WorldCover 무리를 Landsat 칸으로(가장 많은 값)
    g30 = sample(grp, grp_tr, 'EPSG:4326', tr, crs, st.shape, k=3, how='mode')
    by = {}
    for i, (gid, _, _) in enumerate(GROUPS, 1):
        v = t[(g30 == i) & clear]
        v = v[np.isfinite(v)]
        by[gid] = {'mean': round(float(v.mean()), 2), 'n': int(v.size)} if v.size >= 200 else None
    allv = t[np.isfinite(t)]
    p = f['properties']
    info = {'scene': f['id'], 'date': p['datetime'][:10], 'time_utc': p['datetime'][11:16], 'platform': p['platform'],
            'clear': round(float(clear.sum() / mask.sum()), 4), 'valid': round(float((np.isfinite(t) & mask).sum() / mask.sum()), 4), 'median': round(float(np.median(allv)), 2),
            'p5': round(float(np.percentile(allv, 5)), 2), 'p95': round(float(np.percentile(allv, 95)), 2), 'by': by}
    return t, tr, crs, info


# ── 4) 지도 그림 ──
def merc(lon, lat):
    return lon * math.pi / 180 * 6378137, math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * 6378137


def inv(x, y):
    return [round(math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2), 6), round(math.degrees(x / 6378137), 6)]


def outline(geom):
    """지도에 그을 경계선 — 단순화한 바깥 고리들([위도, 경도])"""
    g = geom.simplify(0.0012, preserve_topology=True)
    polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    return [[[round(y, 4), round(x, 4)] for x, y in p.exterior.coords] for p in polys if p.area > 2e-6]


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {'built_t': BUILT_T, 'epochs': EPOCHS, 'groups': [{'id': g, 'name': n} for g, n, _ in GROUPS], 'cities': []}
    for cid, name, kind, code, clip in CITIES:
        print(cid, name, flush=True)
        geom = city_geom(kind, code, clip)
        grp, gtr, area, share = worldcover(geom)
        print('  피복', round(area, 1), {k: round(v * 100, 1) for k, v in share.items()}, flush=True)
        first, ftr, rows, land = ghsl(geom)
        print('  건물', [(r['y'], r['km2']) for r in rows], flush=True)
        lst, ltr, lcrs, linfo = landsat(geom, grp, gtr)
        print('  온도', linfo['date'], linfo['clear'], {k: (v and v['mean']) for k, v in linfo['by'].items()}, flush=True)
        # 3857 칸
        w, s, e, n = geom.bounds
        latc = (s + n) / 2
        res = PX_M / math.cos(math.radians(latc))
        x0, y0 = merc(w, s)
        x1, y1 = merc(e, n)
        W, H = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
        dtr = from_origin(x0, y0 + H * res, res, res)
        g3857 = shape(transform_geom('EPSG:4326', 'EPSG:3857', mapping(geom)))
        m = rasterize([(mapping(g3857), 1)], out_shape=(H, W), transform=dtr, fill=0, dtype='uint8').astype(bool)
        R_ = sample(grp, gtr, 'EPSG:4326', dtr, 'EPSG:3857', (H, W), k=5, how='mode')
        G_ = sample(first, ftr, 'EPSG:4326', dtr, 'EPSG:3857', (H, W))
        T_ = sample(lst, ltr, lcrs, dtr, 'EPSG:3857', (H, W), k=2, how='mean', nodata=np.nan)
        print('  경계 안 빈 칸 — 피복', int((m & (R_ == 0)).sum()), '온도', int((m & ~np.isfinite(T_)).sum()), '/', int(m.sum()), flush=True)
        tmin = math.floor(linfo['p5'] - 4)
        B_ = np.where(np.isfinite(T_), np.clip(np.round((T_ - tmin) * 4) + 1, 1, 255), 0).astype(np.uint8)
        for a in (R_, G_, B_):
            a[~m] = 0
        R_[m & (R_ == 0)] = 6  # 경계 안인데 피복 값이 빈 칸(드묾)은 맨땅으로
        img = f'land-{cid}.png'
        Image.fromarray(np.dstack([R_, G_, B_]), 'RGB').save(os.path.join(OUT, img), optimize=True)
        sw, ne = inv(x0, y0), inv(x0 + W * res, y0 + H * res)
        linfo['tmin'] = tmin
        out['cities'].append({
            'id': cid, 'name': name, 'area': round(area, 1),
            'cover': {k: round(v, 4) for k, v in share.items()},
            'built': rows, 'lst': linfo,
            'img': f'data/dashboard/{img}', 'px': [W, H], 'bounds': [sw, ne],
            'center': [round((s + n) / 2, 4), round((w + e) / 2, 4)],
            'outline': outline(geom),
        })
        print('  그림', W, H, os.path.getsize(os.path.join(OUT, img)) // 1024, 'KB', flush=True)
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            pal = np.array([[0, 0, 0], [217, 89, 38], [0, 131, 0], [201, 133, 0], [25, 158, 112], [57, 135, 229], [150, 150, 150]], np.uint8)
            Image.fromarray(pal[R_]).save(os.path.join(PREVIEW, f'{cid}-cover.png'))
            Image.fromarray((G_ * 25).astype(np.uint8)).save(os.path.join(PREVIEW, f'{cid}-built.png'))
            Image.fromarray(B_).save(os.path.join(PREVIEW, f'{cid}-lst.png'))
    out['made'] = datetime.date.today().isoformat()
    with open(os.path.join(OUT, 'land.json'), 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))


main()
