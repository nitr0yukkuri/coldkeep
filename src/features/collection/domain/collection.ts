export const COLLECTION_ACTIONS = ['pour', 'shake', 'still'] as const;

/**
 * The product scan now asks for a shake. The action-specific artifact is
 * checked at runtime; until a phone/water-bottle model is installed the UI
 * shows `未学習` instead of falling back to the unrelated pour model.
 */
export const MODEL_RECORDING_ACTION = 'shake' as const;

export const COLLECTION_ACTION_LABELS: Record<CollectionAction, string> = {
  pour: '注ぐ',
  shake: '振る',
  still: '静置',
};

export const COLLECTION_ACTION_INSTRUCTIONS: Record<CollectionAction, string> = {
  pour: '水筒へ水を注ぐ音',
  shake: '水筒を振る音',
  still: '水筒を静置した音',
};

export type CollectionAction = (typeof COLLECTION_ACTIONS)[number];

export type CollectionDraft = {
  sessionId: string;
  containerId: string;
  deviceId: string;
  capacityMl: string;
  waterMl: string;
  iceCount: string;
  iceMassG: string;
  temperatureC: string;
  microphoneDistanceCm: string;
  action: CollectionAction;
};

export type CollectionLabels = {
  sessionId: string;
  containerId: string;
  deviceId: string;
  capacityMl: number;
  waterMl: number;
  iceCount: number;
  iceMassG: number;
  temperatureC: number;
  microphoneDistanceCm: number;
  action: CollectionAction;
};

export type CollectionRecord = CollectionLabels & {
  recordingId: string;
  recordedAt: string;
  audioFilename: string;
  sampleRateHz: number;
  channels: number;
  bitDepth: number;
  durationSeconds: number;
  platform: string;
};

export const COLLECTION_CSV_HEADER = [
  'recording_id',
  'recorded_at',
  'session_id',
  'container_id',
  'device_id',
  'capacity_ml',
  'water_ml',
  'ice_count',
  'ice_mass_g',
  'temperature_c',
  'microphone_distance_cm',
  'action',
  'audio_filename',
  'sample_rate_hz',
  'channels',
  'bit_depth',
  'duration_seconds',
  'platform',
].join(',');

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (normalized.length > 80) {
    throw new Error(`${label} is too long`);
  }
  return normalized;
}

function numberInRange(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
  integer = false,
): number {
  if (!value.trim()) {
    throw new Error(`${label} is required`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  if (integer && !Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
}

export function validateCollectionDraft(draft: CollectionDraft): CollectionLabels {
  const labels: CollectionLabels = {
    sessionId: requiredText(draft.sessionId, 'Session ID'),
    containerId: requiredText(draft.containerId, 'Container ID'),
    deviceId: requiredText(draft.deviceId, 'Device ID'),
    capacityMl: numberInRange(draft.capacityMl, 'Capacity', 1, 10_000),
    waterMl: numberInRange(draft.waterMl, 'Water amount', 0, 10_000),
    iceCount: numberInRange(draft.iceCount, 'Ice count', 0, 100, true),
    iceMassG: numberInRange(draft.iceMassG, 'Ice mass', 0, 5_000),
    temperatureC: numberInRange(draft.temperatureC, 'Temperature', -20, 100),
    microphoneDistanceCm: numberInRange(
      draft.microphoneDistanceCm,
      'Microphone distance',
      0,
      500,
    ),
    action: draft.action,
  };
  if (labels.waterMl > labels.capacityMl) {
    throw new Error('Water amount cannot exceed container capacity');
  }
  if ((labels.iceCount === 0) !== (labels.iceMassG === 0)) {
    throw new Error('Ice count and ice mass must both be zero or both be positive');
  }
  return labels;
}

export function createRecordingId(
  labels: Pick<CollectionLabels, 'sessionId' | 'containerId'>,
  recordedAt: Date,
): string {
  const safe = (value: string) =>
    value
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'unknown';
  const timestamp = recordedAt.toISOString().replace(/[-:.TZ]/g, '');
  return `${timestamp}_${safe(labels.sessionId)}_${safe(labels.containerId)}`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function collectionRecordToCsv(record: CollectionRecord): string {
  return [
    record.recordingId,
    record.recordedAt,
    record.sessionId,
    record.containerId,
    record.deviceId,
    record.capacityMl,
    record.waterMl,
    record.iceCount,
    record.iceMassG,
    record.temperatureC,
    record.microphoneDistanceCm,
    record.action,
    record.audioFilename,
    record.sampleRateHz,
    record.channels,
    record.bitDepth,
    record.durationSeconds.toFixed(3),
    record.platform,
  ]
    .map(csvCell)
    .join(',');
}
