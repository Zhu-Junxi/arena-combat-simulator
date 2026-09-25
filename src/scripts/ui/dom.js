export const byId = id => document.getElementById(id);

export function requireElements(ids) {
  return Object.fromEntries(ids.map(id => {
    const element = byId(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return [id, element];
  }));
}
