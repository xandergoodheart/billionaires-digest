# Portraits plan: style test before any real rollout

Status: PLAN ONLY. No images have been generated. Nothing here is live.

Goal: pick one illustrated portrait style for the v2 game (Billionaire Life, Draft room, Lucky five, player cards),
test it on three people, get the owner's approval, and only then make the rest of the 100.

## Rules (from the owner, not negotiable)

- Illustrated only. Never photos of real people, never photo-realistic output, never a photo used as a base image.
- No company logos, no brand marks, no readable text, letters or numbers anywhere in the image.
- No family members, homes, cars or places that could identify where someone lives.
- Neutral and respectful: a caricature of the *game style*, not a mocking caricature of the person.
- The owner approves the style on the 3 test people before anyone makes the other 97.
- Every file is checked by eye before it is registered (no stray text, no logo shapes, no extra fingers or faces).

## Two styles to test

### Style A: sports trading card

Bold, clean vector illustration like a premium collectible sports card. Head and shoulders, three-quarter view,
confident neutral expression, flat cel shading with 2-3 tones, thick dark outline, warm gold rim light,
deep burgundy-to-black radial background with a subtle diamond lattice (matches the casino-arcade card back).

### Style B: game avatar

Friendly stylized 3D-look game avatar, slightly larger head than real proportions, soft rounded forms,
smooth matte shading, big readable silhouette that still works at 48px. Plain dark green felt background
with a soft gold glow behind the head (matches the casino table felt).

## Variants

- **Normal**: the portrait as described.
- **"$ eyes"**: the same portrait, same pose and framing, with the eyes drawn as gold dollar-sign shapes
  (cartoon "jackpot" moment used by Lucky five and the Billionaire Life win screen). Nothing else changes.

## Output spec

- Square 1:1, 1024 x 1024 px master. Export to WebP (quality ~82) at 1024 px; pages scale it down.
- Face centered, top of head ~8% from the top edge, shoulders cut at the bottom edge, so the circle crop
  used by the game plates (`border-radius: 50%`) never cuts the face.
- Background fills the whole square (no transparency needed).
- File names:
  - `assets/portraits/<slug>.webp` (normal)
  - `assets/portraits/<slug>-dollar.webp` ("$ eyes" variant)
  - `<slug>` is the person's slug from `data/people/index.json` (for example `jensen-huang`).

## Test prompts (3 people x 2 styles x 2 variants = 12 images)

Describe what the person publicly looks like in general terms only (hair, glasses, usual clothing).
Do not upload or reference a photo. Keep the words "no text, no logos, no photo" in every prompt.

Shared tail for every prompt:
> square 1:1, 1024x1024, head and shoulders, centered, no text, no letters, no numbers, no logos,
> no brand marks, not a photo, not photorealistic, illustration only.

### Jensen Huang (`jensen-huang`)

- A normal: "Sports trading card style vector illustration of a smiling older East Asian man with short
  swept-back grey-black hair and glasses, wearing a black leather jacket over a black t-shirt, flat cel
  shading, thick dark outline, gold rim light, burgundy-to-black background with faint diamond lattice." + tail
- A "$ eyes": same prompt + "his eyes are drawn as shiny gold dollar-sign shapes, cartoon jackpot expression."
- B normal: "Stylized 3D game avatar of a friendly older East Asian man with short swept-back grey-black hair
  and glasses, black leather jacket, slightly oversized head, soft matte shading, dark green felt background
  with soft gold glow." + tail
- B "$ eyes": same B prompt + "eyes drawn as shiny gold dollar-sign shapes."

### Warren Buffett (`warren-buffett`)

- A normal: "Sports trading card style vector illustration of a cheerful elderly man with white hair,
  bushy white eyebrows and large rimmed glasses, wearing a grey suit, white shirt and a plain tie, flat cel
  shading, thick dark outline, gold rim light, burgundy-to-black background with faint diamond lattice." + tail
- A "$ eyes": same + "his eyes are drawn as shiny gold dollar-sign shapes, cartoon jackpot expression."
- B normal: "Stylized 3D game avatar of a cheerful elderly man with white hair, bushy white eyebrows and large
  glasses, grey suit and plain tie, slightly oversized head, soft matte shading, dark green felt background
  with soft gold glow." + tail
- B "$ eyes": same B prompt + "eyes drawn as shiny gold dollar-sign shapes."

### Elon Musk (`elon-musk`)

- A normal: "Sports trading card style vector illustration of a man in his fifties with short dark brown hair
  and a slight smile, wearing a plain black t-shirt, flat cel shading, thick dark outline, gold rim light,
  burgundy-to-black background with faint diamond lattice." + tail
- A "$ eyes": same + "his eyes are drawn as shiny gold dollar-sign shapes, cartoon jackpot expression."
- B normal: "Stylized 3D game avatar of a man in his fifties with short dark brown hair and a slight smile,
  plain black t-shirt, slightly oversized head, soft matte shading, dark green felt background with soft
  gold glow." + tail
- B "$ eyes": same B prompt + "eyes drawn as shiny gold dollar-sign shapes."

Note: no t-shirt prints, no company names, no rockets or cars with brand shapes in the picture.

## How to review

1. Put the 12 test files in a private folder (not the repo) and show them to the owner side by side.
2. Check each at 1024 px, at 112 px (hub card) and at 48 px (lists): is it still readable, is anything
   odd (text, logos, extra features)?
3. Owner picks A or B (or asks for changes). Write the chosen style and final prompt wording into this file.
4. Only after approval: make the rest, one person at a time, same prompt template.

## How to register an approved portrait

Portraits are looked up in `assets/v2/portraits.js` (one global, `BDPortraits`). It is empty on purpose until the
style is approved. After approval, add entries there (site-relative paths, no leading slash):

```js
(function(root){
  root.BDPortraits = root.BDPortraits || {
    'jensen-huang': { img: 'assets/portraits/jensen-huang.webp', dollar: 'assets/portraits/jensen-huang-dollar.webp' },
    'warren-buffett': { img: 'assets/portraits/warren-buffett.webp', dollar: 'assets/portraits/warren-buffett-dollar.webp' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

What picks them up automatically:
- Billionaire Life hub cards, the game intro and the "Next billionaire" card (`assets/v2/life.js`): use `img`;
  the "Portrait coming soon" line hides when an image exists.
- Lucky five reels (`assets/v2/lucky.js`): `img` on reels, `dollar` for the jackpot close-up.
- Pages accept only plain relative paths (letters, numbers, `-`, `_`, `.`, `/`, no `..`); anything else is ignored
  and the initials plate is shown instead.

Checklist per person before registering:
- [ ] file exists at both paths, 1:1, WebP, under ~150 KB
- [ ] no text, logos or photo look
- [ ] owner has approved the style (not needed per person after the style is approved)
