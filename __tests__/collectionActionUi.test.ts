import {
  COLLECTION_ACTION_LABELS,
  COLLECTION_ACTION_INSTRUCTIONS,
  COLLECTION_ACTIONS,
  MODEL_RECORDING_ACTION,
} from '../src/features/collection/domain/collection';

test('product data collection is fixed to the shake action', () => {
  expect(MODEL_RECORDING_ACTION).toBe('shake');
  expect(COLLECTION_ACTION_LABELS[MODEL_RECORDING_ACTION]).toBe('振る');
  expect(COLLECTION_ACTION_INSTRUCTIONS[MODEL_RECORDING_ACTION]).toBe(
    '水筒を振る音',
  );
  // Legacy action labels stay in the domain for imported/comparison datasets.
  expect(COLLECTION_ACTIONS).toEqual(['pour', 'shake', 'still']);
});
