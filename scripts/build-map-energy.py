# 햇빛과 바람의 지도(map-energy) 자료 만들기 — 우리나라를 2km(웹 메르카토르 기준) 격자로 묶어 PNG 세 장에 담는다.
#
# 원자료(모두 로그인 없이 받음, 받은 날 2026-10-20 — OSM 육지 다각형만 2026-10-19판):
#   햇빛  Global Solar Atlas 2.0 — 연평균 수평면 전일사량(GHI, kWh/m2/년, 2007~2018 평균, 9초 격자)
#         https://api.globalsolaratlas.info/download/Republic%20of%20Korea/Republic-of-Korea_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip
#         Solar resource data (c) 2019 Solargis, World Bank Group(ESMAP) — CC BY 4.0
#   바람  Global Wind Atlas 4.0 — 지상 100m 연평균 풍속(m/s, 250m 격자, 바다 포함)
#         https://globalwindatlas.info/api/gis/country/KOR/wind-speed/100
#         DTU(덴마크 공과대학교) · World Bank Group, 자료 Vortex, ESMAP 지원 — CC BY 4.0
#   높이  Copernicus DEM GLO-90 (90m) — https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_N37_00_E127_00_DEM/…
#         produced using Copernicus WorldDEM-90 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018
#         provided under COPERNICUS by the European Union and ESA; all rights reserved. 경사는 이 자료에서 계산.
#   인구  WorldPop 2020 인구 밀도(1km, UN 보정) — https://data.worldpop.org/GIS/Population_Density/Global_2000_2020_1km_UNadj/2020/KOR/kor_pd_2020_1km_UNadj.tif
#         CC BY 4.0 (WorldPop, University of Southampton)
#   국립공원  OpenStreetMap boundary=national_park 가운데 이름에 「국립공원」이 든 관계 23개(Overpass API) — ODbL (c) OpenStreetMap contributors
#   육지  OpenStreetMap 육지 다각형(osmdata.openstreetmap.de, 2026-10-19판) — ODbL. 이웃 나라 땅은 Natural Earth 10m 나라 경계(공공 영역)로 가려 뺀다.
#
# 처리:
#   격자: EPSG:3857, 칸 2,000m(실제 땅 위로는 위도에 따라 약 1.6km), 동경 124~132도 · 북위 32.8~38.8도.
#   칸마다 GHI · 풍속 · 높이 · 경사 · 인구 밀도는 원자료를 평균(average)해 옮기고, 경사는 90m 칸에서 먼저 구한 뒤 평균한다.
#   국립공원은 200m 칸으로 그린 뒤 평균해 칸 안 비율로 둔다.
#   kind: 1 = 우리나라 땅(OSM 육지 가운데 Natural Earth 의 북한 · 일본 · 중국 경계 +3km 밖), 2 = 가장 가까운 땅이 우리나라인 바다(해안에서 80km 안), 0 = 그 밖.
#   dist: 바다 칸은 해안(우리나라 땅 칸)까지, 땅 칸은 바다까지 거리(km, 칸 중심 기준).
#   PNG 세 장(RGB, 값 255 = 자료 없음):
#     a.png  R = GHI: 1000 + 2.5*v      G = 풍속: 0.05*v       B = 경사(도): 0.25*v
#     b.png  R = 높이(m): 8*v             G = 인구 밀도(명/km2): 10^(v/50) - 1   B = 국립공원 비율: v/200
#     c.png  R = kind                     G = dist(km, 땅 · 바다 모두)  B = 0
#
# 실행: python -I scripts/build-map-energy.py <원자료 폴더> <OSM kr_land.gpkg>
import sys, os, json, math, zipfile, glob
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy import ndimage
from PIL import Image
import geopandas as gpd
from shapely.geometry import LineString, shape
from shapely.ops import linemerge, polygonize, unary_union

sys.stdout.reconfigure(encoding='utf-8')
RAW, LAND = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'maps', 'energy')
CELL = 2000.0
W_LON, E_LON, S_LAT, N_LAT = 124.0, 132.0, 32.8, 38.8
RE = 6378137.0
mx = lambda lon: math.radians(lon) * RE
my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * RE
X0, X1, Y0, Y1 = mx(W_LON), mx(E_LON), my(S_LAT), my(N_LAT)
NC, NR = int(math.ceil((X1 - X0) / CELL)), int(math.ceil((Y1 - Y0) / CELL))
TR = from_origin(X0, Y1, CELL, CELL)
X1, Y0 = X0 + NC * CELL, Y1 - NR * CELL
inv_lat = lambda y: math.degrees(2 * math.atan(math.exp(y / RE)) - math.pi / 2)
ROW_LAT = np.array([inv_lat(Y1 - (r + 0.5) * CELL) for r in range(NR)])
COS = np.cos(np.radians(ROW_LAT))
print('grid', NC, NR)


def warp(path, resampling=Resampling.average, band=1, src_nodata=None):
    with rasterio.open(path) as r:
        a = r.read(band).astype(np.float32)
        nod = r.nodata if src_nodata is None else src_nodata
        if nod is not None and not (isinstance(nod, float) and math.isnan(nod)):
            a[a == nod] = np.nan
        a[a < -1e30] = np.nan
        dst = np.full((NR, NC), np.nan, np.float32)
        reproject(a, dst, src_transform=r.transform, src_crs=r.crs, src_nodata=np.nan, dst_transform=TR, dst_crs='EPSG:3857', dst_nodata=np.nan, resampling=resampling)
    return dst


def main():
    os.makedirs(OUT, exist_ok=True)
    # 햇빛
    with zipfile.ZipFile(os.path.join(RAW, 'gsa.zip')) as z:
        z.extractall(os.path.join(RAW, 'gsa'))
    ghi_p = glob.glob(os.path.join(RAW, 'gsa', '*', 'GHI.tif'))[0]
    ghi = warp(ghi_p)
    ghi[ghi <= 0] = np.nan
    # 바람
    ws = warp(os.path.join(RAW, 'gwa_ws100.tif'))
    ws[ws <= 0] = np.nan
    # 인구
    pop = warp(os.path.join(RAW, 'kor_pd_2020_1km_UNadj.tif'))
    # 높이 · 경사(90m 칸마다)
    elev = np.full((NR, NC), np.nan, np.float32)
    slope = np.full((NR, NC), np.nan, np.float32)
    for p in sorted(glob.glob(os.path.join(RAW, 'dem90', 'dem_*.tif'))):
        with rasterio.open(p) as r:
            z = r.read(1).astype(np.float32)
            t = r.transform
            lat = t.f + t.e * (np.arange(z.shape[0]) + 0.5)
            dy = abs(t.e) * 111320.0
            dx = t.a * 111320.0 * np.cos(np.radians(lat))[:, None]
            gy, gx = np.gradient(z)
            s = np.degrees(np.arctan(np.hypot(gx / dx, gy / dy))).astype(np.float32)
            for src, dst in ((z, elev), (s, slope)):
                tmp = np.full((NR, NC), np.nan, np.float32)
                reproject(src, tmp, src_transform=t, src_crs=r.crs, dst_transform=TR, dst_crs='EPSG:3857', dst_nodata=np.nan, resampling=Resampling.average)
                m = np.isfinite(tmp) & ~np.isfinite(dst)
                dst[m] = tmp[m]
    # 육지 · 대한민국
    land_g = gpd.read_file(LAND, bbox=(W_LON, S_LAT, E_LON, N_LAT)).to_crs(3857)
    land = rasterize(((g, 1) for g in land_g.geometry), out_shape=(NR, NC), transform=TR, fill=0, dtype='uint8').astype(bool)
    ne = gpd.read_file('zip://' + os.path.join(RAW, 'ne_10m_admin_0_countries.zip') + '!ne_10m_admin_0_countries.shp')
    # 이 범위 안의 다른 나라 땅(북한 · 일본 · 중국)을 Natural Earth 경계(+3km)로 빼고 남는 땅을 우리나라 땅으로 본다.
    # (Natural Earth 10m 에 없는 작은 섬도 우리나라 쪽에 남기기 위해)
    oth = ne[ne.ADM0_A3.isin(['PRK', 'JPN', 'CHN'])].to_crs(3857).buffer(3000)
    othm = rasterize(((g, 1) for g in oth.geometry if not g.is_empty), out_shape=(NR, NC), transform=TR, fill=0, dtype='uint8').astype(bool)
    kor = ne[ne.ADM0_A3 == 'KOR'].to_crs(3857).buffer(60000)  # 대한민국 경계에서 60km 넘게 떨어진 땅(규슈 둘레의 작은 섬 등)은 뺀다
    korm = rasterize(((g, 1) for g in kor.geometry), out_shape=(NR, NC), transform=TR, fill=0, dtype='uint8').astype(bool)
    kland = land & ~othm & korm
    # 바다: 가장 가까운 땅 칸이 우리나라 땅인 곳
    dist_px, (ir, ic) = ndimage.distance_transform_edt(~land, return_indices=True)
    near_kor = kland[ir, ic]
    dist_km = dist_px * CELL / 1000.0 * COS[:, None]
    ksea = (~land) & near_kor & (dist_km <= 80)
    kind = np.zeros((NR, NC), np.uint8)
    kind[kland] = 1
    kind[ksea] = 2
    # 국립공원(200m 칸으로 그려 평균)
    els = json.load(open(os.path.join(RAW, 'np_geom.json'), encoding='utf-8'))['elements']
    polys, names = [], []
    for e in els:
        lines_o, lines_i = [], []
        for m in e.get('members', []):
            if m['type'] != 'way' or 'geometry' not in m:
                continue
            ln = LineString([(q['lon'], q['lat']) for q in m['geometry']])
            (lines_i if m.get('role') == 'inner' else lines_o).append(ln)
        outer = unary_union(list(polygonize(linemerge(lines_o)))) if lines_o else None
        if outer is None or outer.is_empty:
            continue
        if lines_i:
            inner = unary_union(list(polygonize(linemerge(lines_i))))
            outer = outer.difference(inner)
        polys.append(outer)
        names.append(e['tags'].get('name'))
    npg = gpd.GeoSeries(polys, crs=4326).to_crs(3857)
    F = 10
    fine = rasterize(((g, 1) for g in npg), out_shape=(NR * F, NC * F), transform=from_origin(X0, Y1, CELL / F, CELL / F), fill=0, dtype='uint8')
    npf = fine.reshape(NR, F, NC, F).mean(axis=(1, 3))
    print('국립공원', len(polys), names)

    def enc(a, off, sc, mask):
        v = np.full(a.shape, 255, np.uint8)
        ok = np.isfinite(a) & mask
        v[ok] = np.clip(np.round((a[ok] - off) / sc), 0, 254).astype(np.uint8)
        return v
    on = kind > 0
    A = np.dstack([enc(ghi, 1000, 2.5, kind == 1), enc(ws, 0, 0.05, on), enc(slope, 0, 0.25, kind == 1)])
    popv = np.where(np.isfinite(pop), np.log10(np.maximum(pop, 0) + 1) * 50, np.nan)
    B = np.dstack([enc(elev, 0, 8, kind == 1), enc(popv, 0, 1, kind == 1), enc(npf * 200, 0, 1, on)])
    # 땅 칸은 바다(땅이 아닌 칸)까지 거리
    inland_km = ndimage.distance_transform_edt(land) * CELL / 1000.0 * COS[:, None]
    dd = np.where(kind == 2, dist_km, np.where(kind == 1, inland_km, 0))
    C = np.dstack([kind, np.clip(np.round(dd), 0, 254).astype(np.uint8), np.zeros((NR, NC), np.uint8)])
    for nm, arr in (('a', A), ('b', B), ('c', C)):
        Image.fromarray(arr.astype(np.uint8), 'RGB').save(os.path.join(OUT, f'{nm}.png'), optimize=True)
    area = (CELL / 1000.0 * COS) ** 2  # km2, 행마다
    meta = {
        'w': NC, 'h': NR,
        'bounds': [[round(inv_lat(Y0), 6), W_LON], [round(inv_lat(Y1), 6), round(math.degrees(X1 / RE), 6)]],
        'rowArea': [round(float(a), 4) for a in area],
        'enc': {'ghi': [1000, 2.5], 'ws': [0, 0.05], 'slope': [0, 0.25], 'elev': [0, 8], 'pop': 'log', 'np': 200},
        'parks': len(polys),
        'stats': {
            'land_km2': round(float((kland * area[:, None]).sum())),
            'ghi': [round(float(np.nanpercentile(ghi[kland], q)), 1) for q in (0, 5, 50, 95, 100)],
            'ws_land': [round(float(np.nanpercentile(ws[kland], q)), 2) for q in (0, 5, 50, 95, 100)],
            'ws_sea': [round(float(np.nanpercentile(ws[ksea], q)), 2) for q in (0, 5, 50, 95, 100)],
        },
    }
    with open(os.path.join(OUT, 'grid.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(meta['stats'], ensure_ascii=False))


main()
