(function() {

jb.component('pretty-print', {
  params: [
    { id: 'profile', defaultValue: '%%' },
    { id: 'colWidth', as: 'number', defaultValue: 140 },
    { id: 'macro', as: 'boolean'},
  ],
  impl: (ctx,profile) =>
    jb.prettyPrint(profile,ctx.params)
})

jb.prettyPrintComp = function(compId,comp,settings) {
  if (comp)
    return "jb.component('" + compId + "', "
      + jb.prettyPrintWithPositions(comp,settings).result + ')'
}

jb.prettyPrint = function(profile,options) {
  return jb.prettyPrintWithPositions(profile,options).result;
}

jb.prettyPrintWithPositions = function(profile,{colWidth,tabSize,initialPath,showNulls,macro} = {}) {
  const spaces = Array.from(new Array(200)).map(_=>' ').join('')

  colWidth = colWidth || 140;
  tabSize = tabSize || 2;

  let remainedInLine = colWidth;
  let result = '';
  let depth = 0;
  let lineNum = 0;
  let positions = {};
  
  if (macro)
    return [valueToMacro({path: initialPath || '', line:0, col: 0}, profile)].map(({text,pos}) => ({result: text, positions: pos}))[0]

  printValue(profile,initialPath || '');
  return { result, positions }

  function sortedPropertyNames(obj) {
    let props = jb.entries(obj)
      .filter(p=>showNulls || p[1] != null)
      .map(x=>x[0]) // try to keep the order
      .filter(p=>p.indexOf('$jb') != 0)

    const comp_name = jb.compName(obj);
    if (comp_name) { // tgp obj - sort by params def
      const params = jb.compParams(jb.comps[comp_name]).map(p=>p.id);
      props.sort((p1,p2)=>params.indexOf(p1) - params.indexOf(p2));
    }
    if (props.indexOf('$') > 0) { // make the $ first
      props.splice(props.indexOf('$'),1);
      props.unshift('$');
    }
    return props;
  }

  function printValue(val,path) {
    positions[path] = lineNum;
    if (!val) return;
    if (val.$jb_arrayShortcut)
      val = val.items;
    if (Array.isArray(val)) return printArray(val,path);
    if (typeof val === 'object') return printObj(val,path);
    if (typeof val === 'function')
      result += val.toString();
    else if (typeof val === 'string' && val.indexOf("'") == -1 && val.indexOf('\n') == -1)
      result += "'" + JSON.stringify(val).replace(/^"/,'').replace(/"$/,'') + "'";
    else if (typeof val === 'string' && val.indexOf('\n') != -1) {
      result += "`" + val.replace(/`/g,'\\`') + "`"
    } else {
      result += JSON.stringify(val);
    }
  }

  function printObj(obj,path) {
      var obj_str = flat_obj(obj);
      if (!printInLine(obj_str)) { // object does not fit in parent line
        depth++;
        result += '{';
        if (!printInLine(obj_str)) { // object does not fit in its own line
          sortedPropertyNames(obj).forEach(function(prop,index,array) {
              if (prop != '$')
                newLine();
              if (showNulls || obj[prop] != null) {
                printProp(obj,prop,path);
                if (index < array.length -1)
                  result += ', ';//newLine();
              }
          });
        }
        depth--;
        newLine();
        result += '}';
      }
  }
  function quotePropName(p) {
    if (p.match(/^[$a-zA-Z_][$a-zA-Z0-9_]*$/))
      return p;
    else
      return `"${p}"`
  }
  function printProp(obj,prop,path) {
    if (obj[prop] && obj[prop].$jb_arrayShortcut)
      obj = obj(prop,obj[prop].items);

    if (printInLine(flat_property(obj,prop))) return;

    if (prop == '$')
      result += '$: '
    else
      result += quotePropName(prop) + (jb.compName(obj[prop]) ? ' :' : ': ');
    //depth++;
    printValue(obj[prop],path+'~'+prop);
    //depth--;
  }
  function printArray(array,path) {
    if (printInLine(flat_array(array))) return;
    result += '[';
    depth++;
    newLine();
    array.forEach(function(val,index) {
      printValue(val,path+'~'+index);
      if (index < array.length -1) {
        result += ', ';
        newLine();
      }
    })
    depth--;newLine();
    result += ']';
  }
  function printInLine(text) {
    if (remainedInLine < text.length || text.match(/:\s?{/) || text.match(/, {\$/)) return false;
    result += text;
    remainedInLine -= text.length;
    return true;
  }
  function newLine() {
    result += '\n';
    lineNum++;
    for (var i = 0; i < depth; i++) result += '               '.substr(0,tabSize);
    remainedInLine = colWidth - tabSize * depth;
  }

  function flat_obj(obj) {
    var props = sortedPropertyNames(obj)
      .filter(p=>showNulls || obj[p] != null)
      .filter(x=>x!='$')
      .map(prop =>
      quotePropName(prop) + ': ' + flat_val(obj[prop]));
    if (obj && obj.$) {
      props.unshift("$: '" + obj.$+ "'");
      return '{' + props.join(', ') + ' }'
    }
    return '{ ' + props.join(', ') + ' }'
  }
  function flat_property(obj,prop) {
    if (jb.compName(obj[prop]))
      return quotePropName(prop) + ' :' + flat_val(obj[prop]);
    else
      return quotePropName(prop) + ': ' + flat_val(obj[prop]);
  }
  function flat_val(val) {
    if (Array.isArray(val)) return flat_array(val);
    if (typeof val === 'object') return flat_obj(val);
    if (typeof val === 'function') return val.toString();
    if (typeof val === 'string' && val.indexOf("'") == -1 && val.indexOf('\n') == -1)
      return "'" + JSON.stringify(val).replace(/^"/,'').replace(/"$/,'') + "'";
    else
      return JSON.stringify(val); // primitives
  }
  function flat_array(array) {
    return '[' + array.map(item=>flat_val(item)).join(', ') + ']';
  }

  function joinVals({path, line, col}, innerVals, open, close, flat, isArray) {
    const result = innerVals.reduce((acc,{innerPath, val}, index) => {
      const fullInnerPath = [path,innerPath].join('~')
      let result = valueToMacro({path: fullInnerPath, line: acc.line, col: acc.col}, val, flat)
      if (typeof result === 'string')
        result = { text: result, map: {}}
      const newPos = advanceLineCol(acc, result.text)
      const map = Object.assign({},acc.map, result.map,{[fullInnerPath]: [acc.line, acc.col,newPos.line, newPos.col]})
      const separator = index === 0 ? '' : ',' + (flat ? ' ' : newLine())
      const valPrefix = isArray ? '' : innerPath + ': ';
      return Object.assign({ text: acc.text + separator + valPrefix + result.text, map }, newPos)
    }, {text: '', map: {}, line, col} )

    if (result.text.replace(/\n\s*/g,'').length < colWidth && !flat)
      return joinVals({path, line, col}, innerVals, open, close, true, isArray)

    const out = { 
      text: open + newLine() + result.text + newLine(-1) + close,
      map: result.map
    }
    return out

    function newLine(offset = 0) {
      return flat ? '' : '\n' + spaces.slice(0,((path.match(/~/g)||'').length+offset)*tabSize)
    }
    function advanceLineCol({line,col},text) {
      const noOfLines = (text.match(/\n/g) || '').length
      const newCol = noOfLines ? text.match(/\n(.*)$/)[1].length : col + text.length
      return { line: line + noOfLines, col: newCol }
    }
  }

  function profileToMacro(ctx, profile,flat) {
    const id = jb.compName(profile)
    if (!id || !jb.comps[id] || id === 'object') { // not tgp
      const props = Object.keys(profile) 
      if (props.indexOf('$') > 0) { // make the $ first
        props.splice(props.indexOf('$'),1);
        props.unshift('$');
      }
      return joinVals(ctx, props.map(prop=>({innerPath: prop, val: profile[prop]})), '{', '}', flat, false)
    }
    const comp = jb.comps[id]
    const idAsCamel = id.replace(/[_-]([a-zA-Z])/g,(_,letter) => letter.toUpperCase()).replace(/\./g,'_')
    const macro = comp.reservedWord ? `$${idAsCamel}` : idAsCamel
  
    const params = comp.params || []
    if (params.length == 1 && (params[0].type||'').indexOf('[]') != -1) { // pipeline, or, and, plus
      const args = (profile['$'+id] || profile[params[0].id]).map((val,i) => ({innerPath: params[0].id + i, val}))
      return joinVals(ctx, args, `${macro}(`, ')', flat, true)
    }
    if (params.length < 3 || comp.usageByValue) {
      const args = params.map(param=>({innerPath: param.id, val: profile[param.id]}))
      if (args.length && args[args.length-1].val === undefined) args.pop()
      if (args.length && args[args.length-1].val === undefined) args.pop()
      return joinVals(ctx, args, `${macro}(`, ')', flat, true)
    }
    const args = params.filter(param=>profile[param.id] !== undefined)
        .map(param=>({innerPath: param.id, val: profile[param.id]}))
      return joinVals(ctx, args, `${macro}({`, '})', flat, false)
  }
    
    function valueToMacro(ctx, val, flat) {
    if (Array.isArray(val)) return arrayToMacro(ctx, val, flat);
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'object') return profileToMacro(ctx, val, flat);
    if (typeof val === 'function') return val.toString();
    if (typeof val === 'string' && val.indexOf("'") == -1 && val.indexOf('\n') == -1)
      return "'" + JSON.stringify(val).replace(/^"/,'').replace(/"$/,'') + "'";
    else
      return JSON.stringify(val); // primitives
  }
  
  function arrayToMacro(ctx, array, flat) {
    const vals = array.map((val,i) => ({innerPath: i, val}))
    return joinVals(ctx, vals, '[', ']', flat, true)
  }
 
}


})()