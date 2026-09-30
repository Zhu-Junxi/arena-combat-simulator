export function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), values };
}

const missing = () => Object.assign(new Error('Not found'), { name: 'NotFoundError' });
export function memoryDirectory(name = 'chosen-folder') {
  const files = new Map();
  let failWrite = false;
  let denied = false;
  const makeDirectory = (prefix, label) => ({
    kind: 'directory', name: label,
    async getDirectoryHandle(part, options = {}) {
      const path = prefix + part + '/';
      if (!options.create && ![...files.keys()].some(key => key.startsWith(path))) throw missing();
      return makeDirectory(path, part);
    },
    async getFileHandle(part, options = {}) {
      const path = prefix + part;
      if (!options.create && !files.has(path)) throw missing();
      return { kind: 'file', name: part,
        async getFile() { if (denied) throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' });
          return { text: async () => files.get(path) }; },
        async createWritable() {
          if (denied || failWrite) throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' });
          let next;
          return { async write(value) { next = value; }, async close() { files.set(path, next); }, async abort() {} };
        } };
    },
    async removeEntry(part) { if (!files.delete(prefix + part)) throw missing(); },
    async *entries() {
      for (const path of files.keys()) if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length);
        if (!rest.includes('/')) yield [rest, { kind: 'file' }];
      }
    }
  });
  const root = makeDirectory('', name);
  root.files = files;
  root.setFailWrite = value => { failWrite = value; };
  root.setDenied = value => { denied = value; };
  root.requestPermission = async () => { denied = false; return 'granted'; };
  return root;
}
