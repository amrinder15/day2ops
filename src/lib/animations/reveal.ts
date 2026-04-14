import { REVEAL_ROOT_MARGIN, REVEAL_THRESHOLD } from './motion';

const REVEAL_SELECTOR = '.reveal';

export const initRevealAnimations = (root: ParentNode = document) => {
  const revealElements = Array.from(root.querySelectorAll(REVEAL_SELECTOR));

  if (revealElements.length === 0) {
    return () => {};
  }

  if (typeof IntersectionObserver === 'undefined') {
    revealElements.forEach((element) => element.classList.add('revealed'));
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: REVEAL_THRESHOLD,
      rootMargin: REVEAL_ROOT_MARGIN,
    }
  );

  revealElements.forEach((element) => observer.observe(element));

  return () => {
    observer.disconnect();
  };
};