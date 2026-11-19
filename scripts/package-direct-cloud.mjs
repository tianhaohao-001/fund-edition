import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const candidate=process.argv.slice(2).includes('--candidate');
const args=process.argv.slice(2).filter(arg=>arg!=='--candidate');
if(args.length&&!(args.length===2&&args[0]==='--worker'))throw Error('Usage: node scripts/package-direct-cloud.mjs [--candidate] [--worker <verified index.js>]');
const frozen=args.length?resolve(args[1]):null;
const output=resolve(root,candidate?'release/cloud/local-candidate-not-approved/fund-edition-candidate.tgz':'release/cloud/fund-edition-direct.tgz');
const temporary=await mkdtemp(join(tmpdir(),'fund-edition-cloud-'));
const stage=join(temporary,'package'),workerBuild=join(temporary,'worker');
const copies=[
  ...['Dockerfile','.dockerignore','start.mjs','railway.json','README.md'].map(file=>['hosting/cloud/'+file,file]),
  ...['store','accounts','team-activity','studio-review','market-freshness-calendar','local-voice','stripe-billing','paypal-billing','invoice-membership'].map(name=>['core/'+name+'.mjs','core/'+name+'.mjs']),
  ['core/neural-reply-voice.py','core/neural-reply-voice.py'],
  ...['direct-server','visitors'].map(name=>['hosting/site/'+name+'.mjs','hosting/site/'+name+'.mjs'])
];
try{
  if(!frozen)execFileSync(process.execPath,[join(root,'hosting/site/build.mjs'),workerBuild,'--direct'],{cwd:root,stdio:'inherit'});
  const journal='hosting/site/drizzle/meta/_journal.json';
  const history=JSON.parse(await readFile(join(root,journal),'utf8'));
  copies.push([journal,journal]);
  for(const {tag} of history.entries){
    if(!/^\d{4}_[a-z0-9_]+$/.test(tag))throw Error('Unexpected migration name.');
    const path='hosting/site/drizzle/'+tag+'.sql';copies.push([path,path]);
  }
  for(const [source,destination] of copies){
    const file=join(stage,destination);await mkdir(dirname(file),{recursive:true});
    await copyFile(join(root,source),file);
  }
  await copyFile(frozen||join(workerBuild,'dist/server/index.js'),join(stage,'site-worker.mjs'));
  // Load the packaged dependency graph and run the public welcome screen before creating the archive.
  execFileSync(process.execPath,['--input-type=module','-e',`
    import {createDirectApp} from './hosting/site/direct-server.mjs';
    const origin='https://packaging.example';
    const app=await createDirectApp({database:':memory:',origin,credential:'package-fixture',build:'site-worker.mjs'});
    try {
      const response=await app.dispatch(new Request(origin+'/'), 'package-test');
      if(!response.ok || !(await response.text()).includes('Fund Edition')) throw Error('Packaged welcome page failed');
    } finally { app.close(); }
  `],{cwd:stage,stdio:'inherit'});
  await mkdir(dirname(output),{recursive:true});
  const assembling=output+'.'+process.pid+'.tmp';
  try{
    execFileSync('tar',['-czf',assembling,'-C',stage,'.'],{stdio:'inherit'});
    await rename(assembling,output);
  }finally{await rm(assembling,{force:true})}
  console.log(output);
}finally{
  if(dirname(resolve(temporary))===resolve(tmpdir())&&basename(temporary).startsWith('fund-edition-cloud-'))
    await rm(temporary,{recursive:true,force:true});
}
