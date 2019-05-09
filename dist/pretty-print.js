jb.component('pretty-print', {
  params: [
    { id: 'profile', defaultValue: '%%' },
    { id: 'colWidth', as: 'number', defaultValue: 140 },
  ],
  impl: (ctx,profile,colWidth) =>
    jb.prettyPrint(profile,colWidth)
})

jb.prettyPrintComp = function(compId,comp) {
  if (comp)
    return "jb.component('" + compId + "', "
      + jb.prettyPrintWithPositions(comp).result + ')'
}

jb.prettyPrint = function(profile,colWidth,tabSize,initialPath) {
  return jb.prettyPrintWithPositions(profile,colWidth,tabSize,initialPath).result;
}

jb.prettyPrintWithPositions = function(profile,colWidth,tabSize,initialPath) {
  colWidth = colWidth || 140;
  tabSize = tabSize || 2;

  let remainedInLine = colWidth;
  let result = '';
  let depth = 0;
  let lineNum = 0;
  let positions = {};

  printValue(profile,initialPath || '');
  return { result : result, positions : positions }

  function sortedPropertyNames(obj) {
    let props = jb.entries(obj)
      .filter(p=>p[1] != null)
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
      // depth++;
      // result += "`";
      // var lines = val.split('\n');
      // lines.forEach((line,index)=>{
      //     result += line.trim();
      //     if(index<lines.length-1)
      //       newLine();
      // })
      // depth--;
      // result += "`";
    }  else
      result += JSON.stringify(val);
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
              if (obj[prop] != null) {
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
      .filter(p=>obj[p] != null)
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
}
;
