#!/usr/bin/env python3
"""
Generate macOS, Windows, and Web application icons for SHAI from the new logo emblem.
Produces:
  - macOS .icns (10 standard sizes: 16x16 to 1024x1024 @2x)
  - Windows .ico (16, 24, 32, 48, 64, 128, 256)
  - Web favicon.ico
  - Master PNG icons (1024x1024 and 512x512)
"""

import os
import shutil
import subprocess
import tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

def generate_icons():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    public_dir = os.path.join(root_dir, "public")
    electron_assets_dir = os.path.join(root_dir, "electron", "assets")
    build_dir = os.path.join(root_dir, "build")
    app_dir = os.path.join(root_dir, "app")

    os.makedirs(electron_assets_dir, exist_ok=True)
    os.makedirs(build_dir, exist_ok=True)

    glyph_path = os.path.join(public_dir, "shai-logo-glyph.png")
    if not os.path.exists(glyph_path):
        raise FileNotFoundError(f"Glyph not found at {glyph_path}")

    print(f"Loading logo glyph: {glyph_path}")
    glyph = Image.open(glyph_path).convert("RGBA")

    # Feather bottom 42 pixels of glyph to eliminate the flat crop edge
    arr = np.array(glyph, dtype=np.float32)
    h = arr.shape[0]
    feather_start = h - 42
    for y in range(feather_start, h):
        factor = (h - 1 - y) / (h - 1 - feather_start)
        arr[y, :, 3] *= factor
    glyph_clean = Image.fromarray(arr.astype(np.uint8))

    bbox = glyph_clean.getbbox()
    glyph_cropped = glyph_clean.crop(bbox)

    CANVAS_SIZE = 1024
    TILE_SIZE = 824
    RADIUS = 185
    OFFSET = (CANVAS_SIZE - TILE_SIZE) // 2

    # 1. Supersampled squircle mask (4x)
    scale = 4
    s_tile = TILE_SIZE * scale
    s_radius = RADIUS * scale
    mask_hi = Image.new("L", (s_tile, s_tile), 0)
    d_hi = ImageDraw.Draw(mask_hi)
    d_hi.rounded_rectangle((0, 0, s_tile, s_tile), radius=s_radius, fill=255)
    tile_mask = mask_hi.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)

    # 2. Squircle background gradient: deep rich dark slate #18192C -> #090A12
    tile_bg = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    top_color = (24, 25, 44)
    bot_color = (9, 10, 18)
    for y in range(TILE_SIZE):
        t = y / (TILE_SIZE - 1)
        r = int(top_color[0] * (1 - t) + bot_color[0] * t)
        g = int(top_color[1] * (1 - t) + bot_color[1] * t)
        b = int(top_color[2] * (1 - t) + bot_color[2] * t)
        for x in range(TILE_SIZE):
            tile_bg.putpixel((x, y), (r, g, b, 255))

    # 3. Delicate inner border / rim highlight
    rim_hi = Image.new("RGBA", (s_tile, s_tile), (0, 0, 0, 0))
    d_rim = ImageDraw.Draw(rim_hi)
    d_rim.rounded_rectangle((0, 0, s_tile - 1, s_tile - 1), radius=s_radius, outline=(255, 255, 255, 140), width=6)
    rim = rim_hi.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    for y in range(TILE_SIZE):
        fade = max(0.1, 1.0 - (y / TILE_SIZE) * 0.9)
        for x in range(TILE_SIZE):
            px = rim.getpixel((x, y))
            if px[3] > 0:
                rim.putpixel((x, y), (px[0], px[1], px[2], int(px[3] * fade)))
    tile_bg = Image.alpha_composite(tile_bg, rim)

    # 4. Scale glyph and place inside tile
    gw = 630
    gh = int(glyph_cropped.size[1] * (gw / glyph_cropped.size[0]))
    glyph_scaled = glyph_cropped.resize((gw, gh), Image.Resampling.LANCZOS)

    enhancer = ImageEnhance.Contrast(glyph_scaled)
    glyph_boosted = enhancer.enhance(1.15)
    brightener = ImageEnhance.Brightness(glyph_boosted)
    glyph_boosted = brightener.enhance(1.08)

    gx = (TILE_SIZE - gw) // 2
    gy = (TILE_SIZE - gh) // 2

    # Subtle neon glow behind the neural hexagon
    glyph_glow = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    glyph_glow.paste(glyph_scaled, (gx, gy), glyph_scaled)
    glow_data = []
    for p in glyph_glow.get_flattened_data():
        glow_data.append((139, 124, 246, int(p[3] * 0.35)))
    glyph_glow = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    glyph_glow.putdata(glow_data)
    glyph_glow = glyph_glow.filter(ImageFilter.GaussianBlur(16))

    tile_bg = Image.alpha_composite(tile_bg, glyph_glow)
    tile_bg.paste(glyph_boosted, (gx, gy), glyph_boosted)

    tile_masked = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    tile_masked.paste(tile_bg, (0, 0), tile_mask)

    # 5. Composite onto 1024x1024 canvas with authentic macOS ambient shadow
    master_1024 = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    shadow_mask = Image.new("L", (CANVAS_SIZE, CANVAS_SIZE), 0)
    shadow_mask.paste(tile_mask, (OFFSET, OFFSET + 16))
    shadow_canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    shadow_canvas.paste(Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 95)), (0, 0), shadow_mask)
    shadow_canvas = shadow_canvas.filter(ImageFilter.GaussianBlur(24))

    master_1024 = Image.alpha_composite(master_1024, shadow_canvas)
    master_1024.paste(tile_masked, (OFFSET, OFFSET), tile_masked)

    # Save PNG masters
    master_512 = master_1024.resize((512, 512), Image.Resampling.LANCZOS)

    paths_png = [
        os.path.join(electron_assets_dir, "icon.png"),
        os.path.join(build_dir, "icon.png"),
    ]
    for p in paths_png:
        master_1024.save(p, "PNG")
        print(f"Saved: {p}")

    master_512.save(os.path.join(electron_assets_dir, "icon-512.png"), "PNG")
    print(f"Saved: {os.path.join(electron_assets_dir, 'icon-512.png')}")

    # Generate macOS .icns via iconutil
    with tempfile.TemporaryDirectory() as tmpdir:
        iconset_dir = os.path.join(tmpdir, "icon.iconset")
        os.makedirs(iconset_dir, exist_ok=True)

        icns_sizes = [
            ("icon_16x16.png", 16),
            ("icon_16x16@2x.png", 32),
            ("icon_32x32.png", 32),
            ("icon_32x32@2x.png", 64),
            ("icon_128x128.png", 128),
            ("icon_128x128@2x.png", 256),
            ("icon_256x256.png", 256),
            ("icon_256x256@2x.png", 512),
            ("icon_512x512.png", 512),
            ("icon_512x512@2x.png", 1024),
        ]

        for filename, sz in icns_sizes:
            resized = master_1024.resize((sz, sz), Image.Resampling.LANCZOS)
            resized.save(os.path.join(iconset_dir, filename), "PNG")

        tmp_icns = os.path.join(tmpdir, "icon.icns")
        cmd = ["iconutil", "-c", "icns", iconset_dir, "-o", tmp_icns]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"iconutil failed: {res.stderr}")

        shutil.copyfile(tmp_icns, os.path.join(electron_assets_dir, "icon.icns"))
        shutil.copyfile(tmp_icns, os.path.join(build_dir, "icon.icns"))
        print(f"Generated macOS icns: {os.path.join(electron_assets_dir, 'icon.icns')}")
        print(f"Generated macOS icns: {os.path.join(build_dir, 'icon.icns')}")

    # Generate multi-size .ico (Windows + Web)
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_paths = [
        os.path.join(electron_assets_dir, "icon.ico"),
        os.path.join(build_dir, "icon.ico"),
        os.path.join(app_dir, "favicon.ico"),
    ]
    for p in ico_paths:
        master_1024.save(p, format="ICO", sizes=ico_sizes)
        print(f"Saved ICO: {p}")

    print("Icon generation completed successfully!")

if __name__ == "__main__":
    generate_icons()
