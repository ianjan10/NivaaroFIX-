import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

// RGB to HSL conversion
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

// HSL to RGB conversion
function hslToRgb(h, s, l) {
  h /= 360;
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const targetHue = 164; // Hue for #064E3B and #047857

function recolorPng(sourcePath, destPath) {
  const data = fs.readFileSync(sourcePath);
  const png = PNG.sync.read(data);

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];

      if (a === 0) continue;

      const [h, s, l] = rgbToHsl(r, g, b);

      // Gold / Brass / Amber range in the original logo:
      // typically 20° <= h <= 65° with saturation >= 0.12
      if (h >= 18 && h <= 68 && s >= 0.10) {
        // Shift hue to deep green (164°)
        // Adjust lightness slightly to retain deep richness of #064E3B
        const newLightness = Math.max(0.05, Math.min(0.95, l * 0.92));
        const newSaturation = Math.min(1.0, s * 1.05);

        const [nr, ng, nb] = hslToRgb(targetHue, newSaturation, newLightness);
        png.data[idx] = nr;
        png.data[idx + 1] = ng;
        png.data[idx + 2] = nb;
      }
    }
  }

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(destPath, buffer);
  console.log(`Recolored ${path.basename(sourcePath)} -> ${destPath}`);
}

const logoFiles = [
  'logo-emblem.png',
  'logo-horizontal.png',
  'logo-stacked.png',
  'logo-wordmark.png',
  'logo-full-transparent.png'
];

const dirs = [
  'c:/NivaaroFIX-/apps/web/public/brand',
  'c:/NivaaroFIX-/apps/auth/public/brand'
];

// Backup first
const backupDir = 'c:/NivaaroFIX-/scratch/brand_backup_original_gold';
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

for (const file of logoFiles) {
  const src = path.join(dirs[0], file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(backupDir, file));
  }
}
console.log('Backed up original gold assets to scratch/brand_backup_original_gold');

// Process
for (const dir of dirs) {
  for (const file of logoFiles) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) {
      recolorPng(filePath, filePath);
    }
  }
}
console.log('All logo assets successfully recolored to deep green #064E3B!');
