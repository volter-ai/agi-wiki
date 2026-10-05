import {readFile,writeFile} from 'node:fs/promises';
const path='pages-dist/index.html';const html=await readFile(path,'utf8');
await writeFile(path,html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://upload.wikimedia.org https://thumb.wikimedia.org; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"><meta name="referrer" content="no-referrer">`));
