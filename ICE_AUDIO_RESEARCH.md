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
| [`bigsoundbank_2125_three_whisky.mp3`](dataset/external/ice-count-references/bigsoundbank_2125_three_whisky.mp3) | [BigSoundBank #2125](https://bigsoundbank.com/ice-cubes-in-a-glass-3-s2125.html) describes “3 ice cubes put in a whisky glass”; the page lists a studio mono 48 kHz recording by Joseph SARDIN | page states CC0/public domain; MP3 SHA256 `1983BAFCB1351D3F8A735E07F1DA0168CF75A448EA67797136E6A14AFFF964BD` | repeated three-cube transient reference and decoder/onset probe only; never a ColdKeep `few`/`many` label |
| [Freesound #406250](https://freesound.org/people/Anthousai/sounds/406250/) | author describes shaking a glass cup containing ice; Tascam DR-40, stereo 96 kHz/24-bit, 1.746 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed | shake-domain presence and hard-negative review only; no auditable cube count, so never a `none/few/many` label |
| [Freesound #457641](https://freesound.org/people/AudioWay/sounds/457641/) | “Cup of Ice, Shaking”; recorded with an iPhone, then edited in FL Studio 20; stereo 48 kHz/24-bit, 0.685 s; the page has a `six` tag but no measured count in the description | Attribution 4.0 is shown on the source page; no local bytes/SHA256 are claimed | closest public shake-domain reference for detector review; the `six` tag is not ground truth and must not become an amount label |
| [Freesound #485041](https://freesound.org/people/Rvgerxini/sounds/485041/) | author description: “A cut recording of an ice cube dropping into water”; stereo MP3, 44.1 kHz, 0.628 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed | single-impact/onset reference only; drop-into-water action is not bottle shaking |
| [Freesound #555043](https://freesound.org/people/izzytherobloxgamer09/sounds/555043/) | author description: one ice cube falling into a cup; CC0 source page | preview hash `14575FED5F55ED7B81E01836A04E859093E3ED91C5DBD2A6019317D7EB50A8E0` was used only in the temporary feature probe; no repository audio is claimed | single-impact transient reference only; not a ColdKeep label |
| [Freesound #682741](https://freesound.org/people/thomasanthony321/sounds/682741/) | author description: “One ice cube being poured into a glass softly”; WAV, mono, 48 kHz, 24-bit, 2.620 s | CC0 is shown on the source page; download requires Freesound login, so no local bytes/SHA256 are claimed here | candidate for a separately tracked research probe after download; never production labels |
| [Freesound #682740](https://freesound.org/people/thomasanthony321/sounds/682740/) | author description: “One ice cube being poured into a glass loud”; WAV, mono, 48 kHz, 24-bit, 1.229 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed here | loud/soft within-author contrast for transient robustness; never production labels |
| [Freesound #784069](https://freesound.org/people/nifigasebesharik/sounds/784069/) | author description: “Three ice cubes in a red wine glass”; AIFF, mono, 96 kHz, 24-bit, 42.642 s | CC0 is shown on the source page; download requires Freesound login, so no local bytes/SHA256 are claimed here | candidate for transient/decay inspection only; glass-internal microphone is a major domain gap |
| [Freesound #634782](https://freesound.org/people/Lewooz/sounds/634782/) | author description: “4 ice cubes falling in a tumbler”; MP3, stereo 44.1 kHz, 3.433 s | CC0 is shown on the source page; no local bytes/SHA256 are claimed here | exact-count provenance lead for a four-cube event; glass/tumbler and falling action are not ColdKeep labels |
| [BigSoundBank #2124](https://bigsoundbank.com/ice-cubes-in-a-glass-2-s2124.html), [#2125](https://bigsoundbank.com/ice-cubes-in-a-glass-3-s2125.html), [#2128](https://bigsoundbank.com/ice-cubes-in-a-glass-6-s2128.html) | each page describes “3 ice cubes put in a whisky glass”; studio mono 48 kHz/24-bit, ~1 s | pages state CC0/public domain and expose WAV/MP3/OGG downloads; no local bytes are claimed until downloaded and hashed | repeated three-cube transient references and hard-negative review; not ColdKeep labels |

The one- and three-cube pages provide provenance leads, not a license to infer
that a louder or denser event means `many`. The only labels accepted by
`ml/train_shake_ice_amount.py` remain rows with
`label_source=coldkeep_measured` and an exact measured `ice_count`.

### Additional public-data leads checked in the second search pass

The search was extended beyond GitHub effect-file mirrors to academic
repositories, open dataset catalogs, and audio-question-answer benchmarks:

| lead | what was actually available | decision |
| --- | --- | --- |
| [Frissen, Sagou & Overvliet (2026)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12830427/) | An open human-perception study of beads in handheld cardboard boxes. It reports auditory-only and auditory-haptic enumeration, but the public article exposes study results and procedure rather than a redistributable phone-recorded raw-audio corpus with per-file object counts. | Use as a feature/design hypothesis only. It supports collision-density reasoning, not ColdKeep training or accuracy evidence. |
| [GLDKWY/Water-Filling-Level](https://github.com/GLDKWY/Water-Filling-Level) (ATVfle) | 1,140 audio-visual recordings for empty/50%/90% containers holding water, rice, or pasta. The repository documents a jaw-mounted BOYA microphone and provides annotations/model links, but no ice recordings or `ice_count`; the data are a pouring/filling-level domain with different hardware. | Candidate for future liquid-level/domain pretraining only. It cannot supply `none/few/many` ice labels. |
| [AV-Phys Bench example C1-1-43](https://zijuncui.com/AV-Phys/videos/C1-1-43/) | A generated video prompt/example describes a clear bottle with water and “several ice cubes” being shaken. It has no measured cube count and uses generated/proprietary or benchmark media rather than a controlled recording corpus. | Qualitative multimodal sanity reference only; not imported or used for labels. |
| [MMAU-Pro](https://huggingface.co/datasets/gamma-lab-umd/MMAU-Pro) | Wild audio paired with expert QA under CC BY-NC 4.0. Ice-related questions can test general audio reasoning, but the benchmark is not a controlled bottle dataset and its license is unsuitable for the product artifact without a separate review. | Evaluation/domain-gap lead only; no ColdKeep amount labels or production weights. |

These leads do not change the data contract. In particular, “several ice
cubes”, a benchmark answer, or an author-written effect description is not
treated as measured `ice_count` for the ColdKeep trainer.

### Additional search pass: bottle, rattle, and count-adjacent audio

The third search pass also checked public sound indexes and audio benchmarks
for a closer recording setup or an explicit count. The results still do not
provide a ColdKeep-compatible supervised corpus:

| lead | what is available | decision |
| --- | --- | --- |
| [Freesound #463291](https://freesound.org/people/eirelgeux/sounds/463291/) | The author page lists “Dropping ice cubes into my metal water bottle”. It is the closest public container description found, but the page does not expose an auditable cube count, phone capture metadata, or a checked-in raw file/license record. | Bottle-domain qualitative lead only; do not download into the training manifest or assign an amount class. |
| [Freesound #432351](https://freesound.org/s/432351/) | CC0 recording of multiple ice cubes dropped into a metallic tumbler; the description gives no exact count and uses a Tascam microphone. | Metal-container transient and hard-negative probe only; no `none/few/many` label. |
| [Freesound #706046](https://freesound.org/people/o_charlyv/sounds/706046/) | CC0 recording of liquid and ice cubes in a metal thermos; the action is filling/pouring, not shaking, and no count is given. | Thermos/domain-gap reference only; not a shake or count example. |
| [AudioSet `Rattle`](https://research.google.com/audioset/dataset/rattle.html) | The ontology has 1,072 noisy “small hard items loose inside a container” clips, but labels are weak event tags, not ice presence or cube count, and source videos are not redistributed raw audio. | Hard-negative/open-set pretraining lead only; no production labels or weights. |
| [Acoustics.org ice-presence study](https://acoustics.org/tag/ice/) | A separate marine study reports audio classification of whether ice is present in water, not how many cubes are in a bottle; the sensor/domain is unrelated. | Feasibility/feature-design reference only. |

This pass increases the negative/reference coverage, but it does not change the
conclusion: there is still no public raw dataset with phone + insulated bottle
recordings and measured `ice_count` across nuisance holdouts. The production
trainer must therefore continue to reject all of these leads.

Four CC0 previews that were obtainable without the original-download login are
checked in separately under
[`dataset/external/ice-count-references`](dataset/external/ice-count-references).
Their `manifest.csv` records the author wording, preview URL, SHA256, and an
explicit `production_label_eligible=false` guard. The feature-only output is
[`ml/reports/exact_count_ice_feature_probe.json`](ml/reports/exact_count_ice_feature_probe.json);
it is not a supervised amount dataset.

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

### Checked-in shake-domain reference pack

The [`ice-shake-references`](dataset/external/ice-shake-references) directory
contains ten CC0 Freesound previews from the [`creeeeak` ice-cubes pack](https://freesound.org/people/creeeeak/packs/24823/).
The individual source pages describe ice being rolled, dropped, stirred, or
shaken in a glass/jar; several mention an SM57/SM58 microphone. None supplies a
measured cube count, insulated-bottle geometry, or phone recording. Their
`manifest.csv` stores the source URL, preview URL, description, and SHA256;
every row is explicitly `production_label_eligible=false`.

The feature-only result is
[`ml/reports/ice_shake_reference_probe.json`](ml/reports/ice_shake_reference_probe.json).
All ten previews decoded with zero diagnostics. They are useful for checking
whether transient detectors behave sensibly on shake-like ice events, but they
remain presence/domain references and cannot train `none`/`few`/`many`.

### Water-bottle shake hard negatives

The [`hard-negative-references`](dataset/external/hard-negative-references)
directory adds four CC0 Freesound previews that are closer to the ColdKeep
action domain but describe liquid-only or unspecified bottle shaking rather than
ice. The sources include a Zoom H2 recording of bottles with liquid
([qubodup #184287](https://freesound.org/people/qubodup/sounds/184287/)), a
contact-microphone bottle shake ([bushi3593 #219371](https://freesound.org/people/bushi3593/sounds/219371/)), a short water-bottle shake
([florian_reinke #63527](https://freesound.org/people/florian_reinke/sounds/63527/)),
and a condenser-mic plastic bottle recording
([dylanperitz #452364](https://freesound.org/people/dylanperitz/sounds/452364/)).
The local manifest stores preview SHA256 values and sets
`production_label_eligible=false` for every row. The feature probe decoded all
four previews with zero diagnostics; its output is
[`ml/reports/hard_negative_water_bottle_probe.json`](ml/reports/hard_negative_water_bottle_probe.json).
They can test bottle-domain false positives and augmentation plumbing only;
they cannot supply an ice-count label or production accuracy evidence.

### EPIC-SOUNDS hard-negative metadata (not imported)

The public [EPIC-SOUNDS annotation repository](https://github.com/epic-kitchens/epic-sounds-annotations)
contains four useful `glass clink` / `glass-only collision` annotations in the
training CSV (participant/video `P10_04`, plus a `clink` annotation in
`P26_108`). The dataset is an egocentric kitchen corpus, not a controlled
ice-in-bottle recording; its license is CC BY-NC 4.0 and the repository
distributes timestamps/metadata while the source videos require a separate
download step. We therefore record it as a hard-negative lead only. No
EPIC-SOUNDS audio or annotation is used as a ColdKeep amount label, and no
file is copied into the training manifest.

### Count-adjacent datasets checked in the latest pass

Two additional leads were checked because they expose an object-count field or
an event-density annotation, but neither is a ColdKeep audio corpus:

| lead | what is actually labelled | decision |
| --- | --- | --- |
| [FoleySet](https://www.researchgate.net/publication/408047005_FoleySet_A_Multi-Level_Human-Annotated_Foley_Sound_Dataset) | A 10,000-clip CC0 Freesound-derived Foley collection with `one-shot`/`multi-shot`, `IceCube`, and other material-interaction categories. It does not measure how many cubes are inside a container, and many clips are studio effects. | Useful for event-density and hard-negative feature review only; never a `none/few/many` target. |
| [Laser Vibrations](https://huggingface.co/datasets/eturok-weizmann/laser-vibrations) | 551 cardboard-box vibration samples expose `n_objects`, but the signal is reconstructed from a 10×10 laser-speckle array while loudspeakers excite the box. | Count-adjacent pretraining/reference only; the sensor, box, excitation, and object domain are not phone microphone plus ice in a bottle. |

These datasets strengthen the feature-design hypothesis but do not remove the
missing-data blocker: no searched source provides measured `ice_count` from the
ColdKeep capture protocol.

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
