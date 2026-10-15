# -*- coding: utf-8 -*-
"""用 art/bibo-app-icon.png 產生 PWA 圖示（Pillow）。輸出到 public/icons/ 與 public/。
用法：python scripts/build_icons.py
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'art', 'bibo-app-icon.png')
OUT = os.path.join(ROOT, 'public')
BG = (255, 255, 255)


def load_crop():
    im = Image.open(SRC).convert('RGBA')
    base = Image.new('RGBA', im.size, BG + (255,))
    base.alpha_composite(im)
    rgb = base.convert('RGB')
    # 原圖四周有一圈很淡的圓角方框陰影，把接近白色的像素全部洗成純白
    pix = rgb.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = pix[x, y]
            if min(r, g, b) >= 236:
                pix[x, y] = BG
    # 找出非白色內容的外框
    px = rgb.load()
    w, h = rgb.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r + g + b < 720:
                xs.append(x)
                ys.append(y)
    return rgb.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def make(crop, size, fill):
    """fill = 圖案佔畫布邊長的比例。maskable 用較小的比例以符合安全區。"""
    canvas = Image.new('RGB', (size, size), BG)
    target = int(size * fill)
    scale = target / max(crop.size)
    d = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    canvas.paste(d, ((size - d.width) // 2, (size - d.height) // 2))
    return canvas


def main():
    crop = load_crop()
    os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
    make(crop, 192, 0.80).save(os.path.join(OUT, 'icons', 'icon-192.png'), optimize=True)
    make(crop, 512, 0.80).save(os.path.join(OUT, 'icons', 'icon-512.png'), optimize=True)
    make(crop, 192, 0.60).save(os.path.join(OUT, 'icons', 'maskable-192.png'), optimize=True)
    make(crop, 512, 0.60).save(os.path.join(OUT, 'icons', 'maskable-512.png'), optimize=True)
    make(crop, 180, 0.80).save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
    make(crop, 64, 0.90).save(os.path.join(OUT, 'favicon.png'), optimize=True)
    print('icons done')


if __name__ == '__main__':
    main()
