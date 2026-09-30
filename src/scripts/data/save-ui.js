import { factorySettings } from './backup-codec.js';
import { mergeBackupForSwitch } from './merge-project-data.js';

const serverOrigin = 'http://127.0.0.1:4173';
const loopback = origin => {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
};

export function mergeHandoff(source, project) {
  if (source?.format !== 'arena-duel.backup' || source.version !== 1 ||
      !Object.hasOwn(source, 'settings') || !Object.hasOwn(source, 'presets')) throw new Error('Invalid handoff');
  return mergeBackupForSwitch(source, project, factorySettings());
}

export function bindSaveUI({ storage, i18n, banner, message, move, browser, project, retry,
  chooseOverlaps = async () => null }) {
  const target = new URL(location.href);
  const isProjectServer = target.origin === serverOrigin;
  const handoffNonce = target.searchParams.get('handoff');
  let handoffWindow = null;
  let outgoingNonce = null;
  let lastStatus;
  let mergeReloadScheduled = false;
  function render(status = storage.getSaveState()) {
    lastStatus = status;
    const { state, liveServer, mode = 'project' } = status;
    banner.hidden = false;
    banner.dataset.saveState = state;
    message.textContent = i18n.t(liveServer && mode === 'project' ? 'save.live_server' :
      state === 'saved' ? `save.saved_${mode}` : `save.${state.replaceAll('-', '_')}`, { mode: i18n.t(`storage.mode_${mode}`) });
    move.hidden = !(liveServer && mode === 'project');
    browser.hidden = project.hidden = state !== 'conflict';
    retry.hidden = !['retrying', 'file-error', 'waiting-for-server'].includes(state) || liveServer;
    if (state === 'saved' && status.remoteMerge && !mergeReloadScheduled) {
      mergeReloadScheduled = true;
      setTimeout(() => location.reload(), 100);
    }
  }
  storage.subscribeSaveState(render);
  i18n.subscribe(() => render(lastStatus));
  function startProjectHandoff() {
    outgoingNonce = crypto.randomUUID();
    const url = new URL(serverOrigin + '/');
    url.searchParams.set('handoff', outgoingNonce);
    url.searchParams.set('source', location.origin);
    handoffWindow = window.open(url, 'arena-duel-project-handoff');
    if (!handoffWindow) message.textContent = i18n.t('save.allow_popup');
  }
  move.addEventListener('click', startProjectHandoff);
  browser.addEventListener('click', async () => {
    try { if (await storage.resolveConflict('browser')) location.reload(); }
    catch { render(storage.getSaveState()); }
  });
  project.addEventListener('click', async () => {
    try { if (await storage.resolveConflict('project')) location.reload(); }
    catch { render(storage.getSaveState()); }
  });
  retry.addEventListener('click', () => {
    void (storage.getMode?.() === 'folder' ? storage.reconnect() : storage.syncPending()).catch(() => {});
  });
  window.addEventListener('message', async event => {
    if (!loopback(event.origin) || !event.data || event.data.type !== 'arena-duel-handoff') return;
    if (event.data.phase === 'ready' && event.source === handoffWindow && event.origin === serverOrigin &&
        event.data.nonce === outgoingNonce) {
      try {
        const backup = await storage.exportBackup();
        handoffWindow.postMessage({ type: 'arena-duel-handoff', phase: 'transfer', nonce: outgoingNonce, backup }, serverOrigin);
      } catch { message.textContent = i18n.t('save.handoff_failed'); }
      return;
    }
    if (event.data.phase === 'done' && event.source === handoffWindow && event.origin === serverOrigin &&
        event.data.nonce === outgoingNonce) {
      location.assign(serverOrigin + '/');
      return;
    }
    if (event.data.phase === 'failed' && event.source === handoffWindow && event.origin === serverOrigin &&
        event.data.nonce === outgoingNonce) {
      message.textContent = i18n.t('save.handoff_failed');
      return;
    }
    if (!isProjectServer || !handoffNonce || event.source !== window.opener || event.data.nonce !== handoffNonce ||
        event.data.phase !== 'transfer') return;
    try {
      if (JSON.stringify(event.data.backup).length > 2 * 1024 * 1024) throw new Error('Handoff too large');
      const switched = await storage.switchMode('project', { sourceBackup: event.data.backup, chooseOverlaps });
      if (!switched) {
        window.opener.postMessage({ type: 'arena-duel-handoff', phase: 'failed', nonce: handoffNonce }, event.origin);
        return;
      }
      window.opener.postMessage({ type: 'arena-duel-handoff', phase: 'done', nonce: handoffNonce }, event.origin);
      window.close();
      if (!window.closed) setTimeout(() => location.replace(serverOrigin + '/'), 500);
    } catch (error) {
      console.warn('Handoff failed', error);
      window.opener.postMessage({ type: 'arena-duel-handoff', phase: 'failed', nonce: handoffNonce }, event.origin);
      message.textContent = i18n.t('save.handoff_failed');
    }
  });
  if (isProjectServer && handoffNonce && window.opener) {
    const source = target.searchParams.get('source');
    if (source && loopback(source)) window.opener.postMessage({ type: 'arena-duel-handoff', phase: 'ready', nonce: handoffNonce }, source);
  }
  return Object.freeze({ startProjectHandoff });
}
