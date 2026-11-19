// Repair the already accepted release without importing ongoing frontend work.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=join(root,'release/cloud/full-web'), archive=join(directory,'fund-edition-web.tgz');
const prior='bd56faca8e59b6ae974747d7806e4349a29affaa9a12d88e5b4a4831b73992b7';
const sha=buf=>createHash('sha256').update(buf).digest('hex');
assert.equal(sha(await readFile(archive)),prior,'Expected the exact accepted original.');
const stage=await mkdtemp(join(tmpdir(),'fund-edition-volume-'));
const pending=archive+'.'+process.pid+'.tmp';
try{
  execFileSync('tar',['-xzf',archive,'-C',stage]);
  const manifestPath=join(stage,'manifest.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const recipe=await readFile(join(root,'hosting/cloud/full/Dockerfile'),'utf8');
  const old=await readFile(join(stage,'Dockerfile'),'utf8');
  assert.equal(old.replace(/^VOLUME \["\/data"\]\r?\n/m,''),recipe);
  for(const [name,hash] of Object.entries(manifest.files))assert.equal(sha(await readFile(join(stage,name))),hash,name);
  await writeFile(join(stage,'Dockerfile'),recipe);
  manifest.files.Dockerfile=sha(recipe);
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  execFileSync('tar',['-czf',pending,'-C',stage,'.']);
  await mkdir(join(directory,'previous'),{recursive:true});
  await copyFile(archive,join(directory,'previous',prior+'.tgz'));
  await rename(pending,archive);
  console.log(sha(await readFile(archive)));
}finally{await rm(pending,{force:true});await rm(stage,{recursive:true,force:true});}
