from pathlib import Path
from PIL import Image

root = Path("public/sprites")
output = root / "frames"
frame_count = 8

for fighter in ("cyan-fighter", "purple-fighter"):
    for pose in ("idle", "punch", "hit"):
        source = root / fighter / f"{pose}.png"

        if not source.exists():
            print(f"Missing: {source}")
            continue

        image = Image.open(source).convert("RGB")
        width, height = image.size

        if width % frame_count != 0:
            print(f"Skipping unexpected dimensions: {source} {image.size}")
            continue

        frame_width = width // frame_count
        destination = output / fighter / pose
        destination.mkdir(parents=True, exist_ok=True)

        for index in range(frame_count):
            frame = image.crop((
                index * frame_width,
                0,
                (index + 1) * frame_width,
                height
            ))
            frame.save(destination / f"frame-{index:02d}.png")

        print(f"Created {frame_count} frames: {destination}")

