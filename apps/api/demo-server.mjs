// Local read-only demo composition. No wallet, credential, signing or submission port.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {SCENARIOS,runSyntheticDemo} from '../../packages/adapters/synthetic-demo.mjs';
import {openCeremonyRuntime,ceremonyView} from '../../packages/adapters/p0b-ceremony-runtime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files=new Map([
 ['/operator',{body:readFileSync(join(root,'apps/operator/index.html')),type:'text/html; charset=utf-8'}],
 ['/operator.mjs',{body:readFileSync(join(root,'apps/operator/operator.mjs')),type:'text/javascript; charset=utf-8'}],
 ['/operator.css',{body:readFileSync(join(root,'apps/operator/operator.css')),type:'text/css; charset=utf-8'}],
 ['/',{body:readFileSync(join(root,'apps/web/index.html')),type:'text/html; charset=utf-8'}],
 ['/demo.mjs',{body:readFileSync(join(root,'apps/web/demo.mjs')),type:'text/javascript; charset=utf-8'}],
 ['/style.css',{body:readFileSync(join(root,'apps/web/style.css')),type:'text/css; charset=utf-8'}]
]);
const proof=JSON.parse(readFileSync(join(root,'spikes/p0-a-passkey-sponsored-swap/evidence/live-finalized-2026-10-07/proof.json')));
export function createDemoServer(){return createServer((req,res)=>{
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
 const send=(status,value,type='application/json; charset=utf-8')=>{res.writeHead(status,{...headers,'content-type':type});res.end(Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value));};
 if(req.method!=='GET')return send(405,{error:'READ_ONLY_DEMO'});
 if(!/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host??''))return send(403,{error:'LOCAL_HOST_ONLY'});
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/readiness'){
 const path=join(root,'evidence/p0b-ceremony-overnight-2026-10-08/readiness.json');
 return send(200,existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{status:'PREPARATION_IN_PROGRESS',review:'PENDING',liveEffects:0,p0BLive:'NOT_PROVEN'});
 }
 if(url.pathname==='/api/ceremony'){let runtime;try{runtime=openCeremonyRuntime(root,{readOnly:true});return send(200,ceremonyView(runtime.current));}catch{return send(409,{error:'CEREMONY_UNINITIALIZED_OR_UNVERIFIED',canSign:false,canSend:false});}finally{runtime?.store.close();}}
 if(url.pathname==='/api/proof')return send(200,proof);
 if(url.pathname==='/api/scenarios')return send(200,{scenarios:SCENARIOS,scope:'SIMULATED',signingEnabled:false,sendingEnabled:false});
 if(url.pathname==='/api/demo'){
  const scenario=url.searchParams.get('scenario')??'prepared';if(!SCENARIOS.includes(scenario))return send(400,{error:'UNKNOWN_SCENARIO'});
  try{return send(200,runSyntheticDemo(scenario));}catch{return send(500,{error:'DEMO_PREPARATION_FAILED'});}
 }
 const file=files.get(url.pathname);if(file)return send(200,file.body,file.type);return send(404,{error:'NOT_FOUND'});
 });}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createDemoServer();server.headersTimeout=10000;server.requestTimeout=15000;
 server.listen(8790,'127.0.0.1',()=>console.log('Universal DEX preparation-only demo: http://localhost:8790 — SIMULATED; no signing or sending'));
 server.on('error',()=>{console.error('LOCAL_DEMO_LISTENER_UNAVAILABLE');process.exitCode=1;});
}
