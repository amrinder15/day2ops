import { gsap } from 'gsap';
import { PAGE_TRANSITION_DURATION, PAGE_TRANSITION_ENTER_DURATION } from './motion';

const TRANSITION_KEY = 'day2ops:page-transition';

const isEligibleInternalLink = (anchor: HTMLAnchorElement, event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download') || anchor.dataset.noTransition === 'true') return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.hash) return false;
  return true;
};

export const initPageTransitions = () => {
  const layer = document.querySelector('.page-transition-layer');
  const shell = document.querySelector('[data-page-shell]');

  if (!(layer instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
    return () => {};
  }

  let navigating = false;

  if (document.documentElement.dataset.pageTransition === 'enter') {
    gsap.set(layer, { yPercent: 0 });
    gsap.timeline()
      .to(layer, {
        yPercent: -100,
        duration: PAGE_TRANSITION_ENTER_DURATION,
        ease: 'power4.out',
        clearProps: 'transform',
      })
      .from(shell, {
        autoAlpha: 0,
        y: 26,
        duration: 0.65,
        ease: 'power3.out',
        clearProps: 'transform,opacity,visibility',
      }, 0.12);

    sessionStorage.removeItem(TRANSITION_KEY);
    delete document.documentElement.dataset.pageTransition;
  }

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || navigating) return;
    if (!isEligibleInternalLink(anchor, event)) return;

    event.preventDefault();
    navigating = true;
    sessionStorage.setItem(TRANSITION_KEY, '1');

    gsap.timeline({
      onComplete: () => {
        window.location.assign(anchor.href);
      },
    })
      .to(shell, {
        autoAlpha: 0,
        y: -18,
        duration: 0.28,
        ease: 'power2.in',
      }, 0)
      .fromTo(layer, {
        yPercent: 100,
      }, {
        yPercent: 0,
        duration: PAGE_TRANSITION_DURATION,
        ease: 'power4.inOut',
      }, 0.04);
  };

  document.addEventListener('click', handleClick);

  return () => {
    document.removeEventListener('click', handleClick);
  };
};