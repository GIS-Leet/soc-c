// 지금 화면 그대로 여는 주소를 건네는 창 — 주소 복사와 QR. 수업 중 교실 화면에 QR을 크게 띄우면
// 학생이 폰으로 같은 조건의 화면을 연다. 기후 그래프 · 통계 · 시뮬레이터가 함께 쓴다(스타일은 geo.css .share-*).
// QR은 열 때 한 번만 qrcode-generator(MIT)를 불러와 SVG로 직접 그린다. 불러오지 못하면 주소만 보여 준다.
const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
let qrLib = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLib) {
    qrLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = QR_SRC;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('qr')));
      s.onerror = () => { qrLib = null; reject(new Error('qr')); };
      document.head.append(s);
    });
  }
  return qrLib;
}

// 모듈 하나하나를 사각형으로 — 확대해도 흐려지지 않고 테마 색을 따른다
export async function qrSvg(text) {
  const qrcode = await loadQr();
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount(), q = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + q * 2} ${n + q * 2}" role="img" aria-label="이 화면의 주소 QR 코드" shape-rendering="crispEdges"><rect width="100%" height="100%" class="share-qr__bg"/><path d="${d}" class="share-qr__fg"/></svg>`;
}

let dialog = null;
function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'share-sheet';
  dialog.setAttribute('aria-labelledby', 'shareTitle');
  dialog.innerHTML = `
    <form method="dialog" class="share-sheet__in">
      <div class="share-sheet__head">
        <h2 id="shareTitle">이 화면 그대로 열기</h2>
        <button class="share-x" value="close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <p class="share-sheet__note" id="shareNote">고른 조건이 주소에 들어 있습니다.</p>
      <div class="share-url">
        <input class="form-input" id="shareUrl" readonly aria-label="이 화면의 주소">
        <button type="button" class="btn-solid" id="shareCopy">복사</button>
      </div>
      <figure class="share-qr" id="shareQr" aria-live="polite"></figure>
      <button type="button" class="btn-sub share-big" id="shareBig">QR 크게 띄우기</button>
      <p class="share-status" id="shareStatus" role="status"></p>
    </form>`;
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector('#' + id);
  $('shareCopy').addEventListener('click', async () => {
    const input = $('shareUrl');
    try {
      await navigator.clipboard.writeText(input.value);
      $('shareStatus').textContent = '주소를 복사했습니다.';
    } catch {
      input.focus();
      input.select();
      $('shareStatus').textContent = '선택된 주소를 복사해 주세요.';
    }
  });
  $('shareBig').addEventListener('click', () => {
    const on = dialog.classList.toggle('is-big');
    $('shareBig').textContent = on ? 'QR 작게' : 'QR 크게 띄우기';
  });
  // 바깥(배경)을 누르면 닫는다
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.classList.remove('is-big'));
}

/** @param {string} url 열 주소 @param {string} [note] 무엇이 담겼는지 한 줄 */
export async function openShare(url, note) {
  if (!dialog) build();
  const $ = (id) => dialog.querySelector('#' + id);
  $('shareUrl').value = url;
  $('shareNote').textContent = note || '고른 조건이 주소에 들어 있습니다.';
  $('shareStatus').textContent = '';
  $('shareBig').textContent = 'QR 크게 띄우기';
  const fig = $('shareQr');
  fig.innerHTML = '<span class="share-qr__wait">QR을 만드는 중…</span>';
  dialog.showModal();
  $('shareUrl').select();
  try {
    fig.innerHTML = await qrSvg(url);
  } catch {
    fig.innerHTML = '<span class="share-qr__wait">QR을 불러오지 못했습니다. 주소를 복사해 주세요.</span>';
  }
}

export const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>';
