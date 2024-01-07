import * as file from './file.mjs';

import {versionConstraint,incompatible,anyVersion,constraint,VersionConstraint} from './version.mjs';

//version is an upper and lower bound
//inclusive or exclusive
//either can be omitted for no limit
//resolve picks the newest version
//using a mods query
//explicitly specify the mods you want with one version constraint

async function resolveAllMap(ps){
  // ps is {key:promise ...}
  // returns a Promise that resolves to {key:promise value}
  // will reject with any error
  let values=new Map();
  for(let [k,p] of ps.entries()){
    let data=await p;
    values.set(k,data);
  }
  return values;
}

function geturl(mod,rversion,data){
  let version=rversion.version;
  //console.log(mod,version,data);
  let url,contentroot,dest;

  if(mod=='core'||mod=='base'){
    url=`https://api.github.com/repos/wube/factorio-data/zipball/${rversion.ref}`;
    contentroot=`wube-factorio-data-${(''+rversion.ref).slice(0,7)}/${mod}`;
  }else{
    url=`https://mods-storage.re146.dev/${mod}/${version}.zip`;
    contentroot='';//`${mod}_${version}`;
  }
  dest=`mods/${mod}-${version}`;

  return [url,dest,contentroot];
}

async function run(pack){
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

  resolvedVersions=await resolveAllMap(resolvedVersions);

  let errors=[];
  for(let [mod,resolvedVersion] of resolvedVersions){
    for(let [depmod,depversion] of resolvedVersion.deps){
      if(!depversion.incompatible&&!depversion.optional&&!resolvedVersions.has(depmod)){
        errors.push(`Unresolved dependency: ${depmod} - needs version ${depversion}`)
      }
      if(depversion.incompatible&&depversion.includes(resolvedVersions.get(depmod)?.version)){
        if(depmod=='base'){
          resolvedVersions.delete('base');
        }else{
          errors.push(`Incompatible version: ${depmod} - needs version ${depversion}`)
        }
      }
    }
  }
  if(errors.length>0){
    throw new Error(errors);
  }

  let modlocations=[];
  for(let [mod,resolvedVersion] of resolvedVersions){
    console.log(mod, 'resolves to',resolvedVersion);
    let location=geturl(mod,resolvedVersion,pack.mods[mod]);
    modlocations.push([...location,mod,resolvedVersion.version]);
  }
  console.log('downloading',modlocations);
  return modlocations;
}

let tee=x=>(console.log(x),x);

let packdata=await file.read('pack.json');
console.log(s);
let pack=JSON.parse(s);
let modlocations=await run(data);
//let modlocationsdata=JSON.stringify(modlocations);
//await file.write('modlocations.json',modlocationsdata);


let factorioroot=await file.read('factorioroot.txt');
factorioroot=factorioroot.trim();


// https://stackoverflow.com/a/63497965
async function toArray(asyncIterator){
    const arr=[];
    for await(const i of asyncIterator) arr.push(i);
    return arr;
}



const groupedmods=new Map();
for(const l of modlocations){
  if(!groupedmods.has(l[0])){
    groupedmods.set(l[0],[]);
  }
  groupedmods.get(l[0]).push(l);
}

let coreversion;

for(const [url,v] of groupedmods){
  const temp=$(mktemp) // get temp file name
  retryifyAsync(download.downloadToFile)(url,temp);
  for(const [,unzipto,vroot,mod,version] of v){
    let root=vroot;
    const defaultroot=mod+"_"+version,
    fsPromises.mkdir(unzipto,{recursive:true});
    unzip.unzip(temp,root,unzipto);
    if(root==""){
      const files=(await toArray(await fsPromises.opendir(unzipto))).map(file=>file.name);
      if(files.length==1){
        fsPromises.rename(path.join(unzipto,files[0]),path.join(unzipto,defaultroot));
      }else if(files.includes(defaultroot));
      else{
        throw `mod from ${url} didn't have an identifiable mod root`
      }
      root=defaultroot;
    }
    if(mod=="base"){
      await fsPromises.mkdir(path.join(unzipto,root,'menu-simulations'));
      await fsPromises.copyFile(
        path.join(factorioroot,'menu-simulations/menu-simulations.lua'),
        path.join(unzipto,root,'menu-simulations/menu-simulations.lua')
      );
    }
    if(mod=='core'){
      coreversion=version;
    }
  }
}

let modroots={};
for(let [,unzipto,root,mod,version] of modlocations){
  modroots[mod]=unzipto+"/"+(root==""?`${mod}_${version}`:root);
}








version=coreversion

const writestream=fs.createWriteStream("fdata.lua");

try{
  // first try json
  const defines=await import('defines.json');

  function writedefines(defines,prefix,writestream) {
    writestream.write(`${prefix}={}\n`);
    for(const [name,value] of defines){
      const subprefix=prefix+"."+name;
      if(typeof value=='object'){
        writedefines(value,subprefix,writestream);
      }else{
        writestream.write(`${subprefix}=value\n`);
      }
    }
  }

  writestream.write("local ");
  writedefines(defines.defines,"defines",writestream);
  writestream.write("\n");
}catch{
  try{
    // try defines.lua
    // from /c game.write_file("defines.lua", "local defines = " .. serpent.block(defines, {indent="    "}))
    // (command from https://github.com/redruin1/factorio-draftsman/blob/main/draftsman/compatibility/defines.lua)
    const readstream=fs.createReadStream("defines.lua");
    readstream.pipe(writestream,{end:false});
    writestream.write("\n");
  }catch{
    // finally fall back to taking it from the factorio api
    const runtimeapi=downloadjson(`https://lua-api.factorio.com/${version}/runtime-api.json`);
    jq -rf "$root"/factorio-defines.jq>fdata.lua

    // defines is list
    function writedefines(defines,prefix,writestream) {
      for(const define of defines){
        const subprefix=prefix+"."+define.name;
        writestream.write(`${subprefix}={}\n`);
        if("values" in define){
          for(const {name} of define.values){
            const valuename=subprefix+"."+name;
            writestream.write(`${valuename}="${valuename}"\n`);
            // like i could do it in numeric order like the actual defines
            // but there are special cases i don't want to handle
            // this should be just a fallback
          }
        }else if("subkeys" in define){
          for(const subdefines of define.subkeys){
            writedefines(subdefines,subprefix,writestream);
          }
        }
      }
    }

    writestream.write("local defines={}\n");
    writedefines(defines.defines,"defines",writestream);
    writestream.write("\n");
  }
}

jq -r '"local datatypes={",(.prototypes[]|select(.abstract|not)|"  \""+.typename+"\","),"}"'
function writetypes(data,writestream) {
}

let res=await download.request(`https://lua-api.factorio.com/${version}/prototype-api.json`);
if(!(res.statusCode>=200&&res.statusCode<300)){
  res=await download.request("https://lua-api.factorio.com/latest/prototype-api.json");
}

const parts=[];
const data=await new Promise((resolve,reject)=>
  res.on('data', (chunk) => {
    parts.push(chunk);
  }).on('end', () => {
    if (!res.complete){
      reject('The connection was terminated while the message was still being sent');
    }
    const string = parts.join('');
    resolve(string);
  })
);

writetypes(JSON.parse(data),writestream);

writestream.write('\nreturn {defines=defines,types=datatypes}');
writestream.close();


// generate data.json
const savedluapath=process.env.LUA_PATH;

child_process.spawn('lua',[`${__dirname}/gen.lua`],{stdio:'ignore'});
process.env.LUA_PATH=savedluapath;

// https://stackoverflow.com/a/45130990
async function* getFiles(dir,basePath=".") {
  const dirents = await fsPromises.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const name=path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      //yield name;
      yield* getFiles(name,path.join(basePath,dirent.name));
    } else {
      yield name;
    }
  }
}

modlocations.map(([,unzipto,root,mod,version])=>{
  mod,
  version,
  modroot:(mod=="base"||mod=="core")?`${factorioroot}/data/$(mod)`:modroots[mod]
}).map(({mod,version,modroot})=>{
  const outdir=`assets/${mod}_${version}`;
  fs.mkdir(outdir,{recursive:true});
  for await(const name of getFiles(modroot)){
    fsPromises.copyFile(`${modroot}/${name}`,`${outdir}/${name}`);
  }
})












const localefiles={};

for(const [mod,croot] of Object.entries(modroots)){
  let root=croot;
  if(mod=='base'||mod=='core'){ // get locale from an installed factorio because they're not in factorio-data
    root=path.join(factorioroot,'data',mod);
  }
  const localedir = await fsPromises.opendir(path.join(root,'locale'));
  for await (const entry of localedir){
    if(!entry.isDirectory()){
      continue;
    }
    const lang=entry.name;
    if(!(lang in localefiles)){
      localefiles[lang]=[]
    }
    const localedir = await fsPromises.opendir(path.join(root,'locale',lang));
    for await (const entry of localedir){
      if(entry.name.endsWith('.cfg')){
        localefiles[lang].push(path.join(root,'locale',lang,entry.name));
      }
    }
  }
}

console.log(localefiles);

const locale={};

for(const [lang,langfiles] of Object.entries(localefiles)){
  locale[lang]={};
  for(const langfile of langfiles){
    const data=await file.read(langfile);

    let category;
    for(let line of data.split(/\r?\n/)){
      line=line.trim()
      if(line==''||line.startsWith(';')||line.startsWith('#')){
        continue;
      }
      if(line.startsWith('[')&&line.endsWith(']')){
        category=line.slice(1,-1);
      }else{
        let [key,value]=line.split('=',2)
        if(!category){
          locale[lang][key]=value;
        }else{
          locale[lang][category+'.'+key]=value;
        }
      }
    }
  }
}

//let localedata=JSON.stringify(locale);
//await file.write('locale.json',localedata);


mkdir "$output"

mv assets data.json locale.json "$output"