import { gsap } from 'gsap';
import {
  RECENT_CAROUSEL_ACTIVE_THRESHOLD,
  RECENT_CAROUSEL_BASE_OPACITY,
  RECENT_CAROUSEL_BASE_SCALE,
  RECENT_CAROUSEL_CENTER_RATIO,
  RECENT_CAROUSEL_MIN_DURATION,
  RECENT_CAROUSEL_OPACITY_BOOST,
  RECENT_CAROUSEL_PIXELS_PER_SECOND,
  RECENT_CAROUSEL_SCALE_BOOST,
  RECENT_CAROUSEL_VERTICAL_LIFT,
} from './motion';

type CarouselController = {
  destroy: () => void;
};

const RECENT_CAROUSEL_SELECTOR = '[data-recent-carousel]';
const RECENT_CAROUSEL_MOBILE_BREAKPOINT = 768;

const isHTMLElement = (value: Element | null): value is HTMLElement => value instanceof HTMLElement;

const isCompactLayout = () => window.innerWidth <= RECENT_CAROUSEL_MOBILE_BREAKPOINT;

const updateCenterEmphasis = (viewport: HTMLElement, slideItems: HTMLElement[]) => {
  const viewportRect = viewport.getBoundingClientRect();
  const centerX = viewportRect.left + viewportRect.width / 2;
  const maxDistance = Math.max(viewportRect.width * RECENT_CAROUSEL_CENTER_RATIO, 1);

  slideItems.forEach((slide) => {
    const rect = slide.getBoundingClientRect();
    const slideCenter = rect.left + rect.width / 2;
    const distance = Math.abs(centerX - slideCenter);
    const focus = Math.max(0, 1 - distance / maxDistance);
    const scale = RECENT_CAROUSEL_BASE_SCALE + focus * RECENT_CAROUSEL_SCALE_BOOST;
    const translateY = (1 - focus) * RECENT_CAROUSEL_VERTICAL_LIFT;
    const opacity = RECENT_CAROUSEL_BASE_OPACITY + focus * RECENT_CAROUSEL_OPACITY_BOOST;

    slide.dataset.active = focus > RECENT_CAROUSEL_ACTIVE_THRESHOLD ? 'true' : 'false';

    gsap.set(slide, {
      scale,
      y: translateY,
      opacity,
      zIndex: Math.round(10 + focus * 10),
    });
  });
};

const createRecentCarousel = (carousel: Element): CarouselController | null => {
  const track = carousel.querySelector('[data-carousel-track]');
  const group = carousel.querySelector('[data-carousel-group]');
  const viewport = carousel.querySelector('.recent-carousel__viewport');
  const directionButton = carousel.querySelector('[data-carousel-direction]');
  const status = carousel.querySelector('[data-carousel-status]');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (!isHTMLElement(track) || !isHTMLElement(group) || !isHTMLElement(viewport)) {
    return null;
  }

  const slides = Array.from(group.querySelectorAll('[data-carousel-slide] a'));
  const slideItems = Array.from(track.querySelectorAll('[data-carousel-slide]')).filter(isHTMLElement);
  let tween: gsap.core.Tween | null = null;
  let direction = -1;

  const resetSlideStyles = () => {
    slideItems.forEach((slide) => {
      slide.dataset.active = 'false';
      gsap.set(slide, {
        clearProps: 'transform,opacity,zIndex',
      });
    });
  };

  const stopMarquee = () => {
    tween?.pause();
  };

  const startMarquee = () => {
    if (!tween || prefersReducedMotion.matches || slides.length < 2) {
      return;
    }

    tween.play();
  };

  const buildMarquee = () => {
    tween?.kill();

    const trackGap = Number.parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || '0');
    const distance = group.offsetWidth + trackGap;

    gsap.set(track, { x: 0 });

    if (isCompactLayout()) {
      resetSlideStyles();
      if (status) {
        status.textContent = `Showing ${slides.length} recent posts.`;
      }
      return;
    }

    if (slides.length < 2 || prefersReducedMotion.matches || distance <= 0) {
      updateCenterEmphasis(viewport, slideItems);
      if (status) {
        status.textContent = `Showing ${slides.length} recent posts.`;
      }
      return;
    }

    tween = gsap.fromTo(
      track,
      { x: direction === -1 ? 0 : -distance },
      {
        x: direction === -1 ? -distance : 0,
        duration: Math.max(RECENT_CAROUSEL_MIN_DURATION, distance / RECENT_CAROUSEL_PIXELS_PER_SECOND),
        ease: 'none',
        repeat: -1,
        onUpdate: () => updateCenterEmphasis(viewport, slideItems),
      }
    );

    updateCenterEmphasis(viewport, slideItems);

    if (status) {
      status.textContent = `Auto-scrolling through ${slides.length} recent posts.`;
    }
  };

  const handleDirectionToggle = () => {
    direction *= -1;
    buildMarquee();
  };

  const handleMouseLeave = () => {
    if (!prefersReducedMotion.matches) {
      startMarquee();
    }
  };

  const handleFocusOut = (event: FocusEvent) => {
    if (!carousel.contains(event.relatedTarget as Node | null) && !prefersReducedMotion.matches) {
      startMarquee();
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stopMarquee();
    } else if (!prefersReducedMotion.matches) {
      startMarquee();
    }
  };

  const handleReducedMotionChange = () => {
    if (prefersReducedMotion.matches) {
      stopMarquee();
      updateCenterEmphasis(viewport, slideItems);
    } else {
      buildMarquee();
    }
  };

  slides.forEach((slide) => {
    slide.removeAttribute('tabindex');
  });

  directionButton?.addEventListener('click', handleDirectionToggle);
  carousel.addEventListener('mouseenter', stopMarquee);
  carousel.addEventListener('mouseleave', handleMouseLeave);
  carousel.addEventListener('focusin', stopMarquee);
  carousel.addEventListener('focusout', handleFocusOut);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  prefersReducedMotion.addEventListener('change', handleReducedMotionChange);
  window.addEventListener('resize', buildMarquee);

  buildMarquee();

  return {
    destroy: () => {
      tween?.kill();
      directionButton?.removeEventListener('click', handleDirectionToggle);
      carousel.removeEventListener('mouseenter', stopMarquee);
      carousel.removeEventListener('mouseleave', handleMouseLeave);
      carousel.removeEventListener('focusin', stopMarquee);
      carousel.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      prefersReducedMotion.removeEventListener('change', handleReducedMotionChange);
      window.removeEventListener('resize', buildMarquee);
    },
  };
};

export const initRecentCarousels = (root: ParentNode = document) => {
  const carousels = Array.from(root.querySelectorAll(RECENT_CAROUSEL_SELECTOR));
  const controllers = carousels
    .map((carousel) => createRecentCarousel(carousel))
    .filter((controller): controller is CarouselController => controller !== null);

  return () => {
    controllers.forEach((controller) => controller.destroy());
  };
};