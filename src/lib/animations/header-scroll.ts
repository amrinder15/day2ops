import { HEADER_SCROLLED_OFFSET } from './motion';

const HEADER_SELECTOR = '#site-header';

export const initHeaderScroll = (root: ParentNode = document) => {
  const header = root.querySelector(HEADER_SELECTOR);

  if (!(header instanceof HTMLElement)) {
    return () => {};
  }

  const syncHeaderState = () => {
    header.classList.toggle('scrolled', window.scrollY > HEADER_SCROLLED_OFFSET);
  };

  syncHeaderState();
  window.addEventListener('scroll', syncHeaderState, { passive: true });

  return () => {
    window.removeEventListener('scroll', syncHeaderState);
  };
};