import { chownSync,lstatSync } from 'node:fs';
import { startDirectServer } from './hosting/site/direct-server.mjs';

// Platforms can mount volumes as root. Give only the mount directory to the
// image's node user, then drop privileges before opening the DB or the network.
if(process.getuid?.()===0){
  if(!lstatSync('/data').isDirectory())throw Error('Mount a data directory at /data.');
  chownSync('/data',1000,1000);
  process.setgroups([]);process.setgid(1000);process.setuid(1000);
}
process.umask(0o077);
const server=await startDirectServer();
process.once('SIGTERM',()=>server.close());
