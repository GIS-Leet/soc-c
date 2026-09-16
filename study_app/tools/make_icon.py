# Desk 앱 아이콘 — C안 톤(짙은 남색 바탕, 파란 그라데이션 D, 흰 책상선)을 4배 해상도로 정교하게 렌더
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import math, random
K=4; S=1024*K
F='/Users/leet/Library/Fonts/Pretendard-ExtraBold.ttf'

def lerp(a,b,t): return tuple(int(round(a[i]*(1-t)+b[i]*t)) for i in range(3))
def linear(size, c0, c1, angle_deg):
    """size 정사각 선형 그라데이션(각도)"""
    w=h=size; im=Image.new('RGB',(w,h)); px=im.load()
    a=math.radians(angle_deg); dx,dy=math.cos(a),math.sin(a)
    # 저해상도로 계산 후 확대(속도)
    n=256; small=Image.new('RGB',(n,n)); sp=small.load()
    for y in range(n):
        for x in range(n):
            t=((x/(n-1)-0.5)*dx+(y/(n-1)-0.5)*dy)+0.5; t=min(max(t,0),1); sp[x,y]=lerp(c0,c1,t)
    return small.resize((w,h),Image.BICUBIC)
def radial(size, center, c0, c1, radius):
    n=256; small=Image.new('RGB',(n,n)); sp=small.load(); cx,cy=center
    for y in range(n):
        for x in range(n):
            d=math.hypot(x/(n-1)-cx, y/(n-1)-cy)/radius; t=min(max(d,0),1); t=t*t*(3-2*t); sp[x,y]=lerp(c0,c1,t)
    return small.resize((size,size),Image.BICUBIC)

# ── 배경: 남색, 왼쪽 위에서 은은한 빛, 가장자리는 더 어둡게(비네트)
bg=radial(S,(0.30,0.18),(30,40,66),(9,12,22),1.15)
# 아주 미세한 그레인(고급 인쇄물 느낌) — 작은 크기에선 안 보이고 큰 아이콘에서 밋밋함을 줄임
random.seed(3); noise=Image.effect_noise((S//4,S//4),18).resize((S,S),Image.BILINEAR).convert('L')
bg=Image.composite(ImageChops.add(bg, Image.merge('RGB',(noise,noise,noise)).point(lambda v:int((v-128)*0.10))), bg, Image.new('L',(S,S),255))
# 아래쪽에서 올라오는 파란 기운(D의 빛이 바닥에 비친 느낌)
glow=Image.new('RGB',(S,S),(0,0,0)); gd=ImageDraw.Draw(glow); gd.ellipse([S*0.15,S*0.55,S*0.85,S*1.25],fill=(12,52,120)); glow=glow.filter(ImageFilter.GaussianBlur(S*0.10))
bg=ImageChops.add(bg,glow.point(lambda v:int(v*0.55)))

# ── D 글자 마스크 (시각적 중앙 보정: 살짝 위)
f=ImageFont.truetype(F, int(700*K))
tmp=ImageDraw.Draw(Image.new('L',(1,1)))
bb=tmp.textbbox((0,0),'D',font=f); tw,th=bb[2]-bb[0],bb[3]-bb[1]
dx=(S-tw)/2-bb[0]+S*0.006; dy=(S-th)/2-bb[1]-S*0.055
mask=Image.new('L',(S,S),0); ImageDraw.Draw(mask).text((dx,dy),'D',font=f,fill=255)

# 그림자: 아래로 떨어지는 부드러운 그림자(남색 톤, 두 겹)
sh1=mask.filter(ImageFilter.GaussianBlur(S*0.020)); sh2=mask.filter(ImageFilter.GaussianBlur(S*0.006))
shadow=Image.new('RGB',(S,S),(3,6,14))
bg.paste(shadow,(0,int(S*0.022)),sh1.point(lambda v:int(v*0.55)))
bg.paste(shadow,(0,int(S*0.008)),sh2.point(lambda v:int(v*0.35)))

# 글자 채우기: 파란 그라데이션(왼쪽 위 밝은 하늘색 → 오른쪽 아래 진한 파랑)
fill=linear(S,(96,176,255),(0,84,214),58)
# 위쪽 1/3에 은은한 광택(밝게), 아래는 살짝 어둡게 — 유리 같은 깊이
gloss=linear(S,(255,255,255),(0,0,0),90)
fill=ImageChops.add(fill, gloss.point(lambda v:int(v*0.14)))
bg.paste(fill,(0,0),mask)

# 가장자리 하이라이트: 마스크를 1.5px 아래로 밀어 뺀 위쪽 테두리에 밝은 선 / 아래쪽엔 어두운 선
edge_t=ImageChops.subtract(mask, ImageChops.offset(mask,0,int(S*0.0035)))   # 위 테두리
edge_b=ImageChops.subtract(mask, ImageChops.offset(mask,0,-int(S*0.0035)))  # 아래 테두리
bg.paste(Image.new('RGB',(S,S),(220,236,255)),(0,0),edge_t.filter(ImageFilter.GaussianBlur(S*0.0008)).point(lambda v:int(v*0.9)))
bg.paste(Image.new('RGB',(S,S),(0,40,110)),(0,0),edge_b.filter(ImageFilter.GaussianBlur(S*0.0015)).point(lambda v:int(v*0.35)))

# ── 책상선: D 아래 흰 선(양끝 둥글게), 살짝 파란 번짐 + 오른쪽 끝 작은 라이브 점은 넣지 않음(절제)
lw=int(S*0.038); y0=int(S*0.822); x0=int(S*0.215); x1=int(S*0.785)
line=Image.new('L',(S,S),0); ImageDraw.Draw(line).rounded_rectangle([x0,y0,x1,y0+lw],radius=lw//2,fill=255)
bg.paste(Image.new('RGB',(S,S),(120,180,255)),(0,0),line.filter(ImageFilter.GaussianBlur(S*0.012)).point(lambda v:int(v*0.5)))   # 번짐
lg=linear(S,(255,255,255),(214,228,250),0)
bg.paste(lg,(0,0),line)
bg.paste(Image.new('RGB',(S,S),(10,20,40)),(0,int(S*0.004)),ImageChops.subtract(line,ImageChops.offset(line,0,-int(S*0.004))).point(lambda v:int(v*0.5)))

out=bg.resize((1024,1024),Image.LANCZOS)
out.save('C2.png')

# iOS 18 다크(동일)·틴트(회색조+알파) 변형
out.save('C2-dark.png')
tint_mask=Image.new('L',(S,S),0)
tint_mask.paste(mask,(0,0)); tint_mask=ImageChops.add(tint_mask,line)
tint=Image.new('RGBA',(S,S),(0,0,0,0)); tint.paste(Image.new('RGB',(S,S),(255,255,255)),(0,0),tint_mask)
tint.resize((1024,1024),Image.LANCZOS).save('C2-tinted.png')

# 미리보기: iOS 마스크 + 크기별 + 어두운/밝은 배경
m=Image.new('L',(1024,1024),0); ImageDraw.Draw(m).rounded_rectangle([0,0,1023,1023],radius=229,fill=255)
def masked(im): o=Image.new('RGBA',(1024,1024),(0,0,0,0)); o.paste(im,(0,0),m); return o
prev=Image.new('RGB',(1000,520),(236,236,241)); d=ImageDraw.Draw(prev); d.rectangle([500,0,1000,520],fill=(18,18,22))
for bx in (0,500):
    for i,sz in enumerate([256,120,60]):
        ic=masked(out).resize((sz,sz),Image.LANCZOS); prev.paste(ic,(bx+30+[0,300,450][i],260-sz//2),ic)
prev.save('C2_preview.png'); print('done')
