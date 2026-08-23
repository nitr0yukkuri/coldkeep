# Exact-count ice references (research only)

These four MP3 files are CC0 Freesound previews whose **author descriptions**
mention an ice-cube count. They are kept separately from
`dataset/manifest.csv` because the count is not ColdKeep-measured ground truth:
the recordings use glasses/tumblers, different actions, and unknown capture
devices rather than the phone + insulated-bottle protocol.

The machine-readable provenance and SHA256 values are in `manifest.csv`.
Allowed uses are feature/onset inspection, decoder tests, and explicitly
research-only augmentation. `production_label_eligible=false` is intentional;
these files must never be mapped to `none`, `few`, or `many` by
`ml/train_shake_ice_amount.py`.

The files are previews, not the original uploads. The preview URL, original
source page, author wording, and license evidence are preserved in the
manifest so a future researcher can re-check the source and download terms.
