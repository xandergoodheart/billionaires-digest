# Font sources

These TTFs are used only by `scripts/lib/og.mjs` to render the Open Graph (share) images. The web
pages load the same families from Google Fonts CSS and do not use these files.

Since the v2 casino redesign (September 27, 2026) the share images use only Barlow Condensed ExtraBold
and Barlow SemiBold. DM Serif Display, Newsreader and Inter were the v1 share-image fonts; they are no
longer used by og.mjs but are kept in place.

All four families are licensed under the SIL Open Font License 1.1 (OFL). The license text for each
is kept next to the font (`OFL-*.txt`). The OFL allows use, bundling and redistribution; the fonts may
not be sold on their own. Static (non-variable) files are required: satori's font parser rejects the
variable Newsreader and Inter files that google/fonts ships.

| File | Downloaded from |
| --- | --- |
| `DMSerifDisplay-Regular.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf |
| `OFL-DMSerifDisplay.txt` | https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/OFL.txt |
| `Newsreader72pt-SemiBold.ttf` | https://raw.githubusercontent.com/productiontype/Newsreader/master/fonts/static/ttf/Newsreader72pt-SemiBold.ttf (Production Type's official repo; 72pt optical size, the display cut used for large headlines) |
| `OFL-Newsreader.txt` | https://raw.githubusercontent.com/productiontype/Newsreader/master/OFL.txt |
| `Inter-Regular.ttf` | https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip → `extras/ttf/Inter-Regular.ttf` (official Inter 4.1 release asset) |
| `Inter-SemiBold.ttf` | same zip → `extras/ttf/Inter-SemiBold.ttf` |
| `OFL-Inter.txt` | same zip → `LICENSE.txt` (SIL OFL 1.1) |
| `BarlowCondensed-ExtraBold.ttf` | https://github.com/google/fonts/tree/main/ofl/barlowcondensed (SIL OFL 1.1) |
| `Barlow-SemiBold.ttf` | https://github.com/google/fonts/tree/main/ofl/barlow (SIL OFL 1.1) |
| `OFL-Barlow.txt` | google/fonts `ofl/barlow/OFL.txt` (SIL OFL 1.1; the same license covers Barlow Condensed) |

DM Serif Display, Newsreader and Inter downloaded September 24, 2026; Barlow files added September 27, 2026.
