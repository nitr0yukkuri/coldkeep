# Water-bottle shake hard negatives (research only)

These four CC0 Freesound previews are close to the ColdKeep action domain but
do not contain measured ice counts. They are kept as **hard negatives** for
feature/onset inspection and future robustness augmentation only:

- `qubodup #184287`: bottles with liquid, recorded with Zoom H2.
- `bushi3593 #219371`: bottle shake/opening with a contact crystal microphone.
- `florian_reinke #63527`: a water bottle being shaken.
- `dylanperitz #452364`: plastic water bottle shaken with a condenser mic.

The files are low-quality Freesound previews, not the original uploads. The
manifest records the source page, preview URL, author-described recording
conditions, source license, and local SHA256. The preview transcode may differ
from the source format metadata shown on the source page.

These files must never be mapped to `none`, `few`, or `many`; every row has
`production_label_eligible=false`. They contain no `ice_count`, `ice_mass_g`,
container holdout, device holdout, or ColdKeep phone/water-bottle protocol.
