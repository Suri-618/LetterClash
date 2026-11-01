import { useEffect, useState } from "react";

export default function CountdownTimer({ endsAt, getServerNow }) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!endsAt) return undefined;

    const tick = () => setNow(getServerNow ? getServerNow() : Date.now());
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [endsAt, getServerNow]);

  if (!endsAt) return null;
  if (!getServerNow && !now) return null;

  const serverNow = getServerNow ? getServerNow() : now;
  const seconds = Math.max(0, Math.ceil((endsAt - serverNow) / 1000));

  return (
    <div className="combat-center-overlay countdown-combat" key={seconds}>
      <span className="combat-overlay-label">GET READY</span>
      <div className="combat-target-letter">
        {seconds > 0 ? seconds : "GO!"}
      </div>
      <span className="combat-overlay-hint">PREPARE TO STRIKE</span>
    </div>
  );
}
