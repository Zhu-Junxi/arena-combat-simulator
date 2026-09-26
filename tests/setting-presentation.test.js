import test from 'node:test';
import assert from 'node:assert/strict';

import { displayControl, fromDisplayValue, presentationFor, toDisplayValue } from '../src/scripts/customization/setting-presentation.js';

test('percentage settings display as whole percentages and retain their stored decimal values', () => {
  const presentation = presentationFor('markMoveSlowPerMark');
  assert.equal(toDisplayValue(0.05, presentation), 5);
  assert.equal(fromDisplayValue(5, presentation), 0.05);
  assert.equal(toDisplayValue(0.0501, presentation), 5.01);
  assert.equal(fromDisplayValue(5.01, presentation), 0.0501);
  assert.deepEqual(displayControl({ min: 0, max: 0.25, step: 0.0001 }, presentation), { min: 0, max: 25, step: 0.01 });
});

test('multipliers and ordinary unit values preserve their stored representation', () => {
  assert.equal(toDisplayValue(1.5, presentationFor('timeScale')), 1.5);
  assert.equal(fromDisplayValue(220, presentationFor('movementSpeed')), 220);
  assert.deepEqual(displayControl({ min: 25, max: 440, step: 0.001 }, presentationFor('movementSpeed')), { min: 25, max: 440, step: 0.001 });
});
