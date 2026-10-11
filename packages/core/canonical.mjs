import {createHash} from 'node:crypto';

export function ensure(condition, code) { if (!condition) throw Error(code); }
export function unicode(value) {
  ensure(typeof value === 'string', 'STRING_REQUIRED');
  for (let i = 0; i < value.length; i++) {
    const c=value.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){const n=value.charCodeAt(++i);ensure(n>=0xdc00&&n<=0xdfff,'INVALID_UNICODE');}
    else ensure(c<0xdc00||c>0xdfff,'INVALID_UNICODE');
  }
  return value;
}
export function canonicalize(value) {
  if(value===null)return 'null';
  if(typeof value==='string')return JSON.stringify(unicode(value));
  if(typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){ensure(Number.isSafeInteger(value),'SAFE_INTEGER_REQUIRED');return JSON.stringify(value);}
  if(Array.isArray(value)){ensure(Object.keys(value).length===value.length&&Object.getOwnPropertySymbols(value).length===0&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean),'DENSE_JSON_ARRAY_REQUIRED');return '['+value.map(canonicalize).join(',')+']';}
  ensure(value&&Object.getPrototypeOf(value)===Object.prototype,'PLAIN_JSON_REQUIRED');
  ensure(Object.getOwnPropertySymbols(value).length===0,'SYMBOL_KEY_FORBIDDEN');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(unicode(k))+':'+canonicalize(value[k])).join(',')+'}';
}
// Parse before normalization, preserving the ability to reject duplicate JSON keys.
export function parseStrictJson(text) {
  unicode(text); let i=0; const ws=()=>{while(/[\x20\x09\x0a\x0d]/u.test(text[i]??'')&&i<text.length)i++;};
  function string(){const start=i++;while(i<text.length){if(text[i]==='"'){i++;return unicode(JSON.parse(text.slice(start,i)));}if(text[i]==='\\')i++;i++;}throw Error('INVALID_JSON');}
  function value(){ws();const c=text[i];if(c==='"')return string();
    if(c==='{'){i++;ws();const out={};const keys=new Set();if(text[i]==='}'){i++;return out;}while(true){ws();ensure(text[i]==='"','INVALID_JSON');const k=string();ensure(!keys.has(k),'DUPLICATE_KEY');keys.add(k);ws();ensure(text[i++]===':','INVALID_JSON');Object.defineProperty(out,k,{value:value(),enumerable:true,writable:true,configurable:true});ws();if(text[i]==='}'){i++;return out;}ensure(text[i++ ]===',','INVALID_JSON');}}
    if(c==='['){i++;ws();const a=[];if(text[i]===']'){i++;return a;}while(true){a.push(value());ws();if(text[i]===']'){i++;return a;}ensure(text[i++ ]===',','INVALID_JSON');}}
    const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));ensure(match,'INVALID_JSON');i+=match[0].length;const v=JSON.parse(match[0]);if(typeof v==='number')ensure(Number.isSafeInteger(v),'SAFE_INTEGER_REQUIRED');return v;
  }
  const out=value();ws();ensure(i===text.length,'INVALID_JSON');canonicalize(out);return out;
}
export function hash(domain,payload){ensure(/^[A-Za-z][A-Za-z0-9]*$/.test(domain),'HASH_DOMAIN');return {algorithm:'SHA-256',canonicalizationVersion:'jcs-v1',domainTag:`universal-dex/${domain}/v1`,schemaVersion:1,digest:createHash('sha256').update(canonicalize({domainTag:`universal-dex/${domain}/v1`,schemaVersion:1,canonicalizationVersion:'jcs-v1',payload})).digest('hex')};}
export function sameHash(a,b){return canonicalize(a)===canonicalize(b);}
export function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function snapshot(domain,payload){const clone=JSON.parse(canonicalize(payload));return freeze({...clone,contentHash:hash(domain,clone)});}
export function atomic(value,{positive=false}={}){ensure(typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)&&value.length<=78,'ATOMIC_INTEGER_STRING');const n=BigInt(value);ensure(!positive||n>0n,'POSITIVE_INPUT_REQUIRED');return n;}
export function scaleAtomic(value,from,to){atomic(value,{positive:true});ensure(Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&from>=0&&to>=0&&from<=18&&to<=18,'DECIMALS');const delta=to-from;const n=BigInt(value);if(delta>=0)return String(n*10n**BigInt(delta));const d=10n**BigInt(-delta);ensure(n%d===0n,'NONREPRESENTABLE_AMOUNT');return String(n/d);}
