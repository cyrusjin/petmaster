from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
HOME_OUT = ROOT / "miniprogram" / "images" / "home"
CARD_OUT = ROOT / "miniprogram" / "images" / "card"
TAB_OUT = ROOT / "miniprogram" / "images" / "tab"

CREAM = "#FFF7EF"
PANEL = "#FFFDF8"
INK = "#5B4535"
MUTED = "#A98972"
PEACH = "#F49B69"
PEACH_DARK = "#DF7E4B"
GOLD = "#E8BA6A"
LATTE = "#D5AA82"
PAW = "#8A6B55"
GREEN = "#B9D7B1"
LINE = "#EFDAC7"
GRAY = "#B9A89B"


def ensure_dirs():
    for folder in (HOME_OUT, CARD_OUT, TAB_OUT):
        folder.mkdir(parents=True, exist_ok=True)


def canvas(width, height, color=None):
    return Image.new("RGBA", (width, height), color or (0, 0, 0, 0))


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadowed_panel(img, box, radius=28, fill=PANEL, shadow=(138, 101, 72, 28), offset=(0, 8), blur=18):
    layer = canvas(*img.size)
    d = ImageDraw.Draw(layer)
    sx0, sy0, sx1, sy1 = box
    ox, oy = offset
    d.rounded_rectangle((sx0 + ox, sy0 + oy, sx1 + ox, sy1 + oy), radius=radius, fill=shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(layer)
    ImageDraw.Draw(img).rounded_rectangle(box, radius=radius, fill=fill, outline=(255, 255, 255, 210), width=2)


def dog(draw, cx, cy, scale=1.0):
    s = scale
    def b(x0, y0, x1, y1):
        return (cx + x0 * s, cy + y0 * s, cx + x1 * s, cy + y1 * s)

    draw.ellipse(b(-48, 6, 48, 78), fill="#C98955")
    draw.ellipse(b(-76, -18, -34, 52), fill="#B97849")
    draw.ellipse(b(34, -18, 76, 52), fill="#B97849")
    draw.ellipse(b(-55, -34, 55, 58), fill="#D99A62")
    draw.ellipse(b(-36, -18, -14, 6), fill="#3E2E25")
    draw.ellipse(b(14, -18, 36, 6), fill="#3E2E25")
    draw.ellipse(b(-9, 2, 9, 17), fill="#3A2B23")
    draw.arc(b(-22, 7, 0, 31), start=8, end=88, fill="#5C3A2A", width=max(2, int(3 * s)))
    draw.arc(b(0, 7, 22, 31), start=92, end=172, fill="#5C3A2A", width=max(2, int(3 * s)))
    draw.ellipse(b(-31, 13, -16, 25), fill="#E8AE82")
    draw.ellipse(b(16, 13, 31, 25), fill="#E8AE82")
    draw.rounded_rectangle(b(-34, 46, 34, 67), radius=int(10 * s), fill="#79A7B0")
    draw.polygon([(cx - 12 * s, cy + 67 * s), (cx + 12 * s, cy + 67 * s), (cx, cy + 84 * s)], fill=GOLD)


def paw(draw, cx, cy, size, color):
    r = size
    draw.ellipse((cx - r, cy, cx + r, cy + r * 1.5), fill=color)
    for dx, dy in [(-1.2, -0.5), (-0.4, -1.0), (0.4, -1.0), (1.2, -0.5)]:
        draw.ellipse((cx + dx * r - r * 0.36, cy + dy * r - r * 0.36, cx + dx * r + r * 0.36, cy + dy * r + r * 0.36), fill=color)


def calendar(draw, x, y, w, h, scale=1.0):
    rounded(draw, (x, y, x + w, y + h), int(18 * scale), "#FFE7CB", PEACH, max(2, int(3 * scale)))
    rounded(draw, (x, y, x + w, y + h * 0.28), int(18 * scale), "#F7A46F")
    for i in range(4):
        draw.rounded_rectangle((x + 18 * scale + i * 28 * scale, y - 10 * scale, x + 28 * scale + i * 28 * scale, y + 20 * scale), radius=int(5 * scale), fill="#D7B08A")
    for row in range(2):
        for col in range(3):
            cx = x + 26 * scale + col * 34 * scale
            cy = y + 48 * scale + row * 26 * scale
            draw.ellipse((cx, cy, cx + 10 * scale, cy + 10 * scale), fill="#E9B987")
    draw.ellipse((x + w * 0.54, y + h * 0.47, x + w * 0.92, y + h * 0.85), fill="#FFF7EF", outline=PEACH, width=max(2, int(3 * scale)))
    draw.line((x + w * 0.63, y + h * 0.65, x + w * 0.71, y + h * 0.73, x + w * 0.84, y + h * 0.56), fill=PEACH_DARK, width=max(3, int(4 * scale)), joint="curve")


def gift(draw, x, y, size):
    rounded(draw, (x, y + size * 0.25, x + size, y + size), int(size * 0.12), "#F3C48D", "#DDA566", 2)
    draw.rectangle((x + size * 0.42, y + size * 0.25, x + size * 0.58, y + size), fill="#F48C71")
    draw.rectangle((x, y + size * 0.42, x + size, y + size * 0.57), fill="#F48C71")
    draw.ellipse((x + size * 0.2, y, x + size * 0.5, y + size * 0.32), outline="#F48C71", width=max(2, int(size * 0.05)))
    draw.ellipse((x + size * 0.5, y, x + size * 0.8, y + size * 0.32), outline="#F48C71", width=max(2, int(size * 0.05)))


def save_home_hero():
    img = canvas(640, 350, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    shadowed_panel(img, (18, 34, 622, 330), radius=42, fill="#FFF6EA", shadow=(158, 108, 69, 30), offset=(0, 10), blur=24)
    d.ellipse((42, 238, 470, 314), fill="#F5DDC8")
    d.ellipse((96, 212, 420, 300), fill="#FFF7EF")
    d.ellipse((128, 236, 370, 288), fill="#F3D8BE")
    d.rounded_rectangle((426, 116, 588, 238), radius=28, fill="#FFFDF8", outline="#F2DAC4", width=2)
    paw(d, 478, 171, 11, "#D7A16B")
    d.ellipse((456, 262, 508, 310), fill="#F0C777")
    d.ellipse((438, 252, 478, 300), fill="#F4D88D")
    d.ellipse((486, 250, 534, 298), fill="#EAB96A")
    dog(d, 278, 128, 1.55)
    img.save(HOME_OUT / "home-hero-pet.png")


def save_reserve_art():
    img = canvas(320, 188, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((12, 130, 286, 174), fill="#F0D8BE")
    calendar(d, 88, 26, 150, 118, 1.1)
    d.ellipse((30, 60, 72, 102), fill="#F5C65A")
    d.polygon([(50, 50), (86, 112), (18, 112)], fill="#F2B94A")
    d.rectangle((48, 100, 54, 154), fill="#C89D70")
    d.arc((216, 96, 294, 176), 185, 350, fill="#B88B68", width=8)
    d.ellipse((280, 122, 304, 146), fill="#D0A57D")
    img.save(HOME_OUT / "reserve-art.png")


def save_health_art():
    img = canvas(260, 190, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((24, 138, 220, 174), fill="#EAD5C2")
    d.ellipse((72, 68, 170, 132), fill="#F0E7DB")
    d.ellipse((142, 50, 206, 104), fill="#F0E7DB")
    d.polygon([(190, 60), (228, 40), (210, 82)], fill="#B68964")
    d.ellipse((190, 70, 201, 81), fill="#47362D")
    d.ellipse((204, 88, 214, 96), fill="#5B4535")
    d.arc((196, 92, 222, 112), 190, 340, fill="#7C5843", width=2)
    d.rectangle((86, 126, 98, 158), fill="#D9B996")
    d.rectangle((142, 126, 154, 158), fill="#D9B996")
    d.arc((50, 88, 84, 132), 110, 265, fill="#C89A73", width=6)
    paw(d, 42, 50, 7, "#F2D8C6")
    paw(d, 210, 126, 6, "#F2D8C6")
    img.save(HOME_OUT / "health-art.png")


def save_points_art():
    img = canvas(260, 190, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((26, 140, 226, 174), fill="#EBD5BF")
    gift(d, 86, 56, 94)
    d.ellipse((168, 34, 218, 84), fill="#FFE1D9")
    d.ellipse((178, 44, 196, 62), fill="#F49B69")
    d.ellipse((195, 50, 210, 66), fill="#F49B69")
    d.polygon([(46, 48), (54, 68), (74, 70), (58, 82), (64, 102), (46, 90), (28, 102), (34, 82), (18, 70), (38, 68)], fill="#F5C65A")
    img.save(HOME_OUT / "points-art.png")


def save_card_icon(name, kind):
    img = canvas(96, 96, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rounded(d, (6, 6, 90, 90), 24, "#FFF4E9", "#F3D7C1", 2)
    if kind == "reserve":
        calendar(d, 24, 24, 48, 44, 0.45)
        d.ellipse((54, 52, 75, 73), fill="#FFFDF8", outline=PEACH, width=2)
        d.line((60, 63, 65, 68, 72, 58), fill=PEACH_DARK, width=3)
    elif kind == "pets":
        paw(d, 48, 43, 13, PAW)
    elif kind == "orders":
        rounded(d, (30, 22, 66, 72), 8, "#FFFDF8", PAW, 3)
        d.line((38, 38, 58, 38), fill=PEACH_DARK, width=3)
        d.line((38, 50, 58, 50), fill=PEACH_DARK, width=3)
        d.line((38, 62, 50, 62), fill=PEACH_DARK, width=3)
    elif kind == "check":
        d.ellipse((24, 24, 72, 72), outline=GREEN, width=6)
        d.line((36, 49, 45, 58, 62, 38), fill="#77A16C", width=6)
    elif kind == "stats":
        for x, h, c in [(30, 28, PEACH), (44, 42, GOLD), (58, 22, GREEN)]:
            rounded(d, (x, 70 - h, x + 9, 70), 5, c)
        d.line((24, 70, 74, 70), fill=PAW, width=3)
    elif kind == "camera":
        rounded(d, (24, 32, 72, 66), 9, "#FFFDF8", PAW, 3)
        d.ellipse((39, 42, 57, 60), outline=PEACH_DARK, width=3)
    else:
        paw(d, 48, 42, 10, PAW)
        d.line((59, 30, 72, 30, 72, 43), fill=PEACH_DARK, width=3)
        d.line((72, 30, 58, 44), fill=PEACH_DARK, width=3)
    img.save(CARD_OUT / f"{name}.png")


def tab_icon(name, active=False):
    img = canvas(81, 81, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = PEACH_DARK if active else GRAY
    fill = "#FFF0E5" if active else None
    if active:
        d.ellipse((14, 8, 67, 61), fill=fill)
    if name == "tab-home":
        d.polygon([(40, 16), (18, 36), (18, 62), (33, 62), (33, 47), (48, 47), (48, 62), (63, 62), (63, 36)], fill=c if active else None, outline=c)
        if not active:
            d.line((33, 62, 33, 47, 48, 47, 48, 62), fill=c, width=3)
    elif name == "tab-order":
        rounded(d, (23, 19, 58, 64), 8, c if active else None, c, 3)
        d.line((31, 36, 50, 36), fill="#FFFFFF" if active else c, width=3)
        d.line((31, 48, 50, 48), fill="#FFFFFF" if active else c, width=3)
    elif name == "tab-daily":
        rounded(d, (17, 24, 64, 59), 9, c if active else None, c, 3)
        d.ellipse((28, 34, 44, 50), outline="#FFFFFF" if active else c, width=3)
        d.line((45, 51, 53, 43, 60, 52), fill="#FFFFFF" if active else c, width=3)
    elif name == "tab-shop":
        d.polygon([(19, 34), (25, 21), (56, 21), (62, 34)], fill=c if active else None, outline=c)
        rounded(d, (21, 34, 60, 62), 6, c if active else None, c, 3)
        d.arc((30, 20, 51, 43), 180, 360, fill="#FFFFFF" if active else c, width=3)
    elif name == "tab-mine":
        d.ellipse((30, 18, 51, 39), fill=c if active else None, outline=c, width=3)
        d.arc((21, 42, 60, 72), 185, 355, fill=c, width=4)
    img.save(TAB_OUT / f"{name}{'-active' if active else ''}.png")


def main():
    ensure_dirs()
    save_home_hero()
    save_reserve_art()
    save_health_art()
    save_points_art()
    for name, kind in {
        "card-reserve": "reserve",
        "card-pets": "pets",
        "card-orders": "orders",
        "card-check": "check",
        "card-stats": "stats",
        "card-camera": "camera",
        "card-share-guest": "share",
        "card-share-staff": "share",
        "card-settings": "settings",
    }.items():
        save_card_icon(name, kind)
    for name in ("tab-home", "tab-order", "tab-daily", "tab-shop", "tab-mine"):
        tab_icon(name, False)
        tab_icon(name, True)
    print("generated warm UI assets")


if __name__ == "__main__":
    main()
