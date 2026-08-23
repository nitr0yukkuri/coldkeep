# ColdKeep ice-audio research

## Scope and non-goals

ColdKeep's public target is deliberately coarse: `none` = 0 cubes, `few` =
1--2, and `many` = 3 or more. A sound effect does not carry an auditable cube
count, so no external file in this document is a `few` or `many` training
label. The files are references for ice presence, transient/onset design,
hard-negative review, and optional, separately marked augmentation only.

The checked-in `ml/artifacts/shake_ice_amount_pilot.json` remains
`untrained`; there is no local measured ColdKeep shake corpus to support a
precision claim.

## Required GitHub sources

| GitHub file | Upstream/source | license evidence | provenance | allowed use |
| --- | --- | --- | --- | --- |
| [`457590__fabrizio84__ice-cubes.ogg`](https://github.com/AnomalousMedical/AdventureAssets/blob/73e3e1738acb18480337f5ff16cc3dd774a46e42/SoundEffects/Fabrizio84/457590__fabrizio84__ice-cubes.ogg) | [Freesound #457590](https://freesound.org/people/Fabrizio84/sounds/457590/), Fabrizio84 | repository `SoundEffects/Fabrizio84/Credits.json` records `cc0`; Freesound describes public-domain use | AdventureAssets commit `73e3e1738acb18480337f5ff16cc3dd774a46e42`, blob `7e57c1d19e2547eca2f34cc6a42d1f437371754b`, downloaded bytes SHA256 `3411285D7E58603CF4153E03E2849DF08702E494B4A0E7A18E3EC8F07C50E425` | qualitative ice/event reference, onset detector fixture, augmentation candidate |
| [`freeze-ice-cubes-hq.ogg`](https://github.com/Udkam/reproduction-tetris/blob/e675389500cdae8063da4d37f4cdda47a62ffe76/src/assets/audio/t37/freeze-ice-cubes-hq.ogg) | [Freesound #819779](https://freesound.org/people/sbml/sounds/819779/), sbml | Udkam [`CC0-1.0.txt`](https://github.com/Udkam/reproduction-tetris/blob/e675389500cdae8063da4d37f4cdda47a62ffe76/licenses/audio/CC0-1.0.txt) and [`t37-audio-manifest.json`](https://github.com/Udkam/reproduction-tetris/blob/e675389500cdae8063da4d37f4cdda47a62ffe76/licenses/audio/t37-audio-manifest.json) | Udkam commit `e675389500cdae8063da4d37f4cdda47a62ffe76`, blob `12e767d2157f3ed2150a743ac2c161f8f99207f1`, runtime OGG SHA256 `5A68425717DE348BA3D10767618FA4C428A97F26C2E85ABC96F45B7BFB35A450`; manifest says the original 96 kHz WAV archive is still pending | short ice event / preprocessing reference; not a cube-count label |

The GitHub repositories themselves do not provide a product dataset license
for every file. The file-level credit/manifest is the evidence used here; a
future redistribution must retain those notices and re-check the upstream
terms.

## Other candidates found

- The Udkam history/tree also contains `ecfike-ice-crack-9-hq.ogg`,
  `giwake-ice-breaking-1-hq.ogg`, and `ledas-luzta-4.ogg`. They are candidate
  hard/event references, but the checked-in audio manifest does not provide the
  same file-level source/license proof as `freezeIce`; they are not imported.
- The existing `dataset/external/ice-references/manifest.csv` records CC0
  Freesound references including bottle clips from SmeckoGeck (stainless,
  plastic, and water-only), Rvgerxini's “3 ice hitting the sides of a glass”,
  Glitchedtones glass-shake clips, and other glass/cup sounds. Those are useful
  for qualitative domain review, but they are independent recordings without
  ColdKeep's controlled bottle/phone/count labels.
- Suitable hard negatives for a later controlled augmentation set are keys,
  coins, glass clinks, metal/plastic rattles, bottle caps, and liquid splashes.
  They must be recorded with the same capture pipeline or explicitly kept as
  external-domain negatives.

## Domain gap

[CORSMAL's catalogue](https://corsmal.github.io/data.html) describes 1,140
audio-visual-inertial container interactions across 15 containers, three
levels, and three filling types. The [CCM protocol](https://corsmal.github.io/containers_manip.html)
uses an eight-microphone circular array at 44.1 kHz and food boxes/cups/glasses,
with container-held-out public/private splits. That is valuable for action and
feature pretraining, but it is not a water-bottle phone recording and has no
`ice_count`. The local repository records the dataset as CC BY-NC 4.0; any
commercial/redistribution use needs a separate license review.

The same restriction applies to Freesound and GitHub effect files: a model
that separates “this studio glass effect” from “that other effect” has learned
recording provenance, not ColdKeep ice amount. Product evidence must come from
measured ColdKeep recordings and group-held-out evaluation.

## Reproducibility

The fixture hashes and file metadata are documented above. The actual
feature/ablation commands and the rule that external audio cannot supply
`none/few/many` labels are in [`DATA_COLLECTION.md`](DATA_COLLECTION.md) and
[`ml/README.md`](ml/README.md).
