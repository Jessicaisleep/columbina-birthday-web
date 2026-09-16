"""生成站点图标（favicon / apple-touch-icon）。

源图：columbina-game/p/event/brand-icon.png（小游戏左上角那枚月牙徽记，256×256 透明 PNG）
用途：主站与生日会相关页面统一的站点图标 —— 以后新页面也都从这张图生成，不要再另找素材。

用法（在本项目根目录）：
    python scripts/make-favicon.py
产物（写进 public/ 与 columbina-game/public/，构建时会被各自原样复制到产物根目录）：
    public/favicon.ico            16/24/32/48/64 多尺寸，兼容老浏览器与直接访问 /favicon.ico
    public/favicon.png            192×192，现代浏览器
    public/apple-touch-icon.png   180×180，iOS 添加到主屏

脚本会把四周的透明留白裁掉（保留 6% 内边距）再缩放，这样 16×16 的标签页图标也看得清月牙。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "columbina-game" / "p" / "event" / "brand-icon.png"
# 主站 + 小游戏（各自独立发布，所以两处都要放一份）
OUT_DIRS = [ROOT / "public", ROOT / "columbina-game" / "public"]

PAD_RATIO = 0.06  # 裁剪后四周补的内边距比例


def load_square_icon(size: int) -> Image.Image:
    """读源图 → 裁掉透明留白 → 补成正方形并留一点边距 → 缩放到目标尺寸。"""
    img = Image.open(SRC).convert("RGBA")
    bbox = img.getbbox()  # 非透明区域
    if bbox:
        img = img.crop(bbox)

    side = max(img.size)
    pad = int(side * PAD_RATIO)
    canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"找不到源图：{SRC}")

    ico = load_square_icon(256)
    png192 = load_square_icon(192)
    touch180 = load_square_icon(180)

    for out in OUT_DIRS:
        out.mkdir(parents=True, exist_ok=True)
        ico.save(out / "favicon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)])
        png192.save(out / "favicon.png", optimize=True)
        touch180.save(out / "apple-touch-icon.png", optimize=True)
        for name in ("favicon.ico", "favicon.png", "apple-touch-icon.png"):
            p = out / name
            print(f"{p.relative_to(ROOT)}  {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
