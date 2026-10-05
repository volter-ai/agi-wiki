import {mkdir,writeFile} from 'node:fs/promises';
import {GitStore,repository} from './api.js';
const {receipts}=await new GitStore(repository()).read();
await mkdir('.data',{recursive:true});await writeFile('.data/publication-receipts.json',JSON.stringify(receipts));
