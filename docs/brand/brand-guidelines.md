# NivaaroFix — Official Brand Identity & Vector Design Guidelines

> **Status:** Active & Official  
> **Supersedes:** All legacy AI-generated mockups and gold/brass crests.  
> **Brand Color System:** Charcoal (`--logo-ink: #1C1C1E`) on light/neutral surfaces, Pure White (`#FFFFFF`) on dark surfaces and brand green canvases.

---

## 1. Brand Concept & Architectural Anatomy

The NivaaroFix brand identity combines architectural permanence, precision engineering, and modern luxury service standards. It is constructed from three distinct elements:

1. **The Shelter Mark:** A clean, symmetrical gable roof with a calibrated $105^\circ$ apex angle, subtle $6\text{px}$ curved ridge contour, and clean vertical plumb-cut eaves.
2. **The Interlocking Monogram (N + F):** An unambiguous geometric ligature where:
   - The left vertical stem and diagonal form the capital **N**.
   - The shared right vertical stem serves as the primary spine of the capital **F**.
   - Balanced top and mid-level horizontal bars form the **F**.
   - Symmetrically centered within the shelter with zero ambiguous bottom hooks or distorted AI artifacts.
3. **The Wordmark:** `NIVAAROFIX` set in Cormorant Garamond SemiBold, converted to pure mathematical vector outlines with hand-tuned optical kerning.
4. **The Tagline:** `ELEVATING THE EVERYDAY` set in Montserrat with wide, even tracking.

```
       / \             <- Symmetrical Gable Roof (105° Apex)
      /   \
     |  |--            <- Interlocking N + F Monogram
     | \|  |
   NIVAAROFIX          <- Cormorant Garamond SemiBold Serif
ELEVATING THE EVERYDAY <- Montserrat Geometric Sans
```

---

## 2. Geometric Construction & Unit Grid

The mark is constructed on a **240 × 240 unit grid**:
- **Baseline Stroke Width ($W$):** $14\text{px}$ ($7 \times 2\text{px}$ unit grid).
- **Roof Geometry:**
  - Outer Apex: $(120, 30.5)$ with quadratic Bézier ridge curve: `Q 120 30.5 124 33`.
  - Left Eave Plumb Terminal: $X = 28$, $Y \in [85, 100]$.
  - Right Eave Plumb Terminal: $X = 212$, $Y \in [85, 100]$.
  - Roof Height: $52\text{px}$ ($3.71 \times W$).
- **Monogram Geometry:**
  - Cap Height: $Y = 92$.
  - Baseline: $Y = 184$. Total height = $92\text{px}$ ($6.57 \times W$).
  - Left Stem: $X \in [66, 80]$.
  - Right Stem / F Spine: $X \in [124, 138]$.
  - Diagonal of N: Miters flush between $(66, 92)$ and $(138, 184)$ with zero baseline overrun.
  - F Top Arm: $X \in [138, 174]$, $Y \in [92, 106]$.
  - F Middle Bar: $X \in [138, 166]$, $Y \in [134, 147]$.
  - Monogram Horizontal Bounding Box: $X \in [66, 174]$.
  - Optical Center: $(66 + 174) / 2 = 120.0$ (Exact centerline alignment with roof apex).

---

## 3. Clear-Space & Minimum-Size Rules

### Clear-Space Rule
To preserve dignity and visual impact, the logo must always maintain an exclusion zone free of typography, imagery, borders, or layout edges.
- **Clear Space ($X$):** Defined as the height of the roof ($X = H_{roof} = 52\text{units}$ on the 240 grid, or $\approx 22\%$ of total lockup height).
- No interface element or margin may encroach inside distance $X$ around the bounding box of the lockup.

### Minimum Sizes
| Lockup Variant | Digital Minimum (px) | Print Minimum (mm) | Recommended Target |
| :--- | :--- | :--- | :--- |
| **Mark Only** | $16 \times 16\text{px}$ (Favicon) | $5 \times 5\text{mm}$ | $24\text{px}$ to $44\text{px}$ |
| **Horizontal Lockup** | $28\text{px}$ height | $9\text{mm}$ height | $36\text{px}$ to $40\text{px}$ (Header) |
| **Full Lockup** | $60\text{px}$ height | $18\text{mm}$ height | $80\text{px}$ to $160\text{px}$ (Auth/Footer) |

---

## 4. Color Specifications & Dark Mode

| Color Token | Hex Code | RGB | Usage |
| :--- | :--- | :--- | :--- |
| `--logo-ink` | `#1C1C1E` | `rgb(28, 28, 30)` | Primary charcoal ink for white, ivory, and light gray surfaces. |
| `--logo-light` | `#FFFFFF` | `rgb(255, 255, 255)` | Inverted pure white for dark mode and colored brand surfaces. |
| `--canvas-warm` | `#F7F5F1` | `rgb(247, 245, 241)` | Official warm ivory paper canvas for marketing showcases. |
| `--color-primary` | `#047857` | `rgb(4, 120, 87)` | Brand emerald green. Logo renders in **pure white** over this background. |

### Adaptive Favicon Rule
The `favicon.svg` uses standard CSS media queries to automatically adapt to the user's browser theme:
```css
.nivaaro-brand-fill { fill: #1C1C1E; }
@media (prefers-color-scheme: dark) {
  .nivaaro-brand-fill { fill: #FFFFFF; }
}
```

---

## 5. Tagline Standardization

- **Brand Tagline:** `Elevating the Everyday`  
  *(Replaces the legacy "Beyond the Fix" across all metadata, headers, titles, social share tags, and official communications).*
- **Value Proposition Line:** `Home repairs, handled with clarity.`  
  *(Maintained verbatim as the footer headline and service guarantee banner).*

---

## 6. Prohibited Practices & Do's and Don'ts

- ❌ **DO NOT** apply drop shadows, emboss, bevel, or inner shadow effects to the vector logo.
- ❌ **DO NOT** apply gradients or photographic textures across the logo strokes.
- ❌ **DO NOT** auto-trace raster artwork or introduce un-geometric wobbly vectors.
- ❌ **DO NOT** introduce emojis into brand or UI typography.
- ❌ **DO NOT** re-introduce the legacy gold, brass, or brown brand tints (`npm run lint:brand` enforces this strictly).
- ❌ **DO NOT** distort or alter the proportions of the roof angle or letter spacing.
- ✅ **DO** use the unified `<Logo />` component with `variant="horizontal"`, `variant="full"`, or `variant="mark"`.
