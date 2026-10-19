# -*- coding: utf-8 -*-
"""통합사회 GIS 지도 · 「종교 · 언어 분포와 기후」 자료 만들기 → data/maps/culture/culture.json

실행(내려받은 원자료를 다루므로 -I):
  C:/Users/user/anaconda3/python.exe -I scripts/build-map-culture.py <원자료 폴더>
  원자료 폴더(저장소 밖, 운영체제 임시 폴더) 안에 아래 셋을 미리 받아 풀어 둔다.

원자료
1) CIA World Factbook — 퍼블릭 도메인(미국 정부 저작물). 나라별 「Religions」 · 「Languages」 글.
   JSON 정리본 factbook/factbook.json (https://github.com/factbook/factbook.json), 커밋 783ed27f
   (2026-01-22 「auto-update week 4」 — 이 저장소의 마지막 자료 갱신. 그 뒤 커밋은 README만 고침).
   받은 날 2026-10-20. https://github.com/factbook/factbook.json/archive/783ed27f.zip → <폴더>/factbook/factbook.json-783ed27f…/
   나라마다 조사 연도가 다르다(글 끝의 「(2021 est.)」 따위). 화면에 나라별 연도를 그대로 보인다.
2) 쾨펜-가이거 기후 구분 1991–2020, 0.1° 격자 — Beck et al. (2023) Scientific Data 10, 724. CC BY 4.0.
   https://figshare.com/articles/dataset/21789074 의 koppen_geiger_tif.zip(받은 날 2026-10-20)
   → <폴더>/koppen/1991_2020/koppen_geiger_0p1.tif , 값 1~30은 legend.txt(1 Af … 30 EF).
3) Natural Earth 1:50m Admin 0 – Countries(퍼블릭 도메인) https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip
   → <폴더>/ne/ne50/ne_50m_admin_0_countries.shp. Factbook 파일 이름(GEC 부호)과 FIPS_10 칸으로 잇는다.
   나라 이름(한국어)은 data/stats/latest.json 의 countries(세계은행 부호) → 없으면 Natural Earth NAME_KO.

처리
- 종교 글을 쉼표(괄호 밖)로 나눠 「이름 비율%」을 읽는다. 「<1%」은 0.5, 「81-90%」는 가운데 값.
- 이름을 여섯 갈래로 묶는다: 크리스트교(가톨릭 · 개신교 · 정교회 · 그 밖) · 이슬람교 · 불교 · 힌두교 · 종교 없음 · 그 밖의 종교.
  「unspecified · refused · 이름 없는 other」는 어느 갈래에도 넣지 않는다(막대에는 「기타 · 미상」).
- 다수 종교 = 갈래별 합이 가장 큰 것. 비율이 없는 나라는 글에서 하나의 종교만 분명히 적힌 경우만 그 종교로 두고(ASSUME),
  나머지는 「비율 자료 없음」.
- 언어: 「아랍어」 「에스파냐어 · 포르투갈어」를 공용어(official)로 적었거나 50% 넘게 쓰거나 맨 앞에 적은 나라.
- 기후: 0.1° 칸마다 면적(위도 코사인)으로 나라 안 기후 무리(A~E, 겨울 건조형 = Am · Aw · Cw · Dw) 비율을 센다.
  겹침 그림은 0.2° 칸으로 줄여(칸 안 절반 넘게 그 기후) 다각형으로 바꾼 뒤 Equal Earth(basemap.json 과 같은 식)로 투영 · 단순화.
"""
import sys, os, re, json, glob, html, math
import numpy as np
import rasterio
from rasterio import features
from rasterio.transform import from_origin
import geopandas as gpd
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import transform as shp_transform, unary_union

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TEMP', '/tmp'), 'mapdl')
FB = glob.glob(os.path.join(SRC, 'factbook', 'factbook.json-*'))[0]
KG = os.path.join(SRC, 'koppen', '1991_2020', 'koppen_geiger_0p1.tif')
NE = os.path.join(SRC, 'ne', 'ne50', 'ne_50m_admin_0_countries.shp')

# ── 종교 글 읽기 ──
FAM = ['chr', 'isl', 'bud', 'hin', 'none', 'oth']
BR = ['cat', 'pro', 'ort', 'xch']  # 가톨릭 · 개신교 · 정교회 · 그 밖/갈래 모름
SKIP = re.compile(r'^(unspecified|not stated|refused|no response|no answer|don\'t know/refused|believers? |believer$|not applicable|unknown|undeclared|don\'t know|other or none|other and unspecified|other/none/unspecified|other/not stated|unspecified/none|none/unspecified|other, unaffiliated|other or unaffiliated|agnostics and other|other religions? and traditional|less than)', re.I)
GENERIC_OTHER = re.compile(r'^(other|others|other religions?|other religion|non-christian|other religious|religious)\b', re.I)


def classify(name):
    """이름 → (갈래, 크리스트교 갈래). 갈래를 정할 수 없으면 (None, None)"""
    n = name.lower().strip()
    if not n or SKIP.match(n):
        return None, None
    if re.search(r'other christian|christian', n) and not re.search(r'non-christian', n):
        if re.search(r'orthodox', n): return 'chr', 'ort'
        if re.search(r'catholic', n): return 'chr', 'cat'
        if re.search(r'protestant|evangelical', n): return 'chr', 'pro'
        return 'chr', 'xch'
    if re.search(r'armenian apostolic|orthodox|coptic', n): return 'chr', 'ort'
    if re.search(r'catholic|maronite', n): return 'chr', 'cat'
    if re.search(r'protestant|lutheran|anglican|church of england|church of ireland|evangelical|pentecostal|methodist|baptist|adventist|calvinist|reformed|presbyterian|congregational|wesleyan|moravian|mennonite|nazarene|assembl(y|ies) of god|revival church|church of norway|church of sweden|ekalesia|church of melanesia|united church|uniting church|church of christ|church of god|full gospel|brethren|salvation army|charismatic|born again|celestial|kiribati protestant|free church|evangelic', n):
        return 'chr', 'pro'
    if re.search(r'jehovah|latter day|church of jesus christ|iglesia ni cristo|kimbanguist|awakening churches|salutiste|apostolic|zionist|saio/zione|african instituted|new apostolic|universal kingdom|mana\b|christian rationalism|church|christ', n):
        return 'chr', 'xch'
    if re.search(r'muslim|islam|sunni|shia|ahmadi|ibadi|alawi|bektashi', n): return 'isl', None
    if re.search(r'buddhis', n) and not re.search(r' or ', n): return 'bud', None
    if re.search(r'hindu', n): return 'hin', None
    if re.search(r'^(none|no religion|unaffiliated|non-believers?|nonbeliever|atheist|agnostic|nothing in particular|none or atheist|non-believer/agnostic|nonbeliever/agnostic|agnostic/atheist|no religion)', n):
        return 'none', None
    if GENERIC_OTHER.match(n):
        return None, None
    # 이름이 있는 그 밖의 종교(유대교 · 신토 · 민속 종교 · 도교 · 시크교 · 바하이 · 부두 · 애니미즘 따위)
    return 'oth', None


def split_top(s, seps=',;'):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '([': depth += 1
        elif ch in ')]': depth = max(0, depth - 1)
        if ch in seps and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    return [x.strip() for x in out if x.strip()]


PCT = re.compile(r'(?:(<|&lt;|less than|more than)\s*)?(\d+(?:[./]\d+)?|\.\d+)\s*(?:(?:-|–| - )\s*(\d+(?:\.\d+)?))?\s*%')


def read_pct(s):
    """괄호 밖에서 처음 나오는 비율. 없으면 None"""
    depth, flat = 0, ''
    for ch in s:
        if ch in '([': depth += 1; continue
        if ch in ')]': depth = max(0, depth - 1); continue
        if depth == 0: flat += ch
    m = PCT.search(flat)
    if not m:
        m2 = re.search(r'(\d+(?:\.\d+)?)\s*$', flat.strip())  # 「89.5」처럼 % 빠진 것
        if m2 and re.search(r'[a-z]\s+\d', flat, re.I):
            return float(m2.group(1)), m2.group(1)
        return None, None
    lo = float(m.group(2).replace('/', '.'))
    if m.group(3):
        return (lo + float(m.group(3))) / 2, f'{m.group(2)}~{m.group(3)}'
    if m.group(1) in ('<', '&lt;', 'less than'):
        return 0.5, f'<{m.group(2)}'
    return lo, m.group(2).replace('/', '.')


def name_of(item):
    n = re.split(r'\s*[\(\[]|\s*\d|\s*<|\s*&lt;|\s+less than|\s+more than', item, maxsplit=1)[0]
    return n.strip(' :-')


def parse_religion(text):
    t = html.unescape(text or '').replace('\xa0', ' ')
    t = re.sub(r'<[^>]+>', '', t)
    year = None
    m = re.search(r'\((\d{4}(?:-\d{2,4})?)\s*(?:est\.?)?\)\s*$', t.strip())
    if m:
        year = m.group(1); t = t.strip()[: m.start()].strip()
    # 두 조사가 이어 붙은 글(우루과이: 「…3.4%Roman Catholic 42% … (2023 est.)」)은 연도가 붙은 뒤쪽만 쓴다
    parts = re.split(r'%(?=[A-Z])', t)
    if len(parts) > 1:
        t = parts[-1]
    t = re.sub(r';\s*note\b.*$', '', t, flags=re.I)
    t = re.sub(r';\s*less than 1\s*(%|percent)?:.*$', '', t, flags=re.I)
    items = []
    for it in split_top(t):
        nm = name_of(it)
        v, vs = read_pct(it)
        fam, br = classify(nm)
        sub = []
        inner = re.search(r'\((.*)\)', it)
        if fam == 'chr' and br == 'xch' and inner:
            # 「Christian 80.8% (overwhelmingly Roman Catholic …)」처럼 비율 없이 주된 갈래를 적은 경우
            pm = re.match(r'\s*(?:predominantly|overwhelmingly|mostly|majority)\s+([A-Za-z ]+)', inner.group(1))
            if pm:
                _, b2 = classify(pm.group(1))
                if b2 and b2 != 'xch':
                    br = b2
        if fam == 'chr' and inner:
            for s in split_top(inner.group(1)):
                sn = name_of(s); sv, _ = read_pct(s)
                sf, sb = classify(sn)
                if sv is not None and sf == 'chr' and sb:
                    sub.append((sb, sv))
        items.append({'name': nm, 'v': v, 'vs': vs, 'fam': fam, 'br': br, 'sub': sub})
    return items, year


# 비율이 없지만 글에 한 종교만 분명히 적힌 나라(파일 이름 → 갈래, 크리스트교 갈래). 글은 출력 src 에 그대로 남긴다.
ASSUME = {
    'su': ('isl', None),   # Sudan: "Sunni Muslim, small Christian minority"
    'wi': ('isl', None),   # Western Sahara: "Muslim"
    'mv': ('isl', None),   # Maldives: "Sunni Muslim (official)"
    'sa': ('isl', None),   # Saudi Arabia: "Muslim (official; citizens are 85-90% Sunni and 10-12% Shia), other ..."
    'sm': ('chr', 'cat'),  # San Marino: "Roman Catholic"
    'vt': ('chr', 'cat'),  # Holy See: "Roman Catholic"
}


def summarize(items, gec):
    fam = {k: 0.0 for k in FAM}
    br = {k: 0.0 for k in BR}
    rest = 0.0
    have = False
    for it in items:
        if it['v'] is None:
            continue
        have = True
        if it['fam']:
            fam[it['fam']] += it['v']
            if it['fam'] == 'chr':
                if it['sub']:
                    got = 0
                    for b, v in it['sub']:
                        br[b] += v; got += v
                    br['xch'] += max(0, it['v'] - got)
                else:
                    br[it['br'] or 'xch'] += it['v']
        else:
            rest += it['v']
    if not have:
        if gec in ASSUME:
            f, b = ASSUME[gec]
            return {'fam': f, 'br': b, 'shares': None, 'branches': None, 'assumed': True}
        return {'fam': None, 'br': None, 'shares': None, 'branches': None}
    top = max(FAM, key=lambda k: fam[k])
    if fam[top] <= 0:
        return {'fam': None, 'br': None, 'shares': None, 'branches': None}
    b = None
    if top == 'chr':
        named = {k: v for k, v in br.items() if k != 'xch'}
        bk = max(named, key=named.get)
        # 갈래가 밝혀진 몫이 크리스트교의 절반을 넘을 때만 그 갈래로 본다
        b = bk if named[bk] > 0 and sum(named.values()) >= fam['chr'] * 0.5 else 'xch'
    r1 = lambda d: {k: round(v, 1) for k, v in d.items() if v > 0}
    return {'fam': top, 'br': b, 'shares': {**r1(fam), **({'rest': round(rest, 1)} if rest > 0 else {})}, 'branches': r1(br) if fam['chr'] > 0 else None}


def lang_flags(text):
    t = html.unescape(text or '').replace('\xa0', ' ')
    t = re.sub(r'<[^>]+>', '', t)
    out = set()
    for i, it in enumerate(split_top(t)):
        low = it.lower()
        nm = name_of(it).lower()
        v, _ = read_pct(it)
        strong = 'official' in low.split('(')[1] if '(' in low else False
        strong = strong or (v is not None and v >= 50) or i == 0
        if not strong:
            continue
        if re.match(r'^(standard |modern standard )?arabic', nm): out.add('ar')
        if re.match(r'^(castilian )?spanish', nm): out.add('ib')
        if re.match(r'^portuguese(?!-based)', nm): out.add('ib')
    return sorted(out)


# ── Equal Earth(basemap.json 의 world 와 같은 식) ──
A1, A2, A3, A4, M = 1.340264, -0.081106, 0.000893, 0.003796, math.sqrt(3) / 2
W = 1000
S = W / 2 / (math.pi / (M * A1))
H = math.ceil(2 * S * 1.3173627) + 2


def ee(lon, lat):
    l, p = math.radians(lon), math.radians(lat)
    th = math.asin(M * math.sin(p)); t2 = th * th; t6 = t2 * t2 * t2
    x = (l * math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return W / 2 + x * S, H / 2 - y * S


def _tx(xs, ys):
    pts = [ee(x, y) for x, y in zip(xs, ys)]
    return [p[0] for p in pts], [p[1] for p in pts]


def path_of(g, tol=0.35, min_area=0.0):
    if g.is_empty:
        return ''
    g = g.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
    d = []
    for p in polys:
        if not isinstance(p, Polygon) or p.area < min_area:
            continue
        for ring in [p.exterior, *p.interiors]:
            cs = list(ring.coords)
            if len(cs) < 4:
                continue
            out = []
            for x, y in cs[:-1]:
                q = (round(x, 1), round(y, 1))
                if not out or out[-1] != q:
                    out.append(q)
            if len(out) >= 3:
                d.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in out) + 'Z')
    return ''.join(d)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    # 1) Factbook
    fb = {}
    for f in glob.glob(os.path.join(FB, '*', '*.json')):
        reg = os.path.basename(os.path.dirname(f))
        if reg in ('meta', 'oceans', 'world'):
            continue
        gec = os.path.splitext(os.path.basename(f))[0]
        d = json.load(open(f, encoding='utf-8'))
        ps = d.get('People and Society', {})
        rel = (ps.get('Religions') or {}).get('text', '')
        L = ps.get('Languages') or {}
        lang = (L.get('Languages') or {}).get('text', '') if isinstance(L.get('Languages'), dict) else L.get('text', '')
        tld = ((d.get('Communications') or {}).get('Internet country code') or {}).get('text', '')
        items, year = parse_religion(rel)
        fb[gec] = {'gec': gec, 'rel': html.unescape(re.sub(r'<[^>]+>', '', rel)).replace('\xa0', ' ').strip(), 'items': items, 'year': year,
                   'sum': summarize(items, gec), 'lang': lang_flags(lang), 'tld': tld.strip().lower()}

    # 2) 나라 모양과 잇기
    ne = gpd.read_file(NE)
    latest = json.load(open(os.path.join(ROOT, 'data', 'stats', 'latest.json'), encoding='utf-8'))
    ko_by_iso2 = {c['iso2']: c['ko'] for c in latest['countries'] if c.get('iso2')}
    by_tld = {v['tld'].lstrip('.'): k for k, v in fb.items() if v['tld'].startswith('.')}
    NAME_FIX = {'TW': '타이완'}
    countries, unmatched = [], []
    for _, r in ne.iterrows():
        fips = (r['FIPS_10'] or '').lower()
        iso2 = r['ISO_A2_EH'] if r['ISO_A2_EH'] not in (None, '-99') else r['ISO_A2']
        gec = fips if fips in fb else by_tld.get((iso2 or '').lower(), by_tld.get('uk') if iso2 == 'GB' else None)
        if iso2 == 'FR': gec = 'fr'
        if iso2 == 'PS': gec = 'we'  # 서안 지구(we)와 가자 지구(gz) 가운데 넓은 쪽
        if r['ADM0_A3'] == 'SOL': gec = 'so'  # 소말릴란드 — Factbook은 소말리아 안에 넣어 센다
        if r['ADM0_A3'] == 'ALD': gec = 'fi'  # 올란드 — 핀란드
        geom = r.geometry
        name = NAME_FIX.get(iso2) or ko_by_iso2.get(iso2) or r['NAME_KO'] or r['NAME']
        rec = {'id': r['ADM0_A3'], 'iso2': iso2, 'name': name, 'geom': geom}
        if gec and gec in fb:
            rec['fb'] = fb[gec]
        else:
            unmatched.append((r['ADM0_A3'], r['NAME']))
        countries.append(rec)
    print('짝 없는 Natural Earth 단위:', unmatched)

    # 3) 쾨펜 — 나라별 비율, 겹침 다각형
    with rasterio.open(KG) as src:
        kg = src.read(1)
        tr = src.transform
    rows = np.arange(kg.shape[0])
    lat_c = 90 - (rows + 0.5) * 0.1
    wgt = np.cos(np.radians(lat_c))[:, None] * np.ones((1, kg.shape[1]))
    groups = {
        'A': (kg >= 1) & (kg <= 3), 'B': (kg >= 4) & (kg <= 7), 'C': (kg >= 8) & (kg <= 16),
        'D': (kg >= 17) & (kg <= 28), 'E': (kg >= 29) & (kg <= 30),
        'M': np.isin(kg, [2, 3, 11, 12, 13, 21, 22, 23, 24]),  # 겨울이 건조한 기후: Am · Aw · Cwa/Cwb/Cwc · Dwa~Dwd
    }
    land = kg > 0
    shapes_ = [(c['geom'], i + 1) for i, c in enumerate(countries)]
    idx = features.rasterize(shapes_, out_shape=kg.shape, transform=tr, fill=0, dtype='int32')
    for i, c in enumerate(countries):
        m = (idx == i + 1) & land
        tot = float((wgt * m).sum())
        c['clim'] = None if tot <= 0 else {k: round(100 * float((wgt * (m & g)).sum()) / tot, 1) for k, g in groups.items()}
    climate = {}
    for k, g in groups.items():
        # 0.2° 칸으로 줄이기(네 칸 가운데 셋 이상) → 다각형
        h2, w2 = g.shape[0] // 2, g.shape[1] // 2
        g2 = g[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2).sum(axis=(1, 3)) >= 3
        t2 = from_origin(-180, 90, 0.2, 0.2)
        polys = [shape(s) for s, v in features.shapes(g2.astype('uint8'), mask=g2, transform=t2) if v == 1]
        u = unary_union(polys)
        u = shp_transform(_tx, u)
        climate[k] = path_of(u, tol=0.6, min_area=1.2)

    # 4) 나라 경로
    out = []
    for c in countries:
        g = shp_transform(_tx, c['geom'])
        d = path_of(g, tol=0.3, min_area=0.0)
        if not d:
            continue
        lx, ly = ee(*(float(c['geom'].representative_point().x), float(c['geom'].representative_point().y)))
        rec = {'id': c['id'], 'name': c['name'], 'd': d, 'x': round(lx, 1), 'y': round(ly, 1), 'clim': c['clim']}
        f = c.get('fb')
        if f:
            s = f['sum']
            rec.update({'fam': s['fam'], 'br': s['br'], 'shares': s['shares'], 'branches': s['branches'], 'year': f['year'], 'lang': f['lang'], 'src': f['rel']})
            if s.get('assumed'):
                rec['assumed'] = True
        out.append(rec)

    meta = {
        'religion': 'CIA World Factbook(퍼블릭 도메인) — factbook/factbook.json 커밋 783ed27f(2026-01-22 자료 갱신), 받은 날 2026-10-20',
        'koppen': 'Beck et al. (2023) 쾨펜-가이거 기후 구분 1991–2020, 0.1° 격자, CC BY 4.0 — figshare 21789074, 받은 날 2026-10-20',
        'shapes': 'Natural Earth 1:50m Admin 0 – Countries(퍼블릭 도메인)',
        'names': '나라 이름: data/stats/latest.json(세계은행 부호), 없으면 Natural Earth NAME_KO',
        'built': '2026-10-20',
    }
    os.makedirs(os.path.join(ROOT, 'data', 'maps', 'culture'), exist_ok=True)
    res = {'meta': meta, 'w': W, 'h': H, 'countries': out, 'climate': climate}
    p = os.path.join(ROOT, 'data', 'maps', 'culture', 'culture.json')
    with open(p, 'w', encoding='utf-8') as fh:
        json.dump(res, fh, ensure_ascii=False, separators=(',', ':'))
    print('→', p, round(os.path.getsize(p) / 1024), 'KB', '나라', len(out), {k: round(len(v) / 1024) for k, v in climate.items()})


if __name__ == '__main__':
    main()
