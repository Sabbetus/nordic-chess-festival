// Phones: a page title or section heading that only just does not fit on one line is shrunk to fit, instead of
// wrapping a word or two onto a second line. Headings that would have to shrink a lot keep wrapping normally.

const PHONE = '(max-width: 700px)';
/** The smallest share of the normal size a heading may be shrunk to (0.75 = at most 25 % smaller). */
const MIN_SCALE = 0.75;

function fit(): void {
  const phone = window.matchMedia(PHONE).matches;
  document.querySelectorAll<HTMLElement>('main h1, main h2').forEach((h) => {
    h.style.fontSize = '';
    if (!phone || !h.offsetParent) return;
    const cs = getComputedStyle(h);
    if (cs.maxWidth !== 'none') return; // a width limit in ch units would shrink along with the text
    const avail = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) return;
    // The width the text needs on one line.
    const { whiteSpace, width, display } = h.style;
    h.style.whiteSpace = 'nowrap';
    h.style.display = 'block';
    h.style.width = 'max-content';
    const natural = h.getBoundingClientRect().width;
    h.style.whiteSpace = whiteSpace;
    h.style.display = display;
    h.style.width = width;
    if (natural <= avail) return;
    const scale = avail / natural;
    if (scale >= MIN_SCALE) h.style.fontSize = `${(parseFloat(cs.fontSize) * scale * 0.985).toFixed(2)}px`;
  });
}

let timer: number | undefined;
const schedule = () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(fit, 80);
};

fit();
document.fonts?.ready.then(fit);
document.fonts?.addEventListener('loadingdone', schedule);
window.addEventListener('resize', schedule);
window.addEventListener('orientationchange', schedule);
