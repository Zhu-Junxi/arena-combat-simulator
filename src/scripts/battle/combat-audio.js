const SOUNDS = {
  damage: { url: new URL('../../../assets/audio/damage.mp3', import.meta.url), volume: 0.5 },
  swing: { url: new URL('../../../assets/audio/warrior-swing.mp3', import.meta.url), volume: 0.65 },
  bow: { url: new URL('../../../assets/audio/archer-shot.mp3', import.meta.url), volume: 0.65 },
  vines: { url: new URL('../../../assets/audio/archer-vines.mp3', import.meta.url), volume: 0.5 },
  chain: { url: new URL('../../../assets/audio/guardian-chain.wav', import.meta.url), volume: 0.32 },
  hammer: { url: new URL('../../../assets/audio/guardian-hammer-land.wav', import.meta.url), volume: 0.75 },
  shield: { url: new URL('../../../assets/audio/guardian-shield-hit.wav', import.meta.url), volume: 0.45 }
};

export function createCombatAudio({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), fetchAudio = url => fetch(url) } = {}) {
  let context;
  let loading;
  const buffers = new Map();
  const active = new Set();
  const lastDamage = new Map();
  const lastShieldDamage = new Map();
  const chains = new Map();

  // Called directly from the Start click so browsers allow subsequent battle audio.
  async function unlock() {
    try {
      context ??= createContext();
      await context.resume();
      loading ??= Promise.all(Object.entries(SOUNDS).map(async ([key, sound]) => {
        const response = await fetchAudio(sound.url);
        if (!response.ok) throw new Error(`Audio load failed: ${key}`);
        buffers.set(key, await context.decodeAudioData(await response.arrayBuffer()));
      })).catch(error => { loading = null; console.warn('Battle audio unavailable', error); });
      await loading;
    } catch (error) {
      console.warn('Battle audio unavailable', error);
    }
  }

  function stop() {
    for (const source of active) source.stop();
    active.clear();
    lastDamage.clear();
    lastShieldDamage.clear();
    chains.clear();
  }

  function play(key, { loop = false, rate = 1 } = {}) {
    if (context?.state !== 'running' || !buffers.has(key)) return;
    // Bound overlapping voices even under accelerated/custom battle settings.
    if (active.size >= 8) {
      const oldest = active.values().next().value;
      oldest.stop();
      active.delete(oldest);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffers.get(key);
    source.loop = loop;
    source.playbackRate.value = rate;
    gain.gain.value = SOUNDS[key].volume;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      active.delete(source);
      for (const [side, chain] of chains) if (chain === source) chains.delete(side);
      source.disconnect();
      gain.disconnect();
    };
    active.add(source);
    source.start();
    return source;
  }

  function stopChain(fighter) {
    const source = chains.get(fighter.side);
    chains.delete(fighter.side);
    if (source && active.has(source)) source.stop();
  }

  function handleEvent(event) {
    if (event.type === 'reset' || event.type === 'stopped') { stop(); return; }
    if (event.type === 'attack-released' && event.fighter.character.id === 'warrior') play('swing');
    if (event.type === 'attack-released' && event.fighter.character.id === 'archer') play('bow');
    if (event.type === 'vines-applied') play('vines');
    if (event.type === 'flail-spawned' || event.type === 'flail-returning') {
      stopChain(event.fighter);
      const source = play('chain', { loop: true, rate: event.type === 'flail-returning' ? 1.1 : 1 });
      if (source) chains.set(event.fighter.side, source);
    }
    if (event.type === 'flail-landed') {
      stopChain(event.fighter);
      play('hammer');
    }
    if (event.type === 'flail-removed') stopChain(event.fighter);
    if (event.type === 'shield-damaged' && event.amount > 0 && context) {
      const key = event.target.side;
      const now = context.currentTime;
      const interval = event.damageType ? 0.35 : 0.09;
      if (now - (lastShieldDamage.get(key) ?? -Infinity) >= interval) {
        lastShieldDamage.set(key, now);
        play('shield');
      }
    }
    if ((event.type === 'damage' || event.type === 'damage-over-time') && event.amount > 0 && context) {
      const key = event.target.side;
      const now = context.currentTime;
      const interval = event.type === 'damage-over-time' ? 0.35 : 0.07;
      if (now - (lastDamage.get(key) ?? -Infinity) < interval) return;
      lastDamage.set(key, now);
      play('damage');
    }
  }

  return { unlock, handleEvent, stop };
}
