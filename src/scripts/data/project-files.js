// Read committed gameplay JSON in both the browser and Node's test/server runtime.
export async function readProjectJson(relativePath) {
  if (!/^[a-z0-9/_-]+\.json$/i.test(relativePath) || relativePath.includes('..')) throw new Error('Invalid project data path');
  const url = new URL(`../../../data/${relativePath}`, import.meta.url);
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${relativePath}`);
  return response.json();
}

export const projectCatalog = await readProjectJson('catalog.json');
