# 바닷물이 1m 오르면(map-sealevel) 자료 만들기.
#
# 원자료: Copernicus DEM GLO-30 Public (30m, 1초 격자), AWS 공개 버킷 — 로그인 없이 받는다.
#   https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N37_00_E126_00_DEM/Copernicus_DSM_COG_10_N37_00_E126_00_DEM.tif
#   …/AUXFILES/Copernicus_DSM_COG_10_N37_00_E126_00_WBM.tif  (물 가림: 0 땅 · 1 바다 · 2 호수 · 3 강)
#   타일이 없는 곳은 바다(높이 0)다(버킷 readme.html).
# 땅 가림: OpenStreetMap 육지 다각형(osmdata.openstreetmap.de, land-polygons-split-4326.zip, 2026-10-19판), ODbL
#   © OpenStreetMap contributors. 해안선(만조선) 바깥의 갯벌은 DEM 에서 땅처럼 잡히므로, 넓이는 OSM 육지 안의 칸만 센다.
#   받은 뒤 한반도 둘레만 잘라 둔다: gpd.read_file("zip://land-polygons-split-4326.zip!land-polygons-split-4326/land_polygons.shp",
#   bbox=(124, 33, 132, 39.5)).to_file("kr_land.gpkg")
#   라이선스: 각 타일 INFO/eula_F.pdf — "produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and
#   (c) Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"
#   "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use
#   of the Copernicus WorldDEM-30". 받은 날: 2026-10-20.
#
# 처리:
#   1) 곳마다 사각형(+여백 0.12도)을 타일에서 이어 붙여 읽는다. 높이 기준은 EGM2008 지오이드.
#   2) 해수면이 h(0.5 · 1 · 2 · 3 · 5m) 오를 때 — 높이 <= h 인 칸과 바다 칸(WBM=1)을 모아 4방향으로 이어진 덩어리를 찾고,
#      여백까지 넣은 사각형 테두리에 닿은 바다(열린 바다)와 이어진 덩어리만 「바다와 이어져 잠기는 칸」으로 본다(연결성 flood fill).
#      높이는 h 아래인데 이어지지 않은 땅은 따로 「낮지만 떨어진 칸」으로 센다.
#   3) 넓이는 땅 칸(WBM=0 이고 OSM 육지 안)만 센다. 물은 갯벌 · 강을 따라서도 퍼지게 둔다. 칸 넓이 = (R * 1초)^2 * cos(위도), R = 6,371,008.8m.
#   4) 칸마다 f(처음 잠기는 단계 1~5, 0 = 5m까지 안 잠김) · d(처음 h 아래가 되는 단계)를 회색 값 v = 40f + 6d 로 담아
#      웹 메르카토르(EPSG:3857)로 옮긴(가장 가까운 칸) PNG 로 쓴다. 화면(assets/map-sealevel.mjs)이 이 값을 풀어 칠한다.
#
# 실행: python -I scripts/build-map-sealevel.py <원자료 폴더> <kr_land.gpkg> [--preview <폴더>]
import sys, os, json, math, urllib.request
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.transform import array_bounds
from scipy import ndimage
from PIL import Image
import geopandas as gpd
from rasterio.features import rasterize
from shapely.geometry import box

sys.stdout.reconfigure(encoding='utf-8')
RAW = sys.argv[1]
LAND = sys.argv[2]
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'maps', 'sealevel')
LEVELS = [0.5, 1, 2, 3, 5]
MARGIN = 0.12
R = 6371008.8

# 곳: id, 이름, 사각형(서, 남, 동, 북) — 큰 강 하구와 간척지가 있는 낮은 해안
SITES = [
    ('hangang', '한강 하구', '김포 · 강화 · 인천', (126.33, 37.50, 126.86, 37.82)),
    ('asan', '아산만', '평택 · 당진 · 아산', (126.62, 36.84, 127.06, 37.10)),
    ('saemangeum', '새만금', '군산 · 김제 · 부안', (126.42, 35.66, 127.00, 36.08)),
    ('mokpo', '영산강 하구', '목포 · 무안 · 영암', (126.25, 34.68, 126.72, 34.98)),
    ('suncheon', '순천만 · 광양만', '순천 · 여수 · 광양', (127.38, 34.72, 127.85, 35.02)),
    ('busan', '낙동강 하구', '부산 · 김해', (128.78, 35.02, 129.08, 35.30)),
]


def tile_name(lat, lon):
    return f'N{lat:02d}_00_E{lon:03d}_00'


def fetch(t):
    base = f'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{t}_DEM'
    for kind, url in (('dem', f'{base}/Copernicus_DSM_COG_10_{t}_DEM.tif'), ('wbm', f'{base}/AUXFILES/Copernicus_DSM_COG_10_{t}_WBM.tif')):
        p = os.path.join(RAW, f'{kind}_{t}.tif')
        if os.path.exists(p):
            continue
        try:
            urllib.request.urlretrieve(url, p)
        except Exception as e:  # 타일 없음 = 바다
            print('  타일 없음(바다로 둠):', t, e)
            return False
    return True


def read_window(b):
    w, s, e, n = b[0] - MARGIN, b[1] - MARGIN, b[2] + MARGIN, b[3] + MARGIN
    tiles = [tile_name(la, lo) for la in range(math.floor(s), math.floor(n) + 1) for lo in range(math.floor(w), math.floor(e) + 1)]
    tiles = [t for t in tiles if fetch(t)]
    out = {}
    for kind, nod, fill in (('dem', -9999.0, 0.0), ('wbm', 255, 1)):
        srcs = [rasterio.open(os.path.join(RAW, f'{kind}_{t}.tif')) for t in tiles]
        arr, tr = merge(srcs, bounds=(w, s, e, n), nodata=nod)
        for x in srcs:
            x.close()
        a = arr[0]
        a[a == nod] = fill
        out[kind] = (a, tr)
    return out['dem'][0].astype(np.float32), out['wbm'][0].astype(np.uint8), out['dem'][1]


def osm_land(shape, tr, b):
    g = gpd.read_file(LAND, bbox=(b[0] - MARGIN, b[1] - MARGIN, b[2] + MARGIN, b[3] + MARGIN))
    return rasterize(((geom, 1) for geom in g.geometry), out_shape=shape, transform=tr, fill=0, dtype='uint8').astype(bool)


def flood(dem, wbm):
    sea = wbm == 1
    # 열린 바다: 바다 칸 가운데 테두리에 닿은 덩어리
    lab, _ = ndimage.label(sea)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    open_sea = np.isin(lab, edge[edge > 0])
    f = np.zeros(dem.shape, np.uint8)
    d = np.zeros(dem.shape, np.uint8)
    for k, h in enumerate(LEVELS, 1):
        wet = (dem <= h) | sea
        lab, _ = ndimage.label(wet)  # 4방향
        ids = np.unique(lab[open_sea])
        conn = np.isin(lab, ids[ids > 0])
        f[(f == 0) & conn & (wbm == 0)] = k
        d[(d == 0) & (dem <= h) & (wbm == 0)] = k
    return f, d, open_sea


def cell_area(tr, rows, cols):
    lat = tr.f + tr.e * (np.arange(rows) + 0.5)
    a = (R * math.radians(abs(tr.e))) * (R * math.radians(tr.a)) * np.cos(np.radians(lat))
    return np.repeat(a[:, None], cols, axis=1) / 1e6  # km2


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {'levels': LEVELS, 'sites': []}
    for sid, name, towns, b in SITES:
        print(sid, name)
        dem, wbm, tr = read_window(b)
        osm = osm_land(dem.shape, tr, b)
        wbm = wbm.copy()
        wbm[(wbm == 0) & ~osm] = 9  # 갯벌 등 — 물은 지나가되 땅으로 세지 않는다
        f, d, open_sea = flood(dem, wbm)
        # 여백을 잘라 낸다
        r0 = int(round((tr.f - b[3]) / -tr.e)); r1 = int(round((tr.f - b[1]) / -tr.e))
        c0 = int(round((b[0] - tr.c) / tr.a)); c1 = int(round((b[2] - tr.c) / tr.a))
        sl = (slice(r0, r1), slice(c0, c1))
        dem, wbm, f, d, open_sea = dem[sl], wbm[sl], f[sl], d[sl], open_sea[sl]
        tr2 = rasterio.Affine(tr.a, 0, tr.c + c0 * tr.a, 0, tr.e, tr.f + r0 * tr.e)
        area = cell_area(tr2, *dem.shape)
        land = wbm == 0
        rows = []
        for k, h in enumerate(LEVELS, 1):
            fl = land & (f > 0) & (f <= k)
            lo = land & (d > 0) & (d <= k) & ~fl
            # joined: 앞 단계까지 낮았지만 떨어져 있다가 이 단계에서 바다와 이어진 땅
            jo = land & (f == k) & (d > 0) & (d < k)
            rows.append({'h': h, 'flood': round(float(area[fl].sum()), 2), 'cut': round(float(area[lo].sum()), 2), 'joined': round(float(area[jo].sum()), 2)})
        land_km2 = float(area[land].sum())
        info = {'id': sid, 'name': name, 'towns': towns, 'bbox': list(b), 'land': round(land_km2, 1), 'rows': rows}
        # 3857 로 옮겨 PNG
        v = (f.astype(np.uint16) * 40 + d.astype(np.uint16) * 6).astype(np.uint8)
        H, W = v.shape
        bw, bs, be, bn = array_bounds(H, W, tr2)
        dt, dw, dh = calculate_default_transform('EPSG:4326', 'EPSG:3857', W, H, bw, bs, be, bn)
        dst = np.zeros((dh, dw), np.uint8)
        reproject(v, dst, src_transform=tr2, src_crs='EPSG:4326', dst_transform=dt, dst_crs='EPSG:3857', resampling=Resampling.nearest)
        x0, y1 = dt.c, dt.f
        x1, y0 = dt.c + dt.a * dw, dt.f + dt.e * dh

        def inv(x, y):
            return [round(math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2), 6), round(math.degrees(x / 6378137), 6)]
        info['img'] = f'data/maps/sealevel/{sid}.png'
        info['bounds'] = [inv(x0, y0), inv(x1, y1)]
        info['px'] = [dw, dh]
        Image.fromarray(dst, 'L').save(os.path.join(OUT, f'{sid}.png'), optimize=True)
        meta['sites'].append(info)
        print('  ', dh, dw, 'land', round(land_km2, 1), [(r['h'], r['flood'], r['cut'], r['joined']) for r in rows])
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            g = np.clip(dem / 60, 0, 1)
            rgb = np.stack([g * 180 + 30] * 3, -1).astype(np.uint8)
            rgb[wbm == 1] = (10, 20, 40)
            rgb[(wbm == 2) | (wbm == 3)] = (20, 40, 70)
            rgb[wbm == 9] = (90, 60, 90)
            cols = [(183, 211, 246), (109, 167, 236), (57, 135, 229), (42, 95, 158), (34, 65, 106)]
            for k in range(5, 0, -1):
                rgb[f == k] = cols[k - 1]
            rgb[(d > 0) & (f == 0) & land & (d <= 3)] = (200, 100, 60)
            rgb[open_sea] = (0, 0, 0)
            Image.fromarray(rgb).save(os.path.join(PREVIEW, f'{sid}.png'))
    meta['dem_note'] = 'TanDEM-X 2011~2015 관측으로 만든 DSM'
    meta['source'] = 'Copernicus DEM GLO-30 Public (AWS copernicus-dem-30m), 2026-10-20'
    with open(os.path.join(OUT, 'sites.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False, separators=(',', ':'))


main()
