import {mkdirSync,existsSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {ensure,hash,sameHash,canonicalize,parseStrictJson} from '../core/canonical.mjs';
export class PublicArtifactVault{
 constructor(root,{create=false}={}){this.root=resolve(root);if(create)mkdirSync(this.root,{recursive:true});ensure(existsSync(this.root),'CEREMONY_ARTIFACT_DIRECTORY_MISSING');}
 verify(value){const {contentHash,...body}=value,match=contentHash?.domainTag?.match(/^universal-dex\/([A-Za-z][A-Za-z0-9]*)\/v1$/);ensure(match&&sameHash(contentHash,hash(match[1],body)),'CEREMONY_ARTIFACT_HASH');return value;}
 path(ref){ensure(/^[0-9a-f]{64}$/.test(ref?.digest),'CEREMONY_ARTIFACT_REFERENCE');return join(this.root,ref.digest+'.json');}
 save(value){
  this.verify(value);const path=this.path(value.contentHash),body=canonicalize(value)+'\n';
  if(existsSync(path)){ensure(readFileSync(path,'utf8')===body,'CEREMONY_ARTIFACT_EXISTS_DIFFERENT');return value.contentHash;}
  const fd=openSync(path,'wx');try{writeFileSync(fd,body);fsyncSync(fd);}finally{closeSync(fd);}return value.contentHash;
 }
 read(ref){const value=this.verify(parseStrictJson(readFileSync(this.path(ref),'utf8')));ensure(sameHash(value.contentHash,ref),'CEREMONY_ARTIFACT_REFERENCE_MISMATCH');return value;}
}
