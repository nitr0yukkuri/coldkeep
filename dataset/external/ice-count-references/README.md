# Exact-count ice references (research only)

The first four MP3 files are CC0 Freesound previews whose **author descriptions**
mention an ice-cube count. They are kept separately from
`dataset/manifest.csv` because the count is not ColdKeep-measured ground truth:
the recordings use glasses/tumblers, different actions, and unknown capture
devices rather than the phone + insulated-bottle protocol.

The pack also includes `bigsoundbank_2125_three_whisky.mp3`, a CC0/public-domain
BigSoundBank reference whose page describes three cubes placed in a whisky
glass. It is included for the same feature/transient probe only; the page's
description is not a ColdKeep measurement and `production_label_eligible=false`
is mandatory.

The machine-readable provenance and SHA256 values are in `manifest.csv`.
Allowed uses are feature/onset inspection, decoder tests, and explicitly
research-only augmentation. `production_label_eligible=false` is intentional;
these files must never be mapped to `none`, `few`, or `many` by
`ml/train_shake_ice_amount.py`.

The files are previews, not the original uploads. The preview URL, original
source page, author wording, and license evidence are preserved in the
manifest so a future researcher can re-check the source and download terms.
