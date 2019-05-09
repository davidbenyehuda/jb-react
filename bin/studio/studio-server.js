fs = require('fs');
http = require('http');
child = require('child_process');

file_type_handlers = {};

_iswin = /^win/.test(process.platform);

const settings = JSON.parse(fs.readFileSync(`${__dirname}/jbart.json`));
// define projects not under /jbart/projects directory
let sites = null;
function projectDirectory(project) {
    // if (project == 'bin')
    //    return 'node_modules/jbart5-react/bin'
    sites = sites || externalSites() || {};
    const site = Object.keys(sites).filter(site=>project.indexOf(site+'-') != -1)[0];
    const res = site ? `${sites[site]}/${project.substring(site.length+1)}` : `${settings.http_dir}projects/${project}`;
    return res;

    function externalSites() {
      try { return JSON.parse(fs.readFileSync(`${__dirname}/sites.json`)) } catch (e) {}
    }
}

// Http server
function serve(req, res) {
   try {
    const url_parts = req.url.split('#')[0].split('?');
    const path = url_parts[0].substring(1); //, query= url_parts[1] && url_parts[1].split('#')[0];
//    console.log(req.url,path);
    const base = path.split('/')[0] || '';
    const file_type = path.split('.').pop();
    const op = getURLParam(req,'op');

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (op && op_get_handlers[op] && req.method == 'GET') {
      return op_get_handlers[op](req,res,path);
    } else if (path.indexOf('studio') == 0 && base_get_handlers[base] && path.indexOf('.html') != -1) {
      return base_get_handlers[base](req,res,path);
    } else if (base_get_handlers[base] && path.indexOf('.html') == -1) {
      return base_get_handlers[base](req,res,path);
    } else if (op && op_post_handlers[op] && req.method == 'POST') {
      let body = '';
      req.on('data', data => {
        body += '' + data;
      });
      req.on('end', () => 
        op_post_handlers[op](req, res,body,path)
      )
    } else if (file_type && file_type_handlers[file_type]) {
      return file_type_handlers[file_type](req,res,path);
    } else {
      endWithFailure(res,'no handler for the request ' + req.url);
    }
   } catch(e) {
      console.log(e)
  }
}

// static file handlers
supported_ext =  ['js','gif','png','jpg','html','xml','css','xtml','txt','json','bmp','woff','jsx','prj','woff2','map','ico'];
for(i=0;i<supported_ext.length;i++)
  file_type_handlers[supported_ext[i]] = function(req, res,path) { serveFile(req,res,path); };

function calcFullPath(path) {
  const project_match = path.match(/^projects\/([^/]*)(.*)/);
  if (project_match)
    return projectDirectory(project_match[1]) + project_match[2]
  const bin_match = path.match(/^bin\/(.*)/);
  if (bin_match)
      return `node_modules/jbart5-react/bin/${bin_match[1]}`
  return settings.http_dir + path;
}

function serveFile(req,res,path) {
//  console.log(path,full_path);
  const full_path = calcFullPath(path).replace(/!st!/,'')
  const extension = path.split('.').pop();

  fs.readFile(_path(full_path), function (err, content) {
    if (err) {
      if (err.errno === 34)
        res.statusCode = 404;
      else
        res.statusCode = 500;
      return endWithFailure(res,'Can not read file ' + full_path + ' ' + err);
    } else {
      fs.stat(_path(full_path), function (err, stat) {
        if (err) {
          res.statusCode = 500;
          return endWithFailure(res,'file status code 500 ' + full_path + ' ' + err);
        } else {
          const etag = stat.size + '-' + Date.parse(stat.mtime);
          res.setHeader('Last-Modified', stat.mtime);

          if (extension == 'json') res.setHeader('Content-Type', 'application/json;charset=utf8');
          if (extension == 'css') res.setHeader('Content-Type', 'text/css');
          if (extension == 'xml') res.setHeader('Content-Type', 'application/xml;charset=utf8');
          if (extension == 'js') res.setHeader('Content-Type', 'application/javascript;charset=utf8');
          if (extension == 'woff') res.setHeader('Content-Type', 'application/x-font-woff');
          if (extension == 'woff2') res.setHeader('Content-Type', 'application/x-font-woff2');

          if (req.headers['if-none-match'] === etag) {
            res.statusCode = 304;
            res.end();
          } else {
            res.setHeader('Content-Length', content.length);
            res.setHeader('ETag', etag);
            res.statusCode = 200;
            res.end(content);
          }
        }
      })
    }
  });
}

const op_post_handlers = {
    saveComp: function(req, res,body,path) {
        let clientReq;
        try {
          clientReq = JSON.parse(body);
        } catch(e) {}
        if (!clientReq)
           return endWithFailure(res,'Can not parse json request');
        //if (!clientReq.original) return endWithFailure(res,'missing original in request');
        if (!clientReq.toSave) return endWithFailure(res,'missing toSave in request');

        const project = getURLParam(req,'project');
        const force = getURLParam(req,'force') == 'true';
        if (!project) 
          return endWithFailure(res,'missing project param in url');
        const comp = getURLParam(req,'comp');
        if (!comp) 
          return endWithFailure(res,'missing comp param in url');
        try {
          endWithSuccess(res,saveComp(clientReq.toSave,clientReq.original,comp,project,force,projectDirectory(project),getURLParam(req,'destFileName')))
        } catch (e) {
          endWithFailure(res,e)
        }
    },
    saveFile: function(req, res,body,path) {
        let clientReq;
        try {
          clientReq = JSON.parse(body);
        } catch(e) {}
        if (!clientReq)
           return endWithFailure(res,'Can not parse json request');
        fs.writeFile(clientReq.Path || '', clientReq.Contents || '' , function (err) {
          if (err)
            endWithFailure(res,'Can not write to file ' + clientReq.Path);
          else
            endWithSuccess(res,'File saved to ' + clientReq.Path);
        });
    },
    createProject: function(req, res,body,path) {
      let clientReq;
      try {
        clientReq = JSON.parse(body);
        if (!clientReq)
           return endWithFailure(res,'Can not parse json request');
        const projDir = 'projects/' + clientReq.project;
        fs.mkdirSync(projDir);
        (clientReq.files || []).forEach(f=>
          fs.writeFileSync(projDir+ '/' + f.fileName,f.content)
        )
      } catch(e) {
        endWithFailure(res,e)
      }
      endWithSuccess(res,'Project Created');
    }
};

const base_get_handlers = {
  'studio-bin': (req,res) =>
    file_type_handlers.html(req,res,'node_modules/jbart5-react/bin/studio/studio-bin.html'),
  studio: (req,res) => 
    file_type_handlers.html(req,res,'projects/studio/studio.html'),
  project(req,res,path) {
    const project_with_params = req.url.split('/')[2];
    const project = project_with_params.split('?')[0];
    // if (external_projects[project])
    //   return file_type_handlers.html(req,res, external_projects[project] + `/${project}/${project}.html`);
    return file_type_handlers.html(req,res,`projects/${project}/${project}.html`);
  }
};

const op_get_handlers = {
    runCmd: function(req,res,path) {
      if (!settings.allowCmd) return endWithFailure(res,'no permission to run cmd. allowCmd in jbart.json');

      const cmd = getURLParam(req,'cmd');
      if (!cmd) return endWithFailure(res,'missing cmd param in url');
      let cwd = getURLParam(req,'dir');
      if (!cwd) return endWithFailure(res,'missing dir param in url');
      cwd += '/';

      child.exec(cmd,cwd ? { cwd: cwd } : {},function (error, stdout, stderr) {
        if (error) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({type:'error', desc:'Can not run cmd', cmd: cmd, stdout: stdout, stderr: stderr, exitcode: error }));
        } else {
          const out = {
            type: 'success',
            outfiles: {},
            stdout: stdout, stderr: stderr
          };
          (getURLParam(req,'outfiles') || '').split(',').forEach(function(outfile) {
              let content = '';
              try { content = '' + fs.readFileSync(outfile); } catch(e) {}
              out.outfiles[outfile] = content;
          });
          res.setHeader('Content-Type', 'application/json; charset=utf8');
          res.end(JSON.stringify(out));
        }
      });
    },
    ls: function(req,res) {
      const path = getURLParam(req,'path');
      const full_path = settings.http_dir + path;
      res.setHeader('Content-Type', 'application/json; charset=utf8');
      res.end(JSON.stringify({entries: fs.readdirSync(full_path)}));
    },
    getFile: function(req,res) {
      const path = getURLParam(req,'path');
      const full_path = settings.http_dir + path;
      fs.readFile(_path(full_path), function (err, content) {
        if (err) {
          if (err.errno === 34)
            res.statusCode = 404;
          else
            res.statusCode = 500;
          return endWithFailure(res,'Can not read file ' + full_path + ' ' + err);
        } else {
          res.setHeader('Content-Length', content.length);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/text;charset=utf8');
          res.end(content);
        }
      });
    },
    download: function(req,res,path) {
      res.writeHead(200, {'Content-Type': 'application/csv', 'Content-disposition': 'attachment; filename=' + path });
      res.end(getURLParam(req,'data'));
    },
    projects: function(req,res,path) {
      res.end(JSON.stringify({projects: fs.readdirSync('projects')}));
    },
    gotoSource: function(req,res,path) {
      const comp = getURLParam(req,'comp');
      const files = walk('projects').concat(walk('src'));
      files.filter(x=>x.match(/\.(ts|js)$/))
        .forEach(srcPath=>{
                const source = ('' + fs.readFileSync(srcPath)).split('\n');
                source.map((line,no)=> {
                  if (line.indexOf(`component('${comp}'`) != -1) {
                    const cmd = settings.open_source_cmd + srcPath+':'+(no+1);
                    console.log(cmd);
                    child.exec(cmd,{});
                    endWithSuccess(res,'open editor cmd: ' + cmd);
                  }
                })
        })
    }
};


process.on('uncaughtException', function(err) {
 console.log(err);
});


// *************** utils ***********

const _path = path => path.replace(/[\\\/]/g,'/');

function getURLParam(req,name) {
  try {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(req.url)||[,""])[1].replace(/\+/g, '%20'))||null;
  } catch(e) {}
}

function endWithFailure(res,desc) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({type:'error', desc:desc }));
  console.log(desc);
}
function endWithSuccess(res, message) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({type:'success', message: message}));
}

function now() {
  const date = new Date();
  return pad(date.getDate()) + '/' + pad(date.getMonth()+1) + '/' + date.getFullYear() + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}
function pad(i) { return i<10?'0'+i:i; }

function walk(dir) {
    const list = fs.readdirSync(dir);
    let results = [];
    list.forEach( file => {
        const full_path = dir + '/' + file;
        const stat = fs.statSync(full_path);
        if (stat && stat.isDirectory())
          results = results.concat(walk(full_path))
        else
          results.push(full_path)
    })
    return results;
}

function saveComp(toSave,original,comp,project,force,projectDir,destFileName) {
    let projDir = projectDir;

    if (comp.indexOf('studio.') == 0 && project == 'studio-helper')
      projDir = 'projects/studio';

    if (!original) { // new comp
      const srcPath = `${projectDirectory(project)}/${destFileName || (project+'.js')}`;
      try {
        const current = '' + fs.readFileSync(srcPath);
        const toStore = current + '\n\n' + toSave;
        let cleanNL = toStore.replace(/\r/g,'');
        if (_iswin)
          cleanNL = cleanNL.replace(/\n/g,'\r\n');
        fs.writeFileSync(srcPath,cleanNL);
        return `component ${comp} added to ${srcPath}`;
      } catch (e) {
        throw `can not store component ${comp} in path ${srcPath}`
      }
    }

    let comp_found = '';
//        console.log(original);
    fs.readdirSync(projDir)
      .filter(x=>x.match(/\.js$/) || x.match(/\.ts$/))
      .forEach(srcFile=> {
          const srcPath = projDir+'/'+srcFile;
          const source = ('' + fs.readFileSync(srcPath)).replace(/\r/g,'').split('\n');
          const toFind = original.replace(/\r/g,'').split('\n');
          const replaceWith = toSave.replace(/\r/g,'').split('\n');
          const found = findSection(source,toFind,srcFile);
          if (found) {
            //console.log('splice',source,found.index,found.length,replaceWith);
            source.splice.apply(source, [found.index+1, found.length-1].concat(replaceWith.slice(1)));
            const newContent = source.join(_iswin ? '\r\n' : '\n');
            fs.writeFileSync(srcPath,newContent);
            comp_found = `component ${comp} saved to ${srcPath} at ${JSON.stringify(found)}`;
          }
      })

    if (comp_found)
      return comp_found
    else
      throw `Can not find component ${comp} in project`;

    function findSection(source,toFind,srcFile) {
      const index = source.indexOf(toFind[0]);
      // if (index == -1)
      //   index = source.indexOf(toFind[0].replace('jb_','jb.'));
      if (index != -1 && force) {// ignore content - just look for the end
        for(end_index=index;end_index<source.length;end_index++)
          if ((source[end_index]||'').match(/^}\)$/m))
            return { index: index, length: end_index - index +1}
      } else if (index != -1 && compareArrays(source.slice(index,index+toFind.length),toFind)) {
          return { index: index, length: toFind.length }
      } else if (index == -1) {
        return false;
      } else {
        // calc error message
        const src = source.slice(index,index+toFind.length);
        console.log('origin not found at file ' + srcFile);
        src.forEach(l=>console.log(l));
        toFind.forEach((line,index) => {
          if (line != src[index])
            console.log(index + '-' +line + '#versus source#' + src[index]);
        })

        throw `${comp} found with a different source, use "force save" to save`;
      }
    }
    function compareArrays(arr1,arr2) {
      return arr1.join('\n') == arr2.join('\n')
    }
}

http.createServer(serve).listen(settings.port);