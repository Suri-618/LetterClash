import { useEffect, useState } from "react";

export default function RoundTimer({
  deadline,
  getServerNow,
  className = "combat-overlay-timer",
}) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!deadline) return undefined;

    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  if (!getServerNow && !now) return null;

  const serverNow = getServerNow ? getServerNow() : now;
  const remaining = Math.max(0, (deadline - serverNow) / 1000);

  return <span className={className}>{remaining.toFixed(1)}s</span>;
}
