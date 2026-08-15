import {
  COLLECTION_ACTION_LABELS,
  COLLECTION_ACTION_INSTRUCTIONS,
  COLLECTION_ACTIONS,
  MODEL_RECORDING_ACTION,
} from '../src/features/collection/domain/collection';

test('the scan contract is explicit about the evaluated recording action', () => {
  expect(MODEL_RECORDING_ACTION).toBe('pour');
  expect(COLLECTION_ACTIONS).toEqual(['pour', 'shake', 'still']);
  expect(COLLECTION_ACTIONS).toContain(MODEL_RECORDING_ACTION);
  expect(COLLECTION_ACTION_LABELS[MODEL_RECORDING_ACTION]).toBe('注ぐ');
  expect(COLLECTION_ACTION_INSTRUCTIONS[MODEL_RECORDING_ACTION]).toBe('水筒へ水を注ぐ音');
});
