# Design Direction — Original 1970s Game-Show System

The goal is not a literal copy of a television set. Build an original Designs Direct experience using the visual grammar found in the supplied reference images.

## What the references show

### Contestant row

- Four strong color bays arranged in one connected scenic structure.
- Red, blue, yellow, and green read instantly as team identity.
- Black and warm metallic outlines separate saturated panels.
- Small jewel lights and bulbs create energy without covering the content.

### Showcase podiums

- Trapezoid forms rather than modern rectangular cards.
- Warm cream/gold frames around dark numeric windows.
- Orange and purple accent panels.
- Oversized dot-matrix numbers become the visual event.

### Product reveal pedestals

- Product is physically elevated on a single stage pedestal.
- A bright price window sits directly below the item.
- Wood, bronze, cream, and saturated orange make the product feel theatrical.
- The screen should feel like one stage composition, not a stack of disconnected panels.

### Price tags and win graphics

- Thick black outlines.
- Bold cyan, royal blue, red, and yellow.
- Price-tag silhouettes with punched holes.
- Exploding starbursts and very large condensed lettering.
- Simple shapes move quickly and read at projector distance.

### Any Number board

- Rounded cream-and-gold scenic cabinetry.
- Coral/pink linework.
- Mechanical digit slots.
- Warm walnut and glitter-like scenic surfaces.
- Symmetrical rows and ornamental curls.

## Production palette

```css
--show-red: #E52B2F;
--show-orange: #F36C21;
--show-yellow: #FFD13A;
--show-blue: #1759D8;
--show-aqua: #20CBD0;
--show-green: #37A63B;
--show-purple: #8E159C;
--show-cream: #F7E6B0;
--show-walnut: #5A3022;
--show-black: #111111;
```

Use Designs Direct teal, orange, green, and gold as secondary brand bridges.

## Type system

Use licensed/open fonts or system fallbacks. Suggested roles:

- Display: very heavy condensed or block face with tight line height.
- Prices: mechanical, dot-matrix, or monospaced numerals.
- Body: highly readable grotesk/sans serif.
- Buttons: uppercase heavy condensed text.

Do not use a decorative font for long instructions.

## Layout rules

- Build connected stage architecture across the entire viewport.
- Use one dominant product window and one dominant interaction bay.
- Keep team colors persistent across lobby, inputs, statuses, and winner effects.
- Team price input must be the largest control on the laptop screen.
- Public display must be readable from the back of the room.
- Admin may use denser controls but should preserve the same visual system.

## Original deployable assets

`public/ui` includes:

- `dd-price-game-lockup.svg`
- `contestants-row-frame.svg`
- `showcase-podium-frame.svg`
- `any-number-panel.svg`
- `retro-price-tag.svg`
- `win-burst.svg`
- `marquee-bulb.svg`

These are original project assets and may be adapted. The files in `private/reference-only` are moodboard references and must not be deployed.

## Avoid

- generic SaaS cards;
- glassmorphism;
- gray dashboard styling;
- tiny inputs;
- cyberpunk neon;
- casino slot-machine treatment;
- copying the supplied logo or set geometry pixel for pixel;
- displaying source photos with price stickers or store clues.
