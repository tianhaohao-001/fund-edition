import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=join(root,'release/cloud/full-web');
const archive=join(out,'fund-edition-web.tgz');
const stage=await mkdtemp(join(tmpdir(),'fund-edition-full-'));
const hashes={};
const webTypes=/\.(?:m?js|css|html|ico|png|webp|jpe?g|svg|wav|woff2|webmanifest|json|txt|mts)$/u;
try {
  async function copy(source,name) {
    if(!(await lstat(join(root,source))).isFile())throw Error('Unexpected non-file: '+source);
    const path=join(stage,name);
    await mkdir(dirname(path),{recursive:true});
    await copyFile(join(root,source),path);
    hashes[name]=createHash('sha256').update(await readFile(path)).digest('hex');
  }
  async function collectWeb(folder) {
    const entries=await readdir(join(root,folder),{withFileTypes:true});
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      const name=folder+'/'+entry.name;
      if(entry.name.startsWith('.')||entry.isSymbolicLink())throw Error('Unexpected hidden or linked public path: '+name);
      if(entry.isDirectory())await collectWeb(name);
      else if(webTypes.test(name))await copy(name,name);
      else throw Error('Unexpected web asset type: '+name);
    }
  }
  await collectWeb('web');
  for(const entry of (await readdir(join(root,'core'))).sort()) {
    if(/^[a-z][a-z\d-]*\.mjs$/u.test(entry)) await copy('core/'+entry,'core/'+entry);
  }
  await copy('server.mjs','server.mjs');
  // Railway mounts its managed volume at /data and rejects Docker VOLUME declarations.
  if(/^\s*VOLUME\s/im.test(await readFile(join(root,'hosting/cloud/full/Dockerfile'),'utf8')))throw Error('Use the platform-managed /data volume.');
  for(const name of ['start.mjs','README.md','Dockerfile'])await copy('hosting/cloud/full/'+name,name);
  await copy('hosting/cloud/railway.json','railway.json');
  await writeFile(join(stage,'manifest.json'),JSON.stringify({product:'Fund Edition',runtime:'full-web-node24',files:hashes},null,2)+'\n');
  execFileSync(process.execPath,['--input-type=module','-e',"import {createApp} from './server.mjs';import{publicEnvironment}from './start.mjs';const env=publicEnvironment({FUNDROOM_PUBLIC_ORIGIN:'https://packaging.example',FUNDROOM_DB_PATH:':memory:'});const {server}=await createApp({env});server.close();"],{cwd:stage,stdio:'inherit'});
  await mkdir(out,{recursive:true});
  const temporary=resolve(out,'web-'+process.pid+'.tmp');
  try{
    execFileSync('tar',['-czf',temporary,'-C',stage,'.'],{stdio:'inherit'});
    await rename(temporary,archive);
  } finally {await rm(temporary,{force:true});}
  console.log(archive);
} finally {await rm(stage,{recursive:true,force:true});}
