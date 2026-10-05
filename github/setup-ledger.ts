import {api,repository} from './api.js';
const repo=repository(process.argv[2]);
// Explicit setup: creation refuses if the branch already exists. Never reset a ledger.
const tree=api(`repos/${repo}/git/trees`,'POST',{tree:[{path:'receipts.json',mode:'100644',type:'blob',content:'[]'}]});
const commit=api(`repos/${repo}/git/commits`,'POST',{message:'Initialize append-only WikiChat quota ledger',tree:tree.sha,parents:[]});
api(`repos/${repo}/git/refs`,'POST',{ref:'refs/heads/wiki-ledger',sha:commit.sha});
console.log('Created wiki-ledger; protect it from deletion and force pushes.');
