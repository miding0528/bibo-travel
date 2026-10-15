# -*- coding: utf-8 -*-
r"""字體子集化：Noto Serif TC（400/500/700/900）與 Material Symbols Outlined。

來源字體不放進 repo（太大）。要重跑請先：
    npm i --no-save @expo-google-fonts/noto-serif-tc material-symbols
    pip install fonttools brotli openpyxl
    python scripts/build_fonts.py            # 內文字集 = 原型 HTML + 試算表 + content\*.md + seed.json + 固定字集
    python scripts/build_fonts.py --common   # 再加上 Big5 常用字 5401 字（Lena 自己在 App 內輸入的字比較不會缺字）

輸出：src/fonts/NotoSerifTC-{400,500,700,900}.woff2、MaterialSymbolsOutlined.woff2、charset.txt
"""
import argparse
import glob
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BIBO = os.path.dirname(ROOT)          # ...\bibo-travel
OUT = os.path.join(ROOT, 'src', 'fonts')
NM = os.path.join(ROOT, 'node_modules')

WEIGHTS = {400: '400Regular', 500: '500Medium', 700: '700Bold', 900: '900Black'}


def read(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()


def collect_text(common):
    chunks = []
    # 1) 現行 App 的 HTML 殼（含 JS 內所有字串）
    for p in (os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'src', 'main.js'),
              os.path.join(BIBO, 'prototype-v3', 'index.html')):
        if os.path.exists(p):
            chunks.append(read(p))
    # 2) seed.json
    p = os.path.join(ROOT, 'src', 'data', 'seed.json')
    if os.path.exists(p):
        chunks.append(read(p))
    # 3) 試算表所有文字儲存格
    xp = os.path.join(BIBO, 'sheet', 'bibo-travel-data.xlsx')
    if os.path.exists(xp):
        import openpyxl
        wb = openpyxl.load_workbook(xp, read_only=True, data_only=True)
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                for v in row:
                    if isinstance(v, str):
                        chunks.append(v)
    # 4) content\*.md（只取最上層）
    for p in glob.glob(os.path.join(BIBO, 'content', '*.md')):
        chunks.append(read(p))
    text = ''.join(chunks)
    chars = set(text)
    # 固定字集：ASCII、Latin-1 標點、一般標點、CJK 標點、全形、箭頭與常用符號
    for lo, hi in [(0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x2190, 0x21FF), (0x2460, 0x24FF),
                   (0x25A0, 0x25FF), (0x2600, 0x26FF), (0x3000, 0x303F), (0xFF00, 0xFFEF), (0xFE30, 0xFE4F)]:
        chars.update(chr(c) for c in range(lo, hi + 1))
    chars.update('一二三四五六七八九十百千萬零〇日月年週周時分秒元圓點')
    chars.update('週一週二週三週四週五週六週日星期')
    if common:
        # Big5 Level 1：0xA440–0xC67E，共 5401 個常用繁體字
        for hi in range(0xA4, 0xC7):
            for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
                try:
                    chars.add(bytes([hi, lo]).decode('big5'))
                except Exception:
                    pass
    # 去掉控制字元
    chars = {c for c in chars if ord(c) >= 0x20 and c not in '  ​﻿'}
    return ''.join(sorted(chars))


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr)
        sys.exit(r.returncode)


def build_serif(text):
    os.makedirs(OUT, exist_ok=True)
    tpath = os.path.join(OUT, 'charset.txt')
    with open(tpath, 'w', encoding='utf-8') as f:
        f.write(text)
    sizes = {}
    for w, folder in WEIGHTS.items():
        src = os.path.join(NM, '@expo-google-fonts', 'noto-serif-tc', folder, 'NotoSerifTC_%s.ttf' % folder)
        dst = os.path.join(OUT, 'NotoSerifTC-%d.woff2' % w)
        run([sys.executable, '-m', 'fontTools.subset', src, '--text-file=' + tpath, '--flavor=woff2',
             '--layout-features=kern,liga,locl,ccmp,mark,mkmk,palt,halt', '--no-hinting', '--output-file=' + dst])
        sizes[w] = os.path.getsize(dst)
    os.remove(tpath)  # charset 只在建置時用；要看字集請重跑
    return sizes


def icon_names():
    """從 index.html、main.js、seed.json 找出所有出現過、且是 Material Symbols 圖示名稱的字串。"""
    from fontTools.ttLib import TTFont
    src = os.path.join(NM, 'material-symbols', 'material-symbols-outlined.woff2')
    f = TTFont(src)
    glyphs = set(f.getGlyphOrder())
    blob = ''
    for p in (os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'src', 'main.js'),
              os.path.join(ROOT, 'src', 'data', 'seed.json')):
        if os.path.exists(p):
            blob += read(p)
    toks = set(re.findall(r'[a-z][a-z0-9_]+', blob))
    return sorted(t for t in toks if t in glyphs), f


def build_icons():
    """Material Symbols：釘死 wght=400、opsz=24、GRAD=0，保留 FILL 軸（原型有用 FILL 1），
    只留下用到的圖示（連字規則也一併刪掉其他圖示）。"""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools import subset
    names, _ = icon_names()
    src = os.path.join(NM, 'material-symbols', 'material-symbols-outlined.woff2')
    f = TTFont(src)
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in f['fvar'].axes}
    print('  圖示字型軸：', axes)
    limits = {}
    if 'wght' in axes:
        limits['wght'] = 400
    if 'opsz' in axes:
        limits['opsz'] = 24
    if 'GRAD' in axes:
        limits['GRAD'] = 0
    f = instancer.instantiateVariableFont(f, limits)
    import io
    buf = io.BytesIO()
    f.save(buf)          # 存一次再讀回來，避免 lazy 載入的 gvar 少字形造成 KeyError
    buf.seek(0)
    f = TTFont(buf)
    # 只留用到的連字
    keep = set(names)
    gsub = f['GSUB'].table
    for lookup in gsub.LookupList.Lookup:
        for st in lookup.SubTable:
            if hasattr(st, 'ExtSubTable'):
                st = st.ExtSubTable
            if getattr(st, 'LookupType', None) == 4 or hasattr(st, 'ligatures'):
                for first, ligs in list(st.ligatures.items()):
                    ligs[:] = [l for l in ligs if l.LigGlyph in keep]
                    if not ligs:
                        del st.ligatures[first]
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['liga', 'rlig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'kern']
    opts.glyph_names = True
    opts.notdef_outline = True
    opts.hinting = False
    opts.drop_tables += ['DSIG']
    sub = subset.Subsetter(opts)
    letters = 'abcdefghijklmnopqrstuvwxyz0123456789_'
    sub.populate(glyphs=list(keep), unicodes=[ord(c) for c in letters])
    sub.subset(f)
    dst = os.path.join(OUT, 'MaterialSymbolsOutlined.woff2')
    os.makedirs(OUT, exist_ok=True)
    f.flavor = 'woff2'
    f.save(dst)
    return len(names), os.path.getsize(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--common', action='store_true', help='再加入 Big5 常用字 5401 字')
    ap.add_argument('--only', choices=['serif', 'icons'], default=None)
    args = ap.parse_args()
    if args.only != 'icons':
        text = collect_text(args.common)
        print('Noto Serif TC 字集：%d 個字元' % len(text))
        sizes = build_serif(text)
        for w, s in sizes.items():
            print('  NotoSerifTC-%d.woff2  %.1f KB' % (w, s / 1024))
        print('  合計 %.1f KB' % (sum(sizes.values()) / 1024))
    if args.only != 'serif':
        n, s = build_icons()
        print('Material Symbols：%d 個圖示，%.1f KB' % (n, s / 1024))


if __name__ == '__main__':
    main()
