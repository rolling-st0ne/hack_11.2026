import { createSeed } from './seed.mjs';
import { FilesystemAdapter } from './adapters.mjs';

// A versioned compare-and-swap makes task creation + audit + idempotency atomic.
// The same adapter works against Cloudflare D1 and the local SQLite wrapper.
export function createStore(db,kind='filesystem-d1',seedFiles=null) {
  async function row() {
    let result=await db.prepare('SELECT version, payload FROM contour_state WHERE id = 1').first();
    if(!result){
      const seed=seedFiles?{format:'csv-v1',files:seedFiles,private:{sessions:{},idempotency:{},sourceEvents:[]}}:FilesystemAdapter.encode(createSeed());
      await db.prepare('INSERT OR IGNORE INTO contour_state (id, version, payload) VALUES (1, 0, ?)').bind(JSON.stringify(seed)).run();
      result=await db.prepare('SELECT version, payload FROM contour_state WHERE id = 1').first();
    }
    return result;
  }
  return {
    kind,
    async read(){return FilesystemAdapter.decode(JSON.parse((await row()).payload));},
    async update(fn){
      for(let attempt=0;attempt<12;attempt++){
        const current=await row(),state=FilesystemAdapter.decode(JSON.parse(current.payload));
        fn(state);
        const candidate=FilesystemAdapter.encode(state);FilesystemAdapter.decode(candidate);
        const result=await db.prepare('UPDATE contour_state SET payload = ?, version = version + 1 WHERE id = 1 AND version = ?').bind(JSON.stringify(candidate),current.version).run();
        if(result.meta.changes===1)return;
      }
      throw new Error('Concurrent update retry limit reached');
    },
  };
}
