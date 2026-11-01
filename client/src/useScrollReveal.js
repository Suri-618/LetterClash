import { useEffect } from "react";

export function useScrollReveal(
  rootRef,
  {
    selector = "[data-reveal]",
    threshold = 0.05,
    rootMargin = "0px 0px -40px 0px",
    stagger = 0,
    refreshKey = "",
  } = {},
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const targets = Array.from(root.querySelectorAll(selector));
    if (!targets.length) return undefined;

    if (stagger > 0) {
      targets.forEach((target, index) => {
        target.style.setProperty("--reveal-delay", `${index * stagger}ms`);
      });
    }

    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold, rootMargin },
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [rootRef, selector, threshold, rootMargin, stagger, refreshKey]);
}
