import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PAGE_SCROLL_REVEAL_START } from './motion';

gsap.registerPlugin(ScrollTrigger);

const toArray = <T extends Element>(selector: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(selector));

const revealOnScroll = (
  targets: Element[] | string,
  vars: gsap.TweenVars = {},
  trigger?: Element
) => {
  const elements = typeof targets === 'string' ? toArray<HTMLElement>(targets) : targets;

  elements.forEach((element, index) => {
    gsap.fromTo(
      element,
      {
        autoAlpha: 0,
        y: 42,
        scale: 0.98,
      },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.9,
        ease: 'power3.out',
        delay: index * 0.04,
        scrollTrigger: {
          trigger: trigger ?? element,
          start: PAGE_SCROLL_REVEAL_START,
          once: true,
        },
        ...vars,
      }
    );
  });
};

const initHomeAnimations = () => {
  const hero = document.querySelector('[data-home-hero]');
  if (!(hero instanceof HTMLElement)) return;

  const heroTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

  heroTimeline
    .from('[data-hero-grid]', { autoAlpha: 0, scale: 1.08, duration: 1.2 }, 0)
    .from('[data-hero-badges] > *', { y: 20, autoAlpha: 0, stagger: 0.08, duration: 0.55 }, 0.08)
    .from('[data-hero-title]', { y: 56, autoAlpha: 0, duration: 0.85 }, 0.16)
    .from('[data-hero-lead]', { y: 32, autoAlpha: 0, duration: 0.72 }, 0.24)
    .from('[data-hero-actions] > *', { y: 18, autoAlpha: 0, stagger: 0.1, duration: 0.45 }, 0.32)
    .from('[data-hero-terminal]', { x: 60, autoAlpha: 0, rotateX: -10, duration: 0.95 }, 0.18)
    .from('.terminal__line', { x: -10, autoAlpha: 0, stagger: 0.08, duration: 0.28 }, 0.7);

  gsap.to('[data-hero-terminal]', {
    yPercent: -7,
    ease: 'none',
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });

  gsap.to('[data-hero-grid]', {
    yPercent: 14,
    ease: 'none',
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });

  const platform = document.querySelector('[data-home-platform]');
  if (platform instanceof HTMLElement) {
    const platformCopy = platform.querySelector<HTMLElement>('.platform-showcase__copy');
    const platformBoard = platform.querySelector<HTMLElement>('.platform-showcase__board');
    const platformLanes = toArray<HTMLElement>('.platform-lane', platform);
    const platformCounters = toArray<HTMLElement>('[data-platform-counter]', platform);

    gsap.from('[data-home-platform] .platform-showcase__copy > *', {
      y: 28,
      autoAlpha: 0,
      duration: 0.64,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: platform,
        start: PAGE_SCROLL_REVEAL_START,
        once: true,
      },
    });

    if (platformBoard instanceof HTMLElement) {
      gsap.set(platformBoard, {
        transformPerspective: 1200,
        transformOrigin: '50% 50%',
      });

      gsap.fromTo(platformBoard,
        {
          y: 44,
          rotateX: 10,
          rotateY: -10,
          scale: 0.94,
        },
        {
          y: -26,
          rotateX: -2,
          rotateY: 8,
          scale: 1.02,
          ease: 'none',
          scrollTrigger: {
            trigger: platform,
            start: 'top 88%',
            end: 'bottom top',
            scrub: 1.1,
          },
        }
      );
    }

    if (platformCopy instanceof HTMLElement) {
      gsap.fromTo(platformCopy,
        { y: 18 },
        {
          y: -16,
          ease: 'none',
          scrollTrigger: {
            trigger: platform,
            start: 'top 88%',
            end: 'bottom top',
            scrub: 1,
          },
        }
      );
    }

    platformLanes.forEach((lane, index) => {
      gsap.fromTo(lane,
        {
          xPercent: index % 2 === 0 ? -4 : 4,
          rotateZ: index % 2 === 0 ? -0.4 : 0.4,
        },
        {
          xPercent: index % 2 === 0 ? 3 : -3,
          rotateZ: index % 2 === 0 ? 0.35 : -0.35,
          ease: 'none',
          scrollTrigger: {
            trigger: platform,
            start: 'top 88%',
            end: 'bottom top',
            scrub: 1.2,
          },
        }
      );
    });

    gsap.from('[data-home-platform] .platform-lane', {
      y: 34,
      autoAlpha: 0,
      duration: 0.66,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: platform,
        start: PAGE_SCROLL_REVEAL_START,
        once: true,
      },
    });

    gsap.from('[data-home-platform] .platform-metric', {
      scale: 0.94,
      autoAlpha: 0,
      duration: 0.52,
      stagger: 0.08,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: platform,
        start: PAGE_SCROLL_REVEAL_START,
        once: true,
      },
    });

    gsap.to('[data-home-platform] .platform-lane__signal', {
      xPercent: 360,
      duration: 2.2,
      ease: 'none',
      stagger: 0.24,
      repeat: -1,
    });

    gsap.to('[data-home-platform] .platform-showcase__orb', {
      xPercent: 12,
      yPercent: -8,
      scale: 1.08,
      duration: 3.8,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    platformCounters.forEach((counter) => {
      const target = Number(counter.dataset.platformTarget ?? '0');
      const pad = Number(counter.dataset.platformPad ?? '0');
      const state = { value: 0 };

      gsap.to(state, {
        value: target,
        duration: 1.25,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: platform,
          start: 'top 70%',
          once: true,
        },
        onUpdate: () => {
          counter.textContent = Math.round(state.value).toString().padStart(pad, '0');
        },
      });
    });
  }

  revealOnScroll(toArray('.stats-bar .stat'));
  revealOnScroll(toArray('[data-home-recent]'));
  revealOnScroll(toArray('[data-home-topics] .tag'), { stagger: 0.02, duration: 0.45 }, document.querySelector('[data-home-topics]') ?? undefined);
};

const initBlogIndexAnimations = () => {
  const header = document.querySelector('[data-blog-header]');
  if (!(header instanceof HTMLElement)) return;

  const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

  timeline
    .from('[data-blog-header] .blog-header__eyebrow', { y: 18, autoAlpha: 0, duration: 0.4 })
    .from('[data-blog-header] .blog-header__title', { y: 42, autoAlpha: 0, duration: 0.7 }, 0.08)
    .from('[data-blog-header] .blog-header__sub', { y: 24, autoAlpha: 0, duration: 0.58 }, 0.18)
    .from('[data-blog-filters] .tag', { y: 18, autoAlpha: 0, stagger: 0.03, duration: 0.35 }, 0.32);

  const cards = toArray<HTMLElement>('[data-blog-grid] .post-card');
  const cardTrigger = document.querySelector('[data-blog-grid]');
  if (cards.length > 0 && cardTrigger instanceof HTMLElement) {
    gsap.fromTo(cards,
      {
        autoAlpha: 0,
        y: 42,
        rotateZ: -1.5,
        scale: 0.96,
      },
      {
        autoAlpha: 1,
        y: 0,
        rotateZ: 0,
        scale: 1,
        duration: 0.72,
        ease: 'power3.out',
        stagger: 0.06,
        scrollTrigger: {
          trigger: cardTrigger,
          start: PAGE_SCROLL_REVEAL_START,
          once: true,
        },
      }
    );
  }
  revealOnScroll(toArray('[data-blog-empty]'));
};

const initArticleAnimations = () => {
  const heroImage = document.querySelector('[data-article-hero-image]');
  const header = document.querySelector('[data-article-header]');

  if (heroImage instanceof HTMLElement) {
    gsap.fromTo(heroImage, { scale: 1.14, autoAlpha: 0.7 }, { scale: 1, autoAlpha: 1, duration: 1.4, ease: 'power3.out' });
    gsap.to(heroImage, {
      yPercent: 10,
      ease: 'none',
      scrollTrigger: {
        trigger: '[data-article-hero]',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  }

  if (header instanceof HTMLElement) {
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
    timeline
      .from('[data-article-header] .post-header__tags', { y: 14, autoAlpha: 0, duration: 0.35 })
      .from('[data-article-header] .post-header__title', { y: 40, autoAlpha: 0, duration: 0.72 }, 0.08)
      .from('[data-article-header] .post-header__description', { y: 24, autoAlpha: 0, duration: 0.58 }, 0.18)
      .from('[data-article-header] .post-header__meta', { y: 18, autoAlpha: 0, duration: 0.42 }, 0.26);
    revealOnScroll(toArray('[data-article-footer], [data-article-comments]'));
  }

};

export const initPageAnimations = () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    return () => {};
  }

  const pageKind = document.body.dataset.pageKind;

  if (pageKind === 'home') {
    initHomeAnimations();
  } else if (pageKind === 'blog-index') {
    initBlogIndexAnimations();
  } else if (pageKind === 'article') {
    initArticleAnimations();
  }

  return () => {
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  };
};