// Generates placeholder SVG cutouts under public/seed/products and db/seed.sql.
// Run: npm run seed:gen   (output is committed; admins can replace images via the upload page)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/seed/products");
fs.mkdirSync(outDir, { recursive: true });

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
};
const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">${inner}</svg>`;

// ---------- garments (front/back cutouts, transparent background) ----------
function garment(p, view) {
  const c = p.color, d = shade(c, -28), l = shade(c, 22);
  const hem = p.hem, sl = p.sleeve, flare = p.flare || 0;
  const defs = `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${l}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`;
  const body = `M300 118 Q400 ${view === "back" ? 150 : 170} 500 118 L588 150 L${604 + flare} ${hem} Q400 ${hem + 22} ${196 - flare} ${hem} L212 150 Z`;
  const sleeveL = `M212 150 L120 ${sl} L${190} ${sl + 24} L262 300 Z`;
  const sleeveR = `M588 150 L680 ${sl} L610 ${sl + 24} L538 300 Z`;
  let s = defs;
  s += `<path d="${sleeveL}" fill="${d}"/><path d="${sleeveR}" fill="${d}"/>`;
  s += `<path d="${body}" fill="url(#g)" stroke="${shade(c, 60)}" stroke-opacity=".55" stroke-width="3"/>`;
  if (p.kind === "hoodie") {
    s += `<path d="M300 118 Q400 40 500 118 Q400 190 300 118Z" fill="${d}"/>`;
    if (view === "front") s += `<path d="M330 330 h140 l30 120 h-200Z" fill="${shade(c, -14)}" opacity=".7"/><path d="M370 150 v90 M430 150 v90" stroke="#eee" stroke-width="6"/>`;
  } else if (p.kind === "dress") {
    s += `<path d="M330 118 Q400 ${view === "back" ? 150 : 200} 470 118" fill="none" stroke="${d}" stroke-width="3"/>`;
    s += `<path d="M285 420 H515" stroke="${d}" stroke-width="10"/>`;
    for (let i = 0; i < 26; i++) s += `<circle cx="${230 + ((i * 97) % 340)}" cy="${470 + ((i * 53) % 400)}" r="${6 + (i % 3) * 3}" fill="${i % 2 ? "#f6c1d1" : "#fff7e6"}" opacity=".85"/>`;
  } else {
    // collar + front placket
    s += `<path d="M300 118 L350 190 L400 ${view === "back" ? 150 : 150} L450 190 L500 118 L470 104 L400 ${view === "back" ? 140 : 135} L330 104Z" fill="${l}" stroke="${d}" stroke-width="3"/>`;
    if (view === "front") {
      s += `<path d="M400 170 V${hem + 18}" stroke="${d}" stroke-width="4"/>`;
      if (p.buttons) for (let y = 230; y < hem - 20; y += 78) s += `<circle cx="372" cy="${y}" r="9" fill="${d}"/><circle cx="428" cy="${y}" r="9" fill="${d}"/>`;
      if (p.belt) s += `<rect x="226" y="440" width="350" height="26" fill="${d}"/><rect x="380" y="436" width="40" height="34" rx="4" fill="#c9a24b"/>`;
      if (p.pockets) s += `<path d="M260 ${hem - 150} h90 v70 h-90Z M450 ${hem - 150} h90 v70 h-90Z" fill="none" stroke="${d}" stroke-width="4"/>`;
    }
    if (p.quilt) for (let y = 210; y < hem; y += 70) s += `<path d="M${215 - (y > 400 ? 0 : 0)} ${y} Q400 ${y + 22} 585 ${y}" fill="none" stroke="${d}" stroke-width="4" opacity=".8"/>`;
    if (p.ribbed) s += `<rect x="196" y="${hem - 26}" width="408" height="30" fill="${d}"/>`;
  }
  return svg(s);
}

// ---------- accessories & cosmetics ----------
const A = {
  watch: (c) => svg(`<rect x="340" y="40" width="120" height="330" rx="30" fill="#2a2a2f"/><rect x="340" y="630" width="120" height="330" rx="30" fill="#2a2a2f"/><circle cx="400" cy="500" r="170" fill="${c}"/><circle cx="400" cy="500" r="140" fill="#111"/><circle cx="400" cy="500" r="128" fill="#f4efe4"/><path d="M400 500 V410 M400 500 L460 530" stroke="#222" stroke-width="10" stroke-linecap="round"/>${[...Array(12)].map((_, i) => `<line x1="400" y1="388" x2="400" y2="402" stroke="#444" stroke-width="5" transform="rotate(${i * 30} 400 500)"/>`).join("")}<rect x="568" y="485" width="26" height="30" rx="6" fill="${c}"/>`),
  bracelet: (c) => svg(`<ellipse cx="400" cy="500" rx="300" ry="220" fill="none" stroke="${c}" stroke-width="64"/><ellipse cx="400" cy="500" rx="300" ry="220" fill="none" stroke="${shade(c, 50)}" stroke-width="14" stroke-dasharray="60 40"/>`),
  aviator: () => svg(`<g transform="translate(0 220)"><path d="M70 120 Q60 360 250 400 Q370 380 385 180 Q330 90 70 120Z" fill="#2c3a2f" fill-opacity=".85" stroke="#c9a24b" stroke-width="14"/><path d="M730 120 Q740 360 550 400 Q430 380 415 180 Q470 90 730 120Z" fill="#2c3a2f" fill-opacity=".85" stroke="#c9a24b" stroke-width="14"/><path d="M385 170 Q400 130 415 170" fill="none" stroke="#c9a24b" stroke-width="14"/><path d="M70 120 L10 90 M730 120 L790 90" stroke="#c9a24b" stroke-width="12"/></g>`),
  round: () => svg(`<g transform="translate(0 240)"><circle cx="230" cy="250" r="165" fill="#bfd9e8" fill-opacity=".35" stroke="#b07a3c" stroke-width="22"/><circle cx="570" cy="250" r="165" fill="#bfd9e8" fill-opacity=".35" stroke="#b07a3c" stroke-width="22"/><path d="M395 230 Q400 190 405 230" fill="none" stroke="#b07a3c" stroke-width="20"/><path d="M65 240 L10 200 M735 240 L790 200" stroke="#b07a3c" stroke-width="18"/></g>`),
  earrings: (c) => svg([200, 600].map((x) => `<circle cx="${x}" cy="260" r="26" fill="${c}"/><path d="M${x} 286 V420" stroke="${c}" stroke-width="10"/><path d="M${x} 420 L${x - 60} 560 L${x} 760 L${x + 60} 560Z" fill="${c}" stroke="${shade(c, -40)}" stroke-width="6"/><path d="M${x} 440 L${x - 28} 560 L${x} 690" fill="none" stroke="${shade(c, 70)}" stroke-width="8" opacity=".7"/>`).join("")),
  cap: (c) => svg(`<path d="M110 560 Q110 190 400 190 Q690 190 690 560Z" fill="${c}"/><path d="M110 560 Q400 640 690 560 Q760 600 790 700 Q430 690 110 640Z" fill="${shade(c, -30)}"/><circle cx="400" cy="200" r="22" fill="${shade(c, -30)}"/><path d="M400 200 Q300 380 270 560 M400 200 Q500 380 530 560" fill="none" stroke="${shade(c, -25)}" stroke-width="5"/>`),
  lipstick: (c) => svg(`<rect x="310" y="520" width="180" height="420" rx="20" fill="#16161a"/><rect x="300" y="470" width="200" height="70" rx="12" fill="#c9a24b"/><rect x="330" y="250" width="140" height="230" rx="24" fill="${c}"/><path d="M330 250 L470 190 V270Z" fill="${shade(c, 20)}"/>`),
  foundation: (c) => svg(`<rect x="300" y="360" width="200" height="580" rx="40" fill="${c}"/><rect x="340" y="280" width="120" height="100" rx="14" fill="#16161a"/><rect x="370" y="180" width="60" height="110" rx="12" fill="#2b2b30"/><rect x="330" y="560" width="140" height="220" rx="18" fill="#fff" opacity=".85"/>`),
  blush: (c) => svg(`<circle cx="400" cy="500" r="330" fill="#1a1a1f"/><circle cx="400" cy="500" r="270" fill="${c}"/><circle cx="400" cy="500" r="270" fill="url(#h)"/><defs><radialGradient id="h"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`),
  eyeliner: (c) => svg(`<g transform="rotate(-35 400 500)"><rect x="350" y="120" width="100" height="620" rx="30" fill="#16161a"/><rect x="350" y="330" width="100" height="60" fill="${c}"/><path d="M370 740 L400 910 L430 740Z" fill="#2b2b30"/></g>`),
  palette: (c) => svg(`<rect x="90" y="240" width="620" height="520" rx="40" fill="#1b1b20"/>${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((q) => `<rect x="${130 + q * 148}" y="${280 + r * 112}" width="130" height="94" rx="14" fill="${shade(c, (q * 20 - 30) + (r % 2 ? -25 : 15))}"/>`).join("")).join("")}`),
  kajal: (c) => svg(`<g transform="rotate(30 400 500)"><rect x="360" y="100" width="80" height="620" rx="12" fill="#232328"/><rect x="360" y="100" width="80" height="120" rx="12" fill="${c}"/><path d="M360 720 L400 880 L440 720Z" fill="#111"/></g>`),
};

// ---------- catalogue ----------
const P = [];
const g = (name, brand, price, sale, color, rating, count, kind, opts, gender, desc) =>
  P.push({ cat: "clothing", sub: opts.sub, name, brand, price, sale, rating, count, gender, desc, type: "garment", region: opts.region || "torso", colors: opts.colors, sizes: ["XS", "S", "M", "L", "XL"], stock: opts.stock ?? 24, draw: (v) => garment({ kind, color, ...opts.shape }, v), extra: opts.extra });
g("Camel Wool Trench Coat", "Maison Nord", 449, null, "#b88a5a", 4.8, 212, "coat", { sub: "coats", region: "torso_long", colors: ["Camel", "Stone", "Black"], shape: { hem: 860, sleeve: 640, flare: 30, buttons: true, belt: true, pockets: true }, extra: 1 }, "women", "A timeless double-breasted trench in a heavyweight wool blend with a storm flap, belted waist and a relaxed, structured drape.");
g("Army Green Puffer Jacket", "Aurum", 229, 189, "#556b3a", 4.6, 341, "puffer", { sub: "jackets", colors: ["Army Green", "Black", "Navy"], shape: { hem: 700, sleeve: 660, quilt: true, ribbed: true }, extra: 1 }, "unisex", "Lightweight recycled-fill puffer with a quilted body, ribbed cuffs and a high collar. Warm, packable and water resistant.");
g("Indigo Denim Trucker Jacket", "Aurum", 119, null, "#2e4a78", 4.5, 187, "jacket", { sub: "jackets", colors: ["Indigo", "Washed Blue"], shape: { hem: 660, sleeve: 640, buttons: true, pockets: true } }, "unisex", "Classic trucker cut in rigid 12oz indigo denim with chest pockets and contrast stitching that softens beautifully with wear.");
g("Olive Bomber Jacket", "Lumen", 159, null, "#6b6b3a", 4.4, 98, "jacket", { sub: "jackets", colors: ["Olive", "Black"], shape: { hem: 640, sleeve: 650, ribbed: true } }, "men", "Satin-finish bomber with ribbed collar, cuffs and hem and a clean zip front. A wardrobe staple for every season.");
g("Dark Brown Leather Biker Jacket", "Maison Nord", 399, 349, "#5a3b28", 4.9, 156, "jacket", { sub: "jackets", colors: ["Dark Brown", "Black"], shape: { hem: 650, sleeve: 650, pockets: true } }, "unisex", "Full-grain lambskin biker with asymmetric zip, quilted shoulders and a satin lining. Built to last for decades.");
g("Black Wool Overcoat", "Maison Nord", 379, null, "#2b2b32", 4.7, 134, "coat", { sub: "coats", region: "torso_long", colors: ["Black", "Charcoal"], shape: { hem: 880, sleeve: 650, flare: 20, buttons: true, pockets: true } }, "men", "A sharply tailored single-breasted overcoat in a dense Italian wool blend with notch lapels and hidden buttons.");
g("White Linen Shirt", "Lumen", 79, null, "#f1ede4", 4.3, 76, "shirt", { sub: "shirts", colors: ["White", "Sky", "Sand"], shape: { hem: 640, sleeve: 560, buttons: true } }, "unisex", "Breathable stonewashed linen shirt with a relaxed fit and mother-of-pearl buttons. Effortless from beach to dinner.");
g("Floral Summer Dress", "Blossom & Co", 129, null, "#d86a8a", 4.6, 203, "dress", { sub: "dresses", region: "torso_dress", colors: ["Rose", "Cream"], shape: { hem: 930, sleeve: 330, flare: 70 } }, "women", "A flowing midi dress with a cinched waist, soft V-neckline and a hand-drawn floral print on lightweight viscose.");
g("Charcoal Hoodie", "Aurum", 89, null, "#3b3d44", 4.5, 410, "hoodie", { sub: "hoodies", colors: ["Charcoal", "Heather Grey", "Black"], shape: { hem: 660, sleeve: 650, ribbed: true } }, "unisex", "Heavyweight brushed-back cotton fleece hoodie with a kangaroo pocket, double-lined hood and ribbed trims.");
g("Beige Knit Sweater", "Lumen", 99, null, "#d6c3a3", 4.4, 122, "sweater", { sub: "sweaters", colors: ["Beige", "Oat", "Forest"], shape: { hem: 640, sleeve: 650, ribbed: true } }, "women", "Chunky merino-blend knit with a relaxed crew neck and ribbed finishes for all-day cosy comfort.");

const lip = [
  { name: "Ruby Red", hex: "#b3122c" }, { name: "Rosewood", hex: "#a2495c" }, { name: "Coral Pop", hex: "#e2584a" },
  { name: "Nude Mauve", hex: "#b5776f" }, { name: "Berry Wine", hex: "#7a1d3d" },
];
const m = (name, brand, price, sale, rating, count, sub, region, shades, draw, desc, color) =>
  P.push({ cat: "cosmetics", sub, name, brand, price, sale, rating, count, gender: "women", desc, type: "face_makeup", region, shades, stock: 80, colors: [], sizes: [], draw: () => draw(color || shades[0].hex) });
m("Velvet Matte Lipstick", "Nykaa", 14, null, 4.7, 1240, "lipstick", "lips", lip, A.lipstick, "Intense, long-wear matte colour in a creamy, comfortable formula enriched with vitamin E. Available in five flattering shades.");
m("Skin Fit Liquid Foundation", "Maybelline", 12, 9.5, 4.4, 860, "foundation", "face", [{ name: "Natural Beige", hex: "#d9a98a" }, { name: "Warm Sand", hex: "#c68e6b" }, { name: "Deep Honey", hex: "#a56b47" }], A.foundation, "Lightweight, buildable coverage with a natural skin-like finish that lasts up to 12 hours.");
m("Soft Glow Cheek Blush", "Lakme", 11, null, 4.3, 530, "blush", "cheeks", [{ name: "Peach Glow", hex: "#f08a6c" }, { name: "Rose Petal", hex: "#e0708a" }, { name: "Warm Berry", hex: "#b6485f" }], A.blush, "Silky powder blush with buildable colour and a natural, satin glow that blends effortlessly.");
m("Precision Liquid Eyeliner", "MAC", 22, null, 4.6, 402, "eyeliner", "eyeliner", [{ name: "Midnight Black", hex: "#111111" }, { name: "Espresso", hex: "#3b2418" }, { name: "Deep Navy", hex: "#16224a" }], A.eyeliner, "Ultra-fine felt tip for razor-sharp wings and bold lines. Smudge-proof and waterproof for 24 hours.");
m("Sunset Eyeshadow Palette", "Huda Beauty", 67, 59, 4.8, 978, "eyeshadow", "eyelids", [{ name: "Copper Sunset", hex: "#b8643a" }, { name: "Smoky Plum", hex: "#6b3a58" }, { name: "Champagne", hex: "#d8b88a" }], A.palette, "Sixteen richly pigmented matte and shimmer shades for everyday looks and bold evenings alike.");
m("Intense Kohl Kajal", "Sugar", 9, null, 4.5, 721, "kajal", "waterline", [{ name: "Jet Black", hex: "#0e0e10" }, { name: "Brown", hex: "#4a2c1d" }], A.kajal, "Smudge-proof, creamy kohl pencil for an intense, long-lasting look in a single stroke.");

const a = (name, brand, price, sale, rating, count, sub, region, colors, draw, desc, gender = "unisex", color) =>
  P.push({ cat: "accessories", sub, name, brand, price, sale, rating, count, gender, desc, type: "accessory", region, colors, sizes: [], stock: 30, draw: () => draw(color || "#c9a24b") });
a("Classic Steel Wrist Watch", "Aurum", 189, 159, 4.7, 245, "watches", "wrist", ["Gold", "Silver"], A.watch, "Minimalist analogue watch with a sapphire-coated crystal, quartz movement and a brushed steel case.");
a("Woven Metal Bracelet", "Lumen", 59, null, 4.3, 118, "bracelets", "wrist", ["Gold", "Silver", "Rose Gold"], A.bracelet, "A chunky woven-metal cuff bracelet with a polished finish that stacks beautifully.", "women");
a("Aviator Sunglasses", "Nord Optics", 129, null, 4.6, 312, "glasses", "eyes", ["Gold/Green", "Silver/Grey"], A.aviator, "Iconic teardrop aviators with polarised UV400 lenses and a lightweight metal frame.");
a("Round Frame Glasses", "Nord Optics", 99, 79, 4.4, 167, "glasses", "eyes", ["Black", "Tortoise"], A.round, "Retro round acetate frames with blue-light filtering lenses for screen and street.");
a("Teardrop Gold Earrings", "Blossom & Co", 69, null, 4.8, 201, "earrings", "ears", ["Gold", "Silver"], A.earrings, "Polished teardrop drop earrings with hypoallergenic posts, lightweight enough for all-day wear.", "women");
a("Everyday Baseball Cap", "Lumen", 35, null, 4.2, 96, "caps", "head", ["Navy", "Black", "Sand"], A.cap, "Washed cotton twill cap with a curved brim and an adjustable strap back.", "unisex", "#2d3f66");

// ---------- write files ----------
const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const esc = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'");

const cats = [["Clothing", "clothing"], ["Cosmetics", "cosmetics"], ["Accessories", "accessories"]];
const subs = {
  clothing: ["Coats", "Jackets", "Shirts", "Dresses", "Hoodies", "Sweaters"],
  cosmetics: ["Lipstick", "Foundation", "Blush", "Eyeliner", "Eyeshadow", "Kajal"],
  accessories: ["Watches", "Bracelets", "Glasses", "Rings", "Earrings", "Bags", "Caps"],
};
const brands = [...new Set(P.map((p) => p.brand))];
let sql = "-- Generated by scripts/gen-seed.mjs. Do not edit by hand.\nSET NAMES utf8mb4;\n";
sql += "INSERT INTO categories (id,name,slug) VALUES " + cats.map((c, i) => `(${i + 1},${esc(c[0])},${esc(c[1])})`).join(",") + ";\n";
let sid = 0; const subId = {};
const subRows = [];
cats.forEach(([, cs], ci) => subs[cs].forEach((s) => { sid++; subId[`${cs}/${slugify(s)}`] = sid; subRows.push(`(${sid},${ci + 1},${esc(s)},${esc(slugify(s))})`); }));
sql += "INSERT INTO subcategories (id,category_id,name,slug) VALUES " + subRows.join(",") + ";\n";
sql += "INSERT INTO brands (id,name,slug) VALUES " + brands.map((b, i) => `(${i + 1},${esc(b)},${esc(slugify(b))})`).join(",") + ";\n";

const prodRows = [], imgRows = [];
P.forEach((p, i) => {
  const id = i + 1, slug = slugify(p.name);
  const catId = cats.findIndex((c) => c[1] === p.cat) + 1;
  const days = P.length - i;
  prodRows.push(`(${id},${catId},${subId[`${p.cat}/${slugify(p.sub)}`] ?? "NULL"},${brands.indexOf(p.brand) + 1},${esc(p.name)},${esc(slug)},${esc(p.desc)},${p.price},${p.sale ?? "NULL"},${p.stock},${p.rating},${p.count},${esc(p.gender)},${esc(JSON.stringify(p.colors || []))},${esc(JSON.stringify(p.sizes || []))},${esc(JSON.stringify(p.shades || []))},${esc(p.type)},${esc(p.region)},1,DATE_SUB(NOW(), INTERVAL ${days} DAY))`);
  const views = [["front", p.draw("front")]];
  if (p.cat === "clothing") views.push(["back", p.draw("back")]);
  if (p.extra) views.push(["extra", p.draw("front")]);
  views.forEach(([view, content], k) => {
    const rel = `/seed/products/${slug}-${view}${view === "extra" ? "-1" : ""}.svg`;
    fs.writeFileSync(path.join(root, "public" + rel), content);
    imgRows.push(`(${id},${esc(view)},${esc(rel)},${esc(rel)},${esc(rel)},${k})`);
  });
});
sql += "INSERT INTO products (id,category_id,subcategory_id,brand_id,name,slug,description,price,sale_price,stock,rating,rating_count,gender,colors,sizes,shades,tryon_type,tryon_region,is_published,created_at) VALUES\n" + prodRows.join(",\n") + ";\n";
sql += "INSERT INTO product_images (product_id,view,original_path,enhanced_path,thumb_path,sort_order) VALUES\n" + imgRows.join(",\n") + ";\n";
fs.writeFileSync(path.join(root, "db/seed.sql"), sql);
console.log(`Generated ${P.length} products, ${imgRows.length} images`);
