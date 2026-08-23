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

### Descriptive exact-count references (research-only)

These sources are unusually useful because the author describes an exact
number of cubes. They still do **not** satisfy the ColdKeep production-label
contract: they were not recorded through the ColdKeep bottle/phone protocol,
and the descriptions are not independently measured metadata. Keep them out
of `dataset/manifest.csv` and never map them to `none`/`few`/`many` in the
production trainer.

| source | auditable description | license / local provenance | allowed use |
| --- | --- | --- | --- |
| [`ice_cubes_glass_2182.wav`](dataset/external/soundbible/ice_cubes_glass_2182.wav) | SoundBible entry is recorded in the local manifest as “two ice cubes into glass” | CC BY 3.0; local WAV is stereo 44.1 kHz/16-bit, 1.566 s, SHA256 `1F32DB6A439493120AD6E97B9D292443F2018EAA8710FB70F7A9143F6ACE7EF6` | onset/transient sanity check and qualitative feature inspection; attribution required for redistribution |
| [Freesound #406250](https://freesound.org/people/Anthousai/sounds/406250/) | author describes shaking a glass cup containing ice; Tascam DR-40, stereo 96 kHz/24-bit, 1.746 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed | shake-domain presence and hard-negative review only; no auditable cube count, so never a `none/few/many` label |
| [Freesound #457641](https://freesound.org/people/AudioWay/sounds/457641/) | “Cup of Ice, Shaking”; recorded with an iPhone, then edited in FL Studio 20; stereo 48 kHz/24-bit, 0.685 s; the page has a `six` tag but no measured count in the description | Attribution 4.0 is shown on the source page; no local bytes/SHA256 are claimed | closest public shake-domain reference for detector review; the `six` tag is not ground truth and must not become an amount label |
| [Freesound #485041](https://freesound.org/people/Rvgerxini/sounds/485041/) | author description: “A cut recording of an ice cube dropping into water”; stereo MP3, 44.1 kHz, 0.628 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed | single-impact/onset reference only; drop-into-water action is not bottle shaking |
| [Freesound #555043](https://freesound.org/people/izzytherobloxgamer09/sounds/555043/) | author description: one ice cube falling into a cup; CC0 source page | preview hash `14575FED5F55ED7B81E01836A04E859093E3ED91C5DBD2A6019317D7EB50A8E0` was used only in the temporary feature probe; no repository audio is claimed | single-impact transient reference only; not a ColdKeep label |
| [Freesound #682741](https://freesound.org/people/thomasanthony321/sounds/682741/) | author description: “One ice cube being poured into a glass softly”; WAV, mono, 48 kHz, 24-bit, 2.620 s | CC0 is shown on the source page; download requires Freesound login, so no local bytes/SHA256 are claimed here | candidate for a separately tracked research probe after download; never production labels |
| [Freesound #682740](https://freesound.org/people/thomasanthony321/sounds/682740/) | author description: “One ice cube being poured into a glass loud”; WAV, mono, 48 kHz, 24-bit, 1.229 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed here | loud/soft within-author contrast for transient robustness; never production labels |
| [Freesound #784069](https://freesound.org/people/nifigasebesharik/sounds/784069/) | author description: “Three ice cubes in a red wine glass”; AIFF, mono, 96 kHz, 24-bit, 42.642 s | CC0 is shown on the source page; download requires Freesound login, so no local bytes/SHA256 are claimed here | candidate for transient/decay inspection only; glass-internal microphone is a major domain gap |
| [BigSoundBank #2124](https://bigsoundbank.com/ice-cubes-in-a-glass-2-s2124.html), [#2125](https://bigsoundbank.com/ice-cubes-in-a-glass-3-s2125.html), [#2128](https://bigsoundbank.com/ice-cubes-in-a-glass-6-s2128.html) | each page describes “3 ice cubes put in a whisky glass”; studio mono 48 kHz/24-bit, ~1 s | pages state CC0/public domain and expose WAV/MP3/OGG downloads; no local bytes are claimed until downloaded and hashed | repeated three-cube transient references and hard-negative review; not ColdKeep labels |

The one- and three-cube pages provide provenance leads, not a license to infer
that a louder or denser event means `many`. The only labels accepted by
`ml/train_shake_ice_amount.py` remain rows with
`label_source=coldkeep_measured` and an exact measured `ice_count`.

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

Recent psychophysics work is relevant to the feasibility argument: Frissen,
Sagou, and Overvliet report auditory-only and auditory-haptic enumeration of
1--8 beads in handheld boxes across 96 trials per participant in
[`The role of auditory and haptic cues in object enumeration within containers`](https://pubmed.ncbi.nlm.nih.gov/41575581/).
The paper is a human-perception study rather than a released phone/container
audio corpus; no raw recording package with `ice_count`-equivalent labels was
identified during this search. It supports the collision-tracking hypothesis,
not ColdKeep model training or accuracy claims.

## Reproducibility

The fixture hashes and file metadata are documented above. The actual
feature/ablation commands and the rule that external audio cannot supply
`none/few/many` labels are in [`DATA_COLLECTION.md`](DATA_COLLECTION.md) and
[`ml/README.md`](ml/README.md).
