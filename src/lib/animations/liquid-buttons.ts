import { gsap } from 'gsap';
import {
  LIQUID_BUTTON_FLOAT_DURATION,
  LIQUID_BUTTON_FLOAT_Y,
  LIQUID_BUTTON_HOVER_SCALE,
  LIQUID_BUTTON_MAX_ROTATE,
  LIQUID_BUTTON_MAX_TRANSLATE,
  LIQUID_BUTTON_MOVE_DURATION,
  LIQUID_BUTTON_PRESS_SCALE,
  LIQUID_BUTTON_SETTLE_DURATION,
} from './motion';

const LIQUID_BUTTON_SELECTOR = '.btn, .theme-toggle, .recent-carousel__control, .like-btn';
const INITIALIZED_ATTR = 'data-liquid-init';

const isHTMLElement = (value: Element | null): value is HTMLElement => value instanceof HTMLElement;

const setPointerGlow = (button: HTMLElement, xPercent: number, yPercent: number) => {
  button.style.setProperty('--liquid-pointer-x', `${xPercent}%`);
  button.style.setProperty('--liquid-pointer-y', `${yPercent}%`);
};

const createLiquidButton = (button: HTMLElement) => {
  if (button.dataset.liquidInit === 'true') {
    return () => {};
  }

  button.dataset.liquidInit = 'true';
  setPointerGlow(button, 50, 50);

  let floatTween: gsap.core.Tween | null = null;

  const startFloat = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    floatTween?.kill();
    floatTween = gsap.to(button, {
      y: LIQUID_BUTTON_FLOAT_Y,
      duration: LIQUID_BUTTON_FLOAT_DURATION,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  };

  const stopFloat = () => {
    floatTween?.kill();
    floatTween = null;
  };

  const handlePointerEnter = () => {
    stopFloat();
    gsap.to(button, {
      scale: LIQUID_BUTTON_HOVER_SCALE,
      duration: LIQUID_BUTTON_MOVE_DURATION,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  };

  const handlePointerMove = (event: PointerEvent) => {
    const rect = button.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    const moveX = (relativeX - 0.5) * LIQUID_BUTTON_MAX_TRANSLATE;
    const moveY = (relativeY - 0.5) * LIQUID_BUTTON_MAX_TRANSLATE;
    const rotateX = (0.5 - relativeY) * LIQUID_BUTTON_MAX_ROTATE;
    const rotateY = (relativeX - 0.5) * LIQUID_BUTTON_MAX_ROTATE;

    setPointerGlow(button, relativeX * 100, relativeY * 100);

    gsap.to(button, {
      x: moveX,
      y: moveY,
      rotateX,
      rotateY,
      scale: LIQUID_BUTTON_HOVER_SCALE,
      duration: LIQUID_BUTTON_MOVE_DURATION,
      ease: 'power2.out',
      overwrite: 'auto',
      transformPerspective: 900,
      transformOrigin: 'center center',
    });
  };

  const handlePointerLeave = () => {
    gsap.to(button, {
      x: 0,
      y: 0,
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      duration: LIQUID_BUTTON_SETTLE_DURATION,
      ease: 'elastic.out(1, 0.55)',
      overwrite: 'auto',
    });

    setPointerGlow(button, 50, 50);
    startFloat();
  };

  const handlePointerDown = () => {
    stopFloat();
    gsap.to(button, {
      scale: LIQUID_BUTTON_PRESS_SCALE,
      duration: 0.12,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

  const handlePointerUp = () => {
    gsap.to(button, {
      scale: LIQUID_BUTTON_HOVER_SCALE,
      duration: 0.24,
      ease: 'back.out(2.2)',
      overwrite: 'auto',
    });
  };

  const handleFocus = () => {
    stopFloat();
    gsap.to(button, {
      scale: LIQUID_BUTTON_HOVER_SCALE,
      y: LIQUID_BUTTON_FLOAT_Y,
      duration: LIQUID_BUTTON_MOVE_DURATION,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  };

  const handleBlur = () => {
    handlePointerLeave();
  };

  button.addEventListener('pointerenter', handlePointerEnter);
  button.addEventListener('pointermove', handlePointerMove);
  button.addEventListener('pointerleave', handlePointerLeave);
  button.addEventListener('pointerdown', handlePointerDown);
  button.addEventListener('pointerup', handlePointerUp);
  button.addEventListener('focus', handleFocus);
  button.addEventListener('blur', handleBlur);

  startFloat();

  return () => {
    stopFloat();
    button.removeAttribute(INITIALIZED_ATTR);
    button.removeEventListener('pointerenter', handlePointerEnter);
    button.removeEventListener('pointermove', handlePointerMove);
    button.removeEventListener('pointerleave', handlePointerLeave);
    button.removeEventListener('pointerdown', handlePointerDown);
    button.removeEventListener('pointerup', handlePointerUp);
    button.removeEventListener('focus', handleFocus);
    button.removeEventListener('blur', handleBlur);
  };
};

export const initLiquidButtons = (root: ParentNode = document) => {
  const buttons = Array.from(root.querySelectorAll(LIQUID_BUTTON_SELECTOR)).filter(isHTMLElement);
  const destroyers = buttons.map((button) => createLiquidButton(button));

  return () => {
    destroyers.forEach((destroy) => destroy());
  };
};