// 기후 그래프 페이지(climate.html)의 관측 자료를 만든다 → data/climate/stations.json
// 실행: node scripts/build-climate-data.mjs   (인터넷 필요. 내려받은 원본은 운영체제 임시 폴더에 캐시)
//
// 원자료
//  1) WMO 기후 평년값 1991–2020 — 각국 기상청이 WMO에 제출한 공식 값. NOAA NCEI가 보관(accession 0253808).
//     우리나라 관측소는 기상청이 제출한 값이라 기상청 평년값과 같다(서울 연평균 12.8℃, 연강수량 1,417.9mm).
//  2) Meteostat 평년값 1991–2020 — 1)에 없는 나라(케냐, 베트남, 북한 등)만. 평균 기온은 (평균 최고+평균 최저)/2.
// 값을 고치지 않는다. 빠진 달이 있으면 그 관측소는 싣지 않고 이유를 출력한다.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(tmpdir(), 'geo-climate-cache');
mkdirSync(CACHE, { recursive: true });
const NOAA = 'https://www.ncei.noaa.gov/data/oceans/archive/arc0216/0253808/1.1/data/0-data/';
const REGION = { 1: 'Region-1-WMO-Normals-9120/', 2: 'Region-2-WMO-Normals-9120/', 3: 'Region-3-WMO-Normals-9120/', 4: 'Region-4-WMO-Normals-9120/', 5: 'Region-5-WMO-Normals-9120/', 6: 'Region-6-WMO-Normals-9120/' };

// [이름, 나라, 대륙, 원자료] — 원자료: 'w:지역번호/나라폴더/파일' 또는 'm:Meteostat 관측소 번호'
// 대륙: as 아시아 · eu 유럽 · af 아프리카 · na 북아메리카 · sa 남아메리카 · oc 오세아니아 · an 남극 · kr 우리나라
const CITIES = [
  // ── 우리나라 (기상청 → WMO) ──
  ['서울', '대한민국', 'kr', 'w:2/Korea/CSV/Seoul_47108.csv'],
  ['인천', '대한민국', 'kr', 'w:2/Korea/CSV/Incheon_47112.csv'],
  ['수원', '대한민국', 'kr', 'w:2/Korea/CSV/Suwon_47119.csv'],
  ['백령도', '대한민국', 'kr', 'w:2/Korea/CSV/Baengnyeongdo_47102.csv'],
  ['철원', '대한민국', 'kr', 'w:2/Korea/CSV/Cheorwon_47095.csv'],
  ['춘천', '대한민국', 'kr', 'w:2/Korea/CSV/Chuncheon_47101.csv'],
  ['홍천', '대한민국', 'kr', 'w:2/Korea/CSV/Hongcheon_47212.csv'],
  ['대관령', '대한민국', 'kr', 'w:2/Korea/CSV/Daegwallyeong_47100.csv'],
  ['태백', '대한민국', 'kr', 'w:2/Korea/CSV/Taebaek_47216.csv'],
  ['속초', '대한민국', 'kr', 'w:2/Korea/CSV/Sokcho_47090.csv'],
  ['강릉', '대한민국', 'kr', 'w:2/Korea/CSV/Gangneung_47105.csv'],
  ['울진', '대한민국', 'kr', 'w:2/Korea/CSV/Uljin_47130.csv'],
  ['울릉도', '대한민국', 'kr', 'w:2/Korea/CSV/Ulleungdo_47115.csv'],
  ['서산', '대한민국', 'kr', 'w:2/Korea/CSV/Seosan_47129.csv'],
  ['청주', '대한민국', 'kr', 'w:2/Korea/CSV/Cheongju_47131.csv'],
  ['대전', '대한민국', 'kr', 'w:2/Korea/CSV/Daejeon_47133.csv'],
  ['추풍령', '대한민국', 'kr', 'w:2/Korea/CSV/Chupungnyeong_47135.csv'],
  ['안동', '대한민국', 'kr', 'w:2/Korea/CSV/Andong_47136.csv'],
  ['대구', '대한민국', 'kr', 'w:2/Korea/CSV/Daegu_47860.csv'],
  ['포항', '대한민국', 'kr', 'w:2/Korea/CSV/Pohang_47138.csv'],
  ['울산', '대한민국', 'kr', 'w:2/Korea/CSV/Ulsan_47152.csv'],
  ['부산', '대한민국', 'kr', 'w:2/Korea/CSV/Busan_47159.csv'],
  ['통영', '대한민국', 'kr', 'w:2/Korea/CSV/Tongyeong_47162.csv'],
  ['전주', '대한민국', 'kr', 'w:2/Korea/CSV/Jeonju_47864.csv'],
  ['광주', '대한민국', 'kr', 'w:2/Korea/CSV/Gwangju_47156.csv'],
  ['목포', '대한민국', 'kr', 'w:2/Korea/CSV/Mokpo_47165.csv'],
  ['흑산도', '대한민국', 'kr', 'w:2/Korea/CSV/Heuksando_47169.csv'],
  ['완도', '대한민국', 'kr', 'w:2/Korea/CSV/Wando_47170.csv'],
  ['여수', '대한민국', 'kr', 'w:2/Korea/CSV/Yeosu_47168.csv'],
  ['제주', '대한민국', 'kr', 'w:2/Korea/CSV/Jeju_47184.csv'],
  ['고산', '대한민국', 'kr', 'w:2/Korea/CSV/Gosan_47185.csv'],
  ['성산', '대한민국', 'kr', 'w:2/Korea/CSV/Seongsan_47188.csv'],
  ['서귀포', '대한민국', 'kr', 'w:2/Korea/CSV/Seogwipo_47189.csv'],
  // 북한 — WMO 제출 자료가 없어 Meteostat
  ['중강진', '북한', 'kr', 'm:47014'],
  ['혜산', '북한', 'kr', 'm:47016'],
  ['신의주', '북한', 'kr', 'm:47035'],
  ['김책', '북한', 'kr', 'm:47025'],
  ['평양', '북한', 'kr', 'm:47058'],
  ['원산', '북한', 'kr', 'm:47055'],

  // ── 아시아 ──
  ['도쿄', '일본', 'as', 'w:2/Japan/Tokyo_47662.csv'],
  ['오사카', '일본', 'as', 'w:2/Japan/Osaka_47772.csv'],
  ['삿포로', '일본', 'as', 'w:2/Japan/Sapporo_47412.csv'],
  ['가나자와', '일본', 'as', 'w:2/Japan/Kanazawa_47605.csv'],
  ['나하', '일본', 'as', 'w:2/Japan/Naha_47936.csv'],
  ['베이징', '중국', 'as', 'w:2/China/BEIJING_54511.csv'],
  ['상하이', '중국', 'as', 'w:2/China/SHANGHAI__BAOSHAN_58362.csv'],
  ['광저우', '중국', 'as', 'w:2/China/GUANGZHOU_59287.csv'],
  ['홍콩', '중국', 'as', 'w:2/HongKongChina/HongKongObservatory_45005.csv'],
  ['하얼빈', '중국', 'as', 'w:2/China/HARBIN_50953.csv'],
  ['우루무치', '중국', 'as', 'w:2/China/WU_LU_MU_QI_51463.csv'],
  ['투루판', '중국', 'as', 'w:2/China/TURPAN_51573.csv'],
  ['카스', '중국', 'as', 'w:2/China/KASHI_51709.csv'],
  ['라싸', '중국', 'as', 'w:2/China/LHASA_55591.csv'],
  ['쿤밍', '중국', 'as', 'w:2/China/KUNMING_56778.csv'],
  ['충칭', '중국', 'as', 'w:2/China/CHONGQING_57516.csv'],
  ['우한', '중국', 'as', 'w:2/China/WUHAN_57494.csv'],
  ['울란바토르', '몽골', 'as', 'w:2/Mongolia/Ulaanbaatar_44292.csv'],
  ['달란자드가드', '몽골', 'as', 'w:2/Mongolia/Dalanzadgad_44373.csv'],
  ['하노이', '베트남', 'as', 'm:48820'],
  ['방콕', '타이', 'as', 'w:2/Thailand/BangkokMetropolis_48455.csv'],
  ['치앙마이', '타이', 'as', 'w:2/Thailand/ChiangMai_48327.csv'],
  ['양곤', '미얀마', 'as', 'w:2/Myanmar/Kabaaye_48097.csv'],
  ['싱가포르', '싱가포르', 'as', 'w:5/Singapore/ChangiAirport_48698.csv'],
  ['쿠알라룸푸르', '말레이시아', 'as', 'w:5/Malaysia/Subang_48647.csv'],
  ['자카르타', '인도네시아', 'as', 'w:5/Indonesia/StasiunMeteorologiKemayoran_96745.csv'],
  ['마닐라', '필리핀', 'as', 'w:5/Philippines/PortAreaManila_98425.csv'],
  ['뭄바이', '인도', 'as', 'w:2/India/MUMBAI_SANTACRUZ_43003.csv'],
  ['콜카타', '인도', 'as', 'w:2/India/KOLKATA_ALIPORE_42807.csv'],
  ['뉴델리', '인도', 'as', 'w:2/India/NEW_DELHI_SAFDARJUNG_42182.csv'],
  ['첸나이', '인도', 'as', 'w:2/India/CHENNAI_NUNGAMBAKKAM_43278.csv'],
  ['체라푼지', '인도', 'as', 'w:2/India/CHERRAPUNJEE_42515.csv'],
  ['자이살메르', '인도', 'as', 'w:2/India/JAISALMER_42328.csv'],
  ['콜롬보', '스리랑카', 'as', 'w:2/SriLanka/Colombo_43466.csv'],
  ['카트만두', '네팔', 'as', 'w:2/Nepal/Kathmandu_44454.csv'],
  ['카라치', '파키스탄', 'as', 'w:2/Pakistan/Karachi_41780.csv'],
  ['테헤란', '이란', 'as', 'w:2/Iran/TehranMehrabadAirport_40754.csv'],
  ['바그다드', '이라크', 'as', 'w:2/Iraq/BAGHDAD_40650.csv'],
  ['리야드', '사우디아라비아', 'as', 'w:2/SaudiArabia/RiyadhOld_40438.csv'],
  ['두바이', '아랍에미리트', 'as', 'w:2/UAE/DubaiIntlAirport_41194.csv'],
  ['예루살렘', '이스라엘', 'as', 'w:6/Israel/JERUSALEM_40183.csv'],
  ['타슈켄트', '우즈베키스탄', 'as', 'w:2/Uzbekistan/Tashkent_38457.csv'],
  ['알마티', '카자흐스탄', 'as', 'w:2/Kazakhstan/ALMATYOGMS_36870.csv'],
  ['아스타나', '카자흐스탄', 'as', 'w:2/Kazakhstan/Nur-Sultan_5127140.csv'],
  ['옴스크', '러시아', 'as', 'w:2/RussianFederation/Omsk_28698.csv'],
  ['이르쿠츠크', '러시아', 'as', 'w:2/RussianFederation/Irkutsk_30710.csv'],
  ['야쿠츠크', '러시아', 'as', 'w:2/RussianFederation/Jakutsk_24959.csv'],
  ['베르호얀스크', '러시아', 'as', 'w:2/RussianFederation/Verhojansk_24266.csv'],
  ['오이먀콘', '러시아', 'as', 'w:2/RussianFederation/Ojmjakon_24688.csv'],
  ['하바롭스크', '러시아', 'as', 'w:2/RussianFederation/Habarovsk_31735.csv'],
  ['블라디보스토크', '러시아', 'as', 'w:2/RussianFederation/Vladivostok_31960.csv'],
  ['디크손', '러시아', 'as', 'w:2/RussianFederation/OstrovDikson_20674.csv'],

  // ── 유럽 ──
  ['모스크바', '러시아', 'eu', 'w:6/RussianFederation/Moskva_27612.csv'],
  ['상트페테르부르크', '러시아', 'eu', 'w:6/RussianFederation/StPetersburg_26063.csv'],
  ['무르만스크', '러시아', 'eu', 'w:6/RussianFederation/Murmansk_22113.csv'],
  ['런던', '영국', 'eu', 'w:6/UnitedKingdom/Heathrow_03772.csv'],
  ['더블린', '아일랜드', 'eu', 'w:6/Ireland/DublinAirport_03969.csv'],
  ['레이캬비크', '아이슬란드', 'eu', 'w:6/Iceland/Reykjavik_04030.csv'],
  ['파리', '프랑스', 'eu', 'w:6/France/PARIS_MONTSOURIS_07156.csv'],
  ['마르세유', '프랑스', 'eu', 'w:6/France/MARIGNANE_07650.csv'],
  ['브뤼셀', '벨기에', 'eu', 'w:6/Belgium/UCCLE_06447.csv'],
  ['암스테르담', '네덜란드', 'eu', 'w:6/Netherlands/AmsterdamSchipholAp_06240.csv'],
  ['베를린', '독일', 'eu', 'w:6/Germany/Berlin-Dahlem-FU_10381.csv'],
  ['뮌헨', '독일', 'eu', 'w:6/Germany/Muenchen-Stadt_10865.csv'],
  ['취리히', '스위스', 'eu', 'w:6/Switzerland/ZuerichFluntern_06660.csv'],
  ['센티스산', '스위스', 'eu', 'w:6/Switzerland/Saentis_06680.csv'],
  ['빈', '오스트리아', 'eu', 'w:6/Austria/Wien_Hohe_Warte_11035.csv'],
  ['프라하', '체코', 'eu', 'w:6/CzechRepublic/PrahaRuzyne_11518.csv'],
  ['바르샤바', '폴란드', 'eu', 'w:6/Poland/WarszawaOkecie_12375.csv'],
  ['부다페스트', '헝가리', 'eu', 'w:6/Hungary/BudapestBelterulet_12840.csv'],
  ['키이우', '우크라이나', 'eu', 'w:6/Ukraine/KYIV_33345.csv'],
  ['코펜하겐', '덴마크', 'eu', 'w:6/Denmark/LANDBOHYJSKOLEN_06186.csv'],
  ['오슬로', '노르웨이', 'eu', 'w:6/Norway/OSLO_BLINDERN_01492.csv'],
  ['트롬쇠', '노르웨이', 'eu', 'w:6/Norway/TROMSO_01026.csv'],
  ['스톡홀름', '스웨덴', 'eu', 'w:6/Sweden/Stockholm_Observatoriekullen_02485.csv'],
  ['헬싱키', '핀란드', 'eu', 'w:6/Finland/HelsinkiKaisaniemi_02978.csv'],
  ['마드리드', '에스파냐', 'eu', 'w:6/Spain/MADRIDRETIRO_8222.csv'],
  ['바르셀로나', '에스파냐', 'eu', 'w:6/Spain/BARCELONAAEROPUERTO_08181.csv'],
  ['세비야', '에스파냐', 'eu', 'w:6/Spain/SEVILLASANPABLO_8391.csv'],
  ['리스본', '포르투갈', 'eu', 'm:08535'],
  ['로마', '이탈리아', 'eu', 'w:6/Italy/RomaCiampino_16239.csv'],
  ['밀라노', '이탈리아', 'eu', 'w:6/Italy/MilanoLinate_16080.csv'],
  ['아테네', '그리스', 'eu', 'm:16716'],
  ['이스탄불', '튀르키예', 'eu', 'w:6/Turkiye/Florya_17636.csv'],
  ['앙카라', '튀르키예', 'as', 'w:6/Turkiye/Ankara_Bolge_17130.csv'],
  ['누크', '그린란드(덴마크)', 'na', 'w:6/DenmarkGreenland/Nuuk_04250.csv'],

  // ── 아프리카 ──
  ['카이로', '이집트', 'af', 'w:1/Egypt/CairoAP_62366.csv'],
  ['아스완', '이집트', 'af', 'w:1/Egypt/Asswan_62414.csv'],
  ['트리폴리', '리비아', 'af', 'm:62010'],
  ['알제', '알제리', 'af', 'w:1/Algeria/AlgerDarElBeida_60390.csv'],
  ['타만라세트', '알제리', 'af', 'w:1/Algeria/Tamanrasset_60680.csv'],
  ['튀니스', '튀니지', 'af', 'w:1/Tunisia/TunisCarthage_60715.csv'],
  ['카사블랑카', '모로코', 'af', 'w:1/Morocco/CASABLANCAANFA_60155.csv'],
  ['다카르', '세네갈', 'af', 'w:1/Senegal/Dakar_61641.csv'],
  ['바마코', '말리', 'af', 'w:1/Mali/BamakoSenou_61291.csv'],
  ['니아메', '니제르', 'af', 'w:1/Niger/Niamey_Aero_61052.csv'],
  ['하르툼', '수단', 'af', 'w:1/Sudan/Khartoum_62721.csv'],
  ['라고스', '나이지리아', 'af', 'w:1/Nigeria/Ikeja_65201.csv'],
  ['아크라', '가나', 'af', 'w:1/Ghana/Accra_65472.csv'],
  ['아비장', '코트디부아르', 'af', 'w:1/CoteDIvoire/ABIDJAN_65578.csv'],
  ['방기', '중앙아프리카 공화국', 'af', 'w:1/CentralAfricanRepublic/Bangui_64650.csv'],
  ['브라자빌', '콩고 공화국', 'af', 'w:1/RepublicOfCongo/BRAZZAVILLE_64450.csv'],
  ['아디스아바바', '에티오피아', 'af', 'm:63450'],
  ['나이로비', '케냐', 'af', 'm:63740'],
  ['다르에스살람', '탄자니아', 'af', 'w:1/Tanzania/DAR_ES_SALAAM_63894.csv'],
  ['도도마', '탄자니아', 'af', 'w:1/Tanzania/DODOMA_63862.csv'],
  ['킬리만자로 공항', '탄자니아', 'af', 'w:1/Tanzania/KILIMANJARO_63791.csv'],
  ['루사카', '잠비아', 'af', 'w:1/Zambia/LusakaInternational_67665.csv'],
  ['안타나나리보', '마다가스카르', 'af', 'w:1/Madagascar/ANTANANARIVO_67085.csv'],
  ['요하네스버그', '남아프리카 공화국', 'af', 'm:68368'],
  ['케이프타운', '남아프리카 공화국', 'af', 'w:1/SouthAfrica/CapeTown_68816.csv'],
  ['어핑턴', '남아프리카 공화국', 'af', 'w:1/SouthAfrica/UpingtonWO_68424.csv'],

  // ── 북아메리카 ──
  ['뉴욕', '미국', 'na', 'w:4/UnitedStates/NEW_YORK_CNTRL_PK_TWR_72506.csv'],
  ['보스턴', '미국', 'na', 'w:4/UnitedStates/BOSTON_LOGAN_INTL_AP_72509.csv'],
  ['워싱턴 D.C.', '미국', 'na', 'w:4/UnitedStates/WASHINGTON_REAGAN_AP_72405.csv'],
  ['시카고', '미국', 'na', 'w:4/UnitedStates/CHICAGO_OHARE_INTL_AP_72530.csv'],
  ['미니애폴리스', '미국', 'na', 'w:4/UnitedStates/MINNEAPOLIS_ST_PAUL_AP_72658.csv'],
  ['마이애미', '미국', 'na', 'w:4/UnitedStates/MIAMI_INTL_AP_72202.csv'],
  ['뉴올리언스', '미국', 'na', 'w:4/UnitedStates/NEW_ORLEANS_INTL_AP_72231.csv'],
  ['휴스턴', '미국', 'na', 'w:4/UnitedStates/HOUSTON_INTERCONT_AP_72243.csv'],
  ['덴버', '미국', 'na', 'w:4/UnitedStates/DENVER_INTL_AP_72565.csv'],
  ['솔트레이크시티', '미국', 'na', 'w:4/UnitedStates/SALT_LAKE_CITY_INTL_AP_72572.csv'],
  ['피닉스', '미국', 'na', 'w:4/UnitedStates/PHOENIX_SKY_HARBOR_INTL_AP_72278.csv'],
  ['라스베이거스', '미국', 'na', 'w:4/UnitedStates/LAS_VEGAS_MCCARRAN_AP_72386.csv'],
  ['로스앤젤레스', '미국', 'na', 'w:4/UnitedStates/LOS_ANGELES_INTL_AP_72295.csv'],
  ['샌프란시스코', '미국', 'na', 'w:4/UnitedStates/SAN_FRANCISCO_INTL_AP_72494.csv'],
  ['시애틀', '미국', 'na', 'w:4/UnitedStates/SEATTLE_TACOMA_INTL_AP_72793.csv'],
  ['앵커리지', '미국', 'na', 'w:4/UnitedStates/ANCHORAGE_INTL_AP_70273.csv'],
  ['페어뱅크스', '미국', 'na', 'w:4/UnitedStates/FAIRBANKS_INTL_AP_70261.csv'],
  ['우트키아비크', '미국', 'na', 'w:4/UnitedStates/BARROW_POST_ROGERS_AP_70026.csv'],
  ['호놀룰루', '미국', 'oc', 'w:4/UnitedStates/HONOLULU_INTL_AP_91182.csv'],
  ['힐로', '미국', 'oc', 'w:4/UnitedStates/HILO_INTL_AP_91285.csv'],
  ['밴쿠버', '캐나다', 'na', 'm:71892'],
  ['에드먼턴', '캐나다', 'na', 'w:4/Canada/EdmontonInternationalCs_71155.csv'],
  ['위니펙', '캐나다', 'na', 'm:71852'],
  ['토론토', '캐나다', 'na', 'w:4/Canada/TorontoCity_71508.csv'],
  ['몬트리올', '캐나다', 'na', 'm:71627'],
  ['이칼루이트', '캐나다', 'na', 'w:4/Canada/IqaluitClimate_71321.csv'],
  ['유리카', '캐나다', 'na', 'w:4/Canada/EurekaClimate_71613.csv'],
  ['멕시코시티', '멕시코', 'na', 'w:4/Mexico/Tacubaya_76680.csv'],
  ['몬테레이', '멕시코', 'na', 'w:4/Mexico/Monterrey_76393.csv'],
  ['베라크루스', '멕시코', 'na', 'w:4/Mexico/Veracruz_76692.csv'],
  ['킹스턴', '자메이카', 'na', 'w:4/Jamaica/KingstonNormanManley_78397.csv'],

  // ── 남아메리카 ──
  ['마나우스', '브라질', 'sa', 'w:3/Brazil/MANAUS_82331.csv'],
  ['벨렝', '브라질', 'sa', 'w:3/Brazil/BELEM_82191.csv'],
  ['브라질리아', '브라질', 'sa', 'w:3/Brazil/BRASILIA_83377.csv'],
  ['키샤라모빔', '브라질', 'sa', 'w:3/Brazil/QUIXERAMOBIM_82586.csv'],
  ['살바도르', '브라질', 'sa', 'w:3/Brazil/SALVADOR_ONDINA_83229.csv'],
  ['상파울루', '브라질', 'sa', 'm:83781'],
  ['포르투알레그리', '브라질', 'sa', 'w:3/Brazil/PORTO_ALEGRE_83967.csv'],
  ['보고타', '콜롬비아', 'sa', 'w:3/Colombia/El_Dorado_Catam__AUT__21205791.csv'],
  ['카라카스', '베네수엘라', 'sa', 'w:3/Venezuela/MaiquetiaAeropuerto_80415.csv'],
  ['리마', '페루', 'sa', 'm:84628'],
  ['쿠스코', '페루', 'sa', 'w:3/Peru/GranjaKcayra_34001.csv'],
  ['라파스', '볼리비아', 'sa', 'm:85201'],
  ['아리카', '칠레', 'sa', 'w:3/Chile/Chacallutaaeropuertoarica_85406.csv'],
  ['칼라마', '칠레', 'sa', 'w:3/Chile/Elloacalamaad_85432.csv'],
  ['산티아고', '칠레', 'sa', 'w:3/Chile/Quintanormalsantiago_85577.csv'],
  ['푸에르토몬트', '칠레', 'sa', 'w:3/Chile/EltepualaeropuertopuertoMontt_85799.csv'],
  ['푼타아레나스', '칠레', 'sa', 'w:3/Chile/Carlosibanezaeropuertopuntaarenas_85934.csv'],
  ['아순시온', '파라과이', 'sa', 'w:3/Paraguay/Asuncion_86218.csv'],
  ['몬테비데오', '우루과이', 'sa', 'w:3/Uruguay/Prado_86585.csv'],
  ['부에노스아이레스', '아르헨티나', 'sa', 'w:3/Argentina/BUENOS_AIRES_OBSERVATORIO_87585.csv'],
  ['코르도바', '아르헨티나', 'sa', 'w:3/Argentina/CORDOBA_OBSERVATORIO_87345.csv'],
  ['멘도사', '아르헨티나', 'sa', 'w:3/Argentina/MENDOZA_OBSERVATORIO_87420.csv'],
  ['트렐레우', '아르헨티나', 'sa', 'w:3/Argentina/TRELEW_AERO_87828.csv'],
  ['우수아이아', '아르헨티나', 'sa', 'w:3/Argentina/USHUAIA_AERO_87938.csv'],

  // ── 오세아니아 ──
  ['시드니', '오스트레일리아', 'oc', 'w:5/Australia/SydneyObservatoryHill_94768.csv'],
  ['멜버른', '오스트레일리아', 'oc', 'w:5/Australia/MelbourneOlympicPark_95936.csv'],
  ['브리즈번', '오스트레일리아', 'oc', 'w:5/Australia/BrisbaneAero_94578.csv'],
  ['퍼스', '오스트레일리아', 'oc', 'w:5/Australia/PerthAirport_94610.csv'],
  ['애들레이드', '오스트레일리아', 'oc', 'w:5/Australia/AdelaideAirport_94672.csv'],
  ['호바트', '오스트레일리아', 'oc', 'w:5/Australia/Hobart_94970.csv'],
  ['다윈', '오스트레일리아', 'oc', 'w:5/Australia/DarwinAirport_94120.csv'],
  ['케언스', '오스트레일리아', 'oc', 'w:5/Australia/CairnsAero_94287.csv'],
  ['앨리스스프링스', '오스트레일리아', 'oc', 'w:5/Australia/AliceSpringsAirport_94326.csv'],
  ['오클랜드', '뉴질랜드', 'oc', 'w:5/NewZealand/Auckland_Aero_AWS_93110.csv'],
  ['웰링턴', '뉴질랜드', 'oc', 'w:5/NewZealand/Wellington_Aero_AWS_93439.csv'],
  ['크라이스트처치', '뉴질랜드', 'oc', 'w:5/NewZealand/Christchurch_Aero_AWS_93781.csv'],
  ['수바', '피지', 'oc', 'w:5/Fiji/LaucalaBay_91690.csv'],
  ['파페에테', '프랑스령 폴리네시아', 'oc', 'w:5/FrenchPolynesia/FAAA_91938.csv'],

  // ── 남극 ──
  ['벨링스하우젠 기지', '남극(러시아) · 세종 기지 인근', 'an', 'm:89050'],
  ['보스토크 기지', '남극(러시아)', 'an', 'm:89606'],
  ['케이시 기지', '남극(오스트레일리아)', 'an', 'w:5/Australia/Casey_89611.csv'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, binary = false) {
  const file = join(CACHE, url.replace(/[^\w.-]+/g, '_').slice(-180));
  if (existsSync(file)) return binary ? readFileSync(file) : readFileSync(file, 'utf8');
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      return binary ? buf : buf.toString('utf8');
    }
    if (res.status === 404) throw new Error('404 ' + url);
    await sleep(800 * (i + 1));
  }
  throw new Error('내려받기 실패 ' + url);
}

// 위경도 표기도 나라마다 다르다: "37|34|17|N", "14|35|N", "30 08", "15|36|N|N", "32|33|EE"
const dms = (s) => {
  const [d = 0, m = 0, sec = 0] = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!s.match(/\d/)) return null;
  const v = d + m / 60 + sec / 3600;
  return Math.round((/[SW]/i.test(s) ? -v : v) * 1000) / 1000;
};
// 원자료 머리글의 위치 정보가 명백히 틀린 관측소 — 같은 관측소의 Meteostat 위치로 바로잡는다(기후 값은 그대로)
const META_FIX = {
  93110: { lon: 174.8 },   // 오클랜드: 원자료 경도 171°48′(바다 한가운데)
  63862: { lat: -6.167 },  // 도도마: 원자료 위도 6°42′S
  85432: { elev: null },   // 칼라마: 원자료 높이 4,880m(도시는 해발 약 2,300m) — 모르는 값으로 둔다
};
const num = (s) => {
  if (s === undefined || /^\s*$/.test(s) || /^-?9{3,}(\.0+)?$/.test(s.trim())) return null;
  const v = parseFloat(s); // "365 m" 같은 단위 붙은 값
  return Number.isFinite(v) ? v : null;
};

// WMO 평년값 CSV: 매개변수 1 강수량 합, 3 일 최고 평균, 4 일 최저 평균, 5 일 평균 기온
function parseWmo(text) {
  // 나라마다 칸에 공백을 넣거나(" 1", "Sum    "), 자료 줄의 관측소 번호를 비우거나(뉴질랜드),
  // 번호 앞 0을 빼기도(04030 → 4030) 한다. 파일 하나에 관측소 하나뿐이므로 번호 칸은 보지 않고,
  // 「WMO_Number,Parameter_Code,…」 머리줄 바로 아래의 첫 계산값 줄을 그 매개변수의 값으로 읽는다.
  const rows = text.split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/^\s*"?|"?\s*$/g, '')));
  const head = rows.findIndex((r) => r[0] === 'WMO_Number' && r[1] === 'Latitude');
  const [wmo, lat, lon, h] = rows[head + 1];
  const name = rows.find((r) => r[0] === 'Station_Name')?.[1];
  const series = {};
  rows.forEach((r, i) => {
    if (r[0] !== 'WMO_Number' || r[1] !== 'Parameter_Code') return;
    const row = rows[i + 1];
    if (!row || !/^\d+$/.test(row[1]) || row[2] === 'NOY' || row[3] === '98') return;
    if (!series[row[1]]) series[row[1]] = row.slice(4, 16).map(num);
  });
  return { wmo, name, lat: dms(lat), lon: dms(lon), elev: num(h), p: series['1'], tx: series['3'], tn: series['4'], t: series['5'] };
}

let meteostatStations = null;
async function meteostat(id) {
  if (!meteostatStations) meteostatStations = JSON.parse(gunzipSync(await get('https://bulk.meteostat.net/v2/stations/lite.json.gz', true)).toString('utf8'));
  const st = meteostatStations.find((s) => s.id === id);
  if (!st) throw new Error('Meteostat 관측소 없음 ' + id);
  const csv = gunzipSync(await get(`https://bulk.meteostat.net/v2/normals/${id}.csv.gz`, true)).toString('utf8');
  const rows = csv.trim().split('\n').map((l) => l.split(',')).filter((r) => r[0] === '1991' && r[1] === '2020');
  const by = (i) => Array.from({ length: 12 }, (_, m) => num(rows.find((r) => +r[2] === m + 1)?.[i]));
  const tn = by(3), tx = by(4), p = by(5);
  const t = tn.map((v, i) => (v === null || tx[i] === null ? null : Math.round(((v + tx[i]) / 2) * 10) / 10));
  return { wmo: st.identifiers?.wmo || id, name: st.name.en, lat: st.location.latitude, lon: st.location.longitude, elev: st.location.elevation, p, tx, tn, t, approxMean: true };
}

// 하나의 원자료를 읽어 열두 달이 모두 있는지 확인한다. 모자라면 이유와 함께 throw.
async function load(src) {
  let d;
  if (src.startsWith('w:')) {
    const [reg, folder, file] = src.slice(2).replace('/CSV/', '/').split('/');
    // 나라마다 CSV/ 하위 폴더가 있기도 하고 없기도 하다
    const base = NOAA + REGION[reg] + folder + '/';
    d = parseWmo(await get(base + file).catch(() => get(base + 'CSV/' + file)));
    d.source = 'wmo';
  } else {
    d = await meteostat(src.slice(2));
    d.source = 'meteostat';
  }
  const full = (a) => Array.isArray(a) && a.length === 12 && a.every((v) => v !== null && !Number.isNaN(v));
  // 평균 기온을 내지 않은 나라(인도 등): 평균 최고와 평균 최저의 가운데 값을 쓰고 표시해 둔다
  if (!full(d.t) && full(d.tx) && full(d.tn)) {
    d.t = d.tx.map((v, i) => Math.round(((v + d.tn[i]) / 2) * 10) / 10);
    d.approxMean = true;
  }
  const miss = [];
  if (!full(d.t)) miss.push('평균 기온');
  if (!full(d.p)) miss.push('강수량');
  if (miss.length) throw new Error('빠진 달: ' + miss.join(', '));
  if (!full(d.tx)) d.tx = undefined;
  if (!full(d.tn)) d.tn = undefined;
  return d;
}

const out = [];
const skipped = [];
const substituted = [];
for (const [ko, country, region, src] of CITIES) {
  let d;
  try {
    d = await load(src);
  } catch (e) {
    // WMO 자료가 비어 있으면 같은 관측소의 Meteostat 평년값으로 대신한다
    const wmo = src.match(/_(\d{5})\.csv$/)?.[1];
    try {
      if (!wmo) throw e;
      d = await load('m:' + wmo);
      substituted.push(`${ko}: WMO ${e.message} → Meteostat ${wmo}`);
    } catch (e2) {
      skipped.push(`${ko} (${src}): ${e.message}${wmo ? ' / Meteostat ' + e2.message : ''}`);
      continue;
    }
  }
  Object.assign(d, META_FIX[parseInt(d.wmo, 10)] || {});
  out.push({
    id: (region === 'kr' ? 'k' : '') + String(parseInt(d.wmo, 10) || d.wmo),
    name: ko, country, region,
    lat: d.lat, lon: d.lon, elev: d.elev,
    station: d.name,
    src: d.source + (d.approxMean ? '*' : ''),
    t: d.t,
    p: d.p.map((v) => Math.round(v * 10) / 10),
    tx: d.tx, tn: d.tn,
  });
  process.stdout.write('.');
}
console.log(`
실음 ${out.length}곳, 대신 ${substituted.length}곳, 뺌 ${skipped.length}곳`);
substituted.forEach((s) => console.log('  ~ ' + s));
skipped.forEach((s) => console.log('  - ' + s));
mkdirSync(join(ROOT, 'data/climate'), { recursive: true });
const meta = {
  period: '1991–2020',
  sources: {
    wmo: 'WMO 기후 평년값 1991–2020 (각국 기상청 제출, NOAA NCEI 보관 0253808)',
    meteostat: 'Meteostat 평년값 1991–2020 (CC BY-NC 4.0)',
  },
  built: new Date().toISOString().slice(0, 10),
};
writeFileSync(join(ROOT, 'data/climate/stations.json'), JSON.stringify({ meta, stations: out }));
console.log('→ data/climate/stations.json', Math.round(JSON.stringify(out).length / 1024) + 'KB');
