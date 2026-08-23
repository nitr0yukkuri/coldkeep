# ACM-S2 shake-action pilot

This derived manifest does not copy audio. The WAV files remain in
`dataset/external/acm-s2/acm_s2_audio/` and are distributed by the ACM-S2
source under CC BY 4.0. The source README documents 21 recordings: 19 pouring
actions and 2 shaking actions. Both shaking recordings use the muesli box
(IDs 11 and 17); the other recordings use the glass/cup containers and are
pouring actions.

`action_labels.csv` records that mapping explicitly so the trainer never
guesses an action from a filename. It is suitable only for the action-gate
pilot. It does not provide ColdKeep water-bottle labels, phone microphone
variation, or empty/half/full shake coverage.
