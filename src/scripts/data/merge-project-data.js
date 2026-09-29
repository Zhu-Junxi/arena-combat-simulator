const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (a, b) => canonical(a) === canonical(b);
const copy = value => value === undefined ? undefined : structuredClone(value);

export function mergeValues(base, local, remote, path = '') {
  if (equal(local, remote)) return { value: copy(local), conflicts: [] };
  if (equal(local, base)) return { value: copy(remote), conflicts: [] };
  if (equal(remote, base)) return { value: copy(local), conflicts: [] };
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote) &&
      base.length === local.length && base.length === remote.length) {
    const value = [];
    const conflicts = [];
    for (let index = 0; index < base.length; index += 1) {
      const next = mergeValues(base[index], local[index], remote[index], `${path}[${index}]`);
      value.push(next.value);
      conflicts.push(...next.conflicts);
    }
    return { value, conflicts };
  }
  if (base && local && remote && [base, local, remote].every(value =>
    typeof value === 'object' && !Array.isArray(value))) {
    const value = {};
    const conflicts = [];
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const next = mergeValues(base[key], local[key], remote[key], path ? `${path}.${key}` : key);
      if (next.value !== undefined) value[key] = next.value;
      conflicts.push(...next.conflicts);
    }
    return { value, conflicts };
  }
  return { value: copy(local), conflicts: [path || 'value'] };
}

export function mergeProjectSection(kind, base, local, remote) {
  if (kind !== 'presets' || !local || !remote) return mergeValues(base, local, remote);
  const baseEntries = new Map((base?.entries || []).map(entry => [entry.id, entry]));
  const localEntries = new Map(local.entries.map(entry => [entry.id, entry]));
  const remoteEntries = new Map(remote.entries.map(entry => [entry.id, entry]));
  const entries = [];
  const conflicts = [];
  const order = [...new Set([...remoteEntries.keys(), ...localEntries.keys(), ...baseEntries.keys()])];
  for (const id of order) {
    const before = baseEntries.get(id);
    const current = localEntries.get(id);
    const saved = remoteEntries.get(id);
    const merged = equal(current, saved) ? { value: copy(current), conflicts: [] } :
      equal(current, before) ? { value: copy(saved), conflicts: [] } :
      equal(saved, before) ? { value: copy(current), conflicts: [] } :
      { value: copy(current), conflicts: [`presets.${id}`] };
    if (merged.value !== undefined) entries.push(merged.value);
    conflicts.push(...merged.conflicts);
  }
  return { value: { version: 1, entries }, conflicts };
}

export function chooseConflictValues(kind, base, local, remote, choice) {
  if (choice === 'browser') return mergeProjectSection(kind, base, local, remote).value;
  return mergeProjectSection(kind, base, remote, local).value;
}
