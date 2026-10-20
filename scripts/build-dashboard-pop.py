# 도시 · 인구 변화 실험(ai_dashboard.html) 가운데 「미래 인구 실험」 자료 만들기 → data/dashboard/pop.json
#
# 원자료: 국제연합(UN) 경제사회국 인구부 「세계 인구 전망 2024(World Population Prospects 2024)」 CSV, CC BY 3.0 IGO.
#   https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/ 아래
#     WPP2024_PopulationBySingleAgeSex_Medium_1950-2023.csv.gz · …_Medium_2024-2100.csv.gz   (7월 1일 인구, 한 살 · 성별, 천 명)
#     WPP2024_Life_Table_Complete_Medium_{Male,Female}_1950-2023.csv.gz · …_2024-2100.csv.gz (한 살 생명표)
#     WPP2024_Fertility_by_Age1.csv.gz        (한 살 연령별 출산율, Variant = Medium)
#     WPP2024_Demographic_Indicators_Medium.csv.gz (합계 출산율 · 기대 수명 · 순이동 · 출생 성비)
#   로그인 없이 받는다(받은 날 2026-10-20). 받으면서 대한민국(ISO3 KOR) 줄만 남겨 *_KOR.csv 로 둔다.
#
# 담는 것(인구는 천 명):
#   base   — 2023년 7월 1일 한 살 · 성별 인구(0~99세, 100세 이상) = 계산의 시작
#   life   — 2023년 생명표의 qx(한 해 안에 죽을 확률) · ax(그해 죽은 사람이 산 평균 햇수), 100세 이상의 Tx/lx
#   pasfr  — 2023년 15~49세 연령별 출산 몫(%) — 합계 출산율을 나이에 나눌 때 쓴다
#   mig    — 순이동의 나이 · 성별 분포. WPP 추정 인구(2016→2017 … 2019→2020)에서 「앞 해 인구 × 생존율」로
#            설명되지 않는 차이(잔차)를 네 해 평균하고, 합이 1이 되게 나눈 것(코로나19 전 네 해)
#   wpp    — 비교용 WPP 2024 중위 추계 2023~2073: 총인구 · 0~14 · 15~64 · 65세 이상, 가정한 합계 출산율 · 기대 수명 · 순이동
#   past   — 1960~2022 추정 인구(같은 네 값)
#
# 실행: python -I scripts/build-dashboard-pop.py <*_KOR.csv 가 있는 폴더>
import sys, os, json
import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')
RAW = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'dashboard', 'pop.json')
BASE, END = 2023, 2073
MIG_YEARS = [2016, 2017, 2018, 2019]


def rd(name):
    return pd.read_csv(os.path.join(RAW, name))


P = pd.concat([rd('WPP2024_PopulationBySingleAgeSex_Medium_1950-2023_KOR.csv'), rd('WPP2024_PopulationBySingleAgeSex_Medium_2024-2100_KOR.csv')])
P = P[P.Variant == 'Medium']
LT = {s: pd.concat([rd(f'WPP2024_Life_Table_Complete_Medium_{n}_1950-2023_KOR.csv'), rd(f'WPP2024_Life_Table_Complete_Medium_{n}_2024-2100_KOR.csv')])
      for s, n in (('m', 'Male'), ('f', 'Female'))}
F = rd('WPP2024_Fertility_by_Age1_KOR.csv')
F = F[F.Variant == 'Medium']
D = rd('WPP2024_Demographic_Indicators_Medium_KOR.csv')
D = D[D.Variant == 'Medium'].set_index('Time')


def pop(t, s):
    x = P[P.Time == t].sort_values('AgeGrpStart')
    v = x['PopMale' if s == 'm' else 'PopFemale'].values.astype(float)
    assert len(v) == 101
    return v


def lt(t, s):
    x = LT[s]
    x = x[(x.Time == t) & (x.Variant == 'Medium')].sort_values('AgeGrpStart')
    assert len(x) == 101
    return x


def surv(t, s):
    x = lt(t, s)
    Lx, Tx = x.Lx.values, x.Tx.values
    S = np.zeros(100)
    S[:99] = Lx[1:100] / Lx[:99]
    S[99] = Tx[100] / Tx[99]  # 99세와 100세 이상 → 100세 이상
    return S


def groups(t):
    tot = pop(t, 'm') + pop(t, 'f')
    return [round(float(tot.sum()), 3), round(float(tot[:15].sum()), 3), round(float(tot[15:65].sum()), 3), round(float(tot[65:].sum()), 3)]


# 순이동 분포 — 잔차 평균
acc = {'m': np.zeros(101), 'f': np.zeros(101)}
for t in MIG_YEARS:
    for s in 'mf':
        S = surv(t, s)
        p0, p1 = pop(t, s), pop(t + 1, s)
        exp = np.zeros(101)
        exp[1:100] = p0[:99] * S[:99]
        exp[100] = (p0[99] + p0[100]) * S[99]
        M = p1 - exp
        M[0] = 0  # 0세는 출생과 섞여 있어 뺀다
        acc[s] += M / len(MIG_YEARS)
tot = acc['m'].sum() + acc['f'].sum()
mig = {s: [round(float(v / tot), 6) for v in acc[s]] for s in 'mf'}
print('잔차 평균 순이동(천 명/년)', round(float(tot), 1), '같은 해 WPP 순이동 평균', round(float(D.loc[MIG_YEARS, 'NetMigrations'].mean()), 1))

life = {}
for s in 'mf':
    x = lt(BASE, s)
    life[s] = {'qx': [round(float(v), 8) for v in x.qx.values[:100]], 'ax': [round(float(v), 5) for v in x.ax.values[:100]],
               'open': round(float(x.Tx.values[100] / x.lx.values[100]), 5), 'e0': round(float(x.ex.values[0]), 4)}

fb = F[F.Time == BASE].sort_values('AgeGrpStart')
pasfr = [round(float(v), 4) for v in fb.PASFR.values]
assert list(fb.AgeGrpStart.values) == list(range(15, 50))

out = {
    'source': 'UN DESA Population Division, World Population Prospects 2024 (CC BY 3.0 IGO)',
    'base_year': BASE, 'end_year': END,
    'base': {s: [round(float(v), 3) for v in pop(BASE, s)] for s in 'mf'},
    'life': life,
    'pasfr': pasfr, 'pasfr_from': 15,
    'srb': float(D.loc[BASE, 'SRB']),
    'tfr': float(D.loc[BASE, 'TFR']),
    'e0': float(D.loc[BASE, 'LEx']),
    'netmig': float(D.loc[BASE, 'NetMigrations']),
    'births': float(D.loc[BASE, 'Births']),
    'mig': mig, 'mig_years': MIG_YEARS,
    'wpp': [{'y': t, 'g': groups(t), 'tfr': round(float(D.loc[t, 'TFR']), 3), 'e0': round(float(D.loc[t, 'LEx']), 2),
             'netmig': round(float(D.loc[t, 'NetMigrations']), 2), 'births': round(float(D.loc[t, 'Births']), 2)} for t in range(BASE, END + 1)],
    'past': [{'y': t, 'g': groups(t), 'tfr': round(float(D.loc[t, 'TFR']), 3)} for t in range(1960, BASE)],
}
with open(OUT, 'w', encoding='utf-8') as fp:
    json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
print('기준', BASE, '총인구', round(sum(out['base']['m']) + sum(out['base']['f']), 3), 'TFR', out['tfr'], 'e0', out['e0'], '순이동', out['netmig'],
      'SRB', out['srb'], '크기', os.path.getsize(OUT) // 1024, 'KB')
