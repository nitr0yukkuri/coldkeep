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

function isCollectionAction(value: unknown): value is CollectionAction {
  return COLLECTION_ACTIONS.includes(value as CollectionAction);
}

export type CollectionDraft = {
  sessionId: string;
  containerId: string;
  deviceId: string;
  roomId: string;
  operatorId: string;
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
  roomId: string;
  operatorId: string;
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
  /** Provenance of the measured labels. ML trainers only accept this value. */
  labelSource: 'coldkeep_measured';
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
  'label_source',
  'room_id',
  'operator_id',
].join(',');

/**
 * Prevent an app upgrade from silently appending a new-schema row to an old
 * manifest. A mixed CSV could look valid to a spreadsheet but would be
 * rejected by the ML trainer with shifted columns, so fail before writing.
 */
export function normalizeCollectionManifest(existing: string | null): string {
  if (!existing || !existing.trim()) {
    return COLLECTION_CSV_HEADER;
  }
  const firstLine = existing.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].trim();
  if (firstLine !== COLLECTION_CSV_HEADER) {
    throw new Error(
      'Collection manifest schema mismatch; export or migrate the existing dataset before adding recordings',
    );
  }
  return existing;
}

/** Parse the collection manifest just far enough to build a safe export list.
 * This is intentionally dependency-free and supports the CSV quoting emitted
 * by collectionRecordToCsv (commas, quotes, and newlines inside cells). */
function parseManifestCsv(manifest: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < manifest.length; index += 1) {
    const character = manifest[index];
    if (quoted) {
      if (character === '"') {
        if (manifest[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
      if (row.some(value => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) {
    throw new Error('Collection manifest contains an unterminated quoted field');
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Return the only files a dataset export is allowed to contain. */
export function collectionExportFileNames(manifest: string): Set<string> {
  const rows = parseManifestCsv(manifest.replace(/^\uFEFF/, ''));
  if (rows.length === 0 || rows[0].join(',') !== COLLECTION_CSV_HEADER) {
    throw new Error('Collection manifest schema mismatch; cannot export dataset');
  }
  const names = new Set<string>(['manifest.csv']);
  const recordingIds = new Set<string>();
  for (const [index, columns] of rows.slice(1).entries()) {
    if (columns.length !== COLLECTION_CSV_HEADER.split(',').length) {
      throw new Error(`Collection manifest row ${index + 2} has an invalid column count`);
    }
    const recordingId = columns[0];
    const audioFilename = columns[12];
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(recordingId)) {
      throw new Error(`Collection manifest row ${index + 2} has an invalid recording_id`);
    }
    if (recordingIds.has(recordingId)) {
      throw new Error(`Collection manifest row ${index + 2} duplicates recording_id`);
    }
    recordingIds.add(recordingId);
    if (audioFilename !== `audio/${recordingId}.wav`) {
      throw new Error(`Collection manifest row ${index + 2} has an invalid audio_filename`);
    }
    if (columns[18] !== 'coldkeep_measured') {
      throw new Error(`Collection manifest row ${index + 2} has an unsupported label_source`);
    }
    names.add(audioFilename);
    names.add(`metadata/${recordingId}.json`);
  }
  return names;
}

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
  if (!isCollectionAction(draft.action)) {
    throw new Error('Action must be pour, shake, or still');
  }
  const labels: CollectionLabels = {
    sessionId: requiredText(draft.sessionId, 'Session ID'),
    containerId: requiredText(draft.containerId, 'Container ID'),
    deviceId: requiredText(draft.deviceId, 'Device ID'),
    roomId: requiredText(draft.roomId, 'Room ID'),
    operatorId: requiredText(draft.operatorId, 'Operator ID'),
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
  if (['android', 'ios', 'web', 'device-01', 'enter-device-id'].includes(labels.deviceId.toLowerCase())) {
    throw new Error('Device ID must be a stable, operator-entered identifier (not the platform name)');
  }
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
    record.labelSource,
    record.roomId,
    record.operatorId,
  ]
    .map(csvCell)
    .join(',');
}
