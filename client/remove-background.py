from pathlib import Path
from PIL import Image

root = Path("public/sprites/frames")
output = Path("public/sprites/transparent-frames")

for fighter in ("cyan-fighter", "purple-fighter"):
    for pose in ("idle", "punch", "hit"):
        folder = root / fighter / pose

        if not folder.exists():
            print(f"Skipping missing folder: {folder}")
            continue

        for source in sorted(folder.glob("frame-*.png")):
            image = Image.open(source).convert("RGBA")
            pixels = image.load()

            for y in range(image.height):
                for x in range(image.width):
                    r, g, b, a = pixels[x, y]

                    if max(r, g, b) < 18:
                        pixels[x, y] = (r, g, b, 0)

            destination = output / fighter / pose / source.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination)

            print(f"Created: {destination}")

print("Finished!")
