import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedback } from '../src/scripts/ui/feedback.js';

const element = () => ({ textContent: '', hidden: true, dataset: {}, style: {}, offsetWidth: 200, offsetHeight: 50 });

test('feedback replaces stale toasts and writes localized text to the matching live region', () => {
  const mainStatus = element();
  const dialogStatus = element();
  const mainToast = element();
  const dialogToast = element();
  const timers = new Map();
  let nextTimer = 0;
  let locale = 'en';
  const feedback = createFeedback({
    i18n: { t: key => `${locale}:${key}` }, mainStatus, dialogStatus, mainToast, dialogToast,
    dialog: { open: true }, schedule: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    cancel: id => timers.delete(id)
  });
  feedback.show({ key: 'saved', context: 'dialog' });
  assert.equal(dialogStatus.textContent, 'en:saved');
  assert.equal(dialogToast.hidden, false);
  assert.equal(timers.get(1).delay, 2500);
  feedback.show({ key: 'blocked', tone: 'warning' });
  assert.equal(dialogToast.hidden, true);
  assert.equal(mainStatus.textContent, 'en:blocked');
  assert.equal(mainToast.hidden, false);
  assert.equal(timers.has(1), false);
  assert.equal(timers.get(2).delay, 4500);
  locale = 'zh-CN';
  feedback.refreshLocalization();
  assert.equal(mainStatus.textContent, 'zh-CN:blocked');
  timers.get(2).callback();
  assert.equal(mainToast.hidden, true);
});

test('anchored toasts stay compact and inside the viewport, then reset to the default position', () => {
  const toast = element();
  const feedback = createFeedback({
    i18n: { t: key => key }, mainStatus: element(), dialogStatus: element(), mainToast: toast,
    dialogToast: element(), dialog: { open: false }, viewport: { innerWidth: 800, innerHeight: 600 },
    schedule: () => 1, cancel: () => {}
  });
  feedback.show({ key: 'saved', anchor: { getBoundingClientRect: () => ({ left: 750, top: 550, bottom: 570 }) } });
  assert.deepEqual({ left: toast.style.left, top: toast.style.top, right: toast.style.right, bottom: toast.style.bottom },
    { left: '588px', top: '492px', right: 'auto', bottom: 'auto' });
  feedback.show({ key: 'saved', anchor: { getBoundingClientRect: () => ({ left: 100, top: 40, bottom: 60 }) } });
  assert.equal(toast.style.top, '68px');
  feedback.show({ key: 'saved' });
  assert.equal(toast.style.top, '');
  assert.equal(toast.style.bottom, '');
});
