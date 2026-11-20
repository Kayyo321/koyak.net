"""Print both sides of an unfolded plane, and register the ink maps to its relief.
Run with python3 art/paper.py (NumPy, SciPy and Pillow). The drawing uses a
440 × 544 sheet, printed at double resolution for high-density displays.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import distance_transform_edt, gaussian_filter

OUT = Path(__file__).resolve().parents[1] / "site" / "assets"
W, H = 440, 544
PRINT_SCALE = 2
SIZE = (W * PRINT_SCALE, H * PRINT_SCALE)
rng = np.random.default_rng(1926)
y, x = np.mgrid[:SIZE[1], :SIZE[0]].astype(np.float32) / PRINT_SCALE


def cloud(spacing):
    grid = rng.integers(0, 256, (max(3, H // spacing), max(3, W // spacing)), dtype=np.uint8)
    field = Image.fromarray(grid).resize(SIZE, Image.Resampling.BICUBIC)
    return np.asarray(field, dtype=np.float32) / 127.5 - 1


# Ring of the actual sheet. The short straight chamfer at the foot is the turned ear.
edge = [(16,10),(39,8),(78,9),(118,6),(165,9),(207,7),(224,4),(249,6),
        (287,9),(322,9),(369,13),(398,11),(418,15),(426,21),(430,52),
        (428,97),(432,118),(429,154),(433,190),(430,213),(426,236),
        (430,266),(432,314),(429,336),(434,370),(431,407),(433,440),
        (428,466),(428,497),(393,532),(368,534),(338,530),(309,534),
        (279,531),(239,535),(210,530),(168,533),(143,530),(122,533),
        (87,530),(61,532),(35,527),(18,526),(12,517),(13,495),(9,464),
        (12,429),(7,402),(11,378),(9,343),(13,301),(8,273),(10,241),
        (5,204),(10,177),(8,144),(12,115),(7,83),(9,56),(6,38),(10,22)]
perimeter = []
for start, end in zip(edge, edge[1:] + edge[:1]):
    a, b = np.array(start), np.array(end)
    length = np.linalg.norm(b - a)
    normal = np.array([a[1] - b[1], b[0] - a[0]]) / length
    for t in np.arange(0, 1, 1.15 / length):
        fuzz = rng.normal(0, .30) + .35 * np.sin(t * 9)
        perimeter.append(tuple((a + (b - a) * t + normal * fuzz) * PRINT_SCALE))
mask = Image.new("L", SIZE)
ImageDraw.Draw(mask).polygon(perimeter, fill=255)
inside = np.asarray(mask) > 0
border = distance_transform_edt(inside) / PRINT_SCALE

# The spine, the two wing folds, and small stress wrinkles where the fingers
# reopened the nose and corners. Width and height determine each fold's profile.
spine = [(217,-18),(212,50),(221,107),(214,174),(223,259),(215,344),(225,427),(213,556)]
wing = [(-10,149),(66,184),(132,220),(223,259),(302,301),(362,330),(455,378)]
cross = [(-10,397),(65,359),(116,331),(171,295),(223,259),(274,217),(338,167),(452,110)]
folds = [
    (13, 6.3, spine), (13, -5.0, wing), (16, 4.2, cross),
    (10, 3.8, [(-14,32),(43,54),(90,87),(137,99),(171,133),(214,174)]),
    (8,-2.9, [(29,-12),(43,54),(57,99),(47,152),(66,184)]),
    (6,2.5, [(155,-13),(139,42),(139,65),(137,99),(130,131)]),
    (7,-3.1, [(212,50),(257,73),(281,99),(299,113),(326,146),(338,167)]),
    (8,3.0, [(463,12),(396,45),(366,80),(333,94),(299,113),(281,141)]),
    (6,-2.5, [(364,-6),(370,32),(366,80),(380,101),(385,141)]),
    (5,1.8, [(281,99),(245,103),(221,107),(193,97)]),
    (10,-3.0, [(-10,272),(45,249),(81,243),(111,227),(132,220)]),
    (4,2.1, [(45,249),(28,212),(-12,196)]),
    (6,2.6, [(66,184),(83,218),(81,243),(93,272),(90,303),(116,331)]),
    (9,-3.4, [(302,301),(333,281),(367,279),(398,258),(454,241)]),
    (6,2.5, [(367,279),(369,236),(390,205),(385,182)]),
    (8,3.4, [(448,406),(405,413),(375,442),(359,456),(344,495),(302,551)]),
    (6,-2.5, [(225,427),(271,435),(293,458),(318,465),(344,495)]),
    (6,2.6, [(-14,458),(51,447),(87,432),(118,401),(142,388),(159,359)]),
    (8,-3.2, [(47,555),(61,508),(51,447),(54,420),(39,389),(35,375)]),
    (5,-2.3, [(184,551),(171,510),(155,493),(148,459),(118,401)]),
    (4,2.0, [(61,508),(83,485),(109,482),(134,465),(148,459)]),
    (4,-1.9, [(375,442),(373,412),(361,390),(362,330)]),
]

mottle, ripple = cloud(31), cloud(9)
# Distortion keeps the sharp crests broken where the stock has buckled.
px = x + 3.1 * mottle + 1.1 * ripple + .37 * cloud(3)
py = y + 3.4 * cloud(36) + 1.1 * cloud(10) + .4 * cloud(3)
z = 2.8 * cloud(82) + 1.1 * cloud(39) + .17 * ripple
wear = np.zeros_like(x)
for width, rise, points in folds:
    distance = np.full_like(x, np.inf)
    along = np.zeros_like(x)
    total = 0
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        dx, dy = bx - ax, by - ay
        length = np.hypot(dx, dy)
        t = np.clip(((px-ax)*dx + (py-ay)*dy) / length**2, 0, 1)
        d = (px - ax - t*dx)**2 + (py - ay - t*dy)**2
        along = np.where(d < distance, total + t*length, along)
        distance = np.minimum(d, distance)
        total += length
    distance = np.sqrt(distance)
    taper = np.clip(np.minimum(along, total - along) / (2.8 * width), 0, 1)
    w = width * (1 + .22*np.sin(along*.043) + .14*mottle)
    profile = np.exp(-distance / w)
    z += rise * taper * profile * (.92 + .14*np.cos(along*.051) + .18*mottle)
    wear += taper * np.exp(-distance / 1.1) * min(1, abs(rise)/5)

# A folded wing changes the angle of the entire panel. Its broad camber is
# continuous across the fine creases instead of a painted-on line.
z += 4.2 * np.exp(-((px - 146) / 67)**2 - ((py - 218) / 127)**2)
z -= 3.2 * np.exp(-((px - 310) / 96)**2 - ((py - 335) / 95)**2)
gy, gx = np.gradient(gaussian_filter(z, 1.2), 1/PRINT_SCALE)
grain = rng.normal(0, 1, x.shape).astype(np.float32)
specks = cloud(2)
# Pulp strands run in small bundles. Only a few catch enough light to stand out.
fiber_img = Image.new("L", SIZE, 128)
draw = ImageDraw.Draw(fiber_img)
for _ in range(19000):
    at = rng.uniform([0,0], SIZE)
    v = rng.normal([3,1], [3,2.8])
    draw.line([tuple(at), tuple(at+v)], fill=int(rng.uniform(62,190)), width=1)
fiber = (np.asarray(fiber_img, dtype=np.float32)-128)/18
fibers = grain*1.85 + fiber + specks * 1.35 + 2.1*mottle

# The portrait's 22-degree screen, wrapped around the very same ridges as the ink.
# Record the print cell under each pixel so each dot takes one impression of the stock.
angle = np.deg2rad(22)
pitch = 3.7
ink_x = x - .29*z - 1.75*gx
ink_y = y + .83*z - 1.1*gy
u = (ink_x*np.cos(angle) + ink_y*np.sin(angle)) / pitch
v = (ink_y*np.cos(angle) - ink_x*np.sin(angle)) / pitch
column, row = np.floor(u).astype(int), np.floor(v).astype(int)
cell = (row - row.min())*(np.ptp(column) + 1) + column - column.min()
cell_area = np.maximum(1, np.bincount(cell.ravel()))
jitter_u, jitter_v, spread = rng.uniform(-1, 1, (3, len(cell_area)))
dot_distance = np.hypot(u - column - .5 - .065*jitter_u[cell],
                        v - row - .5 - .065*jitter_v[cell])
edge_scuff = np.exp(-border/3.1) * (.8 + .4*ripple)
edge_lip = np.exp(-((border-1.25)/.73)**2)
alpha = mask.filter(ImageFilter.GaussianBlur(.46))
# The ear still bears its flattened triangular hinge on the reverse.
flap = [(393,532),(428,497),(396,495)]
flap_mask = Image.new("L",SIZE)
ImageDraw.Draw(flap_mask).polygon([(a*PRINT_SCALE,b*PRINT_SCALE) for a,b in flap],fill=255)
ear = np.asarray(flap_mask.filter(ImageFilter.GaussianBlur(.6)), dtype=np.float32)/255
shadow_mask = Image.new("L",SIZE)
ImageDraw.Draw(shadow_mask).polygon([((a-1.5)*PRINT_SCALE,(b-1.3)*PRINT_SCALE) for a,b in flap], fill=255)
ear_shadow = np.asarray(shadow_mask.filter(ImageFilter.GaussianBlur(3.3)), dtype=np.float32)/255
ridge = np.clip((x+y-889)/37,0,1)
# Fibres compact at the hinge and keep a little of that curl seen from behind.
hinge_distance = (925 - x - y) / np.sqrt(2)
corner_curl = np.exp(-((x-410)/26)**4 - ((y-513)/26)**4)

for back in (False, True):
    # Turn the sheet about its vertical axis. Its x coordinates AND its relief
    # reverse, while the raking light stays above and to the viewer's left.
    slope = .48*gx + (-.86 if back else .86)*gy
    light = np.tanh(slope*1.75)
    tone = 100*light + (2 if back else 0) - 6.5*(x/W + y/H - .8)
    tone += fibers - 8.5*edge_scuff + 12*edge_lip
    tone += wear*(3.7 + 3*specks)
    if back:
        tone += ear*(-7 + 7*ridge)
        tone += corner_curl*(19*np.exp(-((hinge_distance-2)/3)**2)
                             - 22*np.exp(-((hinge_distance-8)/6)**2))
    else:
        tone += -43 * ear_shadow * (1-ear)
        tone = tone*(1-ear) + ear*(5 + 38*ridge - 6*ripple + fibers)

    # Six dot sizes, as on the portrait. A ridge can bleach to bare stock while
    # its shadow takes a full blue dot. Short dark fibres catch ink at the edge.
    density = np.clip(.39 - tone/105 + .20*edge_scuff, 0, 1)
    average = np.bincount(cell.ravel(), weights=density.ravel()) / cell_area
    level = np.rint(average*5)[cell] / 5
    radius = .52*np.sqrt(level) * (1 + .065*spread[cell])
    coverage = np.clip((radius - dot_distance)*pitch*PRINT_SCALE + .5, 0, 1)
    coverage *= level > 0
    highlight = np.clip((tone + 42) / 84, 0, 1)
    stock = np.array([186, 191, 230]) + highlight[..., None]*[56, 53, 25]
    stock += (.32*fibers + 1.7*wear - 1.5*back)[..., None]
    ink = np.array([176, 181, 228]) - level[..., None]*[77, 76, 46]
    color = stock + (ink - stock)*coverage[..., None]
    image = Image.fromarray(color.clip(0,255).astype(np.uint8)).convert("RGBA")
    image.putalpha(alpha)
    name = "back" if back else "front"
    if back:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    image.save(OUT / f"paper-{name}.webp", quality=88, alpha_quality=92, method=6)

# Project both the writing and its bleed-through from the same relief. SVG
# displacement samples backwards, so encode the opposite of the ink motion.
for back in (False, True):
    dx = (-1 if back else 1)*(.29*z + 1.75*gx)
    dy = -.83*z + 1.1*gy
    field = np.stack([.5-dx/32, .5-dy/32, np.zeros_like(z)],axis=-1)
    packed = Image.fromarray((255*field).clip(0,255).astype(np.uint8))
    packed = packed.resize((220,272), Image.Resampling.LANCZOS)
    if back:
        packed = packed.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    packed.save(OUT / ("paper-warp-back.png" if back else "paper-warp-front.png"), optimize=True)
