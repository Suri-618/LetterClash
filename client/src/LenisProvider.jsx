import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { createLenis, releaseLenis, useLenis } from "./lenisStore";

export default function LenisProvider({ children }) {
  const location = useLocation();
  const progressRef = useRef(null);
  const lenis = useLenis();

  useEffect(() => {
    const current = createLenis();

    return () => releaseLenis(current);
  }, []);

  useEffect(() => {
    if (!lenis) return;

    lenis.scrollTo(0, { immediate: true });

    const bar = progressRef.current;
    if (bar) bar.style.transform = "scaleX(0)";
  }, [lenis, location.pathname]);

  useEffect(() => {
    if (!lenis) return;

    const root = document.documentElement;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileQuery = window.matchMedia("(max-width: 720px)");

    let target = 0;
    let current = 0;
    let frame = 0;
    let running = false;

    const reset = () => {
      target = 0;
      current = 0;
      running = false;

      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      root.style.setProperty("--scroll-velocity", "0");
    };

    const tick = () => {
      target *= 0.86;
      current += (target - current) * 0.22;

      if (Math.abs(current) < 0.001 && Math.abs(target) < 0.001) {
        reset();
        return;
      }

      root.style.setProperty("--scroll-velocity", current.toFixed(4));
      frame = requestAnimationFrame(tick);
    };

    const handleScroll = (instance) => {
      if (
        instance.prefersReducedMotion ||
        motionQuery.matches ||
        mobileQuery.matches
      ) {
        reset();
        return;
      }

      const velocity = Number.isFinite(instance.velocity)
        ? instance.velocity
        : 0;

      target = Math.max(-0.7, Math.min(0.7, velocity / 45));

      if (!running) {
        running = true;
        frame = requestAnimationFrame(tick);
      }
    };

    const handleViewportChange = () => {
      if (motionQuery.matches || mobileQuery.matches) reset();
    };

    lenis.on("scroll", handleScroll);
    motionQuery.addEventListener("change", handleViewportChange);
    mobileQuery.addEventListener("change", handleViewportChange);

    return () => {
      lenis.off("scroll", handleScroll);
      motionQuery.removeEventListener("change", handleViewportChange);
      mobileQuery.removeEventListener("change", handleViewportChange);

      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--scroll-velocity");
    };
  }, [lenis]);

  useEffect(() => {
    if (!lenis) return;

    const updateProgress = (current) => {
      const bar = progressRef.current;
      if (!bar) return;

      const progress = Number.isFinite(current.progress)
        ? current.progress
        : 0;

      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };

    updateProgress(lenis);
    lenis.on("scroll", updateProgress);

    return () => lenis.off("scroll", updateProgress);
  }, [lenis]);

  return (
    <>
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
      {children}
    </>
  );
}
