import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {downloadunzip} from './unzip.mjs'

import {versionConstraint,incompatible,anyVersion,constraint,VersionConstraint} from './version.mjs';

//version is an upper and lower bound
//inclusive or exclusive
//either can be omitted for no limit
//resolve picks the newest version
//using a mods query
//explicitly specify the mods you want with one version constraint

var pack={
  mods:{
    ["minimal-no-base-mod"]:{},
  }
}

let versions=new Map();

for(let [mod,moddata] of Object.entries(pack.mods)){
  let version;
  if(moddata.version){
    version=versionConstraint('____ = '+moddata.version,mod,'__initial__');
  }else{
    version=anyVersion(mod,'__initial__');
  }
  versions.set(mod,version);
}

// make core and base share the same version
let coreversion,baseversion;
if(!versions.has('core')){
  coreversion=anyVersion('core','__initial__');
}else{
  coreversion=versions.get('core');
}
if(!versions.has('base')){
  baseversion=anyVersion('base','__initial__');
}else{
  baseversion=versions.get('base');
}
coreversion.mod='core+base';
baseversion.mod='core+base';
coreversion.intersect(baseversion);
let mergedversion=coreversion;
versions.set('base',mergedversion);
versions.set('core',mergedversion);
//versions.set('core+base',mergedversion);


let resolvedVersions=new Map();
for(let [mod,version] of versions){
  resolvedVersions.set(mod,version.resolve());
}


function resolveAllMap(ps){
  // ps is {key:promise ...}
  // returns a Promise that resolves to {key:promise value}
  // will reject with any error
  var values=new Map();
  console.log(ps);
  return [...ps.entries()].map(
    ([k,p])=>p.then(data=>{values.set(k,data);})
  ).reduce(
    (p1,p2)=>p1.then(()=>p2)
  ).then(()=>values);
}

let gettempfile=(()=>{
  let gettmpdir=fsPromises.mkdtemp(path.join(os.tmpdir(), 'foo-'));
  let tempcount=0;

  function gettempfile() {
    return gettmpdir.then((tmpdir)=>{
      tempcount++;
      return path.join(tmpdir,`temp${tempcount}`)
    });
  }

  return gettempfile;
})()

let modpromises=new Map();

function downloadmod(mod,version,data){
  let url,contentroot,dest;
  
  if(mod=='core'||mod=='base'){
    url=`https://github.com/wube/factorio-data/archive/refs/tags/${version}.zip`;
    contentroot=`factorio-data-${version}/${mod}`;
  }else{
    url=`https://mods-storage.re146.dev/${mod}/${version}.zip`;
    contentroot=`${mod}_${version}`;
  }
  dest=`mods/${mod}-${version}`;

  let getmodfile;
  if(modpromises.has(url)){
    getmodfile=modpromises.get(url);
  }else{
    getmodfile=gettempfile().then((tempfile)=>{
      let p=downloadfile(url,tempfile);
      modpromises.set(url,p.then(()=>tempfile));
      return modpromises.get(url);
    });
  }
  return getmodfile.then((filename)=>unzip(filename,contentroot,dest));
}

resolveAllMap(resolvedVersions).then((resolvedVersions)=>{
  let errors=[];
  for(let [mod,resolvedVersion] of resolvedVersions){
    for(let [depmod,depversion] of resolvedVersion.deps){
      if(!depversion.incompatible&&!resolvedVersions.has(depmod)){
        errors.push(`Unresolved dependency: ${depmod} - needs version ${depversion}`)
      }
      if(depversion.incompatible&&!depversion.includes(resolvedVersions.get(depmod).version)){
        if(depmod=='base'){
          resolvedVersions.remove('base');
        }else{
          errors.push(`Incompatible version: ${depmod} - needs version ${depversion}`)
        }
      }
    }
  }
  if(errors.length>0){
    throw new Error(errors);
  }
  return resolvedVersions;
}).then((resolvedVersions)=>{
  let downloadingmods=[];
  for(let [mod,resolvedVersion] of resolvedVersions){
    downloadingmods.push(downloadmod(mod,resolvedVersion.version,pack.mods[mod]));
  }
  return Promise.all(downloadingmods);
}).then(()=>{
  // run the lua
});