# Font sources

These TTFs are used only by `scripts/lib/og.mjs` to render the Open Graph (share) image for each
edition. The web pages load the same families from Google Fonts CSS and do not use these files.

All three families are licensed under the SIL Open Font License 1.1 (OFL). The license text for each
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

Downloaded September 24, 2026.
