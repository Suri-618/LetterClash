import { useSyncExternalStore } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

const lenisOptions = {
  autoRaf: true,
  autoToggle: true,
  anchors: true,
  stopInertiaOnNavigate: true,
  respectReducedMotion: true,
};

let instance = null;
const subscribers = new Set();

function notify() {
  for (const subscriber of subscribers) subscriber();
}

export function subscribeLenis(subscriber) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function getLenis() {
  return instance;
}

export function createLenis() {
  if (!instance) {
    instance = new Lenis(lenisOptions);
    notify();
  }

  return instance;
}

export function releaseLenis(current) {
  if (!current || instance !== current) return;

  current.destroy();
  instance = null;
  notify();
}

export function useLenis() {
  return useSyncExternalStore(subscribeLenis, getLenis, getLenis);
}
