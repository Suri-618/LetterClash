import { useEffect, useState } from "react";

const FRAME_COUNT = 8;
const DEFAULT_FRAME_DURATION = 100;
const POSE_FRAME_DURATION = { idle: 100, punch: 35, hit: 45 };

export default function ArcadeFighter({
  color = "cyan-fighter",
  pose = "idle",
  facing = "right",
  frameDuration,
  animationId = null,
  className = "",
}) {
  const [frame, setFrame] = useState(0);
  const [displayPose, setDisplayPose] = useState(pose);

  useEffect(() => {
    let currentFrame = 0;
    let timer;

    const duration =
      frameDuration ?? POSE_FRAME_DURATION[pose] ?? DEFAULT_FRAME_DURATION;

    const loopIdle = () => {
      timer = window.setInterval(() => {
        currentFrame = (currentFrame + 1) % FRAME_COUNT;
        setFrame(currentFrame);
      }, POSE_FRAME_DURATION.idle);
    };

    setFrame(0);
    setDisplayPose(pose);

    if (pose === "idle") {
      timer = window.setInterval(() => {
        currentFrame = (currentFrame + 1) % FRAME_COUNT;
        setFrame(currentFrame);
      }, duration);

      return () => window.clearInterval(timer);
    }

    timer = window.setInterval(() => {
      currentFrame += 1;

      if (currentFrame >= FRAME_COUNT) {
        window.clearInterval(timer);
        setFrame(0);
        setDisplayPose("idle");
        currentFrame = 0;
        loopIdle();
        return;
      }

      setFrame(currentFrame);
    }, duration);

    return () => window.clearInterval(timer);
  }, [pose, animationId, frameDuration]);

  const src = `/sprites/transparent-frames/${color}/${displayPose}/frame-${String(
    frame
  ).padStart(2, "0")}.png`;

  return (
    <img
      className={`arcade-fighter-sprite ${className}`}
      src={src}
      alt={`${color.replace("-fighter", "")} fighter ${displayPose}`}
      draggable={false}
      style={{
        transform: facing === "left" ? "scaleX(-1)" : "none",
        imageRendering: "pixelated",
      }}
    />
  );
}
