const frame = typeof self === 'object' ? self : typeof global === 'object' ? global : {};
const jb = (function() {
function jb_run(ctx,parentParam,settings) {
  log('req', [ctx,parentParam,settings])
  if (ctx.probe && ctx.probe.outOfTime)
    return
  if (jb.ctxByPath) jb.ctxByPath[ctx.path] = ctx
  const res = do_jb_run(...arguments);
  if (ctx.probe && ctx.probe.pathToTrace.indexOf(ctx.path) == 0)
      ctx.probe.record(ctx,res)
  log('res', [ctx,res,parentParam,settings])
  return res;
}

function do_jb_run(ctx,parentParam,settings) {
  try {
    const profile = ctx.profile;
    if (profile == null || (typeof profile == 'object' && profile.$disabled))
      return castToParam(null,parentParam);

    if (profile.$debugger == 0) debugger;
    if (profile.$asIs) return profile.$asIs;
    if (parentParam && (parentParam.type||'').indexOf('[]') > -1 && ! parentParam.as) // fix to array value. e.g. single feature not in array
        parentParam.as = 'array';

    if (typeof profile === 'object' && Object.getOwnPropertyNames(profile).length == 0)
      return;
    const ctxWithVars = extendWithVars(ctx,profile.$vars);
    const run = prepare(ctxWithVars,parentParam);
    ctx.parentParam = parentParam;
    switch (run.type) {
      case 'booleanExp': return castToParam(bool_expression(profile, ctx,parentParam), parentParam);
      case 'expression': return castToParam(expression(profile, ctx,parentParam), parentParam);
      case 'asIs': return profile;
      case 'function': return castToParam(profile(ctx,ctx.vars,ctx.componentContext && ctx.componentContext.params),parentParam);
      case 'null': return castToParam(null,parentParam);
      case 'ignore': return ctx.data;
      case 'list': return profile.map((inner,i) =>
            ctxWithVars.runInner(inner,null,i));
      case 'runActions': return jb.comps.runActions.impl(new jbCtx(ctxWithVars,{profile: { actions : profile },path:''}));
      case 'if': {
          const cond = jb_run(run.ifContext, run.IfParentParam);
          if (cond && cond.then)
            return cond.then(res=>
              res ? jb_run(run.thenContext, run.thenParentParam) : jb_run(run.elseContext, run.elseParentParam))
          return cond ? jb_run(run.thenContext, run.thenParentParam) : jb_run(run.elseContext, run.elseParentParam);
      }
      case 'profile':
        if (!run.impl)
          run.ctx.callerPath = ctx.path;

        run.preparedParams.forEach(paramObj => {
          switch (paramObj.type) {
            case 'function': run.ctx.params[paramObj.name] = paramObj.outerFunc(run.ctx) ;  break;
            case 'array': run.ctx.params[paramObj.name] =
                paramObj.array.map((prof,i) =>
                  jb_run(new jbCtx(run.ctx,{profile: prof, forcePath: paramObj.forcePath || ctx.path + '~' + paramObj.path+ '~' + i, path: ''}), paramObj.param))
                  //run.ctx.runInner(prof, paramObj.param, paramObj.path+'~'+i) )
              ; break;  // maybe we should [].concat and handle nulls
            default: run.ctx.params[paramObj.name] =
              jb_run(new jbCtx(run.ctx,{profile: paramObj.prof, forcePath: paramObj.forcePath || ctx.path + '~' + paramObj.path, path: ''}), paramObj.param);
            //run.ctx.runInner(paramObj.prof, paramObj.param, paramObj.path)
            //jb_run(paramObj.ctx, paramObj.param);
          }
        });
        let out;
        if (run.impl) {
          const args = prepareGCArgs(run.ctx,run.preparedParams);
          if (profile.$debugger) debugger;
          if (! args.then)
            out = run.impl.apply(null,args);
          else
            return args.then(args=>
              castToParam(run.impl.apply(null,args),parentParam))
        }
        else {
          out = jb_run(new jbCtx(run.ctx, { componentContext: run.ctx }),parentParam);
        }

        if (profile.$log)
          console.log(profile.$log === true ? out : ctxWithVars.run(profile.$log));

        if (profile.$trace) console.log('trace: ' + ctx.path,ctx,out,run);

        return castToParam(out,parentParam);
    }
  } catch (e) {
//    log('exception', [e && e.message, e, ctx,parentParam,settings])
    logException(e,'exception while running run',ctx,parentParam,settings);
    //if (ctx.vars.$throw) throw e;
  }

  function prepareGCArgs(ctx,preparedParams) {
    const delayed = preparedParams.filter(param => {
      const v = ctx.params[param.name] || {};
      return (v.then || v.subscribe ) && param.param.as != 'observable'
    });
    if (delayed.length == 0 || typeof Observable == 'undefined')
      return [ctx].concat(preparedParams.map(param=>ctx.params[param.name]))

    return Observable.from(preparedParams)
        .concatMap(param=> ctx.params[param.name])
        .toArray()
        .map(x=> [ctx].concat(x))
        .toPromise()
  }
}

function extendWithVars(ctx,vars) {
  if (!vars) return ctx;
  let res = ctx;
  for(let varname in vars || {})
    res = new jbCtx(res,{ vars: {[varname]: res.runInner(vars[varname] || '%%', null,'$vars~'+varname)} });
  return res;
}

function compParams(comp) {
  if (!comp || !comp.params)
    return [];
  return Array.isArray(comp.params) ? comp.params : entries(comp.params).map(x=>Object.assign(x[1],{id: x[0]}));
}

function prepareParams(comp_name,comp,profile,ctx) {
  return compParams(comp)
    .filter(param=> !param.ignore)
    .map((param,index) => {
      const p = param.id, sugar = sugarProp(profile);
      let val = profile[p], path =p;
      if (!val && index == 0 && sugar) {
        path = sugar[0];
        val = sugar[1];
      }
      const valOrDefault = val !== undefined ? val : (param.defaultValue !== undefined ? param.defaultValue : null)
      const usingDefault = val === undefined && param.defaultValue !== undefined
      const forcePath = usingDefault && [comp_name, 'params', compParams(comp).indexOf(param), 'defaultValue'].join('~')
      if (forcePath) path = ''

      const valOrDefaultArray = valOrDefault ? valOrDefault : []; // can remain single, if null treated as empty array
      const arrayParam = param.type && param.type.indexOf('[]') > -1 && Array.isArray(valOrDefaultArray);

      if (param.dynamic) {
        const outerFunc = runCtx => {
          let func;
          if (arrayParam)
            func = (ctx2,data2) =>
              jb.flattenArray(valOrDefaultArray.map((prof,i)=> runCtx.extendVars(ctx2,data2).runInner(prof,param,path+'~'+i)))
          else
            func = (ctx2,data2) => jb_run(new jb.jbCtx(runCtx.extendVars(ctx2,data2),{ profile: valOrDefault, forcePath, path } ),param)

          Object.defineProperty(func, "name", { value: p }); // for debug
          func.profile = val !== undefined ? val : (param.defaultValue !== undefined ? param.defaultValue : null)
          func.srcPath = ctx.path;
          return func;
        }
        return { name: p, type: 'function', outerFunc, path, param, forcePath };
      }

      if (arrayParam) // array of profiles
        return { name: p, type: 'array', array: valOrDefaultArray, param: Object.assign({},param,{type:param.type.split('[')[0],as:null}), forcePath, path };
      else
        return { name: p, type: 'run', prof: valOrDefault, param, forcePath, path };
  })
}

function fixByValue(profile,comp) {
  if (profile && profile.$byValue) {
    const params = compParams(comp)
    profile.$byValue.forEach((v,i)=> Object.assign(profile,{[params[i].id]: v}))
    delete profile.$byValue
  }
}

function prepare(ctx,parentParam) {
  const profile = ctx.profile;
  const profile_jstype = typeof profile;
  const parentParam_type = parentParam && parentParam.type;
  const jstype = parentParam && parentParam.as;
  const isArray = Array.isArray(profile);

  if (profile_jstype === 'string' && parentParam_type === 'boolean') return { type: 'booleanExp' };
  if (profile_jstype === 'boolean' || profile_jstype === 'number' || parentParam_type == 'asIs') return { type: 'asIs' };// native primitives
  if (profile_jstype === 'object' && jstype === 'object') return { type: 'object' };
  if (profile_jstype === 'string') return { type: 'expression' };
  if (profile_jstype === 'function') return { type: 'function' };
//  if (profile_jstype === 'object' && !isArray && entries(profile).filter(p=>p[0].indexOf('$') == 0).length == 0) return { type: 'asIs' };
  if (profile_jstype === 'object' && (profile instanceof RegExp)) return { type: 'asIs' };
  if (profile == null) return { type: 'asIs' };

  if (isArray) {
    if (!profile.length) return { type: 'null' };
    if (!parentParam || !parentParam.type || parentParam.type === 'data' ) //  as default for array
      return { type: 'list' };
    if (parentParam_type === 'action' || parentParam_type === 'action[]' && profile.isArray) {
      profile.sugar = true;
      return { type: 'runActions' };
    }
  } else if (profile.$if)
  return {
      type: 'if',
      ifContext: new jbCtx(ctx,{profile: profile.$if || profile.condition, path: '$if'}),
      IfParentParam: { type: 'boolean', as:'boolean' },
      thenContext: new jbCtx(ctx,{profile: profile.then || 0 , path: '~then'}),
      thenParentParam: { type: parentParam_type, as:jstype },
      elseContext: new jbCtx(ctx,{profile: profile['else'] || 0 , path: '~else'}),
      elseParentParam: { type: parentParam_type, as:jstype }
    }
  const comp_name = compName(profile,parentParam);
  if (!comp_name)
    return { type: 'asIs' }
  // if (!comp_name)
  //   return { type: 'ignore' }
  const comp = jb.comps[comp_name];
  if (!comp && comp_name) { logError('component ' + comp_name + ' is not defined', ctx); return { type:'null' } }
  if (!comp.impl) { logError('component ' + comp_name + ' has no implementation', ctx); return { type:'null' } }

  fixByValue(profile,comp)
  const resCtx = Object.assign(new jbCtx(ctx,{}), {parentParam, params: {}})
  const preparedParams = prepareParams(comp_name,comp,profile,resCtx);
  if (typeof comp.impl === 'function') {
    Object.defineProperty(comp.impl, 'name', { value: comp_name }); // comp_name.replace(/[^a-zA-Z0-9]/g,'_')
    return { type: 'profile', impl: comp.impl, ctx: resCtx, preparedParams: preparedParams }
  } else
    return { type:'profile', ctx: new jbCtx(resCtx,{profile: comp.impl, comp: comp_name, path: ''}), preparedParams: preparedParams };
}

function resolveFinishedPromise(val) {
  if (!val) return val;
  if (val.$jb_parent)
    val.$jb_parent = resolveFinishedPromise(val.$jb_parent);
  if (val && typeof val == 'object' && val._state == 1) // finished promise
    return val._result;
  return val;
}

function isRefType(jstype) {
  return jstype === 'ref' || jstype === 'ref[]'
}
function calcVar(ctx,varname,jstype) {
  let res;
  if (ctx.componentContext && ctx.componentContext.params[varname] !== undefined)
    res = ctx.componentContext.params[varname];
  else if (ctx.vars[varname] !== undefined)
    res = ctx.vars[varname]
  else if (ctx.vars.scope && ctx.vars.scope[varname] !== undefined)
    res = ctx.vars.scope[varname]
  else if (jb.resources && jb.resources[varname] !== undefined)
    res = isRefType(jstype) ? jb.mainWatchableHandler.refOfPath([varname]) : jb.resource(varname)
  else if (jb.consts && jb.consts[varname] !== undefined)
    res = isRefType(jstype) ? jb.simpleValueByRefHandler.objectProperty(jb.consts,varname) : res = jb.consts[varname];

  return resolveFinishedPromise(res);
}

function expression(_exp, ctx, parentParam) {
  const jstype = parentParam && (parentParam.ref ? 'ref' : parentParam.as);
  let exp = '' + _exp;
  if (jstype == 'boolean') return bool_expression(exp, ctx);
  if (exp.indexOf('$debugger:') == 0) {
    debugger;
    exp = exp.split('$debugger:')[1];
  }
  if (exp.indexOf('$log:') == 0) {
    const out = expression(exp.split('$log:')[1],ctx,parentParam);
    jb.comps.log.impl(ctx, out);
    return out;
  }
  if (exp.indexOf('%') == -1 && exp.indexOf('{') == -1) return exp;
  // if (ctx && !ctx.ngMode)
  //   exp = exp.replace(/{{/g,'{%').replace(/}}/g,'%}')
  if (exp == '{%%}' || exp == '%%')
      return expPart('');

  if (exp.lastIndexOf('{%') == 0 && exp.indexOf('%}') == exp.length-2) // just one exp filling all string
    return expPart(exp.substring(2,exp.length-2));

  exp = exp.replace(/{%(.*?)%}/g, (match,contents) => tostring(expPart(contents,{ as: 'string'})))
  exp = exp.replace(/{\?(.*?)\?}/g, (match,contents) => tostring(conditionalExp(contents)))
  if (exp.match(/^%[^%;{}\s><"']*%$/)) // must be after the {% replacer
    return expPart(exp.substring(1,exp.length-1),parentParam);

  exp = exp.replace(/%([^%;{}\s><"']*)%/g, (match,contents) => tostring(expPart(contents,{as: 'string'})))
  return exp;

  function conditionalExp(exp) {
    // check variable value - if not empty return all exp, otherwise empty
    const match = exp.match(/%([^%;{}\s><"']*)%/);
    if (match && tostring(expPart(match[1])))
      return expression(exp, ctx, { as: 'string' });
    else
      return '';
  }

  function expPart(expressionPart,_parentParam) {
    return resolveFinishedPromise(evalExpressionPart(expressionPart,ctx,_parentParam || parentParam))
  }
}

function evalExpressionPart(expressionPart,ctx,parentParam) {
  const jstype = parentParam && (parentParam.ref ? 'ref' : parentParam.as);
  // example: %$person.name%.

  const parts = expressionPart.split(/[./[]/);
  return parts.reduce((input,subExp,index)=>pipe(input,subExp,index == parts.length-1,index == 0),ctx.data)

  function pipe(input,subExp,last,first) {
    if (subExp == '')
       return input;
    if (subExp.match(/]$/))
      subExp = subExp.slice(0,-1)

    const refHandler = jb.objHandler(input)
    const functionCallMatch = subExp.match(/=([a-zA-Z]*)\(?([^)]*)\)?/);
    if (functionCallMatch && jb.functions[functionCallMatch[1]])
        return tojstype(jb.functions[functionCallMatch[1]](ctx,functionCallMatch[2]),jstype,ctx);

    if (subExp.match(/\(\)$/)) {
      const func = pipe(input,subExp.slice(0,-2),last,first)
      return typeof func == 'function' ? func(ctx) : func
    }

    if (first && subExp.charAt(0) == '$' && subExp.length > 1)
      return calcVar(ctx,subExp.substr(1),last ? jstype : null)
    const obj = val(input);
    if (subExp == 'length' && obj && typeof obj.length != 'undefined')
      return obj.length;
    if (Array.isArray(obj) && isNaN(Number(subExp)))
      return [].concat.apply([],obj.map(item=>pipe(item,subExp,last,false,refHandler)).filter(x=>x!=null));

    if (input != null && typeof input == 'object') {
      if (obj === null || obj === undefined) return;
      if (typeof obj[subExp] === 'function' && (parentParam && parentParam.dynamic || obj[subExp].profile))
          return obj[subExp](ctx);
      if (isRefType(jstype)) {
        if (last)
          return refHandler.objectProperty(obj,subExp,ctx);
        if (obj[subExp] === undefined)
          obj[subExp] = implicitlyCreateInnerObject(obj,subExp,refHandler);
      }
      if (last && jstype)
          return jstypes[jstype](obj[subExp]);
      return obj[subExp];
    }
  }
  function implicitlyCreateInnerObject(parent,prop,refHandler) {
    jb.log('implicitlyCreateInnerObject',[...arguments]);
    parent[prop] = {};
    refHandler.refreshMapDown && refHandler.refreshMapDown(parent)
    return parent[prop]
  }
}

function bool_expression(exp, ctx, parentParam) {
  if (exp.indexOf('$debugger:') == 0) {
    debugger;
    exp = exp.split('$debugger:')[1];
  }
  if (exp.indexOf('$log:') == 0) {
    const calculated = expression(exp.split('$log:')[1],ctx,{as: 'boolean'});
    const result = bool_expression(exp.split('$log:')[1], ctx, parentParam);
    jb.comps.log.impl(ctx, calculated + ':' + result);
    return result;
  }
  if (exp.indexOf('!') == 0)
    return !bool_expression(exp.substring(1), ctx);
  const parts = exp.match(/(.+)(==|!=|<|>|>=|<=|\^=|\$=)(.+)/);
  if (!parts) {
    const ref = expression(exp, ctx, parentParam)
    if (jb.isRef(ref))
      return ref
    
    const val = jb.tostring(ref);
    if (typeof val == 'boolean') return val;
    const asString = tostring(val);
    return !!asString && asString != 'false';
  }
  if (parts.length != 4)
    return logError('invalid boolean expression: ' + exp, ctx);
  const op = parts[2].trim();

  if (op == '==' || op == '!=' || op == '$=' || op == '^=') {
    const p1 = tostring(expression(trim(parts[1]), ctx, {as: 'string'}))
    let p2 = tostring(expression(trim(parts[3]), ctx, {as: 'string'}))
    p2 = (p2.match(/^["'](.*)["']/) || ['',p2])[1]; // remove quotes
    if (op == '==') return p1 == p2;
    if (op == '!=') return p1 != p2;
    if (op == '^=') return p1.lastIndexOf(p2,0) == 0; // more effecient
    if (op == '$=') return p1.indexOf(p2, p1.length - p2.length) !== -1;
  }

  const p1 = tonumber(expression(parts[1].trim(), ctx));
  const p2 = tonumber(expression(parts[3].trim(), ctx));

  if (op == '>') return p1 > p2;
  if (op == '<') return p1 < p2;
  if (op == '>=') return p1 >= p2;
  if (op == '<=') return p1 <= p2;

  function trim(str) {  // trims also " and '
    return str.trim().replace(/^"(.*)"$/,'$1').replace(/^'(.*)'$/,'$1');
  }
}

function castToParam(value,param) {
  return tojstype(value,param ? param.as : null);
}

function tojstype(value,jstype) {
  if (!jstype) return value;
  if (typeof jstypes[jstype] != 'function') debugger;
  return jstypes[jstype](value);
}

const tostring = value => tojstype(value,'string');
const toarray = value => tojstype(value,'array');
const toboolean = value => tojstype(value,'boolean');
const tosingle = value => tojstype(value,'single');
const tonumber = value => tojstype(value,'number');

const jstypes = {
    asIs: x => x,
    object(value) {
      if (Array.isArray(value))
        value = value[0];
      if (value && typeof value === 'object')
        return val(value);
      return {}
    },
    string(value) {
      if (Array.isArray(value)) value = value[0];
      if (value == null) return '';
      value = val(value);
      if (typeof(value) == 'undefined') return '';
      return '' + value;
    },
    number(value) {
      if (Array.isArray(value)) value = value[0];
      if (value == null || value == undefined) return null; // 0 is not null
      const num = Number(val(value),true);
      return isNaN(num) ? null : num;
    },
    array(value) {
      if (typeof value == 'function' && value.profile)
        value = value();
      value = val(value);
      if (Array.isArray(value)) return value;
      if (value == null) return [];
      return [value];
    },
    boolean(value) {
      if (Array.isArray(value)) value = value[0];
      return val(value) ? true : false;
    },
    single(value) {
      if (Array.isArray(value))
        value = value[0];
      return val(value);
    },
    ref(value) {
      if (Array.isArray(value))
        value = value[0];
      return jb.asRef(value);
    },
    'ref[]': function(value) {
      return jb.asRef(value);
    },
    value(value) {
      return val(value);
    }
}

function profileType(profile) {
  if (!profile) return '';
  if (typeof profile == 'string') return 'data';
  const comp_name = compName(profile);
  return (jb.comps[comp_name] && jb.comps[comp_name].type) || '';
}

function sugarProp(profile) {
  return entries(profile)
    .filter(p=>p[0].indexOf('$') == 0 && p[0].length > 1)
    .filter(p=>p[0].indexOf('$jb_') != 0)
    .filter(p=>['$vars','$debugger','$log'].indexOf(p[0]) == -1)[0]
}

function singleInType(profile,parentParam) {
  const _type = parentParam && parentParam.type && parentParam.type.split('[')[0];
  return _type && jb.comps[_type] && jb.comps[_type].singleInType && _type;
}

function compName(profile,parentParam) {
  if (!profile || Array.isArray(profile)) return;
  if (profile.$) return profile.$;
  const f = sugarProp(profile);
  return (f && f[0].slice(1)) || singleInType(profile,parentParam);
}

// give a name to the impl function. Used for tgp debugging
function assignNameToFunc(name, fn) {
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

let ctxCounter = 0;

class jbCtx {
  constructor(ctx,ctx2) {
    this.id = ctxCounter++;
    this._parent = ctx;
    if (typeof ctx == 'undefined') {
      this.vars = {};
      this.params = {};
    }
    else {
      if (ctx2.profile && ctx2.path == null) {
        debugger;
      ctx2.path = '?';
    }
      this.profile = (typeof(ctx2.profile) != 'undefined') ?  ctx2.profile : ctx.profile;

      this.path = (ctx.path || '') + (ctx2.path ? '~' + ctx2.path : '');
      if (ctx2.forcePath)
        this.path = this.forcePath = ctx2.forcePath;
      if (ctx2.comp)
        this.path = ctx2.comp + '~impl';
      this.data= (typeof ctx2.data != 'undefined') ? ctx2.data : ctx.data;     // allow setting of data:null
      this.vars= ctx2.vars ? Object.assign({},ctx.vars,ctx2.vars) : ctx.vars;
      this.params= ctx2.params || ctx.params;
      this.componentContext= (typeof ctx2.componentContext != 'undefined') ? ctx2.componentContext : ctx.componentContext;
      this.probe= ctx.probe;
    }
  }
  run(profile,parentParam) {
    return jb_run(new jbCtx(this,{ profile: profile, comp: profile.$ , path: ''}), parentParam)
  }
  exp(exp,jstype) { return expression(exp, this, {as: jstype}) }
  setVars(vars) { return new jbCtx(this,{vars: vars}) }
  setVar(name,val) { return name ? new jbCtx(this,{vars: {[name]: val}}) : this }
  setData(data) { return new jbCtx(this,{data: data}) }
  runInner(profile,parentParam, path) { return jb_run(new jbCtx(this,{profile: profile,path}), parentParam) }
  bool(profile) { return this.run(profile, { as: 'boolean'}) }
  // keeps the ctx vm and not the caller vm - needed in studio probe
  ctx(ctx2) { return new jbCtx(this,ctx2) }
  frame() { // used for multi windows apps. e.g., studio
    return frame
  }
  extendVars(ctx2,data2) {
    if (ctx2 == null && data2 == null)
      return this;
    return new jbCtx(this,{
      vars: ctx2 ? ctx2.vars : null,
      data: (data2 == null) ? ctx2.data : data2,
      forcePath: (ctx2 && ctx2.forcePath) ? ctx2.forcePath : null
    })
  }
  runItself(parentParam,settings) { return jb_run(this,parentParam,settings) }
  callStack() {
    const ctxStack=[]; 
    for(let innerCtx=this; innerCtx; innerCtx = innerCtx.componentContext) 
      ctxStack.push(innerCtx)
    return ctxStack.map(ctx=>ctx.callerPath)
  }
}

const logs = {};

const profileOfPath = path => path.reduce((o,p)=>o && o[p], jb.comps) || {}

const log = (logName, record, options) => jb.spy && jb.spy.log(logName, record, { 
  modifier: record => {
    if (record[1] instanceof jbCtx)
      record.splice(1,0,pathSummary(record[1].path))
    if (record[0] instanceof jbCtx)
      record.splice(0,0,pathSummary(record[0].path))
} , ...options });

function pathSummary(path) {
  if (!path) return ''
  const _path = path.split('~');
  while(!jb.compName(profileOfPath(_path)) && _path.length > 0)
    _path.pop();
	return jb.compName(profileOfPath(_path)) + ': ' + path;
}

function logError() {
  frame.console && frame.console.log('%c Error: ','color: red', ...arguments)
  log('error',[...arguments])
}

function logException(e,errorStr,ctx, ...rest) {
  frame.console && frame.console.log('%c Exception: ','color: red', ...arguments)
  log('exception',[e.stack||'',ctx,errorStr && pathSummary(ctx && ctx.path),e, ...rest])
}

function val(ref) {
  if (ref == null || typeof ref != 'object') return ref;
  const handler = jb.refHandler(ref)
  if (handler)
    return handler.val(ref)
  return ref
}
// Object.getOwnPropertyNames does not keep the order !!!
function entries(obj) {
  if (!obj || typeof obj != 'object') return [];
  let ret = [];
  for(let i in obj) // please do not change. its keeps definition order !!!!
      if (obj.hasOwnProperty(i) && i.indexOf('$jb_') != 0)
        ret.push([i,obj[i]])
  return ret;
}
function objFromEntries(entries) {
  const res = {}
  entries.forEach(e => res[e[0]] = e[1]);
  return res;
}

const simpleValueByRefHandler = {
  val(v) {
    if (v && v.$jb_val) return v.$jb_val();
    return v && v.$jb_parent ? v.$jb_parent[v.$jb_property] : v;
  },
  writeValue(to,value,srcCtx) {
    jb.log('writeValue',['valueByRefWithjbParent',value,to,srcCtx]);
    if (!to) return;
    if (to.$jb_val)
      to.$jb_val(this.val(value))
    else if (to.$jb_parent)
      to.$jb_parent[to.$jb_property] = this.val(value);
    return to;
  },
  push(ref,toAdd) {
    const arr = jb.asArray(jb.val(ref))
    jb.toarray(toAdd).forEach(item => arr.push(item))
  },
  asRef(value) {
    return value
  },
  isRef(value) {
    return value && (value.$jb_parent || value.$jb_val || value.$jb_obj)
  },
  objectProperty(obj,prop) {
      if (this.isRef(obj[prop]))
        return obj[prop];
      else
        return { $jb_parent: obj, $jb_property: prop };
  }
}

let types = {}, ui = {}, rx = {}, ctxDictionary = {}, testers = {};

return {
  run: jb_run,
  jbCtx, expression, bool_expression, profileType, compName, pathSummary, logs, logError, log, logException, tojstype, jstypes, tostring, toarray, toboolean,tosingle,tonumber,
  types, ui, rx, ctxDictionary, testers, compParams, singleInType, val, entries, objFromEntries, frame, fixByValue,
  ctxCounter: _ => ctxCounter, simpleValueByRefHandler
}

})();

Object.assign(jb,{
  comps: {}, resources: {}, consts: {}, location: Symbol.for('location'), studio: { previewjb: jb },
  removeDataResourcePrefix: id => id.indexOf('data-resource.') == 0 ? id.slice('data-resource.'.length) : id,
  addDataResourcePrefix: id => id.indexOf('data-resource.') == 0 ? id : 'data-resource.' + id,

  component: (id,comp) => {
    try {
      const errStack = new Error().stack.split(/\r|\n/)
      const line = errStack.filter(x=>x && !x.match(/\)<anonymous>|about:blank|tgp-pretty.js|internal\/modules\/cjs/)).pop()
      comp[jb.location] = (line.match(/\\?([^:]+):([^:]+):[^:]+$/) || ['','','','']).slice(1,3)
    
      if (comp.watchableData !== undefined) {
        jb.comps[jb.addDataResourcePrefix(id)] = comp
        return jb.resource(jb.removeDataResourcePrefix(id),comp.watchableData)
      }
      if (comp.passiveData !== undefined) {
        jb.comps[jb.addDataResourcePrefix(id)] = comp
        return jb.const(jb.removeDataResourcePrefix(id),comp.passiveData)
      }
    } catch(e) {
      console.log(e)
    }

    jb.comps[id] = comp;

    // fix as boolean params to have type: 'boolean'
    (comp.params || []).forEach(p=> {
      if (p.as == 'boolean' && ['boolean','ref'].indexOf(p.type) == -1)
        p.type = 'boolean'
    })

    jb.registerMacro && jb.registerMacro(id, comp)
  },
  type: (id,val) => jb.types[id] = val || {},
  resource: (id,val) => { 
    if (typeof val !== 'undefined')
      jb.resources[id] = val
    jb.mainWatchableHandler && jb.mainWatchableHandler.resourceReferred(id);
    return jb.resources[id];
  },
  const: (id,val) => typeof val == 'undefined' ? jb.consts[id] : (jb.consts[id] = val || {}),
  functionDef: (id,val) => jb.functions[id] = val,
// force path - create objects in the path if not exist
  path: (object,path,value) => {
    let cur = object;
    if (typeof path === 'string') path = path.split('.')
    path = jb.asArray(path)

    if (typeof value == 'undefined') {  // get
      return path.reduce((o,k)=>o && o[k], object)
    } else { // set
      for(let i=0;i<path.length;i++)
        if (i == path.length-1)
          cur[path[i]] = value;
        else
          cur = cur[path[i]] = cur[path[i]] || {};
      return value;
    }
  },

  compareArrays: (arr1, arr2) => {
    if (arr1 === arr2)
      return true;
    if (!Array.isArray(arr1) && !Array.isArray(arr2)) return arr1 === arr2;
    if (!arr1 || !arr2 || arr1.length != arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      const key1 = (arr1[i]||{}).key, key2 = (arr2[i]||{}).key;
      if (key1 && key2 && key1 === key2 && arr1[i].val === arr2[i].val)
        continue;
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  },
  range: (start, count) => Array.apply(0, Array(count)).map((element, index) => index + start),

  flattenArray: items => {
    let out = [];
    items.filter(i=>i).forEach(function(item) {
      if (Array.isArray(item))
        out = out.concat(item);
      else
        out.push(item);
    })
    return out;
  },
  synchArray: __ar => {
    const ar = jb.asArray(__ar)
    const isSynch = ar.filter(v=> v &&  (typeof v.then == 'function' || typeof v.subscribe == 'function')).length == 0;
    if (isSynch) return ar;

    const _ar = ar.filter(x=>x).map(v=>
      (typeof v.then == 'function' || typeof v.subscribe == 'function') ? v : [v]);

    return jb.rx.Observable.from(_ar)
          .concatMap(x=>x)
          .flatMap(v =>
            Array.isArray(v) ? v : [v])
          .toArray()
          .toPromise()
  },
  unique: (ar,f) => {
    f = f || (x=>x);
    let keys = {}, res = [];
    ar.forEach(e=>{
      if (!keys[f(e)]) {
        keys[f(e)] = true;
        res.push(e)
      }
    })
    return res;
  },
  isEmpty: o => Object.keys(o).length === 0,
  isObject: o => o != null && typeof o === 'object',
  asArray: v => v == null ? [] : (Array.isArray(v) ? v : [v]),
  filterEmpty: obj => Object.entries(obj).reduce((a,[k,v]) => (v == null ? a : {...a, [k]:v}), {}),
  equals: (x,y) => x == y || jb.val(x) == jb.val(y),
  delay: mSec => new Promise(r=>{setTimeout(r,mSec)}),

  // valueByRef API
  extraWatchableHandlers: [],
  extraWatchableHandler: (handler,oldHandler) => { 
    jb.extraWatchableHandlers.push(handler)
    const oldHandlerIndex = jb.extraWatchableHandlers.indexOf(oldHandler)
    if (oldHandlerIndex != -1)
      jb.extraWatchableHandlers.splice(oldHandlerIndex,1)
    jb.watchableHandlers = [jb.mainWatchableHandler, ...jb.extraWatchableHandlers].map(x=>x)
    return handler
  },
  setMainWatchableHandler: handler => { 
    jb.mainWatchableHandler = handler
    jb.watchableHandlers = [jb.mainWatchableHandler, ...jb.extraWatchableHandlers].map(x=>x)
  },
  watchableHandlers: [],
  safeRefCall: (ref,f) => {
    const handler = jb.refHandler(ref)
    if (!handler || !handler.isRef(ref))
      return jb.logError('invalid ref', ref)
    return f(handler)
  },
 
  // handler for ref
  refHandler: ref => {
    if (ref && ref.handler) return ref.handler
    if (jb.simpleValueByRefHandler.isRef(ref)) 
      return jb.simpleValueByRefHandler
    return jb.watchableHandlers.find(handler => handler.isRef(ref))
  },
  // handler for object (including the case of ref)
  objHandler: obj => obj && jb.refHandler(obj) || jb.watchableHandlers.find(handler=> handler.watchable(obj)) || jb.simpleValueByRefHandler,
  asRef: obj => {
    const watchableHanlder = jb.watchableHandlers.find(handler => handler.watchable(obj) || handler.isRef(obj))
    if (watchableHanlder)
      return watchableHanlder.asRef(obj)
    return jb.simpleValueByRefHandler.asRef(obj)
  },
  writeValue: (ref,value,srcCtx) => !srcCtx.probe && jb.safeRefCall(ref, h=>h.writeValue(ref,value,srcCtx)),
  objectProperty: (obj,prop,srcCtx) => jb.objHandler(obj).objectProperty(obj,prop,srcCtx),
  splice: (ref,args,srcCtx) => !srcCtx.probe && jb.safeRefCall(ref, h=>h.splice(ref,args,srcCtx)),
  move: (ref,toRef,srcCtx) => !srcCtx.probe && jb.safeRefCall(ref, h=>h.move(ref,toRef,srcCtx)),
  push: (ref,toAdd,srcCtx) => !srcCtx.probe && jb.safeRefCall(ref, h=>h.push(ref,toAdd,srcCtx)),
  isRef: ref => jb.refHandler(ref),
  isWatchable: ref => false, // overriden by the watchable-ref.js (if loaded)
  isValid: ref => jb.safeRefCall(ref, h=>h.isValid(ref)),
  refreshRef: ref => jb.safeRefCall(ref, h=>h.refresh(ref)),
})
if (typeof self != 'undefined')
  self.jb = jb
if (typeof module != 'undefined')
  module.exports = jb;

Object.assign(jb, {
    macroDef: Symbol('macroDef'), macroNs: {}, 
    macroName: id => id.replace(/[_-]([a-zA-Z])/g, (_, letter) => letter.toUpperCase()),
    ns: nsIds => nsIds.split(',').forEach(nsId => jb.registerMacro(nsId + '.$dummyComp', {})),
    registerMacro: (id, profile) => {
        const macroId = jb.macroName(id).replace(/\./g, '_')
        const nameSpace = id.indexOf('.') != -1 && jb.macroName(id.split('.')[0])

        if (checkId(macroId))
            registerProxy(macroId)
        if (nameSpace && checkId(nameSpace, true) && !jb.frame[nameSpace]) {
            registerProxy(nameSpace, true)
            jb.macroNs[nameSpace] = true
        }

        function registerProxy(proxyId) {
            jb.frame[proxyId] = new Proxy(() => 0, {
                get: (o, p) => {
                    if (typeof p === 'symbol') return true
                    return jb.frame[proxyId + '_' + p] || genericMacroProcessor(proxyId, p)
                },
                apply: function (target, thisArg, allArgs) {
                    const { args, system } = splitSystemArgs(allArgs)
                    return Object.assign(processMacro(args), system)
                }
            })
        }

        function splitSystemArgs(allArgs) {
            const args = [], system = {} // system props: constVar, remark
            allArgs.forEach(arg => {
                if (arg && typeof arg === 'object' && (jb.comps[arg.$] || {}).isSystem)
                    jb.comps[arg.$].macro(system, arg)
                else
                    args.push(arg)
            })
            if (args.length == 1 && typeof args[0] === 'object') {
                jb.asArray(args[0].vars).forEach(arg => jb.comps[arg.$].macro(system, arg))
                args[0].remark && jb.comps.remark.macro(system, args[0])
            }
            return { args, system }
        }

        function checkId(macroId, isNS) {
            if (jb.frame[macroId] && !jb.frame[macroId][jb.macroDef]) {
                jb.logError(macroId + ' is reserved by system or libs. please use a different name')
                return false
            }
            if (jb.frame[macroId] !== undefined && !isNS && !jb.macroNs[macroId] && !macroId.match(/_\$dummyComp$/))
                jb.logError(macroId + ' is defined more than once, using last definition ' + id)
            // if (jb.frame[macroId] !== undefined && !isNS && jb.macroNs[macroId])
            //     jb.logError(macroId + ' is already defined as ns, using last definition ' + id)
            return true;
        }

        function processMacro(args) {
            if (args.length == 0)
                return { $: id }
            const params = profile.params || []
            const firstParamIsArray = (params[0] && params[0].type || '').indexOf('[]') != -1
            if (params.length == 1 && firstParamIsArray) // pipeline, or, and, plus
                return { $: id, [params[0].id]: args }
            const macroByProps = args.length == 1 && typeof args[0] === 'object' &&
                (params[0] && args[0][params[0].id] || params[1] && args[0][params[1].id])
            if ((profile.macroByValue || params.length < 3) && profile.macroByValue !== false && !macroByProps)
                return { $: id, ...jb.objFromEntries(args.filter((_, i) => params[i]).map((arg, i) => [params[i].id, arg])) }
            if (args.length == 1 && !Array.isArray(args[0]) && typeof args[0] === 'object' && !args[0].$)
                return { $: id, ...args[0] }
            if (args.length == 1 && params.length)
                return { $: id, [params[0].id]: args[0] }
            if (args.length == 2 && params.length > 1)
                return { $: id, [params[0].id]: args[0], [params[1].id]: args[1] }
            debugger;
        }
        const unMacro = macroId => macroId.replace(/([A-Z])/g, (all, s) => '-' + s.toLowerCase())
        function genericMacroProcessor(ns, macroId) {
            return (...allArgs) => {
                const { args, system } = splitSystemArgs(allArgs)
                const out = { $: unMacro(ns) + '.' + unMacro(macroId) }
                if (args.length == 1 && typeof args[0] == 'object' && !jb.compName(args[0]))
                    Object.assign(out, args[0])
                else
                    Object.assign(out, { $byValue: args })
                return Object.assign(out, system)
            }
        }
    }
})
;

jb.component('call', { /* call */
  type: 'any',
  params: [
    {id: 'param', as: 'string'}
  ],
  impl: function(context,param) {
 	  const paramObj = context.componentContext && context.componentContext.params[param];
      if (typeof paramObj == 'function')
 		return paramObj(new jb.jbCtx(context, {
 			data: context.data,
 			vars: context.vars,
 			componentContext: context.componentContext.componentContext,
 			forcePath: paramObj.srcPath // overrides path - use the former path
 		}));
      else
        return paramObj;
 	}
})

jb.pipe = function(context,ptName) {
	const start = [jb.toarray(context.data)[0]]; // use only one data item, the first or null
	if (typeof context.profile.items == 'string')
		return context.runInner(context.profile.items,null,'items');
	const profiles = jb.asArray(context.profile.items || context.profile[ptName]);
	const innerPath = (context.profile.items && context.profile.items.sugar) ? ''
		: (context.profile[ptName] ? (ptName + '~') : 'items~');

	if (ptName == '$pipe') // promise pipe
		return profiles.reduce((deferred,prof,index) =>
			deferred.then(data=>jb.synchArray(data)).then(data=>step(prof,index,data))
    , Promise.resolve(start))
      .then(data=>jb.synchArray(data))

	return profiles.reduce((data,prof,index) =>
		step(prof,index,data), start)


	function step(profile,i,data) {
    	if (!profile || profile.$disabled) return data;
		const parentParam = (i < profiles.length - 1) ? { as: 'array'} : (context.parentParam || {}) ;
		if (jb.profileType(profile) == 'aggregator')
			return jb.run( new jb.jbCtx(context, { data: data, profile: profile, path: innerPath+i }), parentParam);
		return [].concat.apply([],data.map(item =>
				jb.run(new jb.jbCtx(context,{data: item, profile: profile, path: innerPath+i}), parentParam))
			.filter(x=>x!=null)
			.map(x=> Array.isArray(jb.val(x)) ? jb.val(x) : x ));
	}
}

jb.component('pipeline', { /* pipeline */
  type: 'data',
  description: 'map data arrays one after the other',
  params: [
    {
      id: 'items',
      type: 'data,aggregator[]',
      ignore: true,
      mandatory: true,
      composite: true
    }
  ],
  impl: ctx => jb.pipe(ctx,'$pipeline')
})

jb.component('pipe', { /* pipe */
  type: 'data',
  description: 'map asynch data arrays',
  params: [
    {
      id: 'items',
      type: 'data,aggregator[]',
      ignore: true,
      mandatory: true,
      composite: true
    }
  ],
  impl: ctx => jb.pipe(ctx,'$pipe')
})

jb.component('data.if', { /* data.if */
  type: 'data',
  macroByValue: true,
  params: [
    {id: 'condition', as: 'boolean', mandatory: true, dynamic: true},
    {id: 'then', mandatory: true, dynamic: true},
    {id: 'else', dynamic: true, defaultValue: '%%'}
  ],
  impl: (ctx,cond,_then,_else) =>	cond() ? _then() : _else()
})

jb.component('action.if', { /* action.if */
  type: 'action',
  description: 'if then else',
  macroByValue: true,
  params: [
    {id: 'condition', type: 'boolean', as: 'boolean', mandatory: true},
    {id: 'then', type: 'action', mandatory: true, dynamic: true},
    {id: 'else', type: 'action', dynamic: true}
  ],
  impl: (ctx,cond,_then,_else) =>	cond ? _then() : _else()
})

jb.component('jb-run', { /* jbRun */
  type: 'action',
  params: [
    {id: 'profile', as: 'string', mandatory: true, description: 'profile name'},
    {id: 'params', as: 'single'}
  ],
  impl: (ctx,profile,params) =>	ctx.run(Object.assign({$:profile},params || {}))
})

jb.component('list', { /* list */
  type: 'data',
  description: 'also flatten arrays',
  params: [
    {id: 'items', type: 'data[]', as: 'array', composite: true}
  ],
  impl: function(context,items) {
		let out = [];
		items.forEach(item => {
			if (Array.isArray(item))
				out = out.concat(item);
			else
				out.push(item);
		});
		return out;
	}
})

jb.component('first-succeeding', { /* firstSucceeding */
  type: 'data',
  params: [
    {id: 'items', type: 'data[]', as: 'array', composite: true},
//    {id: 'acceptEmptyString', as: 'boolean'}
  ],
  impl: function(ctx,items,acceptEmptyString) {
    for(let i=0;i<items.length;i++) {
      const val = jb.val(items[i])
      const isNumber = typeof val === 'number'
      if ((acceptEmptyString || val !== '') && val != null 
          && (!isNumber || (!isNaN(val)) && val !== Infinity && val !== -Infinity))
        return items[i]
    }
		// return last one even if zero or empty string
		const last = items.slice(-1)[0];
		return (last != null) && jb.val(last);
	}
})

jb.component('keys', { /* keys */
  type: 'data',
  description: 'Object.keys',
  params: [
    {id: 'obj', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx,obj) => Object.keys(obj && typeof obj === 'object' ? obj : {})
})

jb.component('properties', { /* properties */
  description: 'object entries as id,val',
  type: 'data',
  params: [
    {id: 'obj', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx,obj) => Object.keys(obj).filter(p=>p.indexOf('$jb_') != 0).map((id,index) =>
			({id: id, val: obj[id], index: index}))
})

jb.component('entries', {
  description: 'object entries as array 0/1',
  type: 'data',
  params: [
    {id: 'obj', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx,obj) => jb.entries(obj)
})

jb.component('aggregate', {
  type: 'aggregator',
  description: 'calc function on all items, rather then one by one',
  params: [
    {id: 'aggregator', type: 'aggregator', mandatory: true, dynamic: true}
  ],
  impl: (ctx,aggregator) => aggregator()
})

jb.ns('math')

jb.component('math.max', {
  type: 'aggregator',
  impl: ctx => Math.max.apply(0,ctx.data)
})

jb.component('math.min', {
  type: 'aggregator',
  impl: ctx => Math.max.apply(0,ctx.data)
})

jb.component('math.sum', {
  type: 'aggregator',
  impl: ctx => ctx.data.reduce((acc,item) => +item+acc, 0)
})

'abs,acos,acosh,asin,asinh,atan,atan2,atanh,cbrt,ceil,clz32,cos,cosh,exp,expm1,floor,fround,hypot,log2,random,round,sign,sin,sinh,sqrt,tan,tanh,trunc'
  .split(',').forEach(f=>jb.component(`math.${f}`, {
    impl: ctx => Math[f](ctx.data)
  })
)

jb.component('obj-from-entries', {
  description: 'object from entries',
  type: 'aggregator',
  params: [
    {id: 'entries', defaultValue: '%%', as: 'array'}
  ],
  impl: (ctx,entries) => jb.objFromEntries(entries)
})

jb.component('eval-expression', {
  description: 'evaluate javascript expression',
  type: 'data',
  params: [
    {id: 'expression', as: 'string', defaultValue: '%%', expression: 'e.g. 1+2'}
  ],
  impl: (ctx,expression) => {
    try {
      return eval('('+expression+')')
    } catch(e) {}
  }
})

jb.component('prefix', { /* prefix */
  type: 'data',
  params: [
    {id: 'separator', as: 'string', mandatory: true},
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (ctx,separator,text) =>
		(text||'').substring(0,text.indexOf(separator))
})

jb.component('suffix', { /* suffix */
  type: 'data',
  params: [
    {id: 'separator', as: 'string', mandatory: true},
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (context,separator,text) =>
		(text||'').substring(text.lastIndexOf(separator)+separator.length)
})

jb.component('remove-prefix', { /* removePrefix */
  type: 'data',
  params: [
    {id: 'separator', as: 'string', mandatory: true},
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (context,separator,text) =>
		text.indexOf(separator) == -1 ? text : text.substring(text.indexOf(separator)+separator.length)
})

jb.component('remove-suffix', { /* removeSuffix */
  type: 'data',
  params: [
    {id: 'separator', as: 'string', mandatory: true},
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (context,separator,text) =>
		text.lastIndexOf(separator) == -1 ? text : text.substring(0,text.lastIndexOf(separator))
})

jb.component('remove-suffix-regex', { /* removeSuffixRegex */
  type: 'data',
  params: [
    {
      id: 'suffix',
      as: 'string',
      mandatory: true,
      description: 'regular expression. e.g [0-9]*'
    },
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: function(context,suffix,text) {
		context.profile.prefixRegexp = context.profile.prefixRegexp || new RegExp(suffix+'$');
		const m = (text||'').match(context.profile.prefixRegexp);
		return (m && (text||'').substring(m.index+1)) || text;
	}
})

jb.component('write-value', { /* writeValue */
  type: 'action',
  params: [
    {id: 'to', as: 'ref', mandatory: true},
    {id: 'value', mandatory: true}
  ],
  impl: (ctx,to,value) => {
    const val = jb.val(value)
    if (val && typeof val.then == 'function')
      return Promise.resolve().then(val=>jb.writeValue(to,val,ctx))
    else
      jb.writeValue(to,val,ctx)
  }
})

jb.component('property', {
  description: 'navigate/select/path property of object',
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'obj', defaultValue: '%%' },
  ],
  impl: (ctx,prop,obj) =>	jb.objectProperty(obj,prop,ctx)
})

jb.component('index-of', { /* indexOf */
  params: [
    {id: 'array', as: 'array', mandatory: true},
    {id: 'item', as: 'single', mandatory: true}
  ],
  impl: (ctx,array,item) => array.indexOf(item)
})

jb.component('add-to-array', { /* addToArray */
  type: 'action',
  params: [
    {id: 'array', as: 'ref', mandatory: true},
    {id: 'toAdd', as: 'array', mandatory: true },
  ],
  impl: (ctx,array,toAdd) => jb.push(array, JSON.parse(JSON.stringify(toAdd)),ctx)
})

jb.component('splice', { /* splice */
  type: 'action',
  params: [
    {id: 'array', as: 'ref', mandatory: true},
    {id: 'fromIndex', as: 'number', mandatory: true},
    {id: 'noOfItemsToRemove', as: 'number', defaultValue: 0},
    {id: 'itemsToAdd', as: 'array', defaultValue: []}
  ],
  impl: (ctx,array,fromIndex,noOfItemsToRemove,itemsToAdd) =>
		jb.splice(array,[[fromIndex,noOfItemsToRemove,...itemsToAdd]],ctx)
})

jb.component('remove-from-array', { /* removeFromArray */
  type: 'action',
  params: [
    {id: 'array', as: 'ref', mandatory: true},
    {id: 'itemToRemove', as: 'single', description: 'choose item or index'},
    {id: 'index', as: 'number', description: 'choose item or index'}
  ],
  impl: (ctx,array,itemToRemove,_index) => {
		const index = itemToRemove ? jb.toarray(array).indexOf(itemToRemove) : _index;
		if (index != -1)
			jb.splice(array,[[index,1]],ctx)
	}
})

jb.component('toggle-boolean-value', { /* toggleBooleanValue */
  type: 'action',
  params: [
    {id: 'of', as: 'ref'}
  ],
  impl: (ctx,_of) => jb.writeValue(_of,jb.val(_of) ? false : true,ctx)
})

jb.component('slice', { /* slice */
  type: 'aggregator',
  params: [
    {
      id: 'start',
      as: 'number',
      defaultValue: 0,
      description: '0-based index',
      mandatory: true
    },
    {
      id: 'end',
      as: 'number',
      mandatory: true,
      description: '0-based index of where to end the selection (not including itself)'
    }
  ],
  impl: function({data},start,end) {
		if (!data || !data.slice) return null;
		return end ? data.slice(start,end) : data.slice(start);
	}
})

jb.component('sort', { /* sort */
  type: 'aggregator',
  params: [
    {id: 'propertyName', as: 'string', description: 'sort by property inside object'},
    {id: 'lexical', as: 'boolean', type: 'boolean'},
    {id: 'ascending', as: 'boolean', type: 'boolean'}
  ],
  impl: ({data},prop,lexical,ascending) => {
		if (!data || ! Array.isArray(data)) return null;
    let sortFunc;
    const firstData = jb.entries(data[0]||{})[0][1]
		if (lexical || isNaN(firstData))
			sortFunc = prop ? (x,y) => (x[prop] == y[prop] ? 0 : x[prop] < y[prop] ? -1 : 1) : (x,y) => (x == y ? 0 : x < y ? -1 : 1);
		else
			sortFunc = prop ? (x,y) => (x[prop]-y[prop]) : (x,y) => (x-y);
		if (ascending)
  		return data.slice(0).sort((x,y)=>sortFunc(x,y));
		return data.slice(0).sort((x,y)=>sortFunc(y,x));
	}
})

jb.component('first', { /* first */
  type: 'aggregator',
  impl: ({data}) => data[0]
})

jb.component('last', { /* last */
  type: 'aggregator',
  impl: ({data}) => data.slice(-1)[0]
})

jb.component('count', { /* count */
  type: 'aggregator',
  description: 'length, size of array',
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx,items) => items.length
})

jb.component('reverse', { /* reverse */
  type: 'aggregator',
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx,items) => items.reverse()
})

jb.component('sample', { /* sample */
  type: 'aggregator',
  params: [
    {id: 'size', as: 'number', defaultValue: 300},
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx,size,items) =>	items.filter((x,i)=>i % (Math.floor(items.length/size) ||1) == 0)
})

jb.component('obj', { /* obj */
  description: 'build object (dictionary) from props',
  params: [
    {id: 'props', type: 'prop[]', mandatory: true, sugar: true}
  ],
  impl: (ctx,properties) =>
		jb.objFromEntries(properties.map(p=>[p.title, jb.tojstype(p.val(ctx),p.type)]))
})

jb.component('extend', { /* extend */
  description: 'assign and extend with calculated properties',
  params: [
    {id: 'props', type: 'prop[]', mandatory: true, defaultValue: []}
  ],
  impl: (ctx,properties) =>
		Object.assign({}, ctx.data, jb.objFromEntries(properties.map(p=>[p.title, jb.tojstype(p.val(ctx),p.type)])))
})
jb.component('assign', jb.comps.extend)

jb.component('extend-with-index', { /* extendWithIndex */
  type: 'aggregator',
  description: 'extend with calculated properties. %$index% is available ',
  params: [
    {id: 'props', type: 'prop[]', mandatory: true, defaultValue: []}
  ],
  impl: (ctx,properties) =>
		jb.toarray(ctx.data).map((item,i)=>
			Object.assign({}, item, jb.objFromEntries(properties.map(p=>[p.title, jb.tojstype(p.val(ctx.setData(item).setVars({index:i})),p.type)]))))
})

jb.component('prop', { /* prop */
  type: 'prop',
  macroByValue: true,
  params: [
    {id: 'title', as: 'string', mandatory: true},
    {id: 'val', dynamic: true, type: 'data', mandatory: true, defaultValue: ''},
    {id: 'type', as: 'string', options: 'string,number,boolean,object,array', defaultValue: 'string' }
  ],
  impl: ctx => ctx.params
})

jb.component('ref-prop', { /* refProp */
  type: 'prop',
  description: 'value by reference allows to change or watch the value',
  params: [
    {id: 'title', as: 'string', mandatory: true},
    {id: 'val', dynamic: true, as: 'ref', mandatory: true },
  ],
  impl: ctx => ({ ...ctx.params, type: 'ref' })
})


jb.component('pipeline.var', {
  type: 'aggregator',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'val', mandatory: true, dynamic: true, defaultValue: '%%'}
  ],
  impl: ctx => ({ [Symbol.for('Var')]: true, ...ctx.params })
})


jb.component('Var', { /* Var */
  type: 'var,system',
  isSystem: true,
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'val', dynamic: true, type: 'data', mandatory: true, defaultValue: '%%'}
  ],
  macro: (result, self) =>
		Object.assign(result,{ $vars: Object.assign(result.$vars || {}, { [self.name]: self.val }) })
})

jb.component('remark', { /* remark */
  type: 'system',
  isSystem: true,
  params: [
    {id: 'remark', as: 'string', mandatory: true}
  ],
  macro: (result, self) =>
		Object.assign(result,{ remark: self.remark })
})

jb.component('If', { /* If */
  macroByValue: true,
  params: [
    {id: 'condition', as: 'boolean', mandatory: true, dynamic: true},
    {id: 'then', dynamic: true},
    {id: 'Else', dynamic: true}
  ],
  impl: (ctx,cond,_then,_else) =>	cond() ? _then() : _else()
})

jb.component('not', { /* not */
  type: 'boolean',
  params: [
    {id: 'of', type: 'boolean', as: 'boolean', mandatory: true, composite: true}
  ],
  impl: (context, of) => !of
})

jb.component('and', { /* and */
  description: 'logical and',
  type: 'boolean',
  params: [
    {id: 'items', type: 'boolean[]', ignore: true, mandatory: true, composite: true}
  ],
  impl: function(context) {
		const items = context.profile.$and || context.profile.items || [];
		const innerPath =  context.profile.$and ? '$and~' : 'items~';
		for(let i=0;i<items.length;i++) {
			if (!context.runInner(items[i], { type: 'boolean' }, innerPath + i))
				return false;
		}
		return true;
	}
})

jb.component('or', { /* or */
  description: 'logical or',
  type: 'boolean',
  params: [
    {id: 'items', type: 'boolean[]', ignore: true, mandatory: true, composite: true}
  ],
  impl: function(context) {
		const items = context.profile.$or || context.profile.items || [];
		const innerPath =  context.profile.$or ? '$or~' : 'items~';
		for(let i=0;i<items.length;i++) {
			if (context.runInner(items[i],{ type: 'boolean' },innerPath+i))
				return true;
		}
		return false;
	}
})

jb.component('between', { /* between */
  description: 'checks if number is in range',
  type: 'boolean',
  params: [
    {id: 'from', as: 'number', mandatory: true},
    {id: 'to', as: 'number', mandatory: true},
    {id: 'val', as: 'number', defaultValue: '%%'}
  ],
  impl: (ctx,from,to,val) => val >= from && val <= to
})

jb.component('contains', { /* contains */
  type: 'boolean',
  params: [
    {id: 'text', type: 'data[]', as: 'array', mandatory: true},
    {id: 'allText', defaultValue: '%%', as: 'string'},
    {id: 'inOrder', defaultValue: true, as: 'boolean', type: 'boolean'}
  ],
  impl: function(context,text,allText,inOrder) {
      let prevIndex = -1;
      for(let i=0;i<text.length;i++) {
      	const newIndex = allText.indexOf(jb.tostring(text[i]),prevIndex+1);
      	if (newIndex == -1) return false;
      	prevIndex = inOrder ? newIndex : -1;
      }
      return true;
	}
})

jb.component('not-contains', { /* notContains */
  type: 'boolean',
  params: [
    {id: 'text', type: 'data[]', as: 'array', mandatory: true},
    {id: 'allText', defaultValue: '%%', as: 'array'}
  ],
  impl: not(
    contains({text: '%$text%', allText: '%$allText%'})
  )
})

jb.component('starts-with', { /* startsWith */
  description: 'begins with, includes, contains',
  type: 'boolean',
  params: [
    {id: 'startsWith', as: 'string', mandatory: true},
    {id: 'text', defaultValue: '%%', as: 'string'}
  ],
  impl: (context,startsWith,text) => text.indexOf(startsWith) == 0
})

jb.component('ends-with', { /* endsWith */
  description: 'includes, contains',
  type: 'boolean',
  params: [
    {id: 'endsWith', as: 'string', mandatory: true},
    {id: 'text', defaultValue: '%%', as: 'string'}
  ],
  impl: (context,endsWith,text) => text.indexOf(endsWith,text.length-endsWith.length) !== -1
})


jb.component('filter', { /* filter */
  type: 'aggregator',
  params: [
    {id: 'filter', type: 'boolean', as: 'boolean', dynamic: true, mandatory: true}
  ],
  impl: (context,filter) =>	jb.toarray(context.data).filter(item =>	filter(context,item))
})

jb.component('match-regex', { /* matchRegex */
  description: 'validation with regular expression',
  type: 'boolean',
  params: [
    {id: 'regex', as: 'string', mandatory: true, description: 'e.g: [a-zA-Z]*'},
    {id: 'text', as: 'string', defaultValue: '%%'},
  ],
  impl: (ctx,regex,text) => text.match(new RegExp(regex))
})

jb.component('to-uppercase', { /* toUppercase */
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (ctx,text) =>	text.toUpperCase()
})

jb.component('to-lowercase', { /* toLowercase */
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (ctx,text) =>	text.toLowerCase()
})

jb.component('capitalize', { /* capitalize */
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'}
  ],
  impl: (ctx,text) =>	text.charAt(0).toUpperCase() + text.slice(1)
})

jb.component('join', { /* join */
  params: [
    {id: 'separator', as: 'string', defaultValue: ',', mandatory: true},
    {id: 'prefix', as: 'string'},
    {id: 'suffix', as: 'string'},
    {id: 'items', as: 'array', defaultValue: '%%'},
    {id: 'itemName', as: 'string', defaultValue: 'item'},
    {id: 'itemText', as: 'string', dynamic: true, defaultValue: '%%'}
  ],
  type: 'aggregator',
  impl: function(ctx,separator,prefix,suffix,items,itemName,itemText) {
		const itemToText = (ctx.profile.itemText) ?
			item => itemText(itemName ? new jb.jbCtx(ctx, {data: item, vars: {[itemName]: item} }): ctx.setData(item)) :
			item => jb.tostring(item);	// performance

		return prefix + items.map(itemToText).join(separator) + suffix;
	}
})

jb.component('unique', { /* unique */
  params: [
    {id: 'id', as: 'string', dynamic: true, defaultValue: '%%'},
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  type: 'aggregator',
  impl: (ctx,idFunc,items) => {
		const _idFunc = idFunc.profile == '%%' ? x=>x : x => idFunc(ctx.setData(x));
		return jb.unique(items,_idFunc);
	}
})

jb.component('log', { /* log */
  params: [
    {id: 'obj', as: 'single', defaultValue: '%%'}
  ],
  impl: function(context,obj) {
		let out = obj;
		if (typeof GLOBAL != 'undefined' && typeof(obj) == 'object')
			out = JSON.stringify(obj,null," ");
		if (typeof window != 'undefined')
			(window.parent || window).console.log(out);
		else
			console.log(out);
		return out;
	}
})

jb.component('asIs', { /* asIs */
  params: [
    {id: '$asIs', ignore: true}
  ],
  impl: ctx => context.profile.$asIs
})

jb.component('object', { /* object */
  impl: function(context) {
		let result = {};
		const obj = context.profile.$object || context.profile;
		if (Array.isArray(obj)) return obj;
		for(let prop in obj) {
			if ((prop == '$' && obj[prop] == 'object') || obj[prop] == null)
				continue;
			result[prop] = context.runInner(obj[prop],null,prop);
		}
		return result;
	}
})

jb.component('json.stringify', { /* json.stringify */
  params: [
    {id: 'value', defaultValue: '%%'},
    {id: 'space', as: 'string', description: 'use space or tab to make pretty output'}
  ],
  impl: (context,value,space) => JSON.stringify(jb.val(value),null,space)
})

jb.component('json.parse', { /* json.parse */
  params: [
    {id: 'text', as: 'string'}
  ],
  impl: (ctx,text) =>	{
		try {
			return JSON.parse(text)
		} catch (e) {
			jb.logException(e,'json parse',ctx);
		}
	}
})

jb.component('split', { /* split */
  description: 'breaks string using separator',
  type: 'data',
  params: [
    {id: 'separator', as: 'string', defaultValue: ',', description: 'E.g., "," or "<a>"' },
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'part', options: ',first,second,last,but first,but last'}
  ],
  impl: function(context,separator,text,part) {
		const out = text.split(separator.replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n'));
		switch (part) {
			case 'first': return out[0];
			case 'second': return out[1];
			case 'last': return out.pop();
			case 'but first': return out.slice(1);
			case 'but last': return out.slice(0,-1);
			default: return out;
		}
	}
})

jb.component('replace', { /* replace */
  type: 'data',
  params: [
    {id: 'find', as: 'string', mandatory: true},
    {id: 'replace', as: 'string', mandatory: true},
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'useRegex', type: 'boolean', as: 'boolean', defaultValue: true},
    {id: 'regexFlags', as: 'string', defaultValue: 'g', description: 'g,i,m'}
  ],
  impl: function(context,find,replace,text,useRegex,regexFlags) {
		if (useRegex) {
			return text.replace(new RegExp(find,regexFlags) ,replace);
		} else
			return text.replace(find,replace);
	}
})

jb.component('touch', { /* touch */
  description: 'change the value of a watchable variable to acticate its watchers',
  type: 'action',
  params: [
    {id: 'data', as: 'ref'}
  ],
  impl: function(context,data_ref) {
		const val = Number(jb.val(data_ref));
		jb.writeValue(data_ref,val ? val + 1 : 1,ctx);
	}
})

jb.component('isNull', { /* isNull */
  description: 'is null or undefined',
  type: 'boolean',
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx, obj) => jb.val(obj) == null
})

jb.component('isEmpty', { /* isEmpty */
  type: 'boolean',
  params: [
    {id: 'item', as: 'single', defaultValue: '%%'}
  ],
  impl: (ctx, item) => !item || (Array.isArray(item) && item.length == 0)
})

jb.component('notEmpty', { /* notEmpty */
  type: 'boolean',
  params: [
    {id: 'item', as: 'single', defaultValue: '%%'}
  ],
  impl: (ctx, item) => item && !(Array.isArray(item) && item.length == 0)
})

jb.component('equals', { /* equals */
  type: 'boolean',
  params: [
    {id: 'item1', as: 'single', mandatory: true},
    {id: 'item2', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx, item1, item2) => item1 == item2
})

jb.component('not-equals', { /* notEquals */
  type: 'boolean',
  params: [
    {id: 'item1', as: 'single', mandatory: true},
    {id: 'item2', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx, item1, item2) => item1 != item2
})

jb.component('runActions', { /* runActions */
  type: 'action',
  params: [
    {id: 'actions', type: 'action[]', ignore: true, composite: true, mandatory: true}
  ],
  impl: ctx => {
		if (!ctx.profile) debugger;
		const actions = jb.asArray(ctx.profile.actions || ctx.profile['$runActions']).filter(x=>x);
		const innerPath =  (ctx.profile.actions && ctx.profile.actions.sugar) ? ''
			: (ctx.profile['$runActions'] ? '$runActions~' : 'items~');
		return actions.reduce((def,action,index) =>
				def.then(_ => ctx.runInner(action, { as: 'single'}, innerPath + index ))
			,Promise.resolve())
	}
})

jb.component('run-action-on-items', { /* runActionOnItems */
  type: 'action',
  macroByValue: true,
  params: [
    {id: 'items', as: 'ref[]', mandatory: true},
    {id: 'action', type: 'action', dynamic: true, mandatory: true},
    {
      id: 'notifications',
      as: 'string',
      options: 'wait for all actions,no notifications',
      description: 'notification for watch-ref, defualt behavior is after each action'
    }
  ],
  impl: (ctx,items,action,notifications) => {
		if (notifications && jb.mainWatchableHandler) jb.mainWatchableHandler.startTransaction()
		return jb.val(items).reduce((def,item) => def.then(_ => action(ctx.setData(item))) ,Promise.resolve())
			.catch((e) => jb.logException(e,ctx))
			.then(() => notifications && jb.mainWatchableHandler && jb.mainWatchableHandler.endTransaction(notifications === 'no notifications'));
	}
})

jb.component('delay', { /* delay */
  type: 'action,data',
  params: [
    {id: 'mSec', as: 'number', defaultValue: 1}
  ],
  impl: (ctx,mSec) => jb.delay(mSec).then(() => ctx.data)
})

jb.component('on-next-timer', { /* onNextTimer */
  description: 'run action after delay',
  type: 'action',
  params: [
    {id: 'action', type: 'action', dynamic: true, mandatory: true},
    {id: 'delay', type: 'number', defaultValue: 1}
  ],
  impl: (ctx,action,delay) =>
		jb.delay(delay,ctx).then(()=>
			action())
})

jb.component('extract-prefix', { /* extractPrefix */
  type: 'data',
  params: [
    {
      id: 'separator',
      as: 'string',
      description: '/w- alphnumberic, /s- whitespace, ^- beginline, $-endline'
    },
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'regex', type: 'boolean', as: 'boolean', description: 'separator is regex'},
    {id: 'keepSeparator', type: 'boolean', as: 'boolean'}
  ],
  impl: function(context,separator,text,regex,keepSeparator) {
		if (!regex) {
			return text.substring(0,text.indexOf(separator)) + (keepSeparator ? separator : '');
		} else { // regex
			const match = text.match(separator);
			if (match)
				return text.substring(0,match.index) + (keepSeparator ? match[0] : '');
		}
	}
})

jb.component('extract-suffix', { /* extractSuffix */
  type: 'data',
  params: [
    {
      id: 'separator',
      as: 'string',
      description: '/w- alphnumberic, /s- whitespace, ^- beginline, $-endline'
    },
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'regex', type: 'boolean', as: 'boolean', description: 'separator is regex'},
    {id: 'keepSeparator', type: 'boolean', as: 'boolean'}
  ],
  impl: function(context,separator,text,regex,keepSeparator) {
		if (!regex) {
			return text.substring(text.lastIndexOf(separator) + (keepSeparator ? 0 : separator.length));
		} else { // regex
			const match = text.match(separator+'(?![\\s\\S]*' + separator +')'); // (?!) means not after, [\\s\\S]* means any char including new lines
			if (match)
				return text.substring(match.index + (keepSeparator ? 0 : match[0].length));
		}
	}
})

jb.component('range', { /* range */
  description: 'returns a range of number, generator, numerator, numbers, index',
  type: 'data',
  params: [
    {id: 'from', as: 'number', defaultValue: 1},
    {id: 'to', as: 'number', defaultValue: 10}
  ],
  impl: (ctx,from,to) => Array.from(Array(to-from+1).keys()).map(x=>x+from)
})

jb.component('type-of', { /* typeOf */
  type: 'data',
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx,_obj) => {
	  const obj = jb.val(_obj)
		return Array.isArray(obj) ? 'array' : typeof obj
	}
})

jb.component('class-name', { /* className */
  type: 'data',
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx,_obj) => {
	  const obj = jb.val(_obj);
		return obj && obj.constructor && obj.constructor.name
	}
})

jb.component('is-of-type', { /* isOfType */
  type: 'boolean',
  params: [
    {id: 'type', as: 'string', mandatory: true, description: 'e.g., string,boolean,array'},
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx,_type,_obj) => {
  	const obj = jb.val(_obj);
  	const objType = Array.isArray(obj) ? 'array' : typeof obj;
  	return _type.split(',').indexOf(objType) != -1;
  }
})

jb.component('in-group', { /* inGroup */
  type: 'boolean',
  params: [
    {id: 'group', as: 'array', mandatory: true},
    {id: 'item', as: 'single', defaultValue: '%%'}
  ],
  impl: (ctx,group,item) =>	group.indexOf(item) != -1
})

jb.urlProxy = (typeof window !== 'undefined' && location.href.match(/^[^:]*/)[0] || 'http') + '://jbartdb.appspot.com/jbart_db.js?op=proxy&url='
jb.cacheKiller = 0
jb.component('http.get', { /* http.get */
  type: 'data,action',
  description: 'fetch data from external url',
  params: [
    {id: 'url', as: 'string'},
    {id: 'json', as: 'boolean', description: 'convert result to json', type: 'boolean'},
    {id: 'useProxy', as: 'string', options: ',localhost-server,cloud'},
  ],
  impl: (ctx,_url,_json,useProxy) => {
		if (ctx.probe)
			return jb.http_get_cache[url];
    const json = _json || url.match(/json$/);
    let url = _url
    if (useProxy == 'localhost-server')
      url = `//localhost:8082/?op=fetch&req={url:"${url}"}&cacheKiller=${jb.cacheKiller++}`
    else if (useProxy == 'cloud')
      url = `//jbart5-server.appspot.com/?op=fetch&req={url:"${url}"}&cacheKiller=${jb.cacheKiller++}`

		return fetch(url, {mode: 'cors'})
			  .then(r => json ? r.json() : r.text())
				.then(res=> jb.http_get_cache ? (jb.http_get_cache[url] = res) : res)
			  .catch(e => jb.logException(e,'http.get',ctx) || [])
	}
})

jb.component('http.fetch', { /* http.fetch */
  type: 'data,action',
  description: 'fetch, get or post data from external url',
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'method', as: 'string', options: 'GET,POST', defaultValue: 'GET'},
    {id: 'headers', as: 'single', templateValue: obj(prop('Content-Type','application/json; charset=UTF-8'))},
    {id: 'body', as: 'single'},
    {id: 'json', as: 'boolean', description: 'convert result to json', type: 'boolean'},
    {id: 'useProxy', as: 'string', options: ',localhost-server,cloud,cloud-test-local'},
  ],
  impl: (ctx,url,method,headers,body,json,proxy) => {
    const reqObj = {
      url,
      method,
      headers: headers || {}, 
      mode: 'cors',
      body: (typeof body == 'string' || body == null) ? body : JSON.stringify(body) 
    }

    const reqStr = encodeURIComponent(JSON.stringify(reqObj))
		if (ctx.probe)
			return jb.http_get_cache[reqStr];

    if (proxy == 'localhost-server')
      reqObj.url = `//localhost:8082/?op=fetch&req=${reqStr}&cacheKiller=${jb.cacheKiller++}`
    else if (proxy == 'cloud')
      reqObj.url = `//jbart5-server.appspot.com/fetch?req=${reqStr}&cacheKiller=${jb.cacheKiller++}`
    else if (proxy == 'cloud-test-local')
      reqObj.url = `http://localhost:8080/fetch?req=${reqStr}&cacheKiller=${jb.cacheKiller++}`

    return fetch(reqObj.url, proxy ? {mode: 'cors'} : reqObj)
			  .then(r => json ? r.json() : r.text())
				.then(res=> jb.http_get_cache ? (jb.http_get_cache[reqStr] = res) : res)
			  .catch(e => jb.logException(e,'http.fetch',ctx) || [])
	}
})

jb.component('isRef', { /* isRef */
  params: [
    {id: 'obj', mandatory: true}
  ],
  impl: (ctx,obj) => jb.isRef(obj)
})

jb.component('asRef', { /* asRef */
  params: [
    {id: 'obj', mandatory: true}
  ],
  impl: (ctx,obj) => jb.asRef(obj)
})

jb.component('data.switch', { /* data.switch */
  macroByValue: false,
  params: [
    {
      id: 'cases',
      type: 'data.switch-case[]',
      as: 'array',
      mandatory: true,
      defaultValue: []
    },
    {id: 'default', dynamic: true}
  ],
  impl: (ctx,cases,defaultValue) => {
		for(let i=0;i<cases.length;i++)
			if (cases[i].condition(ctx))
				return cases[i].value(ctx)
		return defaultValue(ctx)
	}
})

jb.component('data.case', { /* data.case */
  type: 'data.switch-case',
  singleInType: true,
  params: [
    {id: 'condition', type: 'boolean', mandatory: true, dynamic: true},
    {id: 'value', mandatory: true, dynamic: true}
  ],
  impl: ctx => ctx.params
})

jb.component('action.switch', { /* action.switch */
  type: 'action',
  params: [
    {
      id: 'cases',
      type: 'action.switch-case[]',
      as: 'array',
      mandatory: true,
      defaultValue: []
    },
    {id: 'defaultAction', type: 'action', dynamic: true}
  ],
  impl: (ctx,cases,defaultAction) => {
  	for(let i=0;i<cases.length;i++)
  		if (cases[i].condition(ctx))
  			return cases[i].action(ctx)
  	return defaultAction(ctx);
  }
})

jb.component('action.switch-case', { /* action.switchCase */
  type: 'action.switch-case',
  singleInType: true,
  params: [
    {id: 'condition', type: 'boolean', as: 'boolean', mandatory: true, dynamic: true},
    {id: 'action', type: 'action', mandatory: true, dynamic: true}
  ],
  impl: ctx => ctx.params
})

jb.component('format-date', {
  description: 'using toLocaleDateString',
  params: [
    {id: 'date', defaultValue: '%%', description: 'Date value'},
    {id: 'dateStyle', as: 'string', options: 'full,long,medium,short' },
    {id: 'timeStyle', as: 'string', options: 'full,long,medium,short' },
    {id: 'weekday', as: 'string', options: 'long,short,narrow' },
    {id: 'year', as: 'string', options: 'numeric,2-digit' },
    {id: 'month', as: 'string', options: 'numeric,2-digit,long,short,narrow' },
    {id: 'day', as: 'string', options: 'numeric,2-digit' },
    {id: 'hour', as: 'string', options: 'numeric,2-digit' },
    {id: 'minute', as: 'string', options: 'numeric,2-digit' },
    {id: 'second', as: 'string', options: 'numeric,2-digit' },
    {id: 'timeZoneName', as: 'string', options: 'long,short' },
  ],
  impl: (ctx,date) => new Date(date).toLocaleDateString(undefined, jb.objFromEntries(jb.entries(ctx.params).filter(e=>e[1]))),
})

jb.exec = (...args) => new jb.jbCtx().run(...args)
jb.execInStudio = (...args) => jb.studio.studioWindow && new jb.studio.studioWindow.jb.jbCtx().run(...args)
jb.exp = (...args) => new jb.jbCtx().exp(...args);

(function() {
const spySettings = { 
	moreLogs: 'req,res,focus,apply,check,suggestions,writeValue,render,createReactClass,renderResult,probe,setState,immutable,pathOfObject,refObservable,scriptChange,resLog', 
	groups: {
		watchable: 'doOp,writeValue,removeCmpObservable,registerCmpObservable,notifyCmpObservable,notifyObservableElems,notifyObservableElem,scriptChange',
		react: 'applyDeltaTop,applyDelta,unmount,render,initCmp,refreshReq,refreshElem,childDiffRes,htmlChange,appendChild,removeChild,replaceTop',
		dialog: 'addDialog,closeDialog,refreshDialogs'
	},
	includeLogs: 'exception,error',
	stackFilter: /spy|jb_spy|Object.log|node_modules/i,
    extraIgnoredEvents: [], MAX_LOG_SIZE: 10000
}
const frame = jb.frame

jb.initSpy = function({Error, settings, spyParam, memoryUsage, resetSpyToNull}) {
	Error = Error || frame.Error,
	memoryUsage = memoryUsage || (() => frame.performance && performance.memory && performance.memory.usedJSHeapSize)
	settings = Object.assign(settings||{}, spySettings)

	const systemProps = ['index', 'time', '_time', 'mem', 'source']

    const isRegex = x => Object.prototype.toString.call(x) === '[object RegExp]'
	const isString = x => typeof x === 'string' || x instanceof String
	if (resetSpyToNull)
		return jb.spy = null
    
    jb.spy = {
		logs: {},
		spyParam,
		otherSpies: [],
		observable() { 
			const _jb = jb.path(jb,'studio.studiojb') || jb
			this._obs = this._obs || new _jb.rx.Subject()
			return this._obs
		},
		enabled: () => true,
		log(logName, record, {takeFrom, funcTitle, modifier} = {}) {
			const init = () => {
				if (!this.initialized) {
					const includeLogsFromParam = (this.spyParam || '').split(',').filter(x => x[0] !== '-').filter(x => x)
						.flatMap(x=>Object.keys(settings.groups).indexOf(x) == -1 ? [x] : settings.groups[x].split(','))
					const excludeLogsFromParam = (this.spyParam || '').split(',').filter(x => x[0] === '-').map(x => x.slice(1))
					this.includeLogs = settings.includeLogs.split(',').concat(includeLogsFromParam).filter(log => excludeLogsFromParam.indexOf(log) === -1).reduce((acc, log) => {
						acc[log] = true
						return acc
					}, {})
				}
				this.initialized = true
			}
			const shouldLog = (logName, record) =>
				this.spyParam === 'all' || Array.isArray(record) && this.includeLogs[logName] && !settings.extraIgnoredEvents.includes(record[0])

			init()
			this.logs[logName] = this.logs[logName] || []
			this.logs.$counters = this.logs.$counters || {}
			this.logs.$counters[logName] = this.logs.$counters[logName] || 0
			this.logs.$counters[logName]++
			if (!shouldLog(logName, record)) {
				return
			}
			this.logs.$index = this.logs.$index || 0
			record.index = this.logs.$index++
			record.source = this.source(takeFrom)
			const now = new Date()
			record._time = `${now.getSeconds()}:${now.getMilliseconds()}`
			record.time = now.getTime()
			record.mem = memoryUsage() / 1000000
			if (this.logs[logName].length > settings.MAX_LOG_SIZE) {
				this.logs[logName] = this.logs[logName].slice(-1 * Math.floor(settings.MAX_LOG_SIZE / 2))
			}
			if (!record[0] && typeof funcTitle === 'function') {
				record[0] = funcTitle()
			}
			if (!record[0] && record.source) {
				record[0] = record.source[0]
			}
			if (typeof modifier === 'function') {
				modifier(record)
			}
			this.logs[logName].push(record)
			this._obs && this._obs.next({logName,record})
		},
		source(takeFrom) {
			Error.stackTraceLimit = 50
			const frames = [frame]
			while (frames[0].parent && frames[0] !== frames[0].parent) {
				frames.unshift(frames[0].parent)
			}
			let stackTrace = frames.reverse().map(frame => new frame.Error().stack).join('\n').split(/\r|\n/).map(x => x.trim()).slice(4).
				filter(line => line !== 'Error').
				filter(line => !settings.stackFilter.test(line))
			if (takeFrom) {
				const firstIndex = stackTrace.findIndex(line => line.indexOf(takeFrom) !== -1)
				stackTrace = stackTrace.slice(firstIndex + 1)
			}
			const line = stackTrace[0] || ''
			return [
				line.split(/at |as /).pop().split(/ |]/)[0],
				line.split('/').pop().slice(0, -1).trim(),
				...stackTrace
			]
		},
        
        // browsing methods
		resetParam: spyParam => {
			this.spyParam = spyParam;
			this.includeLogs = null;
		},
		setLogs(logs) {
			if (logs === 'all')
				this.spyParam = 'all'
			this.includeLogs = (logs||'').split(',').reduce((acc,log) => {acc[log] = true; return acc },{})
		},
		clear() {
			Object.keys(this.logs).forEach(log => delete this.logs[log])
		},
        search(pattern) {
			if (isRegex(pattern)) {
				return this.all(x => pattern.test(x.join(' ')))
			} else if (isString(pattern)) {
				return this.all(x => x.join(' ').indexOf(pattern) !== -1)
			} else if (Number.isInteger(pattern)) {
				return this.all().slice(-1 * pattern)
			}
		},
		all(filter) {
			return [].concat.apply([], Object.keys(this.logs).filter(log => Array.isArray(this.logs[log])).map(module =>
				this.logs[module].map(arr => {
					const res = [arr.index, module, ...arr]
					systemProps.forEach(p => {
						res[p] = arr[p]
					})
					return res
				}))).
				filter((e, i, src) => !filter || filter(e, i, src)).
				sort((x, y) => x.index - y.index)
		}
	}
} 

function initSpyByUrl() {
	const getUrl = () => { try { return frame.location.href } catch(e) {} }
	const getParentUrl = () => { try { return frame.parent && frame.parent.location.href } catch(e) {} }
	const getSpyParam = url => (url.match('[?&]spy=([^&]+)') || ['', ''])[1]
	const spyParam = getSpyParam(getParentUrl() || '') || getSpyParam(getUrl() || '')
	if (spyParam)
		jb.initSpy({spyParam})
	if (jb.frame) jb.frame.spy = jb.spy // for console use
}
initSpyByUrl()

})()
;

/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/ui/pack-immutable.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./node_modules/immutability-helper/index.js":
/*!***************************************************!*\
  !*** ./node_modules/immutability-helper/index.js ***!
  \***************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

eval("var invariant = __webpack_require__(/*! invariant */ \"./node_modules/invariant/browser.js\");\n\nvar hasOwnProperty = Object.prototype.hasOwnProperty;\nvar splice = Array.prototype.splice;\n\nvar toString = Object.prototype.toString\nvar type = function(obj) {\n  return toString.call(obj).slice(8, -1);\n}\n\nvar assign = Object.assign || /* istanbul ignore next */ function assign(target, source) {\n  getAllKeys(source).forEach(function(key) {\n    if (hasOwnProperty.call(source, key)) {\n      target[key] = source[key];\n    }\n  });\n  return target;\n};\n\nvar getAllKeys = typeof Object.getOwnPropertySymbols === 'function' ?\n  function(obj) { return Object.keys(obj).concat(Object.getOwnPropertySymbols(obj)) } :\n  /* istanbul ignore next */ function(obj) { return Object.keys(obj) };\n\n/* istanbul ignore next */\nfunction copy(object) {\n  if (Array.isArray(object)) {\n    return assign(object.constructor(object.length), object)\n  } else if (type(object) === 'Map') {\n    return new Map(object)\n  } else if (type(object) === 'Set') {\n    return new Set(object)\n  } else if (object && typeof object === 'object') {\n    var prototype = Object.getPrototypeOf(object);\n    return assign(Object.create(prototype), object);\n  } else {\n    return object;\n  }\n}\n\nfunction newContext() {\n  var commands = assign({}, defaultCommands);\n  update.extend = function(directive, fn) {\n    commands[directive] = fn;\n  };\n  update.isEquals = function(a, b) { return a === b; };\n\n  return update;\n\n  function update(object, spec) {\n    if (typeof spec === 'function') {\n      spec = { $apply: spec };\n    }\n\n    if (!(Array.isArray(object) && Array.isArray(spec))) {\n      invariant(\n        !Array.isArray(spec),\n        'update(): You provided an invalid spec to update(). The spec may ' +\n        'not contain an array except as the value of $set, $push, $unshift, ' +\n        '$splice or any custom command allowing an array value.'\n      );\n    }\n\n    invariant(\n      typeof spec === 'object' && spec !== null,\n      'update(): You provided an invalid spec to update(). The spec and ' +\n      'every included key path must be plain objects containing one of the ' +\n      'following commands: %s.',\n      Object.keys(commands).join(', ')\n    );\n\n    var nextObject = object;\n    var index, key;\n    getAllKeys(spec).forEach(function(key) {\n      if (hasOwnProperty.call(commands, key)) {\n        var objectWasNextObject = object === nextObject;\n        nextObject = commands[key](spec[key], nextObject, spec, object);\n        if (objectWasNextObject && update.isEquals(nextObject, object)) {\n          nextObject = object;\n        }\n      } else {\n        var nextValueForKey =\n          type(object) === 'Map'\n            ? update(object.get(key), spec[key])\n            : update(object[key], spec[key]);\n        var nextObjectValue =\n          type(nextObject) === 'Map'\n              ? nextObject.get(key)\n              : nextObject[key];\n        if (!update.isEquals(nextValueForKey, nextObjectValue) || typeof nextValueForKey === 'undefined' && !hasOwnProperty.call(object, key)) {\n          if (nextObject === object) {\n            nextObject = copy(object);\n          }\n          if (type(nextObject) === 'Map') {\n            nextObject.set(key, nextValueForKey);\n          } else {\n            nextObject[key] = nextValueForKey;\n          }\n        }\n      }\n    })\n    return nextObject;\n  }\n\n}\n\nvar defaultCommands = {\n  $push: function(value, nextObject, spec) {\n    invariantPushAndUnshift(nextObject, spec, '$push');\n    return value.length ? nextObject.concat(value) : nextObject;\n  },\n  $unshift: function(value, nextObject, spec) {\n    invariantPushAndUnshift(nextObject, spec, '$unshift');\n    return value.length ? value.concat(nextObject) : nextObject;\n  },\n  $splice: function(value, nextObject, spec, originalObject) {\n    invariantSplices(nextObject, spec);\n    value.forEach(function(args) {\n      invariantSplice(args);\n      if (nextObject === originalObject && args.length) nextObject = copy(originalObject);\n      splice.apply(nextObject, args);\n    });\n    return nextObject;\n  },\n  $set: function(value, nextObject, spec) {\n    invariantSet(spec);\n    return value;\n  },\n  $toggle: function(targets, nextObject) {\n    invariantSpecArray(targets, '$toggle');\n    var nextObjectCopy = targets.length ? copy(nextObject) : nextObject;\n\n    targets.forEach(function(target) {\n      nextObjectCopy[target] = !nextObject[target];\n    });\n\n    return nextObjectCopy;\n  },\n  $unset: function(value, nextObject, spec, originalObject) {\n    invariantSpecArray(value, '$unset');\n    value.forEach(function(key) {\n      if (Object.hasOwnProperty.call(nextObject, key)) {\n        if (nextObject === originalObject) nextObject = copy(originalObject);\n        delete nextObject[key];\n      }\n    });\n    return nextObject;\n  },\n  $add: function(value, nextObject, spec, originalObject) {\n    invariantMapOrSet(nextObject, '$add');\n    invariantSpecArray(value, '$add');\n    if (type(nextObject) === 'Map') {\n      value.forEach(function(pair) {\n        var key = pair[0];\n        var value = pair[1];\n        if (nextObject === originalObject && nextObject.get(key) !== value) nextObject = copy(originalObject);\n        nextObject.set(key, value);\n      });\n    } else {\n      value.forEach(function(value) {\n        if (nextObject === originalObject && !nextObject.has(value)) nextObject = copy(originalObject);\n        nextObject.add(value);\n      });\n    }\n    return nextObject;\n  },\n  $remove: function(value, nextObject, spec, originalObject) {\n    invariantMapOrSet(nextObject, '$remove');\n    invariantSpecArray(value, '$remove');\n    value.forEach(function(key) {\n      if (nextObject === originalObject && nextObject.has(key)) nextObject = copy(originalObject);\n      nextObject.delete(key);\n    });\n    return nextObject;\n  },\n  $merge: function(value, nextObject, spec, originalObject) {\n    invariantMerge(nextObject, value);\n    getAllKeys(value).forEach(function(key) {\n      if (value[key] !== nextObject[key]) {\n        if (nextObject === originalObject) nextObject = copy(originalObject);\n        nextObject[key] = value[key];\n      }\n    });\n    return nextObject;\n  },\n  $apply: function(value, original) {\n    invariantApply(value);\n    return value(original);\n  }\n};\n\nvar contextForExport = newContext();\n\nmodule.exports = contextForExport;\nmodule.exports.default = contextForExport;\nmodule.exports.newContext = newContext;\n\n// invariants\n\nfunction invariantPushAndUnshift(value, spec, command) {\n  invariant(\n    Array.isArray(value),\n    'update(): expected target of %s to be an array; got %s.',\n    command,\n    value\n  );\n  invariantSpecArray(spec[command], command)\n}\n\nfunction invariantSpecArray(spec, command) {\n  invariant(\n    Array.isArray(spec),\n    'update(): expected spec of %s to be an array; got %s. ' +\n    'Did you forget to wrap your parameter in an array?',\n    command,\n    spec\n  );\n}\n\nfunction invariantSplices(value, spec) {\n  invariant(\n    Array.isArray(value),\n    'Expected $splice target to be an array; got %s',\n    value\n  );\n  invariantSplice(spec['$splice']);\n}\n\nfunction invariantSplice(value) {\n  invariant(\n    Array.isArray(value),\n    'update(): expected spec of $splice to be an array of arrays; got %s. ' +\n    'Did you forget to wrap your parameters in an array?',\n    value\n  );\n}\n\nfunction invariantApply(fn) {\n  invariant(\n    typeof fn === 'function',\n    'update(): expected spec of $apply to be a function; got %s.',\n    fn\n  );\n}\n\nfunction invariantSet(spec) {\n  invariant(\n    Object.keys(spec).length === 1,\n    'Cannot have more than one key in an object with $set'\n  );\n}\n\nfunction invariantMerge(target, specValue) {\n  invariant(\n    specValue && typeof specValue === 'object',\n    'update(): $merge expects a spec of type \\'object\\'; got %s',\n    specValue\n  );\n  invariant(\n    target && typeof target === 'object',\n    'update(): $merge expects a target of type \\'object\\'; got %s',\n    target\n  );\n}\n\nfunction invariantMapOrSet(target, command) {\n  var typeOfTarget = type(target);\n  invariant(\n    typeOfTarget === 'Map' || typeOfTarget === 'Set',\n    'update(): %s expects a target of type Set or Map; got %s',\n    command,\n    typeOfTarget\n  );\n}\n\n\n//# sourceURL=webpack:///./node_modules/immutability-helper/index.js?");

/***/ }),

/***/ "./node_modules/invariant/browser.js":
/*!*******************************************!*\
  !*** ./node_modules/invariant/browser.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("/**\n * Copyright (c) 2013-present, Facebook, Inc.\n *\n * This source code is licensed under the MIT license found in the\n * LICENSE file in the root directory of this source tree.\n */\n\n\n\n/**\n * Use invariant() to assert state which your program assumes to be true.\n *\n * Provide sprintf-style format (only %s is supported) and arguments\n * to provide information about what broke and what you were\n * expecting.\n *\n * The invariant message will be stripped in production, but the invariant\n * will remain to ensure logic does not differ in production.\n */\n\nvar invariant = function(condition, format, a, b, c, d, e, f) {\n  if (true) {\n    if (format === undefined) {\n      throw new Error('invariant requires an error message argument');\n    }\n  }\n\n  if (!condition) {\n    var error;\n    if (format === undefined) {\n      error = new Error(\n        'Minified exception occurred; use the non-minified dev environment ' +\n        'for the full error message and additional helpful warnings.'\n      );\n    } else {\n      var args = [a, b, c, d, e, f];\n      var argIndex = 0;\n      error = new Error(\n        format.replace(/%s/g, function() { return args[argIndex++]; })\n      );\n      error.name = 'Invariant Violation';\n    }\n\n    error.framesToPop = 1; // we don't care about invariant's own frame\n    throw error;\n  }\n};\n\nmodule.exports = invariant;\n\n\n//# sourceURL=webpack:///./node_modules/invariant/browser.js?");

/***/ }),

/***/ "./src/ui/pack-immutable.js":
/*!**********************************!*\
  !*** ./src/ui/pack-immutable.js ***!
  \**********************************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var immutability_helper__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! immutability-helper */ \"./node_modules/immutability-helper/index.js\");\n/* harmony import */ var immutability_helper__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(immutability_helper__WEBPACK_IMPORTED_MODULE_0__);\n\r\n\r\njb.ui.update = immutability_helper__WEBPACK_IMPORTED_MODULE_0___default.a;\r\n\n\n//# sourceURL=webpack:///./src/ui/pack-immutable.js?");

/***/ })

/******/ });;

/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/ui/jb-rx.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./node_modules/rxjs/InnerSubscriber.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/InnerSubscriber.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ./Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar InnerSubscriber = (function (_super) {\n    __extends(InnerSubscriber, _super);\n    function InnerSubscriber(parent, outerValue, outerIndex) {\n        _super.call(this);\n        this.parent = parent;\n        this.outerValue = outerValue;\n        this.outerIndex = outerIndex;\n        this.index = 0;\n    }\n    InnerSubscriber.prototype._next = function (value) {\n        this.parent.notifyNext(this.outerValue, value, this.outerIndex, this.index++, this);\n    };\n    InnerSubscriber.prototype._error = function (error) {\n        this.parent.notifyError(error, this);\n        this.unsubscribe();\n    };\n    InnerSubscriber.prototype._complete = function () {\n        this.parent.notifyComplete(this);\n        this.unsubscribe();\n    };\n    return InnerSubscriber;\n}(Subscriber_1.Subscriber));\nexports.InnerSubscriber = InnerSubscriber;\n//# sourceMappingURL=InnerSubscriber.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/InnerSubscriber.js?");

/***/ }),

/***/ "./node_modules/rxjs/Notification.js":
/*!*******************************************!*\
  !*** ./node_modules/rxjs/Notification.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ./Observable */ \"./node_modules/rxjs/Observable.js\");\n/**\n * Represents a push-based event or value that an {@link Observable} can emit.\n * This class is particularly useful for operators that manage notifications,\n * like {@link materialize}, {@link dematerialize}, {@link observeOn}, and\n * others. Besides wrapping the actual delivered value, it also annotates it\n * with metadata of, for instance, what type of push message it is (`next`,\n * `error`, or `complete`).\n *\n * @see {@link materialize}\n * @see {@link dematerialize}\n * @see {@link observeOn}\n *\n * @class Notification<T>\n */\nvar Notification = (function () {\n    function Notification(kind, value, error) {\n        this.kind = kind;\n        this.value = value;\n        this.error = error;\n        this.hasValue = kind === 'N';\n    }\n    /**\n     * Delivers to the given `observer` the value wrapped by this Notification.\n     * @param {Observer} observer\n     * @return\n     */\n    Notification.prototype.observe = function (observer) {\n        switch (this.kind) {\n            case 'N':\n                return observer.next && observer.next(this.value);\n            case 'E':\n                return observer.error && observer.error(this.error);\n            case 'C':\n                return observer.complete && observer.complete();\n        }\n    };\n    /**\n     * Given some {@link Observer} callbacks, deliver the value represented by the\n     * current Notification to the correctly corresponding callback.\n     * @param {function(value: T): void} next An Observer `next` callback.\n     * @param {function(err: any): void} [error] An Observer `error` callback.\n     * @param {function(): void} [complete] An Observer `complete` callback.\n     * @return {any}\n     */\n    Notification.prototype.do = function (next, error, complete) {\n        var kind = this.kind;\n        switch (kind) {\n            case 'N':\n                return next && next(this.value);\n            case 'E':\n                return error && error(this.error);\n            case 'C':\n                return complete && complete();\n        }\n    };\n    /**\n     * Takes an Observer or its individual callback functions, and calls `observe`\n     * or `do` methods accordingly.\n     * @param {Observer|function(value: T): void} nextOrObserver An Observer or\n     * the `next` callback.\n     * @param {function(err: any): void} [error] An Observer `error` callback.\n     * @param {function(): void} [complete] An Observer `complete` callback.\n     * @return {any}\n     */\n    Notification.prototype.accept = function (nextOrObserver, error, complete) {\n        if (nextOrObserver && typeof nextOrObserver.next === 'function') {\n            return this.observe(nextOrObserver);\n        }\n        else {\n            return this.do(nextOrObserver, error, complete);\n        }\n    };\n    /**\n     * Returns a simple Observable that just delivers the notification represented\n     * by this Notification instance.\n     * @return {any}\n     */\n    Notification.prototype.toObservable = function () {\n        var kind = this.kind;\n        switch (kind) {\n            case 'N':\n                return Observable_1.Observable.of(this.value);\n            case 'E':\n                return Observable_1.Observable.throw(this.error);\n            case 'C':\n                return Observable_1.Observable.empty();\n        }\n        throw new Error('unexpected notification kind value');\n    };\n    /**\n     * A shortcut to create a Notification instance of the type `next` from a\n     * given value.\n     * @param {T} value The `next` value.\n     * @return {Notification<T>} The \"next\" Notification representing the\n     * argument.\n     */\n    Notification.createNext = function (value) {\n        if (typeof value !== 'undefined') {\n            return new Notification('N', value);\n        }\n        return Notification.undefinedValueNotification;\n    };\n    /**\n     * A shortcut to create a Notification instance of the type `error` from a\n     * given error.\n     * @param {any} [err] The `error` error.\n     * @return {Notification<T>} The \"error\" Notification representing the\n     * argument.\n     */\n    Notification.createError = function (err) {\n        return new Notification('E', undefined, err);\n    };\n    /**\n     * A shortcut to create a Notification instance of the type `complete`.\n     * @return {Notification<any>} The valueless \"complete\" Notification.\n     */\n    Notification.createComplete = function () {\n        return Notification.completeNotification;\n    };\n    Notification.completeNotification = new Notification('C');\n    Notification.undefinedValueNotification = new Notification('N', undefined);\n    return Notification;\n}());\nexports.Notification = Notification;\n//# sourceMappingURL=Notification.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Notification.js?");

/***/ }),

/***/ "./node_modules/rxjs/Observable.js":
/*!*****************************************!*\
  !*** ./node_modules/rxjs/Observable.js ***!
  \*****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar root_1 = __webpack_require__(/*! ./util/root */ \"./node_modules/rxjs/util/root.js\");\nvar toSubscriber_1 = __webpack_require__(/*! ./util/toSubscriber */ \"./node_modules/rxjs/util/toSubscriber.js\");\nvar observable_1 = __webpack_require__(/*! ./symbol/observable */ \"./node_modules/rxjs/symbol/observable.js\");\nvar pipe_1 = __webpack_require__(/*! ./util/pipe */ \"./node_modules/rxjs/util/pipe.js\");\n/**\n * A representation of any set of values over any amount of time. This is the most basic building block\n * of RxJS.\n *\n * @class Observable<T>\n */\nvar Observable = (function () {\n    /**\n     * @constructor\n     * @param {Function} subscribe the function that is called when the Observable is\n     * initially subscribed to. This function is given a Subscriber, to which new values\n     * can be `next`ed, or an `error` method can be called to raise an error, or\n     * `complete` can be called to notify of a successful completion.\n     */\n    function Observable(subscribe) {\n        this._isScalar = false;\n        if (subscribe) {\n            this._subscribe = subscribe;\n        }\n    }\n    /**\n     * Creates a new Observable, with this Observable as the source, and the passed\n     * operator defined as the new observable's operator.\n     * @method lift\n     * @param {Operator} operator the operator defining the operation to take on the observable\n     * @return {Observable} a new observable with the Operator applied\n     */\n    Observable.prototype.lift = function (operator) {\n        var observable = new Observable();\n        observable.source = this;\n        observable.operator = operator;\n        return observable;\n    };\n    /**\n     * Invokes an execution of an Observable and registers Observer handlers for notifications it will emit.\n     *\n     * <span class=\"informal\">Use it when you have all these Observables, but still nothing is happening.</span>\n     *\n     * `subscribe` is not a regular operator, but a method that calls Observable's internal `subscribe` function. It\n     * might be for example a function that you passed to a {@link create} static factory, but most of the time it is\n     * a library implementation, which defines what and when will be emitted by an Observable. This means that calling\n     * `subscribe` is actually the moment when Observable starts its work, not when it is created, as it is often\n     * thought.\n     *\n     * Apart from starting the execution of an Observable, this method allows you to listen for values\n     * that an Observable emits, as well as for when it completes or errors. You can achieve this in two\n     * following ways.\n     *\n     * The first way is creating an object that implements {@link Observer} interface. It should have methods\n     * defined by that interface, but note that it should be just a regular JavaScript object, which you can create\n     * yourself in any way you want (ES6 class, classic function constructor, object literal etc.). In particular do\n     * not attempt to use any RxJS implementation details to create Observers - you don't need them. Remember also\n     * that your object does not have to implement all methods. If you find yourself creating a method that doesn't\n     * do anything, you can simply omit it. Note however, that if `error` method is not provided, all errors will\n     * be left uncaught.\n     *\n     * The second way is to give up on Observer object altogether and simply provide callback functions in place of its methods.\n     * This means you can provide three functions as arguments to `subscribe`, where first function is equivalent\n     * of a `next` method, second of an `error` method and third of a `complete` method. Just as in case of Observer,\n     * if you do not need to listen for something, you can omit a function, preferably by passing `undefined` or `null`,\n     * since `subscribe` recognizes these functions by where they were placed in function call. When it comes\n     * to `error` function, just as before, if not provided, errors emitted by an Observable will be thrown.\n     *\n     * Whatever style of calling `subscribe` you use, in both cases it returns a Subscription object.\n     * This object allows you to call `unsubscribe` on it, which in turn will stop work that an Observable does and will clean\n     * up all resources that an Observable used. Note that cancelling a subscription will not call `complete` callback\n     * provided to `subscribe` function, which is reserved for a regular completion signal that comes from an Observable.\n     *\n     * Remember that callbacks provided to `subscribe` are not guaranteed to be called asynchronously.\n     * It is an Observable itself that decides when these functions will be called. For example {@link of}\n     * by default emits all its values synchronously. Always check documentation for how given Observable\n     * will behave when subscribed and if its default behavior can be modified with a {@link Scheduler}.\n     *\n     * @example <caption>Subscribe with an Observer</caption>\n     * const sumObserver = {\n     *   sum: 0,\n     *   next(value) {\n     *     console.log('Adding: ' + value);\n     *     this.sum = this.sum + value;\n     *   },\n     *   error() { // We actually could just remove this method,\n     *   },        // since we do not really care about errors right now.\n     *   complete() {\n     *     console.log('Sum equals: ' + this.sum);\n     *   }\n     * };\n     *\n     * Rx.Observable.of(1, 2, 3) // Synchronously emits 1, 2, 3 and then completes.\n     * .subscribe(sumObserver);\n     *\n     * // Logs:\n     * // \"Adding: 1\"\n     * // \"Adding: 2\"\n     * // \"Adding: 3\"\n     * // \"Sum equals: 6\"\n     *\n     *\n     * @example <caption>Subscribe with functions</caption>\n     * let sum = 0;\n     *\n     * Rx.Observable.of(1, 2, 3)\n     * .subscribe(\n     *   function(value) {\n     *     console.log('Adding: ' + value);\n     *     sum = sum + value;\n     *   },\n     *   undefined,\n     *   function() {\n     *     console.log('Sum equals: ' + sum);\n     *   }\n     * );\n     *\n     * // Logs:\n     * // \"Adding: 1\"\n     * // \"Adding: 2\"\n     * // \"Adding: 3\"\n     * // \"Sum equals: 6\"\n     *\n     *\n     * @example <caption>Cancel a subscription</caption>\n     * const subscription = Rx.Observable.interval(1000).subscribe(\n     *   num => console.log(num),\n     *   undefined,\n     *   () => console.log('completed!') // Will not be called, even\n     * );                                // when cancelling subscription\n     *\n     *\n     * setTimeout(() => {\n     *   subscription.unsubscribe();\n     *   console.log('unsubscribed!');\n     * }, 2500);\n     *\n     * // Logs:\n     * // 0 after 1s\n     * // 1 after 2s\n     * // \"unsubscribed!\" after 2.5s\n     *\n     *\n     * @param {Observer|Function} observerOrNext (optional) Either an observer with methods to be called,\n     *  or the first of three possible handlers, which is the handler for each value emitted from the subscribed\n     *  Observable.\n     * @param {Function} error (optional) A handler for a terminal event resulting from an error. If no error handler is provided,\n     *  the error will be thrown as unhandled.\n     * @param {Function} complete (optional) A handler for a terminal event resulting from successful completion.\n     * @return {ISubscription} a subscription reference to the registered handlers\n     * @method subscribe\n     */\n    Observable.prototype.subscribe = function (observerOrNext, error, complete) {\n        var operator = this.operator;\n        var sink = toSubscriber_1.toSubscriber(observerOrNext, error, complete);\n        if (operator) {\n            operator.call(sink, this.source);\n        }\n        else {\n            sink.add(this.source || !sink.syncErrorThrowable ? this._subscribe(sink) : this._trySubscribe(sink));\n        }\n        if (sink.syncErrorThrowable) {\n            sink.syncErrorThrowable = false;\n            if (sink.syncErrorThrown) {\n                throw sink.syncErrorValue;\n            }\n        }\n        return sink;\n    };\n    Observable.prototype._trySubscribe = function (sink) {\n        try {\n            return this._subscribe(sink);\n        }\n        catch (err) {\n            sink.syncErrorThrown = true;\n            sink.syncErrorValue = err;\n            sink.error(err);\n        }\n    };\n    /**\n     * @method forEach\n     * @param {Function} next a handler for each value emitted by the observable\n     * @param {PromiseConstructor} [PromiseCtor] a constructor function used to instantiate the Promise\n     * @return {Promise} a promise that either resolves on observable completion or\n     *  rejects with the handled error\n     */\n    Observable.prototype.forEach = function (next, PromiseCtor) {\n        var _this = this;\n        if (!PromiseCtor) {\n            if (root_1.root.Rx && root_1.root.Rx.config && root_1.root.Rx.config.Promise) {\n                PromiseCtor = root_1.root.Rx.config.Promise;\n            }\n            else if (root_1.root.Promise) {\n                PromiseCtor = root_1.root.Promise;\n            }\n        }\n        if (!PromiseCtor) {\n            throw new Error('no Promise impl found');\n        }\n        return new PromiseCtor(function (resolve, reject) {\n            // Must be declared in a separate statement to avoid a RefernceError when\n            // accessing subscription below in the closure due to Temporal Dead Zone.\n            var subscription;\n            subscription = _this.subscribe(function (value) {\n                if (subscription) {\n                    // if there is a subscription, then we can surmise\n                    // the next handling is asynchronous. Any errors thrown\n                    // need to be rejected explicitly and unsubscribe must be\n                    // called manually\n                    try {\n                        next(value);\n                    }\n                    catch (err) {\n                        reject(err);\n                        subscription.unsubscribe();\n                    }\n                }\n                else {\n                    // if there is NO subscription, then we're getting a nexted\n                    // value synchronously during subscription. We can just call it.\n                    // If it errors, Observable's `subscribe` will ensure the\n                    // unsubscription logic is called, then synchronously rethrow the error.\n                    // After that, Promise will trap the error and send it\n                    // down the rejection path.\n                    next(value);\n                }\n            }, reject, resolve);\n        });\n    };\n    /** @deprecated internal use only */ Observable.prototype._subscribe = function (subscriber) {\n        return this.source.subscribe(subscriber);\n    };\n    /**\n     * An interop point defined by the es7-observable spec https://github.com/zenparsing/es-observable\n     * @method Symbol.observable\n     * @return {Observable} this instance of the observable\n     */\n    Observable.prototype[observable_1.observable] = function () {\n        return this;\n    };\n    /* tslint:enable:max-line-length */\n    /**\n     * Used to stitch together functional operators into a chain.\n     * @method pipe\n     * @return {Observable} the Observable result of all of the operators having\n     * been called in the order they were passed in.\n     *\n     * @example\n     *\n     * import { map, filter, scan } from 'rxjs/operators';\n     *\n     * Rx.Observable.interval(1000)\n     *   .pipe(\n     *     filter(x => x % 2 === 0),\n     *     map(x => x + x),\n     *     scan((acc, x) => acc + x)\n     *   )\n     *   .subscribe(x => console.log(x))\n     */\n    Observable.prototype.pipe = function () {\n        var operations = [];\n        for (var _i = 0; _i < arguments.length; _i++) {\n            operations[_i - 0] = arguments[_i];\n        }\n        if (operations.length === 0) {\n            return this;\n        }\n        return pipe_1.pipeFromArray(operations)(this);\n    };\n    /* tslint:enable:max-line-length */\n    Observable.prototype.toPromise = function (PromiseCtor) {\n        var _this = this;\n        if (!PromiseCtor) {\n            if (root_1.root.Rx && root_1.root.Rx.config && root_1.root.Rx.config.Promise) {\n                PromiseCtor = root_1.root.Rx.config.Promise;\n            }\n            else if (root_1.root.Promise) {\n                PromiseCtor = root_1.root.Promise;\n            }\n        }\n        if (!PromiseCtor) {\n            throw new Error('no Promise impl found');\n        }\n        return new PromiseCtor(function (resolve, reject) {\n            var value;\n            _this.subscribe(function (x) { return value = x; }, function (err) { return reject(err); }, function () { return resolve(value); });\n        });\n    };\n    // HACK: Since TypeScript inherits static properties too, we have to\n    // fight against TypeScript here so Subject can have a different static create signature\n    /**\n     * Creates a new cold Observable by calling the Observable constructor\n     * @static true\n     * @owner Observable\n     * @method create\n     * @param {Function} subscribe? the subscriber function to be passed to the Observable constructor\n     * @return {Observable} a new cold observable\n     */\n    Observable.create = function (subscribe) {\n        return new Observable(subscribe);\n    };\n    return Observable;\n}());\nexports.Observable = Observable;\n//# sourceMappingURL=Observable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Observable.js?");

/***/ }),

/***/ "./node_modules/rxjs/Observer.js":
/*!***************************************!*\
  !*** ./node_modules/rxjs/Observer.js ***!
  \***************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nexports.empty = {\n    closed: true,\n    next: function (value) { },\n    error: function (err) { throw err; },\n    complete: function () { }\n};\n//# sourceMappingURL=Observer.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Observer.js?");

/***/ }),

/***/ "./node_modules/rxjs/OuterSubscriber.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/OuterSubscriber.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ./Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar OuterSubscriber = (function (_super) {\n    __extends(OuterSubscriber, _super);\n    function OuterSubscriber() {\n        _super.apply(this, arguments);\n    }\n    OuterSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        this.destination.next(innerValue);\n    };\n    OuterSubscriber.prototype.notifyError = function (error, innerSub) {\n        this.destination.error(error);\n    };\n    OuterSubscriber.prototype.notifyComplete = function (innerSub) {\n        this.destination.complete();\n    };\n    return OuterSubscriber;\n}(Subscriber_1.Subscriber));\nexports.OuterSubscriber = OuterSubscriber;\n//# sourceMappingURL=OuterSubscriber.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/OuterSubscriber.js?");

/***/ }),

/***/ "./node_modules/rxjs/Scheduler.js":
/*!****************************************!*\
  !*** ./node_modules/rxjs/Scheduler.js ***!
  \****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n/**\n * An execution context and a data structure to order tasks and schedule their\n * execution. Provides a notion of (potentially virtual) time, through the\n * `now()` getter method.\n *\n * Each unit of work in a Scheduler is called an {@link Action}.\n *\n * ```ts\n * class Scheduler {\n *   now(): number;\n *   schedule(work, delay?, state?): Subscription;\n * }\n * ```\n *\n * @class Scheduler\n */\nvar Scheduler = (function () {\n    function Scheduler(SchedulerAction, now) {\n        if (now === void 0) { now = Scheduler.now; }\n        this.SchedulerAction = SchedulerAction;\n        this.now = now;\n    }\n    /**\n     * Schedules a function, `work`, for execution. May happen at some point in\n     * the future, according to the `delay` parameter, if specified. May be passed\n     * some context object, `state`, which will be passed to the `work` function.\n     *\n     * The given arguments will be processed an stored as an Action object in a\n     * queue of actions.\n     *\n     * @param {function(state: ?T): ?Subscription} work A function representing a\n     * task, or some unit of work to be executed by the Scheduler.\n     * @param {number} [delay] Time to wait before executing the work, where the\n     * time unit is implicit and defined by the Scheduler itself.\n     * @param {T} [state] Some contextual data that the `work` function uses when\n     * called by the Scheduler.\n     * @return {Subscription} A subscription in order to be able to unsubscribe\n     * the scheduled work.\n     */\n    Scheduler.prototype.schedule = function (work, delay, state) {\n        if (delay === void 0) { delay = 0; }\n        return new this.SchedulerAction(this, work).schedule(state, delay);\n    };\n    Scheduler.now = Date.now ? Date.now : function () { return +new Date(); };\n    return Scheduler;\n}());\nexports.Scheduler = Scheduler;\n//# sourceMappingURL=Scheduler.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Scheduler.js?");

/***/ }),

/***/ "./node_modules/rxjs/Subject.js":
/*!**************************************!*\
  !*** ./node_modules/rxjs/Subject.js ***!
  \**************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Observable_1 = __webpack_require__(/*! ./Observable */ \"./node_modules/rxjs/Observable.js\");\nvar Subscriber_1 = __webpack_require__(/*! ./Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar Subscription_1 = __webpack_require__(/*! ./Subscription */ \"./node_modules/rxjs/Subscription.js\");\nvar ObjectUnsubscribedError_1 = __webpack_require__(/*! ./util/ObjectUnsubscribedError */ \"./node_modules/rxjs/util/ObjectUnsubscribedError.js\");\nvar SubjectSubscription_1 = __webpack_require__(/*! ./SubjectSubscription */ \"./node_modules/rxjs/SubjectSubscription.js\");\nvar rxSubscriber_1 = __webpack_require__(/*! ./symbol/rxSubscriber */ \"./node_modules/rxjs/symbol/rxSubscriber.js\");\n/**\n * @class SubjectSubscriber<T>\n */\nvar SubjectSubscriber = (function (_super) {\n    __extends(SubjectSubscriber, _super);\n    function SubjectSubscriber(destination) {\n        _super.call(this, destination);\n        this.destination = destination;\n    }\n    return SubjectSubscriber;\n}(Subscriber_1.Subscriber));\nexports.SubjectSubscriber = SubjectSubscriber;\n/**\n * @class Subject<T>\n */\nvar Subject = (function (_super) {\n    __extends(Subject, _super);\n    function Subject() {\n        _super.call(this);\n        this.observers = [];\n        this.closed = false;\n        this.isStopped = false;\n        this.hasError = false;\n        this.thrownError = null;\n    }\n    Subject.prototype[rxSubscriber_1.rxSubscriber] = function () {\n        return new SubjectSubscriber(this);\n    };\n    Subject.prototype.lift = function (operator) {\n        var subject = new AnonymousSubject(this, this);\n        subject.operator = operator;\n        return subject;\n    };\n    Subject.prototype.next = function (value) {\n        if (this.closed) {\n            throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();\n        }\n        if (!this.isStopped) {\n            var observers = this.observers;\n            var len = observers.length;\n            var copy = observers.slice();\n            for (var i = 0; i < len; i++) {\n                copy[i].next(value);\n            }\n        }\n    };\n    Subject.prototype.error = function (err) {\n        if (this.closed) {\n            throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();\n        }\n        this.hasError = true;\n        this.thrownError = err;\n        this.isStopped = true;\n        var observers = this.observers;\n        var len = observers.length;\n        var copy = observers.slice();\n        for (var i = 0; i < len; i++) {\n            copy[i].error(err);\n        }\n        this.observers.length = 0;\n    };\n    Subject.prototype.complete = function () {\n        if (this.closed) {\n            throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();\n        }\n        this.isStopped = true;\n        var observers = this.observers;\n        var len = observers.length;\n        var copy = observers.slice();\n        for (var i = 0; i < len; i++) {\n            copy[i].complete();\n        }\n        this.observers.length = 0;\n    };\n    Subject.prototype.unsubscribe = function () {\n        this.isStopped = true;\n        this.closed = true;\n        this.observers = null;\n    };\n    Subject.prototype._trySubscribe = function (subscriber) {\n        if (this.closed) {\n            throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();\n        }\n        else {\n            return _super.prototype._trySubscribe.call(this, subscriber);\n        }\n    };\n    /** @deprecated internal use only */ Subject.prototype._subscribe = function (subscriber) {\n        if (this.closed) {\n            throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();\n        }\n        else if (this.hasError) {\n            subscriber.error(this.thrownError);\n            return Subscription_1.Subscription.EMPTY;\n        }\n        else if (this.isStopped) {\n            subscriber.complete();\n            return Subscription_1.Subscription.EMPTY;\n        }\n        else {\n            this.observers.push(subscriber);\n            return new SubjectSubscription_1.SubjectSubscription(this, subscriber);\n        }\n    };\n    Subject.prototype.asObservable = function () {\n        var observable = new Observable_1.Observable();\n        observable.source = this;\n        return observable;\n    };\n    Subject.create = function (destination, source) {\n        return new AnonymousSubject(destination, source);\n    };\n    return Subject;\n}(Observable_1.Observable));\nexports.Subject = Subject;\n/**\n * @class AnonymousSubject<T>\n */\nvar AnonymousSubject = (function (_super) {\n    __extends(AnonymousSubject, _super);\n    function AnonymousSubject(destination, source) {\n        _super.call(this);\n        this.destination = destination;\n        this.source = source;\n    }\n    AnonymousSubject.prototype.next = function (value) {\n        var destination = this.destination;\n        if (destination && destination.next) {\n            destination.next(value);\n        }\n    };\n    AnonymousSubject.prototype.error = function (err) {\n        var destination = this.destination;\n        if (destination && destination.error) {\n            this.destination.error(err);\n        }\n    };\n    AnonymousSubject.prototype.complete = function () {\n        var destination = this.destination;\n        if (destination && destination.complete) {\n            this.destination.complete();\n        }\n    };\n    /** @deprecated internal use only */ AnonymousSubject.prototype._subscribe = function (subscriber) {\n        var source = this.source;\n        if (source) {\n            return this.source.subscribe(subscriber);\n        }\n        else {\n            return Subscription_1.Subscription.EMPTY;\n        }\n    };\n    return AnonymousSubject;\n}(Subject));\nexports.AnonymousSubject = AnonymousSubject;\n//# sourceMappingURL=Subject.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Subject.js?");

/***/ }),

/***/ "./node_modules/rxjs/SubjectSubscription.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/SubjectSubscription.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscription_1 = __webpack_require__(/*! ./Subscription */ \"./node_modules/rxjs/Subscription.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar SubjectSubscription = (function (_super) {\n    __extends(SubjectSubscription, _super);\n    function SubjectSubscription(subject, subscriber) {\n        _super.call(this);\n        this.subject = subject;\n        this.subscriber = subscriber;\n        this.closed = false;\n    }\n    SubjectSubscription.prototype.unsubscribe = function () {\n        if (this.closed) {\n            return;\n        }\n        this.closed = true;\n        var subject = this.subject;\n        var observers = subject.observers;\n        this.subject = null;\n        if (!observers || observers.length === 0 || subject.isStopped || subject.closed) {\n            return;\n        }\n        var subscriberIndex = observers.indexOf(this.subscriber);\n        if (subscriberIndex !== -1) {\n            observers.splice(subscriberIndex, 1);\n        }\n    };\n    return SubjectSubscription;\n}(Subscription_1.Subscription));\nexports.SubjectSubscription = SubjectSubscription;\n//# sourceMappingURL=SubjectSubscription.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/SubjectSubscription.js?");

/***/ }),

/***/ "./node_modules/rxjs/Subscriber.js":
/*!*****************************************!*\
  !*** ./node_modules/rxjs/Subscriber.js ***!
  \*****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar isFunction_1 = __webpack_require__(/*! ./util/isFunction */ \"./node_modules/rxjs/util/isFunction.js\");\nvar Subscription_1 = __webpack_require__(/*! ./Subscription */ \"./node_modules/rxjs/Subscription.js\");\nvar Observer_1 = __webpack_require__(/*! ./Observer */ \"./node_modules/rxjs/Observer.js\");\nvar rxSubscriber_1 = __webpack_require__(/*! ./symbol/rxSubscriber */ \"./node_modules/rxjs/symbol/rxSubscriber.js\");\n/**\n * Implements the {@link Observer} interface and extends the\n * {@link Subscription} class. While the {@link Observer} is the public API for\n * consuming the values of an {@link Observable}, all Observers get converted to\n * a Subscriber, in order to provide Subscription-like capabilities such as\n * `unsubscribe`. Subscriber is a common type in RxJS, and crucial for\n * implementing operators, but it is rarely used as a public API.\n *\n * @class Subscriber<T>\n */\nvar Subscriber = (function (_super) {\n    __extends(Subscriber, _super);\n    /**\n     * @param {Observer|function(value: T): void} [destinationOrNext] A partially\n     * defined Observer or a `next` callback function.\n     * @param {function(e: ?any): void} [error] The `error` callback of an\n     * Observer.\n     * @param {function(): void} [complete] The `complete` callback of an\n     * Observer.\n     */\n    function Subscriber(destinationOrNext, error, complete) {\n        _super.call(this);\n        this.syncErrorValue = null;\n        this.syncErrorThrown = false;\n        this.syncErrorThrowable = false;\n        this.isStopped = false;\n        switch (arguments.length) {\n            case 0:\n                this.destination = Observer_1.empty;\n                break;\n            case 1:\n                if (!destinationOrNext) {\n                    this.destination = Observer_1.empty;\n                    break;\n                }\n                if (typeof destinationOrNext === 'object') {\n                    // HACK(benlesh): To resolve an issue where Node users may have multiple\n                    // copies of rxjs in their node_modules directory.\n                    if (isTrustedSubscriber(destinationOrNext)) {\n                        var trustedSubscriber = destinationOrNext[rxSubscriber_1.rxSubscriber]();\n                        this.syncErrorThrowable = trustedSubscriber.syncErrorThrowable;\n                        this.destination = trustedSubscriber;\n                        trustedSubscriber.add(this);\n                    }\n                    else {\n                        this.syncErrorThrowable = true;\n                        this.destination = new SafeSubscriber(this, destinationOrNext);\n                    }\n                    break;\n                }\n            default:\n                this.syncErrorThrowable = true;\n                this.destination = new SafeSubscriber(this, destinationOrNext, error, complete);\n                break;\n        }\n    }\n    Subscriber.prototype[rxSubscriber_1.rxSubscriber] = function () { return this; };\n    /**\n     * A static factory for a Subscriber, given a (potentially partial) definition\n     * of an Observer.\n     * @param {function(x: ?T): void} [next] The `next` callback of an Observer.\n     * @param {function(e: ?any): void} [error] The `error` callback of an\n     * Observer.\n     * @param {function(): void} [complete] The `complete` callback of an\n     * Observer.\n     * @return {Subscriber<T>} A Subscriber wrapping the (partially defined)\n     * Observer represented by the given arguments.\n     */\n    Subscriber.create = function (next, error, complete) {\n        var subscriber = new Subscriber(next, error, complete);\n        subscriber.syncErrorThrowable = false;\n        return subscriber;\n    };\n    /**\n     * The {@link Observer} callback to receive notifications of type `next` from\n     * the Observable, with a value. The Observable may call this method 0 or more\n     * times.\n     * @param {T} [value] The `next` value.\n     * @return {void}\n     */\n    Subscriber.prototype.next = function (value) {\n        if (!this.isStopped) {\n            this._next(value);\n        }\n    };\n    /**\n     * The {@link Observer} callback to receive notifications of type `error` from\n     * the Observable, with an attached {@link Error}. Notifies the Observer that\n     * the Observable has experienced an error condition.\n     * @param {any} [err] The `error` exception.\n     * @return {void}\n     */\n    Subscriber.prototype.error = function (err) {\n        if (!this.isStopped) {\n            this.isStopped = true;\n            this._error(err);\n        }\n    };\n    /**\n     * The {@link Observer} callback to receive a valueless notification of type\n     * `complete` from the Observable. Notifies the Observer that the Observable\n     * has finished sending push-based notifications.\n     * @return {void}\n     */\n    Subscriber.prototype.complete = function () {\n        if (!this.isStopped) {\n            this.isStopped = true;\n            this._complete();\n        }\n    };\n    Subscriber.prototype.unsubscribe = function () {\n        if (this.closed) {\n            return;\n        }\n        this.isStopped = true;\n        _super.prototype.unsubscribe.call(this);\n    };\n    Subscriber.prototype._next = function (value) {\n        this.destination.next(value);\n    };\n    Subscriber.prototype._error = function (err) {\n        this.destination.error(err);\n        this.unsubscribe();\n    };\n    Subscriber.prototype._complete = function () {\n        this.destination.complete();\n        this.unsubscribe();\n    };\n    /** @deprecated internal use only */ Subscriber.prototype._unsubscribeAndRecycle = function () {\n        var _a = this, _parent = _a._parent, _parents = _a._parents;\n        this._parent = null;\n        this._parents = null;\n        this.unsubscribe();\n        this.closed = false;\n        this.isStopped = false;\n        this._parent = _parent;\n        this._parents = _parents;\n        return this;\n    };\n    return Subscriber;\n}(Subscription_1.Subscription));\nexports.Subscriber = Subscriber;\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar SafeSubscriber = (function (_super) {\n    __extends(SafeSubscriber, _super);\n    function SafeSubscriber(_parentSubscriber, observerOrNext, error, complete) {\n        _super.call(this);\n        this._parentSubscriber = _parentSubscriber;\n        var next;\n        var context = this;\n        if (isFunction_1.isFunction(observerOrNext)) {\n            next = observerOrNext;\n        }\n        else if (observerOrNext) {\n            next = observerOrNext.next;\n            error = observerOrNext.error;\n            complete = observerOrNext.complete;\n            if (observerOrNext !== Observer_1.empty) {\n                context = Object.create(observerOrNext);\n                if (isFunction_1.isFunction(context.unsubscribe)) {\n                    this.add(context.unsubscribe.bind(context));\n                }\n                context.unsubscribe = this.unsubscribe.bind(this);\n            }\n        }\n        this._context = context;\n        this._next = next;\n        this._error = error;\n        this._complete = complete;\n    }\n    SafeSubscriber.prototype.next = function (value) {\n        if (!this.isStopped && this._next) {\n            var _parentSubscriber = this._parentSubscriber;\n            if (!_parentSubscriber.syncErrorThrowable) {\n                this.__tryOrUnsub(this._next, value);\n            }\n            else if (this.__tryOrSetError(_parentSubscriber, this._next, value)) {\n                this.unsubscribe();\n            }\n        }\n    };\n    SafeSubscriber.prototype.error = function (err) {\n        if (!this.isStopped) {\n            var _parentSubscriber = this._parentSubscriber;\n            if (this._error) {\n                if (!_parentSubscriber.syncErrorThrowable) {\n                    this.__tryOrUnsub(this._error, err);\n                    this.unsubscribe();\n                }\n                else {\n                    this.__tryOrSetError(_parentSubscriber, this._error, err);\n                    this.unsubscribe();\n                }\n            }\n            else if (!_parentSubscriber.syncErrorThrowable) {\n                this.unsubscribe();\n                throw err;\n            }\n            else {\n                _parentSubscriber.syncErrorValue = err;\n                _parentSubscriber.syncErrorThrown = true;\n                this.unsubscribe();\n            }\n        }\n    };\n    SafeSubscriber.prototype.complete = function () {\n        var _this = this;\n        if (!this.isStopped) {\n            var _parentSubscriber = this._parentSubscriber;\n            if (this._complete) {\n                var wrappedComplete = function () { return _this._complete.call(_this._context); };\n                if (!_parentSubscriber.syncErrorThrowable) {\n                    this.__tryOrUnsub(wrappedComplete);\n                    this.unsubscribe();\n                }\n                else {\n                    this.__tryOrSetError(_parentSubscriber, wrappedComplete);\n                    this.unsubscribe();\n                }\n            }\n            else {\n                this.unsubscribe();\n            }\n        }\n    };\n    SafeSubscriber.prototype.__tryOrUnsub = function (fn, value) {\n        try {\n            fn.call(this._context, value);\n        }\n        catch (err) {\n            this.unsubscribe();\n            throw err;\n        }\n    };\n    SafeSubscriber.prototype.__tryOrSetError = function (parent, fn, value) {\n        try {\n            fn.call(this._context, value);\n        }\n        catch (err) {\n            parent.syncErrorValue = err;\n            parent.syncErrorThrown = true;\n            return true;\n        }\n        return false;\n    };\n    /** @deprecated internal use only */ SafeSubscriber.prototype._unsubscribe = function () {\n        var _parentSubscriber = this._parentSubscriber;\n        this._context = null;\n        this._parentSubscriber = null;\n        _parentSubscriber.unsubscribe();\n    };\n    return SafeSubscriber;\n}(Subscriber));\nfunction isTrustedSubscriber(obj) {\n    return obj instanceof Subscriber || ('syncErrorThrowable' in obj && obj[rxSubscriber_1.rxSubscriber]);\n}\n//# sourceMappingURL=Subscriber.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Subscriber.js?");

/***/ }),

/***/ "./node_modules/rxjs/Subscription.js":
/*!*******************************************!*\
  !*** ./node_modules/rxjs/Subscription.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar isArray_1 = __webpack_require__(/*! ./util/isArray */ \"./node_modules/rxjs/util/isArray.js\");\nvar isObject_1 = __webpack_require__(/*! ./util/isObject */ \"./node_modules/rxjs/util/isObject.js\");\nvar isFunction_1 = __webpack_require__(/*! ./util/isFunction */ \"./node_modules/rxjs/util/isFunction.js\");\nvar tryCatch_1 = __webpack_require__(/*! ./util/tryCatch */ \"./node_modules/rxjs/util/tryCatch.js\");\nvar errorObject_1 = __webpack_require__(/*! ./util/errorObject */ \"./node_modules/rxjs/util/errorObject.js\");\nvar UnsubscriptionError_1 = __webpack_require__(/*! ./util/UnsubscriptionError */ \"./node_modules/rxjs/util/UnsubscriptionError.js\");\n/**\n * Represents a disposable resource, such as the execution of an Observable. A\n * Subscription has one important method, `unsubscribe`, that takes no argument\n * and just disposes the resource held by the subscription.\n *\n * Additionally, subscriptions may be grouped together through the `add()`\n * method, which will attach a child Subscription to the current Subscription.\n * When a Subscription is unsubscribed, all its children (and its grandchildren)\n * will be unsubscribed as well.\n *\n * @class Subscription\n */\nvar Subscription = (function () {\n    /**\n     * @param {function(): void} [unsubscribe] A function describing how to\n     * perform the disposal of resources when the `unsubscribe` method is called.\n     */\n    function Subscription(unsubscribe) {\n        /**\n         * A flag to indicate whether this Subscription has already been unsubscribed.\n         * @type {boolean}\n         */\n        this.closed = false;\n        this._parent = null;\n        this._parents = null;\n        this._subscriptions = null;\n        if (unsubscribe) {\n            this._unsubscribe = unsubscribe;\n        }\n    }\n    /**\n     * Disposes the resources held by the subscription. May, for instance, cancel\n     * an ongoing Observable execution or cancel any other type of work that\n     * started when the Subscription was created.\n     * @return {void}\n     */\n    Subscription.prototype.unsubscribe = function () {\n        var hasErrors = false;\n        var errors;\n        if (this.closed) {\n            return;\n        }\n        var _a = this, _parent = _a._parent, _parents = _a._parents, _unsubscribe = _a._unsubscribe, _subscriptions = _a._subscriptions;\n        this.closed = true;\n        this._parent = null;\n        this._parents = null;\n        // null out _subscriptions first so any child subscriptions that attempt\n        // to remove themselves from this subscription will noop\n        this._subscriptions = null;\n        var index = -1;\n        var len = _parents ? _parents.length : 0;\n        // if this._parent is null, then so is this._parents, and we\n        // don't have to remove ourselves from any parent subscriptions.\n        while (_parent) {\n            _parent.remove(this);\n            // if this._parents is null or index >= len,\n            // then _parent is set to null, and the loop exits\n            _parent = ++index < len && _parents[index] || null;\n        }\n        if (isFunction_1.isFunction(_unsubscribe)) {\n            var trial = tryCatch_1.tryCatch(_unsubscribe).call(this);\n            if (trial === errorObject_1.errorObject) {\n                hasErrors = true;\n                errors = errors || (errorObject_1.errorObject.e instanceof UnsubscriptionError_1.UnsubscriptionError ?\n                    flattenUnsubscriptionErrors(errorObject_1.errorObject.e.errors) : [errorObject_1.errorObject.e]);\n            }\n        }\n        if (isArray_1.isArray(_subscriptions)) {\n            index = -1;\n            len = _subscriptions.length;\n            while (++index < len) {\n                var sub = _subscriptions[index];\n                if (isObject_1.isObject(sub)) {\n                    var trial = tryCatch_1.tryCatch(sub.unsubscribe).call(sub);\n                    if (trial === errorObject_1.errorObject) {\n                        hasErrors = true;\n                        errors = errors || [];\n                        var err = errorObject_1.errorObject.e;\n                        if (err instanceof UnsubscriptionError_1.UnsubscriptionError) {\n                            errors = errors.concat(flattenUnsubscriptionErrors(err.errors));\n                        }\n                        else {\n                            errors.push(err);\n                        }\n                    }\n                }\n            }\n        }\n        if (hasErrors) {\n            throw new UnsubscriptionError_1.UnsubscriptionError(errors);\n        }\n    };\n    /**\n     * Adds a tear down to be called during the unsubscribe() of this\n     * Subscription.\n     *\n     * If the tear down being added is a subscription that is already\n     * unsubscribed, is the same reference `add` is being called on, or is\n     * `Subscription.EMPTY`, it will not be added.\n     *\n     * If this subscription is already in an `closed` state, the passed\n     * tear down logic will be executed immediately.\n     *\n     * @param {TeardownLogic} teardown The additional logic to execute on\n     * teardown.\n     * @return {Subscription} Returns the Subscription used or created to be\n     * added to the inner subscriptions list. This Subscription can be used with\n     * `remove()` to remove the passed teardown logic from the inner subscriptions\n     * list.\n     */\n    Subscription.prototype.add = function (teardown) {\n        if (!teardown || (teardown === Subscription.EMPTY)) {\n            return Subscription.EMPTY;\n        }\n        if (teardown === this) {\n            return this;\n        }\n        var subscription = teardown;\n        switch (typeof teardown) {\n            case 'function':\n                subscription = new Subscription(teardown);\n            case 'object':\n                if (subscription.closed || typeof subscription.unsubscribe !== 'function') {\n                    return subscription;\n                }\n                else if (this.closed) {\n                    subscription.unsubscribe();\n                    return subscription;\n                }\n                else if (typeof subscription._addParent !== 'function' /* quack quack */) {\n                    var tmp = subscription;\n                    subscription = new Subscription();\n                    subscription._subscriptions = [tmp];\n                }\n                break;\n            default:\n                throw new Error('unrecognized teardown ' + teardown + ' added to Subscription.');\n        }\n        var subscriptions = this._subscriptions || (this._subscriptions = []);\n        subscriptions.push(subscription);\n        subscription._addParent(this);\n        return subscription;\n    };\n    /**\n     * Removes a Subscription from the internal list of subscriptions that will\n     * unsubscribe during the unsubscribe process of this Subscription.\n     * @param {Subscription} subscription The subscription to remove.\n     * @return {void}\n     */\n    Subscription.prototype.remove = function (subscription) {\n        var subscriptions = this._subscriptions;\n        if (subscriptions) {\n            var subscriptionIndex = subscriptions.indexOf(subscription);\n            if (subscriptionIndex !== -1) {\n                subscriptions.splice(subscriptionIndex, 1);\n            }\n        }\n    };\n    Subscription.prototype._addParent = function (parent) {\n        var _a = this, _parent = _a._parent, _parents = _a._parents;\n        if (!_parent || _parent === parent) {\n            // If we don't have a parent, or the new parent is the same as the\n            // current parent, then set this._parent to the new parent.\n            this._parent = parent;\n        }\n        else if (!_parents) {\n            // If there's already one parent, but not multiple, allocate an Array to\n            // store the rest of the parent Subscriptions.\n            this._parents = [parent];\n        }\n        else if (_parents.indexOf(parent) === -1) {\n            // Only add the new parent to the _parents list if it's not already there.\n            _parents.push(parent);\n        }\n    };\n    Subscription.EMPTY = (function (empty) {\n        empty.closed = true;\n        return empty;\n    }(new Subscription()));\n    return Subscription;\n}());\nexports.Subscription = Subscription;\nfunction flattenUnsubscriptionErrors(errors) {\n    return errors.reduce(function (errs, err) { return errs.concat((err instanceof UnsubscriptionError_1.UnsubscriptionError) ? err.errors : err); }, []);\n}\n//# sourceMappingURL=Subscription.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/Subscription.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/observable/from.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/add/observable/from.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar from_1 = __webpack_require__(/*! ../../observable/from */ \"./node_modules/rxjs/observable/from.js\");\nObservable_1.Observable.from = from_1.from;\n//# sourceMappingURL=from.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/observable/from.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/observable/fromEvent.js":
/*!*******************************************************!*\
  !*** ./node_modules/rxjs/add/observable/fromEvent.js ***!
  \*******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar fromEvent_1 = __webpack_require__(/*! ../../observable/fromEvent */ \"./node_modules/rxjs/observable/fromEvent.js\");\nObservable_1.Observable.fromEvent = fromEvent_1.fromEvent;\n//# sourceMappingURL=fromEvent.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/observable/fromEvent.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/observable/fromPromise.js":
/*!*********************************************************!*\
  !*** ./node_modules/rxjs/add/observable/fromPromise.js ***!
  \*********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar fromPromise_1 = __webpack_require__(/*! ../../observable/fromPromise */ \"./node_modules/rxjs/observable/fromPromise.js\");\nObservable_1.Observable.fromPromise = fromPromise_1.fromPromise;\n//# sourceMappingURL=fromPromise.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/observable/fromPromise.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/observable/interval.js":
/*!******************************************************!*\
  !*** ./node_modules/rxjs/add/observable/interval.js ***!
  \******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar interval_1 = __webpack_require__(/*! ../../observable/interval */ \"./node_modules/rxjs/observable/interval.js\");\nObservable_1.Observable.interval = interval_1.interval;\n//# sourceMappingURL=interval.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/observable/interval.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/observable/of.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/add/observable/of.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar of_1 = __webpack_require__(/*! ../../observable/of */ \"./node_modules/rxjs/observable/of.js\");\nObservable_1.Observable.of = of_1.of;\n//# sourceMappingURL=of.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/observable/of.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/observable/zip.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/add/observable/zip.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar zip_1 = __webpack_require__(/*! ../../observable/zip */ \"./node_modules/rxjs/observable/zip.js\");\nObservable_1.Observable.zip = zip_1.zip;\n//# sourceMappingURL=zip.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/observable/zip.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/buffer.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/add/operator/buffer.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar buffer_1 = __webpack_require__(/*! ../../operator/buffer */ \"./node_modules/rxjs/operator/buffer.js\");\nObservable_1.Observable.prototype.buffer = buffer_1.buffer;\n//# sourceMappingURL=buffer.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/buffer.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/catch.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/add/operator/catch.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar catch_1 = __webpack_require__(/*! ../../operator/catch */ \"./node_modules/rxjs/operator/catch.js\");\nObservable_1.Observable.prototype.catch = catch_1._catch;\nObservable_1.Observable.prototype._catch = catch_1._catch;\n//# sourceMappingURL=catch.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/catch.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/concat.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/add/operator/concat.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar concat_1 = __webpack_require__(/*! ../../operator/concat */ \"./node_modules/rxjs/operator/concat.js\");\nObservable_1.Observable.prototype.concat = concat_1.concat;\n//# sourceMappingURL=concat.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/concat.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/concatMap.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/add/operator/concatMap.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar concatMap_1 = __webpack_require__(/*! ../../operator/concatMap */ \"./node_modules/rxjs/operator/concatMap.js\");\nObservable_1.Observable.prototype.concatMap = concatMap_1.concatMap;\n//# sourceMappingURL=concatMap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/concatMap.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/debounce.js":
/*!****************************************************!*\
  !*** ./node_modules/rxjs/add/operator/debounce.js ***!
  \****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar debounce_1 = __webpack_require__(/*! ../../operator/debounce */ \"./node_modules/rxjs/operator/debounce.js\");\nObservable_1.Observable.prototype.debounce = debounce_1.debounce;\n//# sourceMappingURL=debounce.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/debounce.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/debounceTime.js":
/*!********************************************************!*\
  !*** ./node_modules/rxjs/add/operator/debounceTime.js ***!
  \********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar debounceTime_1 = __webpack_require__(/*! ../../operator/debounceTime */ \"./node_modules/rxjs/operator/debounceTime.js\");\nObservable_1.Observable.prototype.debounceTime = debounceTime_1.debounceTime;\n//# sourceMappingURL=debounceTime.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/debounceTime.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/delay.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/add/operator/delay.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar delay_1 = __webpack_require__(/*! ../../operator/delay */ \"./node_modules/rxjs/operator/delay.js\");\nObservable_1.Observable.prototype.delay = delay_1.delay;\n//# sourceMappingURL=delay.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/delay.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/distinctUntilChanged.js":
/*!****************************************************************!*\
  !*** ./node_modules/rxjs/add/operator/distinctUntilChanged.js ***!
  \****************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar distinctUntilChanged_1 = __webpack_require__(/*! ../../operator/distinctUntilChanged */ \"./node_modules/rxjs/operator/distinctUntilChanged.js\");\nObservable_1.Observable.prototype.distinctUntilChanged = distinctUntilChanged_1.distinctUntilChanged;\n//# sourceMappingURL=distinctUntilChanged.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/distinctUntilChanged.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/do.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/add/operator/do.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar do_1 = __webpack_require__(/*! ../../operator/do */ \"./node_modules/rxjs/operator/do.js\");\nObservable_1.Observable.prototype.do = do_1._do;\nObservable_1.Observable.prototype._do = do_1._do;\n//# sourceMappingURL=do.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/do.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/filter.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/add/operator/filter.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar filter_1 = __webpack_require__(/*! ../../operator/filter */ \"./node_modules/rxjs/operator/filter.js\");\nObservable_1.Observable.prototype.filter = filter_1.filter;\n//# sourceMappingURL=filter.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/filter.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/finally.js":
/*!***************************************************!*\
  !*** ./node_modules/rxjs/add/operator/finally.js ***!
  \***************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar finally_1 = __webpack_require__(/*! ../../operator/finally */ \"./node_modules/rxjs/operator/finally.js\");\nObservable_1.Observable.prototype.finally = finally_1._finally;\nObservable_1.Observable.prototype._finally = finally_1._finally;\n//# sourceMappingURL=finally.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/finally.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/last.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/add/operator/last.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar last_1 = __webpack_require__(/*! ../../operator/last */ \"./node_modules/rxjs/operator/last.js\");\nObservable_1.Observable.prototype.last = last_1.last;\n//# sourceMappingURL=last.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/last.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/map.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/add/operator/map.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar map_1 = __webpack_require__(/*! ../../operator/map */ \"./node_modules/rxjs/operator/map.js\");\nObservable_1.Observable.prototype.map = map_1.map;\n//# sourceMappingURL=map.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/map.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/merge.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/add/operator/merge.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar merge_1 = __webpack_require__(/*! ../../operator/merge */ \"./node_modules/rxjs/operator/merge.js\");\nObservable_1.Observable.prototype.merge = merge_1.merge;\n//# sourceMappingURL=merge.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/merge.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/mergeMap.js":
/*!****************************************************!*\
  !*** ./node_modules/rxjs/add/operator/mergeMap.js ***!
  \****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar mergeMap_1 = __webpack_require__(/*! ../../operator/mergeMap */ \"./node_modules/rxjs/operator/mergeMap.js\");\nObservable_1.Observable.prototype.mergeMap = mergeMap_1.mergeMap;\nObservable_1.Observable.prototype.flatMap = mergeMap_1.mergeMap;\n//# sourceMappingURL=mergeMap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/mergeMap.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/race.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/add/operator/race.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar race_1 = __webpack_require__(/*! ../../operator/race */ \"./node_modules/rxjs/operator/race.js\");\nObservable_1.Observable.prototype.race = race_1.race;\n//# sourceMappingURL=race.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/race.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/skip.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/add/operator/skip.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar skip_1 = __webpack_require__(/*! ../../operator/skip */ \"./node_modules/rxjs/operator/skip.js\");\nObservable_1.Observable.prototype.skip = skip_1.skip;\n//# sourceMappingURL=skip.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/skip.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/startWith.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/add/operator/startWith.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar startWith_1 = __webpack_require__(/*! ../../operator/startWith */ \"./node_modules/rxjs/operator/startWith.js\");\nObservable_1.Observable.prototype.startWith = startWith_1.startWith;\n//# sourceMappingURL=startWith.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/startWith.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/take.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/add/operator/take.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar take_1 = __webpack_require__(/*! ../../operator/take */ \"./node_modules/rxjs/operator/take.js\");\nObservable_1.Observable.prototype.take = take_1.take;\n//# sourceMappingURL=take.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/take.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/takeUntil.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/add/operator/takeUntil.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar takeUntil_1 = __webpack_require__(/*! ../../operator/takeUntil */ \"./node_modules/rxjs/operator/takeUntil.js\");\nObservable_1.Observable.prototype.takeUntil = takeUntil_1.takeUntil;\n//# sourceMappingURL=takeUntil.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/takeUntil.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/toArray.js":
/*!***************************************************!*\
  !*** ./node_modules/rxjs/add/operator/toArray.js ***!
  \***************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar toArray_1 = __webpack_require__(/*! ../../operator/toArray */ \"./node_modules/rxjs/operator/toArray.js\");\nObservable_1.Observable.prototype.toArray = toArray_1.toArray;\n//# sourceMappingURL=toArray.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/toArray.js?");

/***/ }),

/***/ "./node_modules/rxjs/add/operator/toPromise.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/add/operator/toPromise.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("// HACK: does nothing, because `toPromise` now lives on the `Observable` itself.\n// leaving this module here to prevent breakage.\n//# sourceMappingURL=toPromise.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/add/operator/toPromise.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/ArrayLikeObservable.js":
/*!*************************************************************!*\
  !*** ./node_modules/rxjs/observable/ArrayLikeObservable.js ***!
  \*************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar ScalarObservable_1 = __webpack_require__(/*! ./ScalarObservable */ \"./node_modules/rxjs/observable/ScalarObservable.js\");\nvar EmptyObservable_1 = __webpack_require__(/*! ./EmptyObservable */ \"./node_modules/rxjs/observable/EmptyObservable.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar ArrayLikeObservable = (function (_super) {\n    __extends(ArrayLikeObservable, _super);\n    function ArrayLikeObservable(arrayLike, scheduler) {\n        _super.call(this);\n        this.arrayLike = arrayLike;\n        this.scheduler = scheduler;\n        if (!scheduler && arrayLike.length === 1) {\n            this._isScalar = true;\n            this.value = arrayLike[0];\n        }\n    }\n    ArrayLikeObservable.create = function (arrayLike, scheduler) {\n        var length = arrayLike.length;\n        if (length === 0) {\n            return new EmptyObservable_1.EmptyObservable();\n        }\n        else if (length === 1) {\n            return new ScalarObservable_1.ScalarObservable(arrayLike[0], scheduler);\n        }\n        else {\n            return new ArrayLikeObservable(arrayLike, scheduler);\n        }\n    };\n    ArrayLikeObservable.dispatch = function (state) {\n        var arrayLike = state.arrayLike, index = state.index, length = state.length, subscriber = state.subscriber;\n        if (subscriber.closed) {\n            return;\n        }\n        if (index >= length) {\n            subscriber.complete();\n            return;\n        }\n        subscriber.next(arrayLike[index]);\n        state.index = index + 1;\n        this.schedule(state);\n    };\n    /** @deprecated internal use only */ ArrayLikeObservable.prototype._subscribe = function (subscriber) {\n        var index = 0;\n        var _a = this, arrayLike = _a.arrayLike, scheduler = _a.scheduler;\n        var length = arrayLike.length;\n        if (scheduler) {\n            return scheduler.schedule(ArrayLikeObservable.dispatch, 0, {\n                arrayLike: arrayLike, index: index, length: length, subscriber: subscriber\n            });\n        }\n        else {\n            for (var i = 0; i < length && !subscriber.closed; i++) {\n                subscriber.next(arrayLike[i]);\n            }\n            subscriber.complete();\n        }\n    };\n    return ArrayLikeObservable;\n}(Observable_1.Observable));\nexports.ArrayLikeObservable = ArrayLikeObservable;\n//# sourceMappingURL=ArrayLikeObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/ArrayLikeObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/ArrayObservable.js":
/*!*********************************************************!*\
  !*** ./node_modules/rxjs/observable/ArrayObservable.js ***!
  \*********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar ScalarObservable_1 = __webpack_require__(/*! ./ScalarObservable */ \"./node_modules/rxjs/observable/ScalarObservable.js\");\nvar EmptyObservable_1 = __webpack_require__(/*! ./EmptyObservable */ \"./node_modules/rxjs/observable/EmptyObservable.js\");\nvar isScheduler_1 = __webpack_require__(/*! ../util/isScheduler */ \"./node_modules/rxjs/util/isScheduler.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar ArrayObservable = (function (_super) {\n    __extends(ArrayObservable, _super);\n    function ArrayObservable(array, scheduler) {\n        _super.call(this);\n        this.array = array;\n        this.scheduler = scheduler;\n        if (!scheduler && array.length === 1) {\n            this._isScalar = true;\n            this.value = array[0];\n        }\n    }\n    ArrayObservable.create = function (array, scheduler) {\n        return new ArrayObservable(array, scheduler);\n    };\n    /**\n     * Creates an Observable that emits some values you specify as arguments,\n     * immediately one after the other, and then emits a complete notification.\n     *\n     * <span class=\"informal\">Emits the arguments you provide, then completes.\n     * </span>\n     *\n     * <img src=\"./img/of.png\" width=\"100%\">\n     *\n     * This static operator is useful for creating a simple Observable that only\n     * emits the arguments given, and the complete notification thereafter. It can\n     * be used for composing with other Observables, such as with {@link concat}.\n     * By default, it uses a `null` IScheduler, which means the `next`\n     * notifications are sent synchronously, although with a different IScheduler\n     * it is possible to determine when those notifications will be delivered.\n     *\n     * @example <caption>Emit 10, 20, 30, then 'a', 'b', 'c', then start ticking every second.</caption>\n     * var numbers = Rx.Observable.of(10, 20, 30);\n     * var letters = Rx.Observable.of('a', 'b', 'c');\n     * var interval = Rx.Observable.interval(1000);\n     * var result = numbers.concat(letters).concat(interval);\n     * result.subscribe(x => console.log(x));\n     *\n     * @see {@link create}\n     * @see {@link empty}\n     * @see {@link never}\n     * @see {@link throw}\n     *\n     * @param {...T} values Arguments that represent `next` values to be emitted.\n     * @param {Scheduler} [scheduler] A {@link IScheduler} to use for scheduling\n     * the emissions of the `next` notifications.\n     * @return {Observable<T>} An Observable that emits each given input value.\n     * @static true\n     * @name of\n     * @owner Observable\n     */\n    ArrayObservable.of = function () {\n        var array = [];\n        for (var _i = 0; _i < arguments.length; _i++) {\n            array[_i - 0] = arguments[_i];\n        }\n        var scheduler = array[array.length - 1];\n        if (isScheduler_1.isScheduler(scheduler)) {\n            array.pop();\n        }\n        else {\n            scheduler = null;\n        }\n        var len = array.length;\n        if (len > 1) {\n            return new ArrayObservable(array, scheduler);\n        }\n        else if (len === 1) {\n            return new ScalarObservable_1.ScalarObservable(array[0], scheduler);\n        }\n        else {\n            return new EmptyObservable_1.EmptyObservable(scheduler);\n        }\n    };\n    ArrayObservable.dispatch = function (state) {\n        var array = state.array, index = state.index, count = state.count, subscriber = state.subscriber;\n        if (index >= count) {\n            subscriber.complete();\n            return;\n        }\n        subscriber.next(array[index]);\n        if (subscriber.closed) {\n            return;\n        }\n        state.index = index + 1;\n        this.schedule(state);\n    };\n    /** @deprecated internal use only */ ArrayObservable.prototype._subscribe = function (subscriber) {\n        var index = 0;\n        var array = this.array;\n        var count = array.length;\n        var scheduler = this.scheduler;\n        if (scheduler) {\n            return scheduler.schedule(ArrayObservable.dispatch, 0, {\n                array: array, index: index, count: count, subscriber: subscriber\n            });\n        }\n        else {\n            for (var i = 0; i < count && !subscriber.closed; i++) {\n                subscriber.next(array[i]);\n            }\n            subscriber.complete();\n        }\n    };\n    return ArrayObservable;\n}(Observable_1.Observable));\nexports.ArrayObservable = ArrayObservable;\n//# sourceMappingURL=ArrayObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/ArrayObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/EmptyObservable.js":
/*!*********************************************************!*\
  !*** ./node_modules/rxjs/observable/EmptyObservable.js ***!
  \*********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar EmptyObservable = (function (_super) {\n    __extends(EmptyObservable, _super);\n    function EmptyObservable(scheduler) {\n        _super.call(this);\n        this.scheduler = scheduler;\n    }\n    /**\n     * Creates an Observable that emits no items to the Observer and immediately\n     * emits a complete notification.\n     *\n     * <span class=\"informal\">Just emits 'complete', and nothing else.\n     * </span>\n     *\n     * <img src=\"./img/empty.png\" width=\"100%\">\n     *\n     * This static operator is useful for creating a simple Observable that only\n     * emits the complete notification. It can be used for composing with other\n     * Observables, such as in a {@link mergeMap}.\n     *\n     * @example <caption>Emit the number 7, then complete.</caption>\n     * var result = Rx.Observable.empty().startWith(7);\n     * result.subscribe(x => console.log(x));\n     *\n     * @example <caption>Map and flatten only odd numbers to the sequence 'a', 'b', 'c'</caption>\n     * var interval = Rx.Observable.interval(1000);\n     * var result = interval.mergeMap(x =>\n     *   x % 2 === 1 ? Rx.Observable.of('a', 'b', 'c') : Rx.Observable.empty()\n     * );\n     * result.subscribe(x => console.log(x));\n     *\n     * // Results in the following to the console:\n     * // x is equal to the count on the interval eg(0,1,2,3,...)\n     * // x will occur every 1000ms\n     * // if x % 2 is equal to 1 print abc\n     * // if x % 2 is not equal to 1 nothing will be output\n     *\n     * @see {@link create}\n     * @see {@link never}\n     * @see {@link of}\n     * @see {@link throw}\n     *\n     * @param {Scheduler} [scheduler] A {@link IScheduler} to use for scheduling\n     * the emission of the complete notification.\n     * @return {Observable} An \"empty\" Observable: emits only the complete\n     * notification.\n     * @static true\n     * @name empty\n     * @owner Observable\n     */\n    EmptyObservable.create = function (scheduler) {\n        return new EmptyObservable(scheduler);\n    };\n    EmptyObservable.dispatch = function (arg) {\n        var subscriber = arg.subscriber;\n        subscriber.complete();\n    };\n    /** @deprecated internal use only */ EmptyObservable.prototype._subscribe = function (subscriber) {\n        var scheduler = this.scheduler;\n        if (scheduler) {\n            return scheduler.schedule(EmptyObservable.dispatch, 0, { subscriber: subscriber });\n        }\n        else {\n            subscriber.complete();\n        }\n    };\n    return EmptyObservable;\n}(Observable_1.Observable));\nexports.EmptyObservable = EmptyObservable;\n//# sourceMappingURL=EmptyObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/EmptyObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/FromEventObservable.js":
/*!*************************************************************!*\
  !*** ./node_modules/rxjs/observable/FromEventObservable.js ***!
  \*************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar tryCatch_1 = __webpack_require__(/*! ../util/tryCatch */ \"./node_modules/rxjs/util/tryCatch.js\");\nvar isFunction_1 = __webpack_require__(/*! ../util/isFunction */ \"./node_modules/rxjs/util/isFunction.js\");\nvar errorObject_1 = __webpack_require__(/*! ../util/errorObject */ \"./node_modules/rxjs/util/errorObject.js\");\nvar Subscription_1 = __webpack_require__(/*! ../Subscription */ \"./node_modules/rxjs/Subscription.js\");\nvar toString = Object.prototype.toString;\nfunction isNodeStyleEventEmitter(sourceObj) {\n    return !!sourceObj && typeof sourceObj.addListener === 'function' && typeof sourceObj.removeListener === 'function';\n}\nfunction isJQueryStyleEventEmitter(sourceObj) {\n    return !!sourceObj && typeof sourceObj.on === 'function' && typeof sourceObj.off === 'function';\n}\nfunction isNodeList(sourceObj) {\n    return !!sourceObj && toString.call(sourceObj) === '[object NodeList]';\n}\nfunction isHTMLCollection(sourceObj) {\n    return !!sourceObj && toString.call(sourceObj) === '[object HTMLCollection]';\n}\nfunction isEventTarget(sourceObj) {\n    return !!sourceObj && typeof sourceObj.addEventListener === 'function' && typeof sourceObj.removeEventListener === 'function';\n}\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar FromEventObservable = (function (_super) {\n    __extends(FromEventObservable, _super);\n    function FromEventObservable(sourceObj, eventName, selector, options) {\n        _super.call(this);\n        this.sourceObj = sourceObj;\n        this.eventName = eventName;\n        this.selector = selector;\n        this.options = options;\n    }\n    /* tslint:enable:max-line-length */\n    /**\n     * Creates an Observable that emits events of a specific type coming from the\n     * given event target.\n     *\n     * <span class=\"informal\">Creates an Observable from DOM events, or Node.js\n     * EventEmitter events or others.</span>\n     *\n     * <img src=\"./img/fromEvent.png\" width=\"100%\">\n     *\n     * `fromEvent` accepts as a first argument event target, which is an object with methods\n     * for registering event handler functions. As a second argument it takes string that indicates\n     * type of event we want to listen for. `fromEvent` supports selected types of event targets,\n     * which are described in detail below. If your event target does not match any of the ones listed,\n     * you should use {@link fromEventPattern}, which can be used on arbitrary APIs.\n     * When it comes to APIs supported by `fromEvent`, their methods for adding and removing event\n     * handler functions have different names, but they all accept a string describing event type\n     * and function itself, which will be called whenever said event happens.\n     *\n     * Every time resulting Observable is subscribed, event handler function will be registered\n     * to event target on given event type. When that event fires, value\n     * passed as a first argument to registered function will be emitted by output Observable.\n     * When Observable is unsubscribed, function will be unregistered from event target.\n     *\n     * Note that if event target calls registered function with more than one argument, second\n     * and following arguments will not appear in resulting stream. In order to get access to them,\n     * you can pass to `fromEvent` optional project function, which will be called with all arguments\n     * passed to event handler. Output Observable will then emit value returned by project function,\n     * instead of the usual value.\n     *\n     * Remember that event targets listed below are checked via duck typing. It means that\n     * no matter what kind of object you have and no matter what environment you work in,\n     * you can safely use `fromEvent` on that object if it exposes described methods (provided\n     * of course they behave as was described above). So for example if Node.js library exposes\n     * event target which has the same method names as DOM EventTarget, `fromEvent` is still\n     * a good choice.\n     *\n     * If the API you use is more callback then event handler oriented (subscribed\n     * callback function fires only once and thus there is no need to manually\n     * unregister it), you should use {@link bindCallback} or {@link bindNodeCallback}\n     * instead.\n     *\n     * `fromEvent` supports following types of event targets:\n     *\n     * **DOM EventTarget**\n     *\n     * This is an object with `addEventListener` and `removeEventListener` methods.\n     *\n     * In the browser, `addEventListener` accepts - apart from event type string and event\n     * handler function arguments - optional third parameter, which is either an object or boolean,\n     * both used for additional configuration how and when passed function will be called. When\n     * `fromEvent` is used with event target of that type, you can provide this values\n     * as third parameter as well.\n     *\n     * **Node.js EventEmitter**\n     *\n     * An object with `addListener` and `removeListener` methods.\n     *\n     * **JQuery-style event target**\n     *\n     * An object with `on` and `off` methods\n     *\n     * **DOM NodeList**\n     *\n     * List of DOM Nodes, returned for example by `document.querySelectorAll` or `Node.childNodes`.\n     *\n     * Although this collection is not event target in itself, `fromEvent` will iterate over all Nodes\n     * it contains and install event handler function in every of them. When returned Observable\n     * is unsubscribed, function will be removed from all Nodes.\n     *\n     * **DOM HtmlCollection**\n     *\n     * Just as in case of NodeList it is a collection of DOM nodes. Here as well event handler function is\n     * installed and removed in each of elements.\n     *\n     *\n     * @example <caption>Emits clicks happening on the DOM document</caption>\n     * var clicks = Rx.Observable.fromEvent(document, 'click');\n     * clicks.subscribe(x => console.log(x));\n     *\n     * // Results in:\n     * // MouseEvent object logged to console every time a click\n     * // occurs on the document.\n     *\n     *\n     * @example <caption>Use addEventListener with capture option</caption>\n     * var clicksInDocument = Rx.Observable.fromEvent(document, 'click', true); // note optional configuration parameter\n     *                                                                          // which will be passed to addEventListener\n     * var clicksInDiv = Rx.Observable.fromEvent(someDivInDocument, 'click');\n     *\n     * clicksInDocument.subscribe(() => console.log('document'));\n     * clicksInDiv.subscribe(() => console.log('div'));\n     *\n     * // By default events bubble UP in DOM tree, so normally\n     * // when we would click on div in document\n     * // \"div\" would be logged first and then \"document\".\n     * // Since we specified optional `capture` option, document\n     * // will catch event when it goes DOWN DOM tree, so console\n     * // will log \"document\" and then \"div\".\n     *\n     * @see {@link bindCallback}\n     * @see {@link bindNodeCallback}\n     * @see {@link fromEventPattern}\n     *\n     * @param {EventTargetLike} target The DOM EventTarget, Node.js\n     * EventEmitter, JQuery-like event target, NodeList or HTMLCollection to attach the event handler to.\n     * @param {string} eventName The event name of interest, being emitted by the\n     * `target`.\n     * @param {EventListenerOptions} [options] Options to pass through to addEventListener\n     * @param {SelectorMethodSignature<T>} [selector] An optional function to\n     * post-process results. It takes the arguments from the event handler and\n     * should return a single value.\n     * @return {Observable<T>}\n     * @static true\n     * @name fromEvent\n     * @owner Observable\n     */\n    FromEventObservable.create = function (target, eventName, options, selector) {\n        if (isFunction_1.isFunction(options)) {\n            selector = options;\n            options = undefined;\n        }\n        return new FromEventObservable(target, eventName, selector, options);\n    };\n    FromEventObservable.setupSubscription = function (sourceObj, eventName, handler, subscriber, options) {\n        var unsubscribe;\n        if (isNodeList(sourceObj) || isHTMLCollection(sourceObj)) {\n            for (var i = 0, len = sourceObj.length; i < len; i++) {\n                FromEventObservable.setupSubscription(sourceObj[i], eventName, handler, subscriber, options);\n            }\n        }\n        else if (isEventTarget(sourceObj)) {\n            var source_1 = sourceObj;\n            sourceObj.addEventListener(eventName, handler, options);\n            unsubscribe = function () { return source_1.removeEventListener(eventName, handler, options); };\n        }\n        else if (isJQueryStyleEventEmitter(sourceObj)) {\n            var source_2 = sourceObj;\n            sourceObj.on(eventName, handler);\n            unsubscribe = function () { return source_2.off(eventName, handler); };\n        }\n        else if (isNodeStyleEventEmitter(sourceObj)) {\n            var source_3 = sourceObj;\n            sourceObj.addListener(eventName, handler);\n            unsubscribe = function () { return source_3.removeListener(eventName, handler); };\n        }\n        else {\n            throw new TypeError('Invalid event target');\n        }\n        subscriber.add(new Subscription_1.Subscription(unsubscribe));\n    };\n    /** @deprecated internal use only */ FromEventObservable.prototype._subscribe = function (subscriber) {\n        var sourceObj = this.sourceObj;\n        var eventName = this.eventName;\n        var options = this.options;\n        var selector = this.selector;\n        var handler = selector ? function () {\n            var args = [];\n            for (var _i = 0; _i < arguments.length; _i++) {\n                args[_i - 0] = arguments[_i];\n            }\n            var result = tryCatch_1.tryCatch(selector).apply(void 0, args);\n            if (result === errorObject_1.errorObject) {\n                subscriber.error(errorObject_1.errorObject.e);\n            }\n            else {\n                subscriber.next(result);\n            }\n        } : function (e) { return subscriber.next(e); };\n        FromEventObservable.setupSubscription(sourceObj, eventName, handler, subscriber, options);\n    };\n    return FromEventObservable;\n}(Observable_1.Observable));\nexports.FromEventObservable = FromEventObservable;\n//# sourceMappingURL=FromEventObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/FromEventObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/FromObservable.js":
/*!********************************************************!*\
  !*** ./node_modules/rxjs/observable/FromObservable.js ***!
  \********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar isArray_1 = __webpack_require__(/*! ../util/isArray */ \"./node_modules/rxjs/util/isArray.js\");\nvar isArrayLike_1 = __webpack_require__(/*! ../util/isArrayLike */ \"./node_modules/rxjs/util/isArrayLike.js\");\nvar isPromise_1 = __webpack_require__(/*! ../util/isPromise */ \"./node_modules/rxjs/util/isPromise.js\");\nvar PromiseObservable_1 = __webpack_require__(/*! ./PromiseObservable */ \"./node_modules/rxjs/observable/PromiseObservable.js\");\nvar IteratorObservable_1 = __webpack_require__(/*! ./IteratorObservable */ \"./node_modules/rxjs/observable/IteratorObservable.js\");\nvar ArrayObservable_1 = __webpack_require__(/*! ./ArrayObservable */ \"./node_modules/rxjs/observable/ArrayObservable.js\");\nvar ArrayLikeObservable_1 = __webpack_require__(/*! ./ArrayLikeObservable */ \"./node_modules/rxjs/observable/ArrayLikeObservable.js\");\nvar iterator_1 = __webpack_require__(/*! ../symbol/iterator */ \"./node_modules/rxjs/symbol/iterator.js\");\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar observeOn_1 = __webpack_require__(/*! ../operators/observeOn */ \"./node_modules/rxjs/operators/observeOn.js\");\nvar observable_1 = __webpack_require__(/*! ../symbol/observable */ \"./node_modules/rxjs/symbol/observable.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar FromObservable = (function (_super) {\n    __extends(FromObservable, _super);\n    function FromObservable(ish, scheduler) {\n        _super.call(this, null);\n        this.ish = ish;\n        this.scheduler = scheduler;\n    }\n    /**\n     * Creates an Observable from an Array, an array-like object, a Promise, an\n     * iterable object, or an Observable-like object.\n     *\n     * <span class=\"informal\">Converts almost anything to an Observable.</span>\n     *\n     * <img src=\"./img/from.png\" width=\"100%\">\n     *\n     * Convert various other objects and data types into Observables. `from`\n     * converts a Promise or an array-like or an\n     * [iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#iterable)\n     * object into an Observable that emits the items in that promise or array or\n     * iterable. A String, in this context, is treated as an array of characters.\n     * Observable-like objects (contains a function named with the ES2015 Symbol\n     * for Observable) can also be converted through this operator.\n     *\n     * @example <caption>Converts an array to an Observable</caption>\n     * var array = [10, 20, 30];\n     * var result = Rx.Observable.from(array);\n     * result.subscribe(x => console.log(x));\n     *\n     * // Results in the following:\n     * // 10 20 30\n     *\n     * @example <caption>Convert an infinite iterable (from a generator) to an Observable</caption>\n     * function* generateDoubles(seed) {\n     *   var i = seed;\n     *   while (true) {\n     *     yield i;\n     *     i = 2 * i; // double it\n     *   }\n     * }\n     *\n     * var iterator = generateDoubles(3);\n     * var result = Rx.Observable.from(iterator).take(10);\n     * result.subscribe(x => console.log(x));\n     *\n     * // Results in the following:\n     * // 3 6 12 24 48 96 192 384 768 1536\n     *\n     * @see {@link create}\n     * @see {@link fromEvent}\n     * @see {@link fromEventPattern}\n     * @see {@link fromPromise}\n     *\n     * @param {ObservableInput<T>} ish A subscribable object, a Promise, an\n     * Observable-like, an Array, an iterable or an array-like object to be\n     * converted.\n     * @param {Scheduler} [scheduler] The scheduler on which to schedule the\n     * emissions of values.\n     * @return {Observable<T>} The Observable whose values are originally from the\n     * input object that was converted.\n     * @static true\n     * @name from\n     * @owner Observable\n     */\n    FromObservable.create = function (ish, scheduler) {\n        if (ish != null) {\n            if (typeof ish[observable_1.observable] === 'function') {\n                if (ish instanceof Observable_1.Observable && !scheduler) {\n                    return ish;\n                }\n                return new FromObservable(ish, scheduler);\n            }\n            else if (isArray_1.isArray(ish)) {\n                return new ArrayObservable_1.ArrayObservable(ish, scheduler);\n            }\n            else if (isPromise_1.isPromise(ish)) {\n                return new PromiseObservable_1.PromiseObservable(ish, scheduler);\n            }\n            else if (typeof ish[iterator_1.iterator] === 'function' || typeof ish === 'string') {\n                return new IteratorObservable_1.IteratorObservable(ish, scheduler);\n            }\n            else if (isArrayLike_1.isArrayLike(ish)) {\n                return new ArrayLikeObservable_1.ArrayLikeObservable(ish, scheduler);\n            }\n        }\n        throw new TypeError((ish !== null && typeof ish || ish) + ' is not observable');\n    };\n    /** @deprecated internal use only */ FromObservable.prototype._subscribe = function (subscriber) {\n        var ish = this.ish;\n        var scheduler = this.scheduler;\n        if (scheduler == null) {\n            return ish[observable_1.observable]().subscribe(subscriber);\n        }\n        else {\n            return ish[observable_1.observable]().subscribe(new observeOn_1.ObserveOnSubscriber(subscriber, scheduler, 0));\n        }\n    };\n    return FromObservable;\n}(Observable_1.Observable));\nexports.FromObservable = FromObservable;\n//# sourceMappingURL=FromObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/FromObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/IntervalObservable.js":
/*!************************************************************!*\
  !*** ./node_modules/rxjs/observable/IntervalObservable.js ***!
  \************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar isNumeric_1 = __webpack_require__(/*! ../util/isNumeric */ \"./node_modules/rxjs/util/isNumeric.js\");\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar async_1 = __webpack_require__(/*! ../scheduler/async */ \"./node_modules/rxjs/scheduler/async.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar IntervalObservable = (function (_super) {\n    __extends(IntervalObservable, _super);\n    function IntervalObservable(period, scheduler) {\n        if (period === void 0) { period = 0; }\n        if (scheduler === void 0) { scheduler = async_1.async; }\n        _super.call(this);\n        this.period = period;\n        this.scheduler = scheduler;\n        if (!isNumeric_1.isNumeric(period) || period < 0) {\n            this.period = 0;\n        }\n        if (!scheduler || typeof scheduler.schedule !== 'function') {\n            this.scheduler = async_1.async;\n        }\n    }\n    /**\n     * Creates an Observable that emits sequential numbers every specified\n     * interval of time, on a specified IScheduler.\n     *\n     * <span class=\"informal\">Emits incremental numbers periodically in time.\n     * </span>\n     *\n     * <img src=\"./img/interval.png\" width=\"100%\">\n     *\n     * `interval` returns an Observable that emits an infinite sequence of\n     * ascending integers, with a constant interval of time of your choosing\n     * between those emissions. The first emission is not sent immediately, but\n     * only after the first period has passed. By default, this operator uses the\n     * `async` IScheduler to provide a notion of time, but you may pass any\n     * IScheduler to it.\n     *\n     * @example <caption>Emits ascending numbers, one every second (1000ms)</caption>\n     * var numbers = Rx.Observable.interval(1000);\n     * numbers.subscribe(x => console.log(x));\n     *\n     * @see {@link timer}\n     * @see {@link delay}\n     *\n     * @param {number} [period=0] The interval size in milliseconds (by default)\n     * or the time unit determined by the scheduler's clock.\n     * @param {Scheduler} [scheduler=async] The IScheduler to use for scheduling\n     * the emission of values, and providing a notion of \"time\".\n     * @return {Observable} An Observable that emits a sequential number each time\n     * interval.\n     * @static true\n     * @name interval\n     * @owner Observable\n     */\n    IntervalObservable.create = function (period, scheduler) {\n        if (period === void 0) { period = 0; }\n        if (scheduler === void 0) { scheduler = async_1.async; }\n        return new IntervalObservable(period, scheduler);\n    };\n    IntervalObservable.dispatch = function (state) {\n        var index = state.index, subscriber = state.subscriber, period = state.period;\n        subscriber.next(index);\n        if (subscriber.closed) {\n            return;\n        }\n        state.index += 1;\n        this.schedule(state, period);\n    };\n    /** @deprecated internal use only */ IntervalObservable.prototype._subscribe = function (subscriber) {\n        var index = 0;\n        var period = this.period;\n        var scheduler = this.scheduler;\n        subscriber.add(scheduler.schedule(IntervalObservable.dispatch, period, {\n            index: index, subscriber: subscriber, period: period\n        }));\n    };\n    return IntervalObservable;\n}(Observable_1.Observable));\nexports.IntervalObservable = IntervalObservable;\n//# sourceMappingURL=IntervalObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/IntervalObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/IteratorObservable.js":
/*!************************************************************!*\
  !*** ./node_modules/rxjs/observable/IteratorObservable.js ***!
  \************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar root_1 = __webpack_require__(/*! ../util/root */ \"./node_modules/rxjs/util/root.js\");\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar iterator_1 = __webpack_require__(/*! ../symbol/iterator */ \"./node_modules/rxjs/symbol/iterator.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar IteratorObservable = (function (_super) {\n    __extends(IteratorObservable, _super);\n    function IteratorObservable(iterator, scheduler) {\n        _super.call(this);\n        this.scheduler = scheduler;\n        if (iterator == null) {\n            throw new Error('iterator cannot be null.');\n        }\n        this.iterator = getIterator(iterator);\n    }\n    IteratorObservable.create = function (iterator, scheduler) {\n        return new IteratorObservable(iterator, scheduler);\n    };\n    IteratorObservable.dispatch = function (state) {\n        var index = state.index, hasError = state.hasError, iterator = state.iterator, subscriber = state.subscriber;\n        if (hasError) {\n            subscriber.error(state.error);\n            return;\n        }\n        var result = iterator.next();\n        if (result.done) {\n            subscriber.complete();\n            return;\n        }\n        subscriber.next(result.value);\n        state.index = index + 1;\n        if (subscriber.closed) {\n            if (typeof iterator.return === 'function') {\n                iterator.return();\n            }\n            return;\n        }\n        this.schedule(state);\n    };\n    /** @deprecated internal use only */ IteratorObservable.prototype._subscribe = function (subscriber) {\n        var index = 0;\n        var _a = this, iterator = _a.iterator, scheduler = _a.scheduler;\n        if (scheduler) {\n            return scheduler.schedule(IteratorObservable.dispatch, 0, {\n                index: index, iterator: iterator, subscriber: subscriber\n            });\n        }\n        else {\n            do {\n                var result = iterator.next();\n                if (result.done) {\n                    subscriber.complete();\n                    break;\n                }\n                else {\n                    subscriber.next(result.value);\n                }\n                if (subscriber.closed) {\n                    if (typeof iterator.return === 'function') {\n                        iterator.return();\n                    }\n                    break;\n                }\n            } while (true);\n        }\n    };\n    return IteratorObservable;\n}(Observable_1.Observable));\nexports.IteratorObservable = IteratorObservable;\nvar StringIterator = (function () {\n    function StringIterator(str, idx, len) {\n        if (idx === void 0) { idx = 0; }\n        if (len === void 0) { len = str.length; }\n        this.str = str;\n        this.idx = idx;\n        this.len = len;\n    }\n    StringIterator.prototype[iterator_1.iterator] = function () { return (this); };\n    StringIterator.prototype.next = function () {\n        return this.idx < this.len ? {\n            done: false,\n            value: this.str.charAt(this.idx++)\n        } : {\n            done: true,\n            value: undefined\n        };\n    };\n    return StringIterator;\n}());\nvar ArrayIterator = (function () {\n    function ArrayIterator(arr, idx, len) {\n        if (idx === void 0) { idx = 0; }\n        if (len === void 0) { len = toLength(arr); }\n        this.arr = arr;\n        this.idx = idx;\n        this.len = len;\n    }\n    ArrayIterator.prototype[iterator_1.iterator] = function () { return this; };\n    ArrayIterator.prototype.next = function () {\n        return this.idx < this.len ? {\n            done: false,\n            value: this.arr[this.idx++]\n        } : {\n            done: true,\n            value: undefined\n        };\n    };\n    return ArrayIterator;\n}());\nfunction getIterator(obj) {\n    var i = obj[iterator_1.iterator];\n    if (!i && typeof obj === 'string') {\n        return new StringIterator(obj);\n    }\n    if (!i && obj.length !== undefined) {\n        return new ArrayIterator(obj);\n    }\n    if (!i) {\n        throw new TypeError('object is not iterable');\n    }\n    return obj[iterator_1.iterator]();\n}\nvar maxSafeInteger = Math.pow(2, 53) - 1;\nfunction toLength(o) {\n    var len = +o.length;\n    if (isNaN(len)) {\n        return 0;\n    }\n    if (len === 0 || !numberIsFinite(len)) {\n        return len;\n    }\n    len = sign(len) * Math.floor(Math.abs(len));\n    if (len <= 0) {\n        return 0;\n    }\n    if (len > maxSafeInteger) {\n        return maxSafeInteger;\n    }\n    return len;\n}\nfunction numberIsFinite(value) {\n    return typeof value === 'number' && root_1.root.isFinite(value);\n}\nfunction sign(value) {\n    var valueAsNumber = +value;\n    if (valueAsNumber === 0) {\n        return valueAsNumber;\n    }\n    if (isNaN(valueAsNumber)) {\n        return valueAsNumber;\n    }\n    return valueAsNumber < 0 ? -1 : 1;\n}\n//# sourceMappingURL=IteratorObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/IteratorObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/PromiseObservable.js":
/*!***********************************************************!*\
  !*** ./node_modules/rxjs/observable/PromiseObservable.js ***!
  \***********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar root_1 = __webpack_require__(/*! ../util/root */ \"./node_modules/rxjs/util/root.js\");\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar PromiseObservable = (function (_super) {\n    __extends(PromiseObservable, _super);\n    function PromiseObservable(promise, scheduler) {\n        _super.call(this);\n        this.promise = promise;\n        this.scheduler = scheduler;\n    }\n    /**\n     * Converts a Promise to an Observable.\n     *\n     * <span class=\"informal\">Returns an Observable that just emits the Promise's\n     * resolved value, then completes.</span>\n     *\n     * Converts an ES2015 Promise or a Promises/A+ spec compliant Promise to an\n     * Observable. If the Promise resolves with a value, the output Observable\n     * emits that resolved value as a `next`, and then completes. If the Promise\n     * is rejected, then the output Observable emits the corresponding Error.\n     *\n     * @example <caption>Convert the Promise returned by Fetch to an Observable</caption>\n     * var result = Rx.Observable.fromPromise(fetch('http://myserver.com/'));\n     * result.subscribe(x => console.log(x), e => console.error(e));\n     *\n     * @see {@link bindCallback}\n     * @see {@link from}\n     *\n     * @param {PromiseLike<T>} promise The promise to be converted.\n     * @param {Scheduler} [scheduler] An optional IScheduler to use for scheduling\n     * the delivery of the resolved value (or the rejection).\n     * @return {Observable<T>} An Observable which wraps the Promise.\n     * @static true\n     * @name fromPromise\n     * @owner Observable\n     */\n    PromiseObservable.create = function (promise, scheduler) {\n        return new PromiseObservable(promise, scheduler);\n    };\n    /** @deprecated internal use only */ PromiseObservable.prototype._subscribe = function (subscriber) {\n        var _this = this;\n        var promise = this.promise;\n        var scheduler = this.scheduler;\n        if (scheduler == null) {\n            if (this._isScalar) {\n                if (!subscriber.closed) {\n                    subscriber.next(this.value);\n                    subscriber.complete();\n                }\n            }\n            else {\n                promise.then(function (value) {\n                    _this.value = value;\n                    _this._isScalar = true;\n                    if (!subscriber.closed) {\n                        subscriber.next(value);\n                        subscriber.complete();\n                    }\n                }, function (err) {\n                    if (!subscriber.closed) {\n                        subscriber.error(err);\n                    }\n                })\n                    .then(null, function (err) {\n                    // escape the promise trap, throw unhandled errors\n                    root_1.root.setTimeout(function () { throw err; });\n                });\n            }\n        }\n        else {\n            if (this._isScalar) {\n                if (!subscriber.closed) {\n                    return scheduler.schedule(dispatchNext, 0, { value: this.value, subscriber: subscriber });\n                }\n            }\n            else {\n                promise.then(function (value) {\n                    _this.value = value;\n                    _this._isScalar = true;\n                    if (!subscriber.closed) {\n                        subscriber.add(scheduler.schedule(dispatchNext, 0, { value: value, subscriber: subscriber }));\n                    }\n                }, function (err) {\n                    if (!subscriber.closed) {\n                        subscriber.add(scheduler.schedule(dispatchError, 0, { err: err, subscriber: subscriber }));\n                    }\n                })\n                    .then(null, function (err) {\n                    // escape the promise trap, throw unhandled errors\n                    root_1.root.setTimeout(function () { throw err; });\n                });\n            }\n        }\n    };\n    return PromiseObservable;\n}(Observable_1.Observable));\nexports.PromiseObservable = PromiseObservable;\nfunction dispatchNext(arg) {\n    var value = arg.value, subscriber = arg.subscriber;\n    if (!subscriber.closed) {\n        subscriber.next(value);\n        subscriber.complete();\n    }\n}\nfunction dispatchError(arg) {\n    var err = arg.err, subscriber = arg.subscriber;\n    if (!subscriber.closed) {\n        subscriber.error(err);\n    }\n}\n//# sourceMappingURL=PromiseObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/PromiseObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/ScalarObservable.js":
/*!**********************************************************!*\
  !*** ./node_modules/rxjs/observable/ScalarObservable.js ***!
  \**********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @extends {Ignored}\n * @hide true\n */\nvar ScalarObservable = (function (_super) {\n    __extends(ScalarObservable, _super);\n    function ScalarObservable(value, scheduler) {\n        _super.call(this);\n        this.value = value;\n        this.scheduler = scheduler;\n        this._isScalar = true;\n        if (scheduler) {\n            this._isScalar = false;\n        }\n    }\n    ScalarObservable.create = function (value, scheduler) {\n        return new ScalarObservable(value, scheduler);\n    };\n    ScalarObservable.dispatch = function (state) {\n        var done = state.done, value = state.value, subscriber = state.subscriber;\n        if (done) {\n            subscriber.complete();\n            return;\n        }\n        subscriber.next(value);\n        if (subscriber.closed) {\n            return;\n        }\n        state.done = true;\n        this.schedule(state);\n    };\n    /** @deprecated internal use only */ ScalarObservable.prototype._subscribe = function (subscriber) {\n        var value = this.value;\n        var scheduler = this.scheduler;\n        if (scheduler) {\n            return scheduler.schedule(ScalarObservable.dispatch, 0, {\n                done: false, value: value, subscriber: subscriber\n            });\n        }\n        else {\n            subscriber.next(value);\n            if (!subscriber.closed) {\n                subscriber.complete();\n            }\n        }\n    };\n    return ScalarObservable;\n}(Observable_1.Observable));\nexports.ScalarObservable = ScalarObservable;\n//# sourceMappingURL=ScalarObservable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/ScalarObservable.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/concat.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/observable/concat.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar isScheduler_1 = __webpack_require__(/*! ../util/isScheduler */ \"./node_modules/rxjs/util/isScheduler.js\");\nvar of_1 = __webpack_require__(/*! ./of */ \"./node_modules/rxjs/observable/of.js\");\nvar from_1 = __webpack_require__(/*! ./from */ \"./node_modules/rxjs/observable/from.js\");\nvar concatAll_1 = __webpack_require__(/*! ../operators/concatAll */ \"./node_modules/rxjs/operators/concatAll.js\");\n/* tslint:enable:max-line-length */\n/**\n * Creates an output Observable which sequentially emits all values from given\n * Observable and then moves on to the next.\n *\n * <span class=\"informal\">Concatenates multiple Observables together by\n * sequentially emitting their values, one Observable after the other.</span>\n *\n * <img src=\"./img/concat.png\" width=\"100%\">\n *\n * `concat` joins multiple Observables together, by subscribing to them one at a time and\n * merging their results into the output Observable. You can pass either an array of\n * Observables, or put them directly as arguments. Passing an empty array will result\n * in Observable that completes immediately.\n *\n * `concat` will subscribe to first input Observable and emit all its values, without\n * changing or affecting them in any way. When that Observable completes, it will\n * subscribe to then next Observable passed and, again, emit its values. This will be\n * repeated, until the operator runs out of Observables. When last input Observable completes,\n * `concat` will complete as well. At any given moment only one Observable passed to operator\n * emits values. If you would like to emit values from passed Observables concurrently, check out\n * {@link merge} instead, especially with optional `concurrent` parameter. As a matter of fact,\n * `concat` is an equivalent of `merge` operator with `concurrent` parameter set to `1`.\n *\n * Note that if some input Observable never completes, `concat` will also never complete\n * and Observables following the one that did not complete will never be subscribed. On the other\n * hand, if some Observable simply completes immediately after it is subscribed, it will be\n * invisible for `concat`, which will just move on to the next Observable.\n *\n * If any Observable in chain errors, instead of passing control to the next Observable,\n * `concat` will error immediately as well. Observables that would be subscribed after\n * the one that emitted error, never will.\n *\n * If you pass to `concat` the same Observable many times, its stream of values\n * will be \"replayed\" on every subscription, which means you can repeat given Observable\n * as many times as you like. If passing the same Observable to `concat` 1000 times becomes tedious,\n * you can always use {@link repeat}.\n *\n * @example <caption>Concatenate a timer counting from 0 to 3 with a synchronous sequence from 1 to 10</caption>\n * var timer = Rx.Observable.interval(1000).take(4);\n * var sequence = Rx.Observable.range(1, 10);\n * var result = Rx.Observable.concat(timer, sequence);\n * result.subscribe(x => console.log(x));\n *\n * // results in:\n * // 0 -1000ms-> 1 -1000ms-> 2 -1000ms-> 3 -immediate-> 1 ... 10\n *\n *\n * @example <caption>Concatenate an array of 3 Observables</caption>\n * var timer1 = Rx.Observable.interval(1000).take(10);\n * var timer2 = Rx.Observable.interval(2000).take(6);\n * var timer3 = Rx.Observable.interval(500).take(10);\n * var result = Rx.Observable.concat([timer1, timer2, timer3]); // note that array is passed\n * result.subscribe(x => console.log(x));\n *\n * // results in the following:\n * // (Prints to console sequentially)\n * // -1000ms-> 0 -1000ms-> 1 -1000ms-> ... 9\n * // -2000ms-> 0 -2000ms-> 1 -2000ms-> ... 5\n * // -500ms-> 0 -500ms-> 1 -500ms-> ... 9\n *\n *\n * @example <caption>Concatenate the same Observable to repeat it</caption>\n * const timer = Rx.Observable.interval(1000).take(2);\n *\n * Rx.Observable.concat(timer, timer) // concating the same Observable!\n * .subscribe(\n *   value => console.log(value),\n *   err => {},\n *   () => console.log('...and it is done!')\n * );\n *\n * // Logs:\n * // 0 after 1s\n * // 1 after 2s\n * // 0 after 3s\n * // 1 after 4s\n * // \"...and it is done!\" also after 4s\n *\n * @see {@link concatAll}\n * @see {@link concatMap}\n * @see {@link concatMapTo}\n *\n * @param {ObservableInput} input1 An input Observable to concatenate with others.\n * @param {ObservableInput} input2 An input Observable to concatenate with others.\n * More than one input Observables may be given as argument.\n * @param {Scheduler} [scheduler=null] An optional IScheduler to schedule each\n * Observable subscription on.\n * @return {Observable} All values of each passed Observable merged into a\n * single Observable, in order, in serial fashion.\n * @static true\n * @name concat\n * @owner Observable\n */\nfunction concat() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    if (observables.length === 1 || (observables.length === 2 && isScheduler_1.isScheduler(observables[1]))) {\n        return from_1.from(observables[0]);\n    }\n    return concatAll_1.concatAll()(of_1.of.apply(void 0, observables));\n}\nexports.concat = concat;\n//# sourceMappingURL=concat.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/concat.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/from.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/observable/from.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar FromObservable_1 = __webpack_require__(/*! ./FromObservable */ \"./node_modules/rxjs/observable/FromObservable.js\");\nexports.from = FromObservable_1.FromObservable.create;\n//# sourceMappingURL=from.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/from.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/fromEvent.js":
/*!***************************************************!*\
  !*** ./node_modules/rxjs/observable/fromEvent.js ***!
  \***************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar FromEventObservable_1 = __webpack_require__(/*! ./FromEventObservable */ \"./node_modules/rxjs/observable/FromEventObservable.js\");\nexports.fromEvent = FromEventObservable_1.FromEventObservable.create;\n//# sourceMappingURL=fromEvent.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/fromEvent.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/fromPromise.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/observable/fromPromise.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar PromiseObservable_1 = __webpack_require__(/*! ./PromiseObservable */ \"./node_modules/rxjs/observable/PromiseObservable.js\");\nexports.fromPromise = PromiseObservable_1.PromiseObservable.create;\n//# sourceMappingURL=fromPromise.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/fromPromise.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/interval.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/observable/interval.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar IntervalObservable_1 = __webpack_require__(/*! ./IntervalObservable */ \"./node_modules/rxjs/observable/IntervalObservable.js\");\nexports.interval = IntervalObservable_1.IntervalObservable.create;\n//# sourceMappingURL=interval.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/interval.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/merge.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/observable/merge.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar ArrayObservable_1 = __webpack_require__(/*! ./ArrayObservable */ \"./node_modules/rxjs/observable/ArrayObservable.js\");\nvar isScheduler_1 = __webpack_require__(/*! ../util/isScheduler */ \"./node_modules/rxjs/util/isScheduler.js\");\nvar mergeAll_1 = __webpack_require__(/*! ../operators/mergeAll */ \"./node_modules/rxjs/operators/mergeAll.js\");\n/* tslint:enable:max-line-length */\n/**\n * Creates an output Observable which concurrently emits all values from every\n * given input Observable.\n *\n * <span class=\"informal\">Flattens multiple Observables together by blending\n * their values into one Observable.</span>\n *\n * <img src=\"./img/merge.png\" width=\"100%\">\n *\n * `merge` subscribes to each given input Observable (as arguments), and simply\n * forwards (without doing any transformation) all the values from all the input\n * Observables to the output Observable. The output Observable only completes\n * once all input Observables have completed. Any error delivered by an input\n * Observable will be immediately emitted on the output Observable.\n *\n * @example <caption>Merge together two Observables: 1s interval and clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var timer = Rx.Observable.interval(1000);\n * var clicksOrTimer = Rx.Observable.merge(clicks, timer);\n * clicksOrTimer.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // timer will emit ascending values, one every second(1000ms) to console\n * // clicks logs MouseEvents to console everytime the \"document\" is clicked\n * // Since the two streams are merged you see these happening\n * // as they occur.\n *\n * @example <caption>Merge together 3 Observables, but only 2 run concurrently</caption>\n * var timer1 = Rx.Observable.interval(1000).take(10);\n * var timer2 = Rx.Observable.interval(2000).take(6);\n * var timer3 = Rx.Observable.interval(500).take(10);\n * var concurrent = 2; // the argument\n * var merged = Rx.Observable.merge(timer1, timer2, timer3, concurrent);\n * merged.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // - First timer1 and timer2 will run concurrently\n * // - timer1 will emit a value every 1000ms for 10 iterations\n * // - timer2 will emit a value every 2000ms for 6 iterations\n * // - after timer1 hits it's max iteration, timer2 will\n * //   continue, and timer3 will start to run concurrently with timer2\n * // - when timer2 hits it's max iteration it terminates, and\n * //   timer3 will continue to emit a value every 500ms until it is complete\n *\n * @see {@link mergeAll}\n * @see {@link mergeMap}\n * @see {@link mergeMapTo}\n * @see {@link mergeScan}\n *\n * @param {...ObservableInput} observables Input Observables to merge together.\n * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of input\n * Observables being subscribed to concurrently.\n * @param {Scheduler} [scheduler=null] The IScheduler to use for managing\n * concurrency of input Observables.\n * @return {Observable} an Observable that emits items that are the result of\n * every input Observable.\n * @static true\n * @name merge\n * @owner Observable\n */\nfunction merge() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    var concurrent = Number.POSITIVE_INFINITY;\n    var scheduler = null;\n    var last = observables[observables.length - 1];\n    if (isScheduler_1.isScheduler(last)) {\n        scheduler = observables.pop();\n        if (observables.length > 1 && typeof observables[observables.length - 1] === 'number') {\n            concurrent = observables.pop();\n        }\n    }\n    else if (typeof last === 'number') {\n        concurrent = observables.pop();\n    }\n    if (scheduler === null && observables.length === 1 && observables[0] instanceof Observable_1.Observable) {\n        return observables[0];\n    }\n    return mergeAll_1.mergeAll(concurrent)(new ArrayObservable_1.ArrayObservable(observables, scheduler));\n}\nexports.merge = merge;\n//# sourceMappingURL=merge.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/merge.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/of.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/observable/of.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar ArrayObservable_1 = __webpack_require__(/*! ./ArrayObservable */ \"./node_modules/rxjs/observable/ArrayObservable.js\");\nexports.of = ArrayObservable_1.ArrayObservable.of;\n//# sourceMappingURL=of.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/of.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/race.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/observable/race.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar isArray_1 = __webpack_require__(/*! ../util/isArray */ \"./node_modules/rxjs/util/isArray.js\");\nvar ArrayObservable_1 = __webpack_require__(/*! ../observable/ArrayObservable */ \"./node_modules/rxjs/observable/ArrayObservable.js\");\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\nfunction race() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    // if the only argument is an array, it was most likely called with\n    // `race([obs1, obs2, ...])`\n    if (observables.length === 1) {\n        if (isArray_1.isArray(observables[0])) {\n            observables = observables[0];\n        }\n        else {\n            return observables[0];\n        }\n    }\n    return new ArrayObservable_1.ArrayObservable(observables).lift(new RaceOperator());\n}\nexports.race = race;\nvar RaceOperator = (function () {\n    function RaceOperator() {\n    }\n    RaceOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new RaceSubscriber(subscriber));\n    };\n    return RaceOperator;\n}());\nexports.RaceOperator = RaceOperator;\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar RaceSubscriber = (function (_super) {\n    __extends(RaceSubscriber, _super);\n    function RaceSubscriber(destination) {\n        _super.call(this, destination);\n        this.hasFirst = false;\n        this.observables = [];\n        this.subscriptions = [];\n    }\n    RaceSubscriber.prototype._next = function (observable) {\n        this.observables.push(observable);\n    };\n    RaceSubscriber.prototype._complete = function () {\n        var observables = this.observables;\n        var len = observables.length;\n        if (len === 0) {\n            this.destination.complete();\n        }\n        else {\n            for (var i = 0; i < len && !this.hasFirst; i++) {\n                var observable = observables[i];\n                var subscription = subscribeToResult_1.subscribeToResult(this, observable, observable, i);\n                if (this.subscriptions) {\n                    this.subscriptions.push(subscription);\n                }\n                this.add(subscription);\n            }\n            this.observables = null;\n        }\n    };\n    RaceSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        if (!this.hasFirst) {\n            this.hasFirst = true;\n            for (var i = 0; i < this.subscriptions.length; i++) {\n                if (i !== outerIndex) {\n                    var subscription = this.subscriptions[i];\n                    subscription.unsubscribe();\n                    this.remove(subscription);\n                }\n            }\n            this.subscriptions = null;\n        }\n        this.destination.next(innerValue);\n    };\n    return RaceSubscriber;\n}(OuterSubscriber_1.OuterSubscriber));\nexports.RaceSubscriber = RaceSubscriber;\n//# sourceMappingURL=race.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/race.js?");

/***/ }),

/***/ "./node_modules/rxjs/observable/zip.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/observable/zip.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar zip_1 = __webpack_require__(/*! ../operators/zip */ \"./node_modules/rxjs/operators/zip.js\");\nexports.zip = zip_1.zipStatic;\n//# sourceMappingURL=zip.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/observable/zip.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/buffer.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/operator/buffer.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar buffer_1 = __webpack_require__(/*! ../operators/buffer */ \"./node_modules/rxjs/operators/buffer.js\");\n/**\n * Buffers the source Observable values until `closingNotifier` emits.\n *\n * <span class=\"informal\">Collects values from the past as an array, and emits\n * that array only when another Observable emits.</span>\n *\n * <img src=\"./img/buffer.png\" width=\"100%\">\n *\n * Buffers the incoming Observable values until the given `closingNotifier`\n * Observable emits a value, at which point it emits the buffer on the output\n * Observable and starts a new buffer internally, awaiting the next time\n * `closingNotifier` emits.\n *\n * @example <caption>On every click, emit array of most recent interval events</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var interval = Rx.Observable.interval(1000);\n * var buffered = interval.buffer(clicks);\n * buffered.subscribe(x => console.log(x));\n *\n * @see {@link bufferCount}\n * @see {@link bufferTime}\n * @see {@link bufferToggle}\n * @see {@link bufferWhen}\n * @see {@link window}\n *\n * @param {Observable<any>} closingNotifier An Observable that signals the\n * buffer to be emitted on the output Observable.\n * @return {Observable<T[]>} An Observable of buffers, which are arrays of\n * values.\n * @method buffer\n * @owner Observable\n */\nfunction buffer(closingNotifier) {\n    return buffer_1.buffer(closingNotifier)(this);\n}\nexports.buffer = buffer;\n//# sourceMappingURL=buffer.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/buffer.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/catch.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operator/catch.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar catchError_1 = __webpack_require__(/*! ../operators/catchError */ \"./node_modules/rxjs/operators/catchError.js\");\n/**\n * Catches errors on the observable to be handled by returning a new observable or throwing an error.\n *\n * <img src=\"./img/catch.png\" width=\"100%\">\n *\n * @example <caption>Continues with a different Observable when there's an error</caption>\n *\n * Observable.of(1, 2, 3, 4, 5)\n *   .map(n => {\n * \t   if (n == 4) {\n * \t     throw 'four!';\n *     }\n *\t   return n;\n *   })\n *   .catch(err => Observable.of('I', 'II', 'III', 'IV', 'V'))\n *   .subscribe(x => console.log(x));\n *   // 1, 2, 3, I, II, III, IV, V\n *\n * @example <caption>Retries the caught source Observable again in case of error, similar to retry() operator</caption>\n *\n * Observable.of(1, 2, 3, 4, 5)\n *   .map(n => {\n * \t   if (n === 4) {\n * \t     throw 'four!';\n *     }\n * \t   return n;\n *   })\n *   .catch((err, caught) => caught)\n *   .take(30)\n *   .subscribe(x => console.log(x));\n *   // 1, 2, 3, 1, 2, 3, ...\n *\n * @example <caption>Throws a new error when the source Observable throws an error</caption>\n *\n * Observable.of(1, 2, 3, 4, 5)\n *   .map(n => {\n *     if (n == 4) {\n *       throw 'four!';\n *     }\n *     return n;\n *   })\n *   .catch(err => {\n *     throw 'error in source. Details: ' + err;\n *   })\n *   .subscribe(\n *     x => console.log(x),\n *     err => console.log(err)\n *   );\n *   // 1, 2, 3, error in source. Details: four!\n *\n * @param {function} selector a function that takes as arguments `err`, which is the error, and `caught`, which\n *  is the source observable, in case you'd like to \"retry\" that observable by returning it again. Whatever observable\n *  is returned by the `selector` will be used to continue the observable chain.\n * @return {Observable} An observable that originates from either the source or the observable returned by the\n *  catch `selector` function.\n * @method catch\n * @name catch\n * @owner Observable\n */\nfunction _catch(selector) {\n    return catchError_1.catchError(selector)(this);\n}\nexports._catch = _catch;\n//# sourceMappingURL=catch.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/catch.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/concat.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/operator/concat.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar concat_1 = __webpack_require__(/*! ../operators/concat */ \"./node_modules/rxjs/operators/concat.js\");\nvar concat_2 = __webpack_require__(/*! ../observable/concat */ \"./node_modules/rxjs/observable/concat.js\");\nexports.concatStatic = concat_2.concat;\n/* tslint:enable:max-line-length */\n/**\n * Creates an output Observable which sequentially emits all values from every\n * given input Observable after the current Observable.\n *\n * <span class=\"informal\">Concatenates multiple Observables together by\n * sequentially emitting their values, one Observable after the other.</span>\n *\n * <img src=\"./img/concat.png\" width=\"100%\">\n *\n * Joins this Observable with multiple other Observables by subscribing to them\n * one at a time, starting with the source, and merging their results into the\n * output Observable. Will wait for each Observable to complete before moving\n * on to the next.\n *\n * @example <caption>Concatenate a timer counting from 0 to 3 with a synchronous sequence from 1 to 10</caption>\n * var timer = Rx.Observable.interval(1000).take(4);\n * var sequence = Rx.Observable.range(1, 10);\n * var result = timer.concat(sequence);\n * result.subscribe(x => console.log(x));\n *\n * // results in:\n * // 1000ms-> 0 -1000ms-> 1 -1000ms-> 2 -1000ms-> 3 -immediate-> 1 ... 10\n *\n * @example <caption>Concatenate 3 Observables</caption>\n * var timer1 = Rx.Observable.interval(1000).take(10);\n * var timer2 = Rx.Observable.interval(2000).take(6);\n * var timer3 = Rx.Observable.interval(500).take(10);\n * var result = timer1.concat(timer2, timer3);\n * result.subscribe(x => console.log(x));\n *\n * // results in the following:\n * // (Prints to console sequentially)\n * // -1000ms-> 0 -1000ms-> 1 -1000ms-> ... 9\n * // -2000ms-> 0 -2000ms-> 1 -2000ms-> ... 5\n * // -500ms-> 0 -500ms-> 1 -500ms-> ... 9\n *\n * @see {@link concatAll}\n * @see {@link concatMap}\n * @see {@link concatMapTo}\n *\n * @param {ObservableInput} other An input Observable to concatenate after the source\n * Observable. More than one input Observables may be given as argument.\n * @param {Scheduler} [scheduler=null] An optional IScheduler to schedule each\n * Observable subscription on.\n * @return {Observable} All values of each passed Observable merged into a\n * single Observable, in order, in serial fashion.\n * @method concat\n * @owner Observable\n */\nfunction concat() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return concat_1.concat.apply(void 0, observables)(this);\n}\nexports.concat = concat;\n//# sourceMappingURL=concat.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/concat.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/concatMap.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operator/concatMap.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar concatMap_1 = __webpack_require__(/*! ../operators/concatMap */ \"./node_modules/rxjs/operators/concatMap.js\");\n/* tslint:enable:max-line-length */\n/**\n * Projects each source value to an Observable which is merged in the output\n * Observable, in a serialized fashion waiting for each one to complete before\n * merging the next.\n *\n * <span class=\"informal\">Maps each value to an Observable, then flattens all of\n * these inner Observables using {@link concatAll}.</span>\n *\n * <img src=\"./img/concatMap.png\" width=\"100%\">\n *\n * Returns an Observable that emits items based on applying a function that you\n * supply to each item emitted by the source Observable, where that function\n * returns an (so-called \"inner\") Observable. Each new inner Observable is\n * concatenated with the previous inner Observable.\n *\n * __Warning:__ if source values arrive endlessly and faster than their\n * corresponding inner Observables can complete, it will result in memory issues\n * as inner Observables amass in an unbounded buffer waiting for their turn to\n * be subscribed to.\n *\n * Note: `concatMap` is equivalent to `mergeMap` with concurrency parameter set\n * to `1`.\n *\n * @example <caption>For each click event, tick every second from 0 to 3, with no concurrency</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = clicks.concatMap(ev => Rx.Observable.interval(1000).take(4));\n * result.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // (results are not concurrent)\n * // For every click on the \"document\" it will emit values 0 to 3 spaced\n * // on a 1000ms interval\n * // one click = 1000ms-> 0 -1000ms-> 1 -1000ms-> 2 -1000ms-> 3\n *\n * @see {@link concat}\n * @see {@link concatAll}\n * @see {@link concatMapTo}\n * @see {@link exhaustMap}\n * @see {@link mergeMap}\n * @see {@link switchMap}\n *\n * @param {function(value: T, ?index: number): ObservableInput} project A function\n * that, when applied to an item emitted by the source Observable, returns an\n * Observable.\n * @param {function(outerValue: T, innerValue: I, outerIndex: number, innerIndex: number): any} [resultSelector]\n * A function to produce the value on the output Observable based on the values\n * and the indices of the source (outer) emission and the inner Observable\n * emission. The arguments passed to this function are:\n * - `outerValue`: the value that came from the source\n * - `innerValue`: the value that came from the projected Observable\n * - `outerIndex`: the \"index\" of the value that came from the source\n * - `innerIndex`: the \"index\" of the value from the projected Observable\n * @return {Observable} An Observable that emits the result of applying the\n * projection function (and the optional `resultSelector`) to each item emitted\n * by the source Observable and taking values from each projected inner\n * Observable sequentially.\n * @method concatMap\n * @owner Observable\n */\nfunction concatMap(project, resultSelector) {\n    return concatMap_1.concatMap(project, resultSelector)(this);\n}\nexports.concatMap = concatMap;\n//# sourceMappingURL=concatMap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/concatMap.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/debounce.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/operator/debounce.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar debounce_1 = __webpack_require__(/*! ../operators/debounce */ \"./node_modules/rxjs/operators/debounce.js\");\n/**\n * Emits a value from the source Observable only after a particular time span\n * determined by another Observable has passed without another source emission.\n *\n * <span class=\"informal\">It's like {@link debounceTime}, but the time span of\n * emission silence is determined by a second Observable.</span>\n *\n * <img src=\"./img/debounce.png\" width=\"100%\">\n *\n * `debounce` delays values emitted by the source Observable, but drops previous\n * pending delayed emissions if a new value arrives on the source Observable.\n * This operator keeps track of the most recent value from the source\n * Observable, and spawns a duration Observable by calling the\n * `durationSelector` function. The value is emitted only when the duration\n * Observable emits a value or completes, and if no other value was emitted on\n * the source Observable since the duration Observable was spawned. If a new\n * value appears before the duration Observable emits, the previous value will\n * be dropped and will not be emitted on the output Observable.\n *\n * Like {@link debounceTime}, this is a rate-limiting operator, and also a\n * delay-like operator since output emissions do not necessarily occur at the\n * same time as they did on the source Observable.\n *\n * @example <caption>Emit the most recent click after a burst of clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = clicks.debounce(() => Rx.Observable.interval(1000));\n * result.subscribe(x => console.log(x));\n *\n * @see {@link audit}\n * @see {@link debounceTime}\n * @see {@link delayWhen}\n * @see {@link throttle}\n *\n * @param {function(value: T): SubscribableOrPromise} durationSelector A function\n * that receives a value from the source Observable, for computing the timeout\n * duration for each source value, returned as an Observable or a Promise.\n * @return {Observable} An Observable that delays the emissions of the source\n * Observable by the specified duration Observable returned by\n * `durationSelector`, and may drop some values if they occur too frequently.\n * @method debounce\n * @owner Observable\n */\nfunction debounce(durationSelector) {\n    return debounce_1.debounce(durationSelector)(this);\n}\nexports.debounce = debounce;\n//# sourceMappingURL=debounce.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/debounce.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/debounceTime.js":
/*!****************************************************!*\
  !*** ./node_modules/rxjs/operator/debounceTime.js ***!
  \****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar async_1 = __webpack_require__(/*! ../scheduler/async */ \"./node_modules/rxjs/scheduler/async.js\");\nvar debounceTime_1 = __webpack_require__(/*! ../operators/debounceTime */ \"./node_modules/rxjs/operators/debounceTime.js\");\n/**\n * Emits a value from the source Observable only after a particular time span\n * has passed without another source emission.\n *\n * <span class=\"informal\">It's like {@link delay}, but passes only the most\n * recent value from each burst of emissions.</span>\n *\n * <img src=\"./img/debounceTime.png\" width=\"100%\">\n *\n * `debounceTime` delays values emitted by the source Observable, but drops\n * previous pending delayed emissions if a new value arrives on the source\n * Observable. This operator keeps track of the most recent value from the\n * source Observable, and emits that only when `dueTime` enough time has passed\n * without any other value appearing on the source Observable. If a new value\n * appears before `dueTime` silence occurs, the previous value will be dropped\n * and will not be emitted on the output Observable.\n *\n * This is a rate-limiting operator, because it is impossible for more than one\n * value to be emitted in any time window of duration `dueTime`, but it is also\n * a delay-like operator since output emissions do not occur at the same time as\n * they did on the source Observable. Optionally takes a {@link IScheduler} for\n * managing timers.\n *\n * @example <caption>Emit the most recent click after a burst of clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = clicks.debounceTime(1000);\n * result.subscribe(x => console.log(x));\n *\n * @see {@link auditTime}\n * @see {@link debounce}\n * @see {@link delay}\n * @see {@link sampleTime}\n * @see {@link throttleTime}\n *\n * @param {number} dueTime The timeout duration in milliseconds (or the time\n * unit determined internally by the optional `scheduler`) for the window of\n * time required to wait for emission silence before emitting the most recent\n * source value.\n * @param {Scheduler} [scheduler=async] The {@link IScheduler} to use for\n * managing the timers that handle the timeout for each value.\n * @return {Observable} An Observable that delays the emissions of the source\n * Observable by the specified `dueTime`, and may drop some values if they occur\n * too frequently.\n * @method debounceTime\n * @owner Observable\n */\nfunction debounceTime(dueTime, scheduler) {\n    if (scheduler === void 0) { scheduler = async_1.async; }\n    return debounceTime_1.debounceTime(dueTime, scheduler)(this);\n}\nexports.debounceTime = debounceTime;\n//# sourceMappingURL=debounceTime.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/debounceTime.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/delay.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operator/delay.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar async_1 = __webpack_require__(/*! ../scheduler/async */ \"./node_modules/rxjs/scheduler/async.js\");\nvar delay_1 = __webpack_require__(/*! ../operators/delay */ \"./node_modules/rxjs/operators/delay.js\");\n/**\n * Delays the emission of items from the source Observable by a given timeout or\n * until a given Date.\n *\n * <span class=\"informal\">Time shifts each item by some specified amount of\n * milliseconds.</span>\n *\n * <img src=\"./img/delay.png\" width=\"100%\">\n *\n * If the delay argument is a Number, this operator time shifts the source\n * Observable by that amount of time expressed in milliseconds. The relative\n * time intervals between the values are preserved.\n *\n * If the delay argument is a Date, this operator time shifts the start of the\n * Observable execution until the given date occurs.\n *\n * @example <caption>Delay each click by one second</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var delayedClicks = clicks.delay(1000); // each click emitted after 1 second\n * delayedClicks.subscribe(x => console.log(x));\n *\n * @example <caption>Delay all clicks until a future date happens</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var date = new Date('March 15, 2050 12:00:00'); // in the future\n * var delayedClicks = clicks.delay(date); // click emitted only after that date\n * delayedClicks.subscribe(x => console.log(x));\n *\n * @see {@link debounceTime}\n * @see {@link delayWhen}\n *\n * @param {number|Date} delay The delay duration in milliseconds (a `number`) or\n * a `Date` until which the emission of the source items is delayed.\n * @param {Scheduler} [scheduler=async] The IScheduler to use for\n * managing the timers that handle the time-shift for each item.\n * @return {Observable} An Observable that delays the emissions of the source\n * Observable by the specified timeout or Date.\n * @method delay\n * @owner Observable\n */\nfunction delay(delay, scheduler) {\n    if (scheduler === void 0) { scheduler = async_1.async; }\n    return delay_1.delay(delay, scheduler)(this);\n}\nexports.delay = delay;\n//# sourceMappingURL=delay.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/delay.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/distinctUntilChanged.js":
/*!************************************************************!*\
  !*** ./node_modules/rxjs/operator/distinctUntilChanged.js ***!
  \************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar distinctUntilChanged_1 = __webpack_require__(/*! ../operators/distinctUntilChanged */ \"./node_modules/rxjs/operators/distinctUntilChanged.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that emits all items emitted by the source Observable that are distinct by comparison from the previous item.\n *\n * If a comparator function is provided, then it will be called for each item to test for whether or not that value should be emitted.\n *\n * If a comparator function is not provided, an equality check is used by default.\n *\n * @example <caption>A simple example with numbers</caption>\n * Observable.of(1, 1, 2, 2, 2, 1, 1, 2, 3, 3, 4)\n *   .distinctUntilChanged()\n *   .subscribe(x => console.log(x)); // 1, 2, 1, 2, 3, 4\n *\n * @example <caption>An example using a compare function</caption>\n * interface Person {\n *    age: number,\n *    name: string\n * }\n *\n * Observable.of<Person>(\n *     { age: 4, name: 'Foo'},\n *     { age: 7, name: 'Bar'},\n *     { age: 5, name: 'Foo'})\n *     { age: 6, name: 'Foo'})\n *     .distinctUntilChanged((p: Person, q: Person) => p.name === q.name)\n *     .subscribe(x => console.log(x));\n *\n * // displays:\n * // { age: 4, name: 'Foo' }\n * // { age: 7, name: 'Bar' }\n * // { age: 5, name: 'Foo' }\n *\n * @see {@link distinct}\n * @see {@link distinctUntilKeyChanged}\n *\n * @param {function} [compare] Optional comparison function called to test if an item is distinct from the previous item in the source.\n * @return {Observable} An Observable that emits items from the source Observable with distinct values.\n * @method distinctUntilChanged\n * @owner Observable\n */\nfunction distinctUntilChanged(compare, keySelector) {\n    return distinctUntilChanged_1.distinctUntilChanged(compare, keySelector)(this);\n}\nexports.distinctUntilChanged = distinctUntilChanged;\n//# sourceMappingURL=distinctUntilChanged.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/distinctUntilChanged.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/do.js":
/*!******************************************!*\
  !*** ./node_modules/rxjs/operator/do.js ***!
  \******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar tap_1 = __webpack_require__(/*! ../operators/tap */ \"./node_modules/rxjs/operators/tap.js\");\n/* tslint:enable:max-line-length */\n/**\n * Perform a side effect for every emission on the source Observable, but return\n * an Observable that is identical to the source.\n *\n * <span class=\"informal\">Intercepts each emission on the source and runs a\n * function, but returns an output which is identical to the source as long as errors don't occur.</span>\n *\n * <img src=\"./img/do.png\" width=\"100%\">\n *\n * Returns a mirrored Observable of the source Observable, but modified so that\n * the provided Observer is called to perform a side effect for every value,\n * error, and completion emitted by the source. Any errors that are thrown in\n * the aforementioned Observer or handlers are safely sent down the error path\n * of the output Observable.\n *\n * This operator is useful for debugging your Observables for the correct values\n * or performing other side effects.\n *\n * Note: this is different to a `subscribe` on the Observable. If the Observable\n * returned by `do` is not subscribed, the side effects specified by the\n * Observer will never happen. `do` therefore simply spies on existing\n * execution, it does not trigger an execution to happen like `subscribe` does.\n *\n * @example <caption>Map every click to the clientX position of that click, while also logging the click event</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var positions = clicks\n *   .do(ev => console.log(ev))\n *   .map(ev => ev.clientX);\n * positions.subscribe(x => console.log(x));\n *\n * @see {@link map}\n * @see {@link subscribe}\n *\n * @param {Observer|function} [nextOrObserver] A normal Observer object or a\n * callback for `next`.\n * @param {function} [error] Callback for errors in the source.\n * @param {function} [complete] Callback for the completion of the source.\n * @return {Observable} An Observable identical to the source, but runs the\n * specified Observer or callback(s) for each item.\n * @method do\n * @name do\n * @owner Observable\n */\nfunction _do(nextOrObserver, error, complete) {\n    return tap_1.tap(nextOrObserver, error, complete)(this);\n}\nexports._do = _do;\n//# sourceMappingURL=do.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/do.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/filter.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/operator/filter.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar filter_1 = __webpack_require__(/*! ../operators/filter */ \"./node_modules/rxjs/operators/filter.js\");\n/* tslint:enable:max-line-length */\n/**\n * Filter items emitted by the source Observable by only emitting those that\n * satisfy a specified predicate.\n *\n * <span class=\"informal\">Like\n * [Array.prototype.filter()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter),\n * it only emits a value from the source if it passes a criterion function.</span>\n *\n * <img src=\"./img/filter.png\" width=\"100%\">\n *\n * Similar to the well-known `Array.prototype.filter` method, this operator\n * takes values from the source Observable, passes them through a `predicate`\n * function and only emits those values that yielded `true`.\n *\n * @example <caption>Emit only click events whose target was a DIV element</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var clicksOnDivs = clicks.filter(ev => ev.target.tagName === 'DIV');\n * clicksOnDivs.subscribe(x => console.log(x));\n *\n * @see {@link distinct}\n * @see {@link distinctUntilChanged}\n * @see {@link distinctUntilKeyChanged}\n * @see {@link ignoreElements}\n * @see {@link partition}\n * @see {@link skip}\n *\n * @param {function(value: T, index: number): boolean} predicate A function that\n * evaluates each value emitted by the source Observable. If it returns `true`,\n * the value is emitted, if `false` the value is not passed to the output\n * Observable. The `index` parameter is the number `i` for the i-th source\n * emission that has happened since the subscription, starting from the number\n * `0`.\n * @param {any} [thisArg] An optional argument to determine the value of `this`\n * in the `predicate` function.\n * @return {Observable} An Observable of values from the source that were\n * allowed by the `predicate` function.\n * @method filter\n * @owner Observable\n */\nfunction filter(predicate, thisArg) {\n    return filter_1.filter(predicate, thisArg)(this);\n}\nexports.filter = filter;\n//# sourceMappingURL=filter.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/filter.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/finally.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/operator/finally.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar finalize_1 = __webpack_require__(/*! ../operators/finalize */ \"./node_modules/rxjs/operators/finalize.js\");\n/**\n * Returns an Observable that mirrors the source Observable, but will call a specified function when\n * the source terminates on complete or error.\n * @param {function} callback Function to be called when source terminates.\n * @return {Observable} An Observable that mirrors the source, but will call the specified function on termination.\n * @method finally\n * @owner Observable\n */\nfunction _finally(callback) {\n    return finalize_1.finalize(callback)(this);\n}\nexports._finally = _finally;\n//# sourceMappingURL=finally.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/finally.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/last.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operator/last.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar last_1 = __webpack_require__(/*! ../operators/last */ \"./node_modules/rxjs/operators/last.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that emits only the last item emitted by the source Observable.\n * It optionally takes a predicate function as a parameter, in which case, rather than emitting\n * the last item from the source Observable, the resulting Observable will emit the last item\n * from the source Observable that satisfies the predicate.\n *\n * <img src=\"./img/last.png\" width=\"100%\">\n *\n * @throws {EmptyError} Delivers an EmptyError to the Observer's `error`\n * callback if the Observable completes before any `next` notification was sent.\n * @param {function} predicate - The condition any source emitted item has to satisfy.\n * @return {Observable} An Observable that emits only the last item satisfying the given condition\n * from the source, or an NoSuchElementException if no such items are emitted.\n * @throws - Throws if no items that match the predicate are emitted by the source Observable.\n * @method last\n * @owner Observable\n */\nfunction last(predicate, resultSelector, defaultValue) {\n    return last_1.last(predicate, resultSelector, defaultValue)(this);\n}\nexports.last = last;\n//# sourceMappingURL=last.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/last.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/map.js":
/*!*******************************************!*\
  !*** ./node_modules/rxjs/operator/map.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar map_1 = __webpack_require__(/*! ../operators/map */ \"./node_modules/rxjs/operators/map.js\");\n/**\n * Applies a given `project` function to each value emitted by the source\n * Observable, and emits the resulting values as an Observable.\n *\n * <span class=\"informal\">Like [Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map),\n * it passes each source value through a transformation function to get\n * corresponding output values.</span>\n *\n * <img src=\"./img/map.png\" width=\"100%\">\n *\n * Similar to the well known `Array.prototype.map` function, this operator\n * applies a projection to each value and emits that projection in the output\n * Observable.\n *\n * @example <caption>Map every click to the clientX position of that click</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var positions = clicks.map(ev => ev.clientX);\n * positions.subscribe(x => console.log(x));\n *\n * @see {@link mapTo}\n * @see {@link pluck}\n *\n * @param {function(value: T, index: number): R} project The function to apply\n * to each `value` emitted by the source Observable. The `index` parameter is\n * the number `i` for the i-th emission that has happened since the\n * subscription, starting from the number `0`.\n * @param {any} [thisArg] An optional argument to define what `this` is in the\n * `project` function.\n * @return {Observable<R>} An Observable that emits the values from the source\n * Observable transformed by the given `project` function.\n * @method map\n * @owner Observable\n */\nfunction map(project, thisArg) {\n    return map_1.map(project, thisArg)(this);\n}\nexports.map = map;\n//# sourceMappingURL=map.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/map.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/merge.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operator/merge.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar merge_1 = __webpack_require__(/*! ../operators/merge */ \"./node_modules/rxjs/operators/merge.js\");\nvar merge_2 = __webpack_require__(/*! ../observable/merge */ \"./node_modules/rxjs/observable/merge.js\");\nexports.mergeStatic = merge_2.merge;\n/* tslint:enable:max-line-length */\n/**\n * Creates an output Observable which concurrently emits all values from every\n * given input Observable.\n *\n * <span class=\"informal\">Flattens multiple Observables together by blending\n * their values into one Observable.</span>\n *\n * <img src=\"./img/merge.png\" width=\"100%\">\n *\n * `merge` subscribes to each given input Observable (either the source or an\n * Observable given as argument), and simply forwards (without doing any\n * transformation) all the values from all the input Observables to the output\n * Observable. The output Observable only completes once all input Observables\n * have completed. Any error delivered by an input Observable will be immediately\n * emitted on the output Observable.\n *\n * @example <caption>Merge together two Observables: 1s interval and clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var timer = Rx.Observable.interval(1000);\n * var clicksOrTimer = clicks.merge(timer);\n * clicksOrTimer.subscribe(x => console.log(x));\n *\n * @example <caption>Merge together 3 Observables, but only 2 run concurrently</caption>\n * var timer1 = Rx.Observable.interval(1000).take(10);\n * var timer2 = Rx.Observable.interval(2000).take(6);\n * var timer3 = Rx.Observable.interval(500).take(10);\n * var concurrent = 2; // the argument\n * var merged = timer1.merge(timer2, timer3, concurrent);\n * merged.subscribe(x => console.log(x));\n *\n * @see {@link mergeAll}\n * @see {@link mergeMap}\n * @see {@link mergeMapTo}\n * @see {@link mergeScan}\n *\n * @param {ObservableInput} other An input Observable to merge with the source\n * Observable. More than one input Observables may be given as argument.\n * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of input\n * Observables being subscribed to concurrently.\n * @param {Scheduler} [scheduler=null] The IScheduler to use for managing\n * concurrency of input Observables.\n * @return {Observable} An Observable that emits items that are the result of\n * every input Observable.\n * @method merge\n * @owner Observable\n */\nfunction merge() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return merge_1.merge.apply(void 0, observables)(this);\n}\nexports.merge = merge;\n//# sourceMappingURL=merge.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/merge.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/mergeMap.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/operator/mergeMap.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar mergeMap_1 = __webpack_require__(/*! ../operators/mergeMap */ \"./node_modules/rxjs/operators/mergeMap.js\");\n/* tslint:enable:max-line-length */\n/**\n * Projects each source value to an Observable which is merged in the output\n * Observable.\n *\n * <span class=\"informal\">Maps each value to an Observable, then flattens all of\n * these inner Observables using {@link mergeAll}.</span>\n *\n * <img src=\"./img/mergeMap.png\" width=\"100%\">\n *\n * Returns an Observable that emits items based on applying a function that you\n * supply to each item emitted by the source Observable, where that function\n * returns an Observable, and then merging those resulting Observables and\n * emitting the results of this merger.\n *\n * @example <caption>Map and flatten each letter to an Observable ticking every 1 second</caption>\n * var letters = Rx.Observable.of('a', 'b', 'c');\n * var result = letters.mergeMap(x =>\n *   Rx.Observable.interval(1000).map(i => x+i)\n * );\n * result.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // a0\n * // b0\n * // c0\n * // a1\n * // b1\n * // c1\n * // continues to list a,b,c with respective ascending integers\n *\n * @see {@link concatMap}\n * @see {@link exhaustMap}\n * @see {@link merge}\n * @see {@link mergeAll}\n * @see {@link mergeMapTo}\n * @see {@link mergeScan}\n * @see {@link switchMap}\n *\n * @param {function(value: T, ?index: number): ObservableInput} project A function\n * that, when applied to an item emitted by the source Observable, returns an\n * Observable.\n * @param {function(outerValue: T, innerValue: I, outerIndex: number, innerIndex: number): any} [resultSelector]\n * A function to produce the value on the output Observable based on the values\n * and the indices of the source (outer) emission and the inner Observable\n * emission. The arguments passed to this function are:\n * - `outerValue`: the value that came from the source\n * - `innerValue`: the value that came from the projected Observable\n * - `outerIndex`: the \"index\" of the value that came from the source\n * - `innerIndex`: the \"index\" of the value from the projected Observable\n * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of input\n * Observables being subscribed to concurrently.\n * @return {Observable} An Observable that emits the result of applying the\n * projection function (and the optional `resultSelector`) to each item emitted\n * by the source Observable and merging the results of the Observables obtained\n * from this transformation.\n * @method mergeMap\n * @owner Observable\n */\nfunction mergeMap(project, resultSelector, concurrent) {\n    if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }\n    return mergeMap_1.mergeMap(project, resultSelector, concurrent)(this);\n}\nexports.mergeMap = mergeMap;\n//# sourceMappingURL=mergeMap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/mergeMap.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/race.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operator/race.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar race_1 = __webpack_require__(/*! ../operators/race */ \"./node_modules/rxjs/operators/race.js\");\n// NOTE: to support backwards compatability with 5.4.* and lower\nvar race_2 = __webpack_require__(/*! ../observable/race */ \"./node_modules/rxjs/observable/race.js\");\nexports.raceStatic = race_2.race;\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that mirrors the first source Observable to emit an item\n * from the combination of this Observable and supplied Observables.\n * @param {...Observables} ...observables Sources used to race for which Observable emits first.\n * @return {Observable} An Observable that mirrors the output of the first Observable to emit an item.\n * @method race\n * @owner Observable\n */\nfunction race() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return race_1.race.apply(void 0, observables)(this);\n}\nexports.race = race;\n//# sourceMappingURL=race.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/race.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/skip.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operator/skip.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar skip_1 = __webpack_require__(/*! ../operators/skip */ \"./node_modules/rxjs/operators/skip.js\");\n/**\n * Returns an Observable that skips the first `count` items emitted by the source Observable.\n *\n * <img src=\"./img/skip.png\" width=\"100%\">\n *\n * @param {Number} count - The number of times, items emitted by source Observable should be skipped.\n * @return {Observable} An Observable that skips values emitted by the source Observable.\n *\n * @method skip\n * @owner Observable\n */\nfunction skip(count) {\n    return skip_1.skip(count)(this);\n}\nexports.skip = skip;\n//# sourceMappingURL=skip.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/skip.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/startWith.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operator/startWith.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar startWith_1 = __webpack_require__(/*! ../operators/startWith */ \"./node_modules/rxjs/operators/startWith.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that emits the items you specify as arguments before it begins to emit\n * items emitted by the source Observable.\n *\n * <img src=\"./img/startWith.png\" width=\"100%\">\n *\n * @param {...T} values - Items you want the modified Observable to emit first.\n * @param {Scheduler} [scheduler] - A {@link IScheduler} to use for scheduling\n * the emissions of the `next` notifications.\n * @return {Observable} An Observable that emits the items in the specified Iterable and then emits the items\n * emitted by the source Observable.\n * @method startWith\n * @owner Observable\n */\nfunction startWith() {\n    var array = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        array[_i - 0] = arguments[_i];\n    }\n    return startWith_1.startWith.apply(void 0, array)(this);\n}\nexports.startWith = startWith;\n//# sourceMappingURL=startWith.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/startWith.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/take.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operator/take.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar take_1 = __webpack_require__(/*! ../operators/take */ \"./node_modules/rxjs/operators/take.js\");\n/**\n * Emits only the first `count` values emitted by the source Observable.\n *\n * <span class=\"informal\">Takes the first `count` values from the source, then\n * completes.</span>\n *\n * <img src=\"./img/take.png\" width=\"100%\">\n *\n * `take` returns an Observable that emits only the first `count` values emitted\n * by the source Observable. If the source emits fewer than `count` values then\n * all of its values are emitted. After that, it completes, regardless if the\n * source completes.\n *\n * @example <caption>Take the first 5 seconds of an infinite 1-second interval Observable</caption>\n * var interval = Rx.Observable.interval(1000);\n * var five = interval.take(5);\n * five.subscribe(x => console.log(x));\n *\n * @see {@link takeLast}\n * @see {@link takeUntil}\n * @see {@link takeWhile}\n * @see {@link skip}\n *\n * @throws {ArgumentOutOfRangeError} When using `take(i)`, it delivers an\n * ArgumentOutOrRangeError to the Observer's `error` callback if `i < 0`.\n *\n * @param {number} count The maximum number of `next` values to emit.\n * @return {Observable<T>} An Observable that emits only the first `count`\n * values emitted by the source Observable, or all of the values from the source\n * if the source emits fewer than `count` values.\n * @method take\n * @owner Observable\n */\nfunction take(count) {\n    return take_1.take(count)(this);\n}\nexports.take = take;\n//# sourceMappingURL=take.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/take.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/takeUntil.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operator/takeUntil.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar takeUntil_1 = __webpack_require__(/*! ../operators/takeUntil */ \"./node_modules/rxjs/operators/takeUntil.js\");\n/**\n * Emits the values emitted by the source Observable until a `notifier`\n * Observable emits a value.\n *\n * <span class=\"informal\">Lets values pass until a second Observable,\n * `notifier`, emits something. Then, it completes.</span>\n *\n * <img src=\"./img/takeUntil.png\" width=\"100%\">\n *\n * `takeUntil` subscribes and begins mirroring the source Observable. It also\n * monitors a second Observable, `notifier` that you provide. If the `notifier`\n * emits a value, the output Observable stops mirroring the source Observable\n * and completes.\n *\n * @example <caption>Tick every second until the first click happens</caption>\n * var interval = Rx.Observable.interval(1000);\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = interval.takeUntil(clicks);\n * result.subscribe(x => console.log(x));\n *\n * @see {@link take}\n * @see {@link takeLast}\n * @see {@link takeWhile}\n * @see {@link skip}\n *\n * @param {Observable} notifier The Observable whose first emitted value will\n * cause the output Observable of `takeUntil` to stop emitting values from the\n * source Observable.\n * @return {Observable<T>} An Observable that emits the values from the source\n * Observable until such time as `notifier` emits its first value.\n * @method takeUntil\n * @owner Observable\n */\nfunction takeUntil(notifier) {\n    return takeUntil_1.takeUntil(notifier)(this);\n}\nexports.takeUntil = takeUntil;\n//# sourceMappingURL=takeUntil.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/takeUntil.js?");

/***/ }),

/***/ "./node_modules/rxjs/operator/toArray.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/operator/toArray.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar toArray_1 = __webpack_require__(/*! ../operators/toArray */ \"./node_modules/rxjs/operators/toArray.js\");\n/**\n * Collects all source emissions and emits them as an array when the source completes.\n *\n * <span class=\"informal\">Get all values inside an array when the source completes</span>\n *\n * <img src=\"./img/toArray.png\" width=\"100%\">\n *\n * `toArray` will wait until the source Observable completes\n * before emitting the array containing all emissions.\n * When the source Observable errors no array will be emitted.\n *\n * @example <caption>Create array from input</caption>\n * const input = Rx.Observable.interval(100).take(4);\n *\n * input.toArray()\n *   .subscribe(arr => console.log(arr)); // [0,1,2,3]\n *\n * @see {@link buffer}\n *\n * @return {Observable<any[]>|WebSocketSubject<T>|Observable<T>}\n * @method toArray\n * @owner Observable\n */\nfunction toArray() {\n    return toArray_1.toArray()(this);\n}\nexports.toArray = toArray;\n//# sourceMappingURL=toArray.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operator/toArray.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/buffer.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/operators/buffer.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\n/**\n * Buffers the source Observable values until `closingNotifier` emits.\n *\n * <span class=\"informal\">Collects values from the past as an array, and emits\n * that array only when another Observable emits.</span>\n *\n * <img src=\"./img/buffer.png\" width=\"100%\">\n *\n * Buffers the incoming Observable values until the given `closingNotifier`\n * Observable emits a value, at which point it emits the buffer on the output\n * Observable and starts a new buffer internally, awaiting the next time\n * `closingNotifier` emits.\n *\n * @example <caption>On every click, emit array of most recent interval events</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var interval = Rx.Observable.interval(1000);\n * var buffered = interval.buffer(clicks);\n * buffered.subscribe(x => console.log(x));\n *\n * @see {@link bufferCount}\n * @see {@link bufferTime}\n * @see {@link bufferToggle}\n * @see {@link bufferWhen}\n * @see {@link window}\n *\n * @param {Observable<any>} closingNotifier An Observable that signals the\n * buffer to be emitted on the output Observable.\n * @return {Observable<T[]>} An Observable of buffers, which are arrays of\n * values.\n * @method buffer\n * @owner Observable\n */\nfunction buffer(closingNotifier) {\n    return function bufferOperatorFunction(source) {\n        return source.lift(new BufferOperator(closingNotifier));\n    };\n}\nexports.buffer = buffer;\nvar BufferOperator = (function () {\n    function BufferOperator(closingNotifier) {\n        this.closingNotifier = closingNotifier;\n    }\n    BufferOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new BufferSubscriber(subscriber, this.closingNotifier));\n    };\n    return BufferOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar BufferSubscriber = (function (_super) {\n    __extends(BufferSubscriber, _super);\n    function BufferSubscriber(destination, closingNotifier) {\n        _super.call(this, destination);\n        this.buffer = [];\n        this.add(subscribeToResult_1.subscribeToResult(this, closingNotifier));\n    }\n    BufferSubscriber.prototype._next = function (value) {\n        this.buffer.push(value);\n    };\n    BufferSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        var buffer = this.buffer;\n        this.buffer = [];\n        this.destination.next(buffer);\n    };\n    return BufferSubscriber;\n}(OuterSubscriber_1.OuterSubscriber));\n//# sourceMappingURL=buffer.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/buffer.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/catchError.js":
/*!***************************************************!*\
  !*** ./node_modules/rxjs/operators/catchError.js ***!
  \***************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\n/**\n * Catches errors on the observable to be handled by returning a new observable or throwing an error.\n *\n * <img src=\"./img/catch.png\" width=\"100%\">\n *\n * @example <caption>Continues with a different Observable when there's an error</caption>\n *\n * Observable.of(1, 2, 3, 4, 5)\n *   .map(n => {\n * \t   if (n == 4) {\n * \t     throw 'four!';\n *     }\n *\t   return n;\n *   })\n *   .catch(err => Observable.of('I', 'II', 'III', 'IV', 'V'))\n *   .subscribe(x => console.log(x));\n *   // 1, 2, 3, I, II, III, IV, V\n *\n * @example <caption>Retries the caught source Observable again in case of error, similar to retry() operator</caption>\n *\n * Observable.of(1, 2, 3, 4, 5)\n *   .map(n => {\n * \t   if (n === 4) {\n * \t     throw 'four!';\n *     }\n * \t   return n;\n *   })\n *   .catch((err, caught) => caught)\n *   .take(30)\n *   .subscribe(x => console.log(x));\n *   // 1, 2, 3, 1, 2, 3, ...\n *\n * @example <caption>Throws a new error when the source Observable throws an error</caption>\n *\n * Observable.of(1, 2, 3, 4, 5)\n *   .map(n => {\n *     if (n == 4) {\n *       throw 'four!';\n *     }\n *     return n;\n *   })\n *   .catch(err => {\n *     throw 'error in source. Details: ' + err;\n *   })\n *   .subscribe(\n *     x => console.log(x),\n *     err => console.log(err)\n *   );\n *   // 1, 2, 3, error in source. Details: four!\n *\n * @param {function} selector a function that takes as arguments `err`, which is the error, and `caught`, which\n *  is the source observable, in case you'd like to \"retry\" that observable by returning it again. Whatever observable\n *  is returned by the `selector` will be used to continue the observable chain.\n * @return {Observable} An observable that originates from either the source or the observable returned by the\n *  catch `selector` function.\n * @name catchError\n */\nfunction catchError(selector) {\n    return function catchErrorOperatorFunction(source) {\n        var operator = new CatchOperator(selector);\n        var caught = source.lift(operator);\n        return (operator.caught = caught);\n    };\n}\nexports.catchError = catchError;\nvar CatchOperator = (function () {\n    function CatchOperator(selector) {\n        this.selector = selector;\n    }\n    CatchOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new CatchSubscriber(subscriber, this.selector, this.caught));\n    };\n    return CatchOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar CatchSubscriber = (function (_super) {\n    __extends(CatchSubscriber, _super);\n    function CatchSubscriber(destination, selector, caught) {\n        _super.call(this, destination);\n        this.selector = selector;\n        this.caught = caught;\n    }\n    // NOTE: overriding `error` instead of `_error` because we don't want\n    // to have this flag this subscriber as `isStopped`. We can mimic the\n    // behavior of the RetrySubscriber (from the `retry` operator), where\n    // we unsubscribe from our source chain, reset our Subscriber flags,\n    // then subscribe to the selector result.\n    CatchSubscriber.prototype.error = function (err) {\n        if (!this.isStopped) {\n            var result = void 0;\n            try {\n                result = this.selector(err, this.caught);\n            }\n            catch (err2) {\n                _super.prototype.error.call(this, err2);\n                return;\n            }\n            this._unsubscribeAndRecycle();\n            this.add(subscribeToResult_1.subscribeToResult(this, result));\n        }\n    };\n    return CatchSubscriber;\n}(OuterSubscriber_1.OuterSubscriber));\n//# sourceMappingURL=catchError.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/catchError.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/concat.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/operators/concat.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar concat_1 = __webpack_require__(/*! ../observable/concat */ \"./node_modules/rxjs/observable/concat.js\");\nvar concat_2 = __webpack_require__(/*! ../observable/concat */ \"./node_modules/rxjs/observable/concat.js\");\nexports.concatStatic = concat_2.concat;\n/* tslint:enable:max-line-length */\n/**\n * Creates an output Observable which sequentially emits all values from every\n * given input Observable after the current Observable.\n *\n * <span class=\"informal\">Concatenates multiple Observables together by\n * sequentially emitting their values, one Observable after the other.</span>\n *\n * <img src=\"./img/concat.png\" width=\"100%\">\n *\n * Joins this Observable with multiple other Observables by subscribing to them\n * one at a time, starting with the source, and merging their results into the\n * output Observable. Will wait for each Observable to complete before moving\n * on to the next.\n *\n * @example <caption>Concatenate a timer counting from 0 to 3 with a synchronous sequence from 1 to 10</caption>\n * var timer = Rx.Observable.interval(1000).take(4);\n * var sequence = Rx.Observable.range(1, 10);\n * var result = timer.concat(sequence);\n * result.subscribe(x => console.log(x));\n *\n * // results in:\n * // 1000ms-> 0 -1000ms-> 1 -1000ms-> 2 -1000ms-> 3 -immediate-> 1 ... 10\n *\n * @example <caption>Concatenate 3 Observables</caption>\n * var timer1 = Rx.Observable.interval(1000).take(10);\n * var timer2 = Rx.Observable.interval(2000).take(6);\n * var timer3 = Rx.Observable.interval(500).take(10);\n * var result = timer1.concat(timer2, timer3);\n * result.subscribe(x => console.log(x));\n *\n * // results in the following:\n * // (Prints to console sequentially)\n * // -1000ms-> 0 -1000ms-> 1 -1000ms-> ... 9\n * // -2000ms-> 0 -2000ms-> 1 -2000ms-> ... 5\n * // -500ms-> 0 -500ms-> 1 -500ms-> ... 9\n *\n * @see {@link concatAll}\n * @see {@link concatMap}\n * @see {@link concatMapTo}\n *\n * @param {ObservableInput} other An input Observable to concatenate after the source\n * Observable. More than one input Observables may be given as argument.\n * @param {Scheduler} [scheduler=null] An optional IScheduler to schedule each\n * Observable subscription on.\n * @return {Observable} All values of each passed Observable merged into a\n * single Observable, in order, in serial fashion.\n * @method concat\n * @owner Observable\n */\nfunction concat() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return function (source) { return source.lift.call(concat_1.concat.apply(void 0, [source].concat(observables))); };\n}\nexports.concat = concat;\n//# sourceMappingURL=concat.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/concat.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/concatAll.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/operators/concatAll.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar mergeAll_1 = __webpack_require__(/*! ./mergeAll */ \"./node_modules/rxjs/operators/mergeAll.js\");\n/**\n * Converts a higher-order Observable into a first-order Observable by\n * concatenating the inner Observables in order.\n *\n * <span class=\"informal\">Flattens an Observable-of-Observables by putting one\n * inner Observable after the other.</span>\n *\n * <img src=\"./img/concatAll.png\" width=\"100%\">\n *\n * Joins every Observable emitted by the source (a higher-order Observable), in\n * a serial fashion. It subscribes to each inner Observable only after the\n * previous inner Observable has completed, and merges all of their values into\n * the returned observable.\n *\n * __Warning:__ If the source Observable emits Observables quickly and\n * endlessly, and the inner Observables it emits generally complete slower than\n * the source emits, you can run into memory issues as the incoming Observables\n * collect in an unbounded buffer.\n *\n * Note: `concatAll` is equivalent to `mergeAll` with concurrency parameter set\n * to `1`.\n *\n * @example <caption>For each click event, tick every second from 0 to 3, with no concurrency</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var higherOrder = clicks.map(ev => Rx.Observable.interval(1000).take(4));\n * var firstOrder = higherOrder.concatAll();\n * firstOrder.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // (results are not concurrent)\n * // For every click on the \"document\" it will emit values 0 to 3 spaced\n * // on a 1000ms interval\n * // one click = 1000ms-> 0 -1000ms-> 1 -1000ms-> 2 -1000ms-> 3\n *\n * @see {@link combineAll}\n * @see {@link concat}\n * @see {@link concatMap}\n * @see {@link concatMapTo}\n * @see {@link exhaust}\n * @see {@link mergeAll}\n * @see {@link switch}\n * @see {@link zipAll}\n *\n * @return {Observable} An Observable emitting values from all the inner\n * Observables concatenated.\n * @method concatAll\n * @owner Observable\n */\nfunction concatAll() {\n    return mergeAll_1.mergeAll(1);\n}\nexports.concatAll = concatAll;\n//# sourceMappingURL=concatAll.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/concatAll.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/concatMap.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/operators/concatMap.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar mergeMap_1 = __webpack_require__(/*! ./mergeMap */ \"./node_modules/rxjs/operators/mergeMap.js\");\n/* tslint:enable:max-line-length */\n/**\n * Projects each source value to an Observable which is merged in the output\n * Observable, in a serialized fashion waiting for each one to complete before\n * merging the next.\n *\n * <span class=\"informal\">Maps each value to an Observable, then flattens all of\n * these inner Observables using {@link concatAll}.</span>\n *\n * <img src=\"./img/concatMap.png\" width=\"100%\">\n *\n * Returns an Observable that emits items based on applying a function that you\n * supply to each item emitted by the source Observable, where that function\n * returns an (so-called \"inner\") Observable. Each new inner Observable is\n * concatenated with the previous inner Observable.\n *\n * __Warning:__ if source values arrive endlessly and faster than their\n * corresponding inner Observables can complete, it will result in memory issues\n * as inner Observables amass in an unbounded buffer waiting for their turn to\n * be subscribed to.\n *\n * Note: `concatMap` is equivalent to `mergeMap` with concurrency parameter set\n * to `1`.\n *\n * @example <caption>For each click event, tick every second from 0 to 3, with no concurrency</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = clicks.concatMap(ev => Rx.Observable.interval(1000).take(4));\n * result.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // (results are not concurrent)\n * // For every click on the \"document\" it will emit values 0 to 3 spaced\n * // on a 1000ms interval\n * // one click = 1000ms-> 0 -1000ms-> 1 -1000ms-> 2 -1000ms-> 3\n *\n * @see {@link concat}\n * @see {@link concatAll}\n * @see {@link concatMapTo}\n * @see {@link exhaustMap}\n * @see {@link mergeMap}\n * @see {@link switchMap}\n *\n * @param {function(value: T, ?index: number): ObservableInput} project A function\n * that, when applied to an item emitted by the source Observable, returns an\n * Observable.\n * @param {function(outerValue: T, innerValue: I, outerIndex: number, innerIndex: number): any} [resultSelector]\n * A function to produce the value on the output Observable based on the values\n * and the indices of the source (outer) emission and the inner Observable\n * emission. The arguments passed to this function are:\n * - `outerValue`: the value that came from the source\n * - `innerValue`: the value that came from the projected Observable\n * - `outerIndex`: the \"index\" of the value that came from the source\n * - `innerIndex`: the \"index\" of the value from the projected Observable\n * @return {Observable} An Observable that emits the result of applying the\n * projection function (and the optional `resultSelector`) to each item emitted\n * by the source Observable and taking values from each projected inner\n * Observable sequentially.\n * @method concatMap\n * @owner Observable\n */\nfunction concatMap(project, resultSelector) {\n    return mergeMap_1.mergeMap(project, resultSelector, 1);\n}\nexports.concatMap = concatMap;\n//# sourceMappingURL=concatMap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/concatMap.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/debounce.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operators/debounce.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\n/**\n * Emits a value from the source Observable only after a particular time span\n * determined by another Observable has passed without another source emission.\n *\n * <span class=\"informal\">It's like {@link debounceTime}, but the time span of\n * emission silence is determined by a second Observable.</span>\n *\n * <img src=\"./img/debounce.png\" width=\"100%\">\n *\n * `debounce` delays values emitted by the source Observable, but drops previous\n * pending delayed emissions if a new value arrives on the source Observable.\n * This operator keeps track of the most recent value from the source\n * Observable, and spawns a duration Observable by calling the\n * `durationSelector` function. The value is emitted only when the duration\n * Observable emits a value or completes, and if no other value was emitted on\n * the source Observable since the duration Observable was spawned. If a new\n * value appears before the duration Observable emits, the previous value will\n * be dropped and will not be emitted on the output Observable.\n *\n * Like {@link debounceTime}, this is a rate-limiting operator, and also a\n * delay-like operator since output emissions do not necessarily occur at the\n * same time as they did on the source Observable.\n *\n * @example <caption>Emit the most recent click after a burst of clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = clicks.debounce(() => Rx.Observable.interval(1000));\n * result.subscribe(x => console.log(x));\n *\n * @see {@link audit}\n * @see {@link debounceTime}\n * @see {@link delayWhen}\n * @see {@link throttle}\n *\n * @param {function(value: T): SubscribableOrPromise} durationSelector A function\n * that receives a value from the source Observable, for computing the timeout\n * duration for each source value, returned as an Observable or a Promise.\n * @return {Observable} An Observable that delays the emissions of the source\n * Observable by the specified duration Observable returned by\n * `durationSelector`, and may drop some values if they occur too frequently.\n * @method debounce\n * @owner Observable\n */\nfunction debounce(durationSelector) {\n    return function (source) { return source.lift(new DebounceOperator(durationSelector)); };\n}\nexports.debounce = debounce;\nvar DebounceOperator = (function () {\n    function DebounceOperator(durationSelector) {\n        this.durationSelector = durationSelector;\n    }\n    DebounceOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new DebounceSubscriber(subscriber, this.durationSelector));\n    };\n    return DebounceOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar DebounceSubscriber = (function (_super) {\n    __extends(DebounceSubscriber, _super);\n    function DebounceSubscriber(destination, durationSelector) {\n        _super.call(this, destination);\n        this.durationSelector = durationSelector;\n        this.hasValue = false;\n        this.durationSubscription = null;\n    }\n    DebounceSubscriber.prototype._next = function (value) {\n        try {\n            var result = this.durationSelector.call(this, value);\n            if (result) {\n                this._tryNext(value, result);\n            }\n        }\n        catch (err) {\n            this.destination.error(err);\n        }\n    };\n    DebounceSubscriber.prototype._complete = function () {\n        this.emitValue();\n        this.destination.complete();\n    };\n    DebounceSubscriber.prototype._tryNext = function (value, duration) {\n        var subscription = this.durationSubscription;\n        this.value = value;\n        this.hasValue = true;\n        if (subscription) {\n            subscription.unsubscribe();\n            this.remove(subscription);\n        }\n        subscription = subscribeToResult_1.subscribeToResult(this, duration);\n        if (!subscription.closed) {\n            this.add(this.durationSubscription = subscription);\n        }\n    };\n    DebounceSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        this.emitValue();\n    };\n    DebounceSubscriber.prototype.notifyComplete = function () {\n        this.emitValue();\n    };\n    DebounceSubscriber.prototype.emitValue = function () {\n        if (this.hasValue) {\n            var value = this.value;\n            var subscription = this.durationSubscription;\n            if (subscription) {\n                this.durationSubscription = null;\n                subscription.unsubscribe();\n                this.remove(subscription);\n            }\n            this.value = null;\n            this.hasValue = false;\n            _super.prototype._next.call(this, value);\n        }\n    };\n    return DebounceSubscriber;\n}(OuterSubscriber_1.OuterSubscriber));\n//# sourceMappingURL=debounce.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/debounce.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/debounceTime.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/operators/debounceTime.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar async_1 = __webpack_require__(/*! ../scheduler/async */ \"./node_modules/rxjs/scheduler/async.js\");\n/**\n * Emits a value from the source Observable only after a particular time span\n * has passed without another source emission.\n *\n * <span class=\"informal\">It's like {@link delay}, but passes only the most\n * recent value from each burst of emissions.</span>\n *\n * <img src=\"./img/debounceTime.png\" width=\"100%\">\n *\n * `debounceTime` delays values emitted by the source Observable, but drops\n * previous pending delayed emissions if a new value arrives on the source\n * Observable. This operator keeps track of the most recent value from the\n * source Observable, and emits that only when `dueTime` enough time has passed\n * without any other value appearing on the source Observable. If a new value\n * appears before `dueTime` silence occurs, the previous value will be dropped\n * and will not be emitted on the output Observable.\n *\n * This is a rate-limiting operator, because it is impossible for more than one\n * value to be emitted in any time window of duration `dueTime`, but it is also\n * a delay-like operator since output emissions do not occur at the same time as\n * they did on the source Observable. Optionally takes a {@link IScheduler} for\n * managing timers.\n *\n * @example <caption>Emit the most recent click after a burst of clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = clicks.debounceTime(1000);\n * result.subscribe(x => console.log(x));\n *\n * @see {@link auditTime}\n * @see {@link debounce}\n * @see {@link delay}\n * @see {@link sampleTime}\n * @see {@link throttleTime}\n *\n * @param {number} dueTime The timeout duration in milliseconds (or the time\n * unit determined internally by the optional `scheduler`) for the window of\n * time required to wait for emission silence before emitting the most recent\n * source value.\n * @param {Scheduler} [scheduler=async] The {@link IScheduler} to use for\n * managing the timers that handle the timeout for each value.\n * @return {Observable} An Observable that delays the emissions of the source\n * Observable by the specified `dueTime`, and may drop some values if they occur\n * too frequently.\n * @method debounceTime\n * @owner Observable\n */\nfunction debounceTime(dueTime, scheduler) {\n    if (scheduler === void 0) { scheduler = async_1.async; }\n    return function (source) { return source.lift(new DebounceTimeOperator(dueTime, scheduler)); };\n}\nexports.debounceTime = debounceTime;\nvar DebounceTimeOperator = (function () {\n    function DebounceTimeOperator(dueTime, scheduler) {\n        this.dueTime = dueTime;\n        this.scheduler = scheduler;\n    }\n    DebounceTimeOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new DebounceTimeSubscriber(subscriber, this.dueTime, this.scheduler));\n    };\n    return DebounceTimeOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar DebounceTimeSubscriber = (function (_super) {\n    __extends(DebounceTimeSubscriber, _super);\n    function DebounceTimeSubscriber(destination, dueTime, scheduler) {\n        _super.call(this, destination);\n        this.dueTime = dueTime;\n        this.scheduler = scheduler;\n        this.debouncedSubscription = null;\n        this.lastValue = null;\n        this.hasValue = false;\n    }\n    DebounceTimeSubscriber.prototype._next = function (value) {\n        this.clearDebounce();\n        this.lastValue = value;\n        this.hasValue = true;\n        this.add(this.debouncedSubscription = this.scheduler.schedule(dispatchNext, this.dueTime, this));\n    };\n    DebounceTimeSubscriber.prototype._complete = function () {\n        this.debouncedNext();\n        this.destination.complete();\n    };\n    DebounceTimeSubscriber.prototype.debouncedNext = function () {\n        this.clearDebounce();\n        if (this.hasValue) {\n            this.destination.next(this.lastValue);\n            this.lastValue = null;\n            this.hasValue = false;\n        }\n    };\n    DebounceTimeSubscriber.prototype.clearDebounce = function () {\n        var debouncedSubscription = this.debouncedSubscription;\n        if (debouncedSubscription !== null) {\n            this.remove(debouncedSubscription);\n            debouncedSubscription.unsubscribe();\n            this.debouncedSubscription = null;\n        }\n    };\n    return DebounceTimeSubscriber;\n}(Subscriber_1.Subscriber));\nfunction dispatchNext(subscriber) {\n    subscriber.debouncedNext();\n}\n//# sourceMappingURL=debounceTime.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/debounceTime.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/defaultIfEmpty.js":
/*!*******************************************************!*\
  !*** ./node_modules/rxjs/operators/defaultIfEmpty.js ***!
  \*******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/* tslint:enable:max-line-length */\n/**\n * Emits a given value if the source Observable completes without emitting any\n * `next` value, otherwise mirrors the source Observable.\n *\n * <span class=\"informal\">If the source Observable turns out to be empty, then\n * this operator will emit a default value.</span>\n *\n * <img src=\"./img/defaultIfEmpty.png\" width=\"100%\">\n *\n * `defaultIfEmpty` emits the values emitted by the source Observable or a\n * specified default value if the source Observable is empty (completes without\n * having emitted any `next` value).\n *\n * @example <caption>If no clicks happen in 5 seconds, then emit \"no clicks\"</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var clicksBeforeFive = clicks.takeUntil(Rx.Observable.interval(5000));\n * var result = clicksBeforeFive.defaultIfEmpty('no clicks');\n * result.subscribe(x => console.log(x));\n *\n * @see {@link empty}\n * @see {@link last}\n *\n * @param {any} [defaultValue=null] The default value used if the source\n * Observable is empty.\n * @return {Observable} An Observable that emits either the specified\n * `defaultValue` if the source Observable emits no items, or the values emitted\n * by the source Observable.\n * @method defaultIfEmpty\n * @owner Observable\n */\nfunction defaultIfEmpty(defaultValue) {\n    if (defaultValue === void 0) { defaultValue = null; }\n    return function (source) { return source.lift(new DefaultIfEmptyOperator(defaultValue)); };\n}\nexports.defaultIfEmpty = defaultIfEmpty;\nvar DefaultIfEmptyOperator = (function () {\n    function DefaultIfEmptyOperator(defaultValue) {\n        this.defaultValue = defaultValue;\n    }\n    DefaultIfEmptyOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new DefaultIfEmptySubscriber(subscriber, this.defaultValue));\n    };\n    return DefaultIfEmptyOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar DefaultIfEmptySubscriber = (function (_super) {\n    __extends(DefaultIfEmptySubscriber, _super);\n    function DefaultIfEmptySubscriber(destination, defaultValue) {\n        _super.call(this, destination);\n        this.defaultValue = defaultValue;\n        this.isEmpty = true;\n    }\n    DefaultIfEmptySubscriber.prototype._next = function (value) {\n        this.isEmpty = false;\n        this.destination.next(value);\n    };\n    DefaultIfEmptySubscriber.prototype._complete = function () {\n        if (this.isEmpty) {\n            this.destination.next(this.defaultValue);\n        }\n        this.destination.complete();\n    };\n    return DefaultIfEmptySubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=defaultIfEmpty.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/defaultIfEmpty.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/delay.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/operators/delay.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar async_1 = __webpack_require__(/*! ../scheduler/async */ \"./node_modules/rxjs/scheduler/async.js\");\nvar isDate_1 = __webpack_require__(/*! ../util/isDate */ \"./node_modules/rxjs/util/isDate.js\");\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar Notification_1 = __webpack_require__(/*! ../Notification */ \"./node_modules/rxjs/Notification.js\");\n/**\n * Delays the emission of items from the source Observable by a given timeout or\n * until a given Date.\n *\n * <span class=\"informal\">Time shifts each item by some specified amount of\n * milliseconds.</span>\n *\n * <img src=\"./img/delay.png\" width=\"100%\">\n *\n * If the delay argument is a Number, this operator time shifts the source\n * Observable by that amount of time expressed in milliseconds. The relative\n * time intervals between the values are preserved.\n *\n * If the delay argument is a Date, this operator time shifts the start of the\n * Observable execution until the given date occurs.\n *\n * @example <caption>Delay each click by one second</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var delayedClicks = clicks.delay(1000); // each click emitted after 1 second\n * delayedClicks.subscribe(x => console.log(x));\n *\n * @example <caption>Delay all clicks until a future date happens</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var date = new Date('March 15, 2050 12:00:00'); // in the future\n * var delayedClicks = clicks.delay(date); // click emitted only after that date\n * delayedClicks.subscribe(x => console.log(x));\n *\n * @see {@link debounceTime}\n * @see {@link delayWhen}\n *\n * @param {number|Date} delay The delay duration in milliseconds (a `number`) or\n * a `Date` until which the emission of the source items is delayed.\n * @param {Scheduler} [scheduler=async] The IScheduler to use for\n * managing the timers that handle the time-shift for each item.\n * @return {Observable} An Observable that delays the emissions of the source\n * Observable by the specified timeout or Date.\n * @method delay\n * @owner Observable\n */\nfunction delay(delay, scheduler) {\n    if (scheduler === void 0) { scheduler = async_1.async; }\n    var absoluteDelay = isDate_1.isDate(delay);\n    var delayFor = absoluteDelay ? (+delay - scheduler.now()) : Math.abs(delay);\n    return function (source) { return source.lift(new DelayOperator(delayFor, scheduler)); };\n}\nexports.delay = delay;\nvar DelayOperator = (function () {\n    function DelayOperator(delay, scheduler) {\n        this.delay = delay;\n        this.scheduler = scheduler;\n    }\n    DelayOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new DelaySubscriber(subscriber, this.delay, this.scheduler));\n    };\n    return DelayOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar DelaySubscriber = (function (_super) {\n    __extends(DelaySubscriber, _super);\n    function DelaySubscriber(destination, delay, scheduler) {\n        _super.call(this, destination);\n        this.delay = delay;\n        this.scheduler = scheduler;\n        this.queue = [];\n        this.active = false;\n        this.errored = false;\n    }\n    DelaySubscriber.dispatch = function (state) {\n        var source = state.source;\n        var queue = source.queue;\n        var scheduler = state.scheduler;\n        var destination = state.destination;\n        while (queue.length > 0 && (queue[0].time - scheduler.now()) <= 0) {\n            queue.shift().notification.observe(destination);\n        }\n        if (queue.length > 0) {\n            var delay_1 = Math.max(0, queue[0].time - scheduler.now());\n            this.schedule(state, delay_1);\n        }\n        else {\n            this.unsubscribe();\n            source.active = false;\n        }\n    };\n    DelaySubscriber.prototype._schedule = function (scheduler) {\n        this.active = true;\n        this.add(scheduler.schedule(DelaySubscriber.dispatch, this.delay, {\n            source: this, destination: this.destination, scheduler: scheduler\n        }));\n    };\n    DelaySubscriber.prototype.scheduleNotification = function (notification) {\n        if (this.errored === true) {\n            return;\n        }\n        var scheduler = this.scheduler;\n        var message = new DelayMessage(scheduler.now() + this.delay, notification);\n        this.queue.push(message);\n        if (this.active === false) {\n            this._schedule(scheduler);\n        }\n    };\n    DelaySubscriber.prototype._next = function (value) {\n        this.scheduleNotification(Notification_1.Notification.createNext(value));\n    };\n    DelaySubscriber.prototype._error = function (err) {\n        this.errored = true;\n        this.queue = [];\n        this.destination.error(err);\n    };\n    DelaySubscriber.prototype._complete = function () {\n        this.scheduleNotification(Notification_1.Notification.createComplete());\n    };\n    return DelaySubscriber;\n}(Subscriber_1.Subscriber));\nvar DelayMessage = (function () {\n    function DelayMessage(time, notification) {\n        this.time = time;\n        this.notification = notification;\n    }\n    return DelayMessage;\n}());\n//# sourceMappingURL=delay.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/delay.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/distinctUntilChanged.js":
/*!*************************************************************!*\
  !*** ./node_modules/rxjs/operators/distinctUntilChanged.js ***!
  \*************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar tryCatch_1 = __webpack_require__(/*! ../util/tryCatch */ \"./node_modules/rxjs/util/tryCatch.js\");\nvar errorObject_1 = __webpack_require__(/*! ../util/errorObject */ \"./node_modules/rxjs/util/errorObject.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that emits all items emitted by the source Observable that are distinct by comparison from the previous item.\n *\n * If a comparator function is provided, then it will be called for each item to test for whether or not that value should be emitted.\n *\n * If a comparator function is not provided, an equality check is used by default.\n *\n * @example <caption>A simple example with numbers</caption>\n * Observable.of(1, 1, 2, 2, 2, 1, 1, 2, 3, 3, 4)\n *   .distinctUntilChanged()\n *   .subscribe(x => console.log(x)); // 1, 2, 1, 2, 3, 4\n *\n * @example <caption>An example using a compare function</caption>\n * interface Person {\n *    age: number,\n *    name: string\n * }\n *\n * Observable.of<Person>(\n *     { age: 4, name: 'Foo'},\n *     { age: 7, name: 'Bar'},\n *     { age: 5, name: 'Foo'})\n *     { age: 6, name: 'Foo'})\n *     .distinctUntilChanged((p: Person, q: Person) => p.name === q.name)\n *     .subscribe(x => console.log(x));\n *\n * // displays:\n * // { age: 4, name: 'Foo' }\n * // { age: 7, name: 'Bar' }\n * // { age: 5, name: 'Foo' }\n *\n * @see {@link distinct}\n * @see {@link distinctUntilKeyChanged}\n *\n * @param {function} [compare] Optional comparison function called to test if an item is distinct from the previous item in the source.\n * @return {Observable} An Observable that emits items from the source Observable with distinct values.\n * @method distinctUntilChanged\n * @owner Observable\n */\nfunction distinctUntilChanged(compare, keySelector) {\n    return function (source) { return source.lift(new DistinctUntilChangedOperator(compare, keySelector)); };\n}\nexports.distinctUntilChanged = distinctUntilChanged;\nvar DistinctUntilChangedOperator = (function () {\n    function DistinctUntilChangedOperator(compare, keySelector) {\n        this.compare = compare;\n        this.keySelector = keySelector;\n    }\n    DistinctUntilChangedOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new DistinctUntilChangedSubscriber(subscriber, this.compare, this.keySelector));\n    };\n    return DistinctUntilChangedOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar DistinctUntilChangedSubscriber = (function (_super) {\n    __extends(DistinctUntilChangedSubscriber, _super);\n    function DistinctUntilChangedSubscriber(destination, compare, keySelector) {\n        _super.call(this, destination);\n        this.keySelector = keySelector;\n        this.hasKey = false;\n        if (typeof compare === 'function') {\n            this.compare = compare;\n        }\n    }\n    DistinctUntilChangedSubscriber.prototype.compare = function (x, y) {\n        return x === y;\n    };\n    DistinctUntilChangedSubscriber.prototype._next = function (value) {\n        var keySelector = this.keySelector;\n        var key = value;\n        if (keySelector) {\n            key = tryCatch_1.tryCatch(this.keySelector)(value);\n            if (key === errorObject_1.errorObject) {\n                return this.destination.error(errorObject_1.errorObject.e);\n            }\n        }\n        var result = false;\n        if (this.hasKey) {\n            result = tryCatch_1.tryCatch(this.compare)(this.key, key);\n            if (result === errorObject_1.errorObject) {\n                return this.destination.error(errorObject_1.errorObject.e);\n            }\n        }\n        else {\n            this.hasKey = true;\n        }\n        if (Boolean(result) === false) {\n            this.key = key;\n            this.destination.next(value);\n        }\n    };\n    return DistinctUntilChangedSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=distinctUntilChanged.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/distinctUntilChanged.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/filter.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/operators/filter.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/* tslint:enable:max-line-length */\n/**\n * Filter items emitted by the source Observable by only emitting those that\n * satisfy a specified predicate.\n *\n * <span class=\"informal\">Like\n * [Array.prototype.filter()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter),\n * it only emits a value from the source if it passes a criterion function.</span>\n *\n * <img src=\"./img/filter.png\" width=\"100%\">\n *\n * Similar to the well-known `Array.prototype.filter` method, this operator\n * takes values from the source Observable, passes them through a `predicate`\n * function and only emits those values that yielded `true`.\n *\n * @example <caption>Emit only click events whose target was a DIV element</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var clicksOnDivs = clicks.filter(ev => ev.target.tagName === 'DIV');\n * clicksOnDivs.subscribe(x => console.log(x));\n *\n * @see {@link distinct}\n * @see {@link distinctUntilChanged}\n * @see {@link distinctUntilKeyChanged}\n * @see {@link ignoreElements}\n * @see {@link partition}\n * @see {@link skip}\n *\n * @param {function(value: T, index: number): boolean} predicate A function that\n * evaluates each value emitted by the source Observable. If it returns `true`,\n * the value is emitted, if `false` the value is not passed to the output\n * Observable. The `index` parameter is the number `i` for the i-th source\n * emission that has happened since the subscription, starting from the number\n * `0`.\n * @param {any} [thisArg] An optional argument to determine the value of `this`\n * in the `predicate` function.\n * @return {Observable} An Observable of values from the source that were\n * allowed by the `predicate` function.\n * @method filter\n * @owner Observable\n */\nfunction filter(predicate, thisArg) {\n    return function filterOperatorFunction(source) {\n        return source.lift(new FilterOperator(predicate, thisArg));\n    };\n}\nexports.filter = filter;\nvar FilterOperator = (function () {\n    function FilterOperator(predicate, thisArg) {\n        this.predicate = predicate;\n        this.thisArg = thisArg;\n    }\n    FilterOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new FilterSubscriber(subscriber, this.predicate, this.thisArg));\n    };\n    return FilterOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar FilterSubscriber = (function (_super) {\n    __extends(FilterSubscriber, _super);\n    function FilterSubscriber(destination, predicate, thisArg) {\n        _super.call(this, destination);\n        this.predicate = predicate;\n        this.thisArg = thisArg;\n        this.count = 0;\n    }\n    // the try catch block below is left specifically for\n    // optimization and perf reasons. a tryCatcher is not necessary here.\n    FilterSubscriber.prototype._next = function (value) {\n        var result;\n        try {\n            result = this.predicate.call(this.thisArg, value, this.count++);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        if (result) {\n            this.destination.next(value);\n        }\n    };\n    return FilterSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=filter.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/filter.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/finalize.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operators/finalize.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar Subscription_1 = __webpack_require__(/*! ../Subscription */ \"./node_modules/rxjs/Subscription.js\");\n/**\n * Returns an Observable that mirrors the source Observable, but will call a specified function when\n * the source terminates on complete or error.\n * @param {function} callback Function to be called when source terminates.\n * @return {Observable} An Observable that mirrors the source, but will call the specified function on termination.\n * @method finally\n * @owner Observable\n */\nfunction finalize(callback) {\n    return function (source) { return source.lift(new FinallyOperator(callback)); };\n}\nexports.finalize = finalize;\nvar FinallyOperator = (function () {\n    function FinallyOperator(callback) {\n        this.callback = callback;\n    }\n    FinallyOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new FinallySubscriber(subscriber, this.callback));\n    };\n    return FinallyOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar FinallySubscriber = (function (_super) {\n    __extends(FinallySubscriber, _super);\n    function FinallySubscriber(destination, callback) {\n        _super.call(this, destination);\n        this.add(new Subscription_1.Subscription(callback));\n    }\n    return FinallySubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=finalize.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/finalize.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/last.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operators/last.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar EmptyError_1 = __webpack_require__(/*! ../util/EmptyError */ \"./node_modules/rxjs/util/EmptyError.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that emits only the last item emitted by the source Observable.\n * It optionally takes a predicate function as a parameter, in which case, rather than emitting\n * the last item from the source Observable, the resulting Observable will emit the last item\n * from the source Observable that satisfies the predicate.\n *\n * <img src=\"./img/last.png\" width=\"100%\">\n *\n * @throws {EmptyError} Delivers an EmptyError to the Observer's `error`\n * callback if the Observable completes before any `next` notification was sent.\n * @param {function} predicate - The condition any source emitted item has to satisfy.\n * @return {Observable} An Observable that emits only the last item satisfying the given condition\n * from the source, or an NoSuchElementException if no such items are emitted.\n * @throws - Throws if no items that match the predicate are emitted by the source Observable.\n * @method last\n * @owner Observable\n */\nfunction last(predicate, resultSelector, defaultValue) {\n    return function (source) { return source.lift(new LastOperator(predicate, resultSelector, defaultValue, source)); };\n}\nexports.last = last;\nvar LastOperator = (function () {\n    function LastOperator(predicate, resultSelector, defaultValue, source) {\n        this.predicate = predicate;\n        this.resultSelector = resultSelector;\n        this.defaultValue = defaultValue;\n        this.source = source;\n    }\n    LastOperator.prototype.call = function (observer, source) {\n        return source.subscribe(new LastSubscriber(observer, this.predicate, this.resultSelector, this.defaultValue, this.source));\n    };\n    return LastOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar LastSubscriber = (function (_super) {\n    __extends(LastSubscriber, _super);\n    function LastSubscriber(destination, predicate, resultSelector, defaultValue, source) {\n        _super.call(this, destination);\n        this.predicate = predicate;\n        this.resultSelector = resultSelector;\n        this.defaultValue = defaultValue;\n        this.source = source;\n        this.hasValue = false;\n        this.index = 0;\n        if (typeof defaultValue !== 'undefined') {\n            this.lastValue = defaultValue;\n            this.hasValue = true;\n        }\n    }\n    LastSubscriber.prototype._next = function (value) {\n        var index = this.index++;\n        if (this.predicate) {\n            this._tryPredicate(value, index);\n        }\n        else {\n            if (this.resultSelector) {\n                this._tryResultSelector(value, index);\n                return;\n            }\n            this.lastValue = value;\n            this.hasValue = true;\n        }\n    };\n    LastSubscriber.prototype._tryPredicate = function (value, index) {\n        var result;\n        try {\n            result = this.predicate(value, index, this.source);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        if (result) {\n            if (this.resultSelector) {\n                this._tryResultSelector(value, index);\n                return;\n            }\n            this.lastValue = value;\n            this.hasValue = true;\n        }\n    };\n    LastSubscriber.prototype._tryResultSelector = function (value, index) {\n        var result;\n        try {\n            result = this.resultSelector(value, index);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        this.lastValue = result;\n        this.hasValue = true;\n    };\n    LastSubscriber.prototype._complete = function () {\n        var destination = this.destination;\n        if (this.hasValue) {\n            destination.next(this.lastValue);\n            destination.complete();\n        }\n        else {\n            destination.error(new EmptyError_1.EmptyError);\n        }\n    };\n    return LastSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=last.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/last.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/map.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operators/map.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/**\n * Applies a given `project` function to each value emitted by the source\n * Observable, and emits the resulting values as an Observable.\n *\n * <span class=\"informal\">Like [Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map),\n * it passes each source value through a transformation function to get\n * corresponding output values.</span>\n *\n * <img src=\"./img/map.png\" width=\"100%\">\n *\n * Similar to the well known `Array.prototype.map` function, this operator\n * applies a projection to each value and emits that projection in the output\n * Observable.\n *\n * @example <caption>Map every click to the clientX position of that click</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var positions = clicks.map(ev => ev.clientX);\n * positions.subscribe(x => console.log(x));\n *\n * @see {@link mapTo}\n * @see {@link pluck}\n *\n * @param {function(value: T, index: number): R} project The function to apply\n * to each `value` emitted by the source Observable. The `index` parameter is\n * the number `i` for the i-th emission that has happened since the\n * subscription, starting from the number `0`.\n * @param {any} [thisArg] An optional argument to define what `this` is in the\n * `project` function.\n * @return {Observable<R>} An Observable that emits the values from the source\n * Observable transformed by the given `project` function.\n * @method map\n * @owner Observable\n */\nfunction map(project, thisArg) {\n    return function mapOperation(source) {\n        if (typeof project !== 'function') {\n            throw new TypeError('argument is not a function. Are you looking for `mapTo()`?');\n        }\n        return source.lift(new MapOperator(project, thisArg));\n    };\n}\nexports.map = map;\nvar MapOperator = (function () {\n    function MapOperator(project, thisArg) {\n        this.project = project;\n        this.thisArg = thisArg;\n    }\n    MapOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new MapSubscriber(subscriber, this.project, this.thisArg));\n    };\n    return MapOperator;\n}());\nexports.MapOperator = MapOperator;\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar MapSubscriber = (function (_super) {\n    __extends(MapSubscriber, _super);\n    function MapSubscriber(destination, project, thisArg) {\n        _super.call(this, destination);\n        this.project = project;\n        this.count = 0;\n        this.thisArg = thisArg || this;\n    }\n    // NOTE: This looks unoptimized, but it's actually purposefully NOT\n    // using try/catch optimizations.\n    MapSubscriber.prototype._next = function (value) {\n        var result;\n        try {\n            result = this.project.call(this.thisArg, value, this.count++);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        this.destination.next(result);\n    };\n    return MapSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=map.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/map.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/merge.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/operators/merge.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar merge_1 = __webpack_require__(/*! ../observable/merge */ \"./node_modules/rxjs/observable/merge.js\");\nvar merge_2 = __webpack_require__(/*! ../observable/merge */ \"./node_modules/rxjs/observable/merge.js\");\nexports.mergeStatic = merge_2.merge;\n/* tslint:enable:max-line-length */\n/**\n * Creates an output Observable which concurrently emits all values from every\n * given input Observable.\n *\n * <span class=\"informal\">Flattens multiple Observables together by blending\n * their values into one Observable.</span>\n *\n * <img src=\"./img/merge.png\" width=\"100%\">\n *\n * `merge` subscribes to each given input Observable (either the source or an\n * Observable given as argument), and simply forwards (without doing any\n * transformation) all the values from all the input Observables to the output\n * Observable. The output Observable only completes once all input Observables\n * have completed. Any error delivered by an input Observable will be immediately\n * emitted on the output Observable.\n *\n * @example <caption>Merge together two Observables: 1s interval and clicks</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var timer = Rx.Observable.interval(1000);\n * var clicksOrTimer = clicks.merge(timer);\n * clicksOrTimer.subscribe(x => console.log(x));\n *\n * @example <caption>Merge together 3 Observables, but only 2 run concurrently</caption>\n * var timer1 = Rx.Observable.interval(1000).take(10);\n * var timer2 = Rx.Observable.interval(2000).take(6);\n * var timer3 = Rx.Observable.interval(500).take(10);\n * var concurrent = 2; // the argument\n * var merged = timer1.merge(timer2, timer3, concurrent);\n * merged.subscribe(x => console.log(x));\n *\n * @see {@link mergeAll}\n * @see {@link mergeMap}\n * @see {@link mergeMapTo}\n * @see {@link mergeScan}\n *\n * @param {ObservableInput} other An input Observable to merge with the source\n * Observable. More than one input Observables may be given as argument.\n * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of input\n * Observables being subscribed to concurrently.\n * @param {Scheduler} [scheduler=null] The IScheduler to use for managing\n * concurrency of input Observables.\n * @return {Observable} An Observable that emits items that are the result of\n * every input Observable.\n * @method merge\n * @owner Observable\n */\nfunction merge() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return function (source) { return source.lift.call(merge_1.merge.apply(void 0, [source].concat(observables))); };\n}\nexports.merge = merge;\n//# sourceMappingURL=merge.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/merge.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/mergeAll.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operators/mergeAll.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar mergeMap_1 = __webpack_require__(/*! ./mergeMap */ \"./node_modules/rxjs/operators/mergeMap.js\");\nvar identity_1 = __webpack_require__(/*! ../util/identity */ \"./node_modules/rxjs/util/identity.js\");\n/**\n * Converts a higher-order Observable into a first-order Observable which\n * concurrently delivers all values that are emitted on the inner Observables.\n *\n * <span class=\"informal\">Flattens an Observable-of-Observables.</span>\n *\n * <img src=\"./img/mergeAll.png\" width=\"100%\">\n *\n * `mergeAll` subscribes to an Observable that emits Observables, also known as\n * a higher-order Observable. Each time it observes one of these emitted inner\n * Observables, it subscribes to that and delivers all the values from the\n * inner Observable on the output Observable. The output Observable only\n * completes once all inner Observables have completed. Any error delivered by\n * a inner Observable will be immediately emitted on the output Observable.\n *\n * @example <caption>Spawn a new interval Observable for each click event, and blend their outputs as one Observable</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var higherOrder = clicks.map((ev) => Rx.Observable.interval(1000));\n * var firstOrder = higherOrder.mergeAll();\n * firstOrder.subscribe(x => console.log(x));\n *\n * @example <caption>Count from 0 to 9 every second for each click, but only allow 2 concurrent timers</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var higherOrder = clicks.map((ev) => Rx.Observable.interval(1000).take(10));\n * var firstOrder = higherOrder.mergeAll(2);\n * firstOrder.subscribe(x => console.log(x));\n *\n * @see {@link combineAll}\n * @see {@link concatAll}\n * @see {@link exhaust}\n * @see {@link merge}\n * @see {@link mergeMap}\n * @see {@link mergeMapTo}\n * @see {@link mergeScan}\n * @see {@link switch}\n * @see {@link zipAll}\n *\n * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of inner\n * Observables being subscribed to concurrently.\n * @return {Observable} An Observable that emits values coming from all the\n * inner Observables emitted by the source Observable.\n * @method mergeAll\n * @owner Observable\n */\nfunction mergeAll(concurrent) {\n    if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }\n    return mergeMap_1.mergeMap(identity_1.identity, null, concurrent);\n}\nexports.mergeAll = mergeAll;\n//# sourceMappingURL=mergeAll.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/mergeAll.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/mergeMap.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operators/mergeMap.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\n/* tslint:enable:max-line-length */\n/**\n * Projects each source value to an Observable which is merged in the output\n * Observable.\n *\n * <span class=\"informal\">Maps each value to an Observable, then flattens all of\n * these inner Observables using {@link mergeAll}.</span>\n *\n * <img src=\"./img/mergeMap.png\" width=\"100%\">\n *\n * Returns an Observable that emits items based on applying a function that you\n * supply to each item emitted by the source Observable, where that function\n * returns an Observable, and then merging those resulting Observables and\n * emitting the results of this merger.\n *\n * @example <caption>Map and flatten each letter to an Observable ticking every 1 second</caption>\n * var letters = Rx.Observable.of('a', 'b', 'c');\n * var result = letters.mergeMap(x =>\n *   Rx.Observable.interval(1000).map(i => x+i)\n * );\n * result.subscribe(x => console.log(x));\n *\n * // Results in the following:\n * // a0\n * // b0\n * // c0\n * // a1\n * // b1\n * // c1\n * // continues to list a,b,c with respective ascending integers\n *\n * @see {@link concatMap}\n * @see {@link exhaustMap}\n * @see {@link merge}\n * @see {@link mergeAll}\n * @see {@link mergeMapTo}\n * @see {@link mergeScan}\n * @see {@link switchMap}\n *\n * @param {function(value: T, ?index: number): ObservableInput} project A function\n * that, when applied to an item emitted by the source Observable, returns an\n * Observable.\n * @param {function(outerValue: T, innerValue: I, outerIndex: number, innerIndex: number): any} [resultSelector]\n * A function to produce the value on the output Observable based on the values\n * and the indices of the source (outer) emission and the inner Observable\n * emission. The arguments passed to this function are:\n * - `outerValue`: the value that came from the source\n * - `innerValue`: the value that came from the projected Observable\n * - `outerIndex`: the \"index\" of the value that came from the source\n * - `innerIndex`: the \"index\" of the value from the projected Observable\n * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of input\n * Observables being subscribed to concurrently.\n * @return {Observable} An Observable that emits the result of applying the\n * projection function (and the optional `resultSelector`) to each item emitted\n * by the source Observable and merging the results of the Observables obtained\n * from this transformation.\n * @method mergeMap\n * @owner Observable\n */\nfunction mergeMap(project, resultSelector, concurrent) {\n    if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }\n    return function mergeMapOperatorFunction(source) {\n        if (typeof resultSelector === 'number') {\n            concurrent = resultSelector;\n            resultSelector = null;\n        }\n        return source.lift(new MergeMapOperator(project, resultSelector, concurrent));\n    };\n}\nexports.mergeMap = mergeMap;\nvar MergeMapOperator = (function () {\n    function MergeMapOperator(project, resultSelector, concurrent) {\n        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }\n        this.project = project;\n        this.resultSelector = resultSelector;\n        this.concurrent = concurrent;\n    }\n    MergeMapOperator.prototype.call = function (observer, source) {\n        return source.subscribe(new MergeMapSubscriber(observer, this.project, this.resultSelector, this.concurrent));\n    };\n    return MergeMapOperator;\n}());\nexports.MergeMapOperator = MergeMapOperator;\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar MergeMapSubscriber = (function (_super) {\n    __extends(MergeMapSubscriber, _super);\n    function MergeMapSubscriber(destination, project, resultSelector, concurrent) {\n        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }\n        _super.call(this, destination);\n        this.project = project;\n        this.resultSelector = resultSelector;\n        this.concurrent = concurrent;\n        this.hasCompleted = false;\n        this.buffer = [];\n        this.active = 0;\n        this.index = 0;\n    }\n    MergeMapSubscriber.prototype._next = function (value) {\n        if (this.active < this.concurrent) {\n            this._tryNext(value);\n        }\n        else {\n            this.buffer.push(value);\n        }\n    };\n    MergeMapSubscriber.prototype._tryNext = function (value) {\n        var result;\n        var index = this.index++;\n        try {\n            result = this.project(value, index);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        this.active++;\n        this._innerSub(result, value, index);\n    };\n    MergeMapSubscriber.prototype._innerSub = function (ish, value, index) {\n        this.add(subscribeToResult_1.subscribeToResult(this, ish, value, index));\n    };\n    MergeMapSubscriber.prototype._complete = function () {\n        this.hasCompleted = true;\n        if (this.active === 0 && this.buffer.length === 0) {\n            this.destination.complete();\n        }\n    };\n    MergeMapSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        if (this.resultSelector) {\n            this._notifyResultSelector(outerValue, innerValue, outerIndex, innerIndex);\n        }\n        else {\n            this.destination.next(innerValue);\n        }\n    };\n    MergeMapSubscriber.prototype._notifyResultSelector = function (outerValue, innerValue, outerIndex, innerIndex) {\n        var result;\n        try {\n            result = this.resultSelector(outerValue, innerValue, outerIndex, innerIndex);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        this.destination.next(result);\n    };\n    MergeMapSubscriber.prototype.notifyComplete = function (innerSub) {\n        var buffer = this.buffer;\n        this.remove(innerSub);\n        this.active--;\n        if (buffer.length > 0) {\n            this._next(buffer.shift());\n        }\n        else if (this.active === 0 && this.hasCompleted) {\n            this.destination.complete();\n        }\n    };\n    return MergeMapSubscriber;\n}(OuterSubscriber_1.OuterSubscriber));\nexports.MergeMapSubscriber = MergeMapSubscriber;\n//# sourceMappingURL=mergeMap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/mergeMap.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/observeOn.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/operators/observeOn.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar Notification_1 = __webpack_require__(/*! ../Notification */ \"./node_modules/rxjs/Notification.js\");\n/**\n *\n * Re-emits all notifications from source Observable with specified scheduler.\n *\n * <span class=\"informal\">Ensure a specific scheduler is used, from outside of an Observable.</span>\n *\n * `observeOn` is an operator that accepts a scheduler as a first parameter, which will be used to reschedule\n * notifications emitted by the source Observable. It might be useful, if you do not have control over\n * internal scheduler of a given Observable, but want to control when its values are emitted nevertheless.\n *\n * Returned Observable emits the same notifications (nexted values, complete and error events) as the source Observable,\n * but rescheduled with provided scheduler. Note that this doesn't mean that source Observables internal\n * scheduler will be replaced in any way. Original scheduler still will be used, but when the source Observable emits\n * notification, it will be immediately scheduled again - this time with scheduler passed to `observeOn`.\n * An anti-pattern would be calling `observeOn` on Observable that emits lots of values synchronously, to split\n * that emissions into asynchronous chunks. For this to happen, scheduler would have to be passed into the source\n * Observable directly (usually into the operator that creates it). `observeOn` simply delays notifications a\n * little bit more, to ensure that they are emitted at expected moments.\n *\n * As a matter of fact, `observeOn` accepts second parameter, which specifies in milliseconds with what delay notifications\n * will be emitted. The main difference between {@link delay} operator and `observeOn` is that `observeOn`\n * will delay all notifications - including error notifications - while `delay` will pass through error\n * from source Observable immediately when it is emitted. In general it is highly recommended to use `delay` operator\n * for any kind of delaying of values in the stream, while using `observeOn` to specify which scheduler should be used\n * for notification emissions in general.\n *\n * @example <caption>Ensure values in subscribe are called just before browser repaint.</caption>\n * const intervals = Rx.Observable.interval(10); // Intervals are scheduled\n *                                               // with async scheduler by default...\n *\n * intervals\n * .observeOn(Rx.Scheduler.animationFrame)       // ...but we will observe on animationFrame\n * .subscribe(val => {                           // scheduler to ensure smooth animation.\n *   someDiv.style.height = val + 'px';\n * });\n *\n * @see {@link delay}\n *\n * @param {IScheduler} scheduler Scheduler that will be used to reschedule notifications from source Observable.\n * @param {number} [delay] Number of milliseconds that states with what delay every notification should be rescheduled.\n * @return {Observable<T>} Observable that emits the same notifications as the source Observable,\n * but with provided scheduler.\n *\n * @method observeOn\n * @owner Observable\n */\nfunction observeOn(scheduler, delay) {\n    if (delay === void 0) { delay = 0; }\n    return function observeOnOperatorFunction(source) {\n        return source.lift(new ObserveOnOperator(scheduler, delay));\n    };\n}\nexports.observeOn = observeOn;\nvar ObserveOnOperator = (function () {\n    function ObserveOnOperator(scheduler, delay) {\n        if (delay === void 0) { delay = 0; }\n        this.scheduler = scheduler;\n        this.delay = delay;\n    }\n    ObserveOnOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new ObserveOnSubscriber(subscriber, this.scheduler, this.delay));\n    };\n    return ObserveOnOperator;\n}());\nexports.ObserveOnOperator = ObserveOnOperator;\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar ObserveOnSubscriber = (function (_super) {\n    __extends(ObserveOnSubscriber, _super);\n    function ObserveOnSubscriber(destination, scheduler, delay) {\n        if (delay === void 0) { delay = 0; }\n        _super.call(this, destination);\n        this.scheduler = scheduler;\n        this.delay = delay;\n    }\n    ObserveOnSubscriber.dispatch = function (arg) {\n        var notification = arg.notification, destination = arg.destination;\n        notification.observe(destination);\n        this.unsubscribe();\n    };\n    ObserveOnSubscriber.prototype.scheduleMessage = function (notification) {\n        this.add(this.scheduler.schedule(ObserveOnSubscriber.dispatch, this.delay, new ObserveOnMessage(notification, this.destination)));\n    };\n    ObserveOnSubscriber.prototype._next = function (value) {\n        this.scheduleMessage(Notification_1.Notification.createNext(value));\n    };\n    ObserveOnSubscriber.prototype._error = function (err) {\n        this.scheduleMessage(Notification_1.Notification.createError(err));\n    };\n    ObserveOnSubscriber.prototype._complete = function () {\n        this.scheduleMessage(Notification_1.Notification.createComplete());\n    };\n    return ObserveOnSubscriber;\n}(Subscriber_1.Subscriber));\nexports.ObserveOnSubscriber = ObserveOnSubscriber;\nvar ObserveOnMessage = (function () {\n    function ObserveOnMessage(notification, destination) {\n        this.notification = notification;\n        this.destination = destination;\n    }\n    return ObserveOnMessage;\n}());\nexports.ObserveOnMessage = ObserveOnMessage;\n//# sourceMappingURL=observeOn.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/observeOn.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/race.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operators/race.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar isArray_1 = __webpack_require__(/*! ../util/isArray */ \"./node_modules/rxjs/util/isArray.js\");\nvar race_1 = __webpack_require__(/*! ../observable/race */ \"./node_modules/rxjs/observable/race.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that mirrors the first source Observable to emit an item\n * from the combination of this Observable and supplied Observables.\n * @param {...Observables} ...observables Sources used to race for which Observable emits first.\n * @return {Observable} An Observable that mirrors the output of the first Observable to emit an item.\n * @method race\n * @owner Observable\n */\nfunction race() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return function raceOperatorFunction(source) {\n        // if the only argument is an array, it was most likely called with\n        // `pair([obs1, obs2, ...])`\n        if (observables.length === 1 && isArray_1.isArray(observables[0])) {\n            observables = observables[0];\n        }\n        return source.lift.call(race_1.race.apply(void 0, [source].concat(observables)));\n    };\n}\nexports.race = race;\n//# sourceMappingURL=race.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/race.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/reduce.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/operators/reduce.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar scan_1 = __webpack_require__(/*! ./scan */ \"./node_modules/rxjs/operators/scan.js\");\nvar takeLast_1 = __webpack_require__(/*! ./takeLast */ \"./node_modules/rxjs/operators/takeLast.js\");\nvar defaultIfEmpty_1 = __webpack_require__(/*! ./defaultIfEmpty */ \"./node_modules/rxjs/operators/defaultIfEmpty.js\");\nvar pipe_1 = __webpack_require__(/*! ../util/pipe */ \"./node_modules/rxjs/util/pipe.js\");\n/* tslint:enable:max-line-length */\n/**\n * Applies an accumulator function over the source Observable, and returns the\n * accumulated result when the source completes, given an optional seed value.\n *\n * <span class=\"informal\">Combines together all values emitted on the source,\n * using an accumulator function that knows how to join a new source value into\n * the accumulation from the past.</span>\n *\n * <img src=\"./img/reduce.png\" width=\"100%\">\n *\n * Like\n * [Array.prototype.reduce()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce),\n * `reduce` applies an `accumulator` function against an accumulation and each\n * value of the source Observable (from the past) to reduce it to a single\n * value, emitted on the output Observable. Note that `reduce` will only emit\n * one value, only when the source Observable completes. It is equivalent to\n * applying operator {@link scan} followed by operator {@link last}.\n *\n * Returns an Observable that applies a specified `accumulator` function to each\n * item emitted by the source Observable. If a `seed` value is specified, then\n * that value will be used as the initial value for the accumulator. If no seed\n * value is specified, the first item of the source is used as the seed.\n *\n * @example <caption>Count the number of click events that happened in 5 seconds</caption>\n * var clicksInFiveSeconds = Rx.Observable.fromEvent(document, 'click')\n *   .takeUntil(Rx.Observable.interval(5000));\n * var ones = clicksInFiveSeconds.mapTo(1);\n * var seed = 0;\n * var count = ones.reduce((acc, one) => acc + one, seed);\n * count.subscribe(x => console.log(x));\n *\n * @see {@link count}\n * @see {@link expand}\n * @see {@link mergeScan}\n * @see {@link scan}\n *\n * @param {function(acc: R, value: T, index: number): R} accumulator The accumulator function\n * called on each source value.\n * @param {R} [seed] The initial accumulation value.\n * @return {Observable<R>} An Observable that emits a single value that is the\n * result of accumulating the values emitted by the source Observable.\n * @method reduce\n * @owner Observable\n */\nfunction reduce(accumulator, seed) {\n    // providing a seed of `undefined` *should* be valid and trigger\n    // hasSeed! so don't use `seed !== undefined` checks!\n    // For this reason, we have to check it here at the original call site\n    // otherwise inside Operator/Subscriber we won't know if `undefined`\n    // means they didn't provide anything or if they literally provided `undefined`\n    if (arguments.length >= 2) {\n        return function reduceOperatorFunctionWithSeed(source) {\n            return pipe_1.pipe(scan_1.scan(accumulator, seed), takeLast_1.takeLast(1), defaultIfEmpty_1.defaultIfEmpty(seed))(source);\n        };\n    }\n    return function reduceOperatorFunction(source) {\n        return pipe_1.pipe(scan_1.scan(function (acc, value, index) {\n            return accumulator(acc, value, index + 1);\n        }), takeLast_1.takeLast(1))(source);\n    };\n}\nexports.reduce = reduce;\n//# sourceMappingURL=reduce.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/reduce.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/scan.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operators/scan.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/* tslint:enable:max-line-length */\n/**\n * Applies an accumulator function over the source Observable, and returns each\n * intermediate result, with an optional seed value.\n *\n * <span class=\"informal\">It's like {@link reduce}, but emits the current\n * accumulation whenever the source emits a value.</span>\n *\n * <img src=\"./img/scan.png\" width=\"100%\">\n *\n * Combines together all values emitted on the source, using an accumulator\n * function that knows how to join a new source value into the accumulation from\n * the past. Is similar to {@link reduce}, but emits the intermediate\n * accumulations.\n *\n * Returns an Observable that applies a specified `accumulator` function to each\n * item emitted by the source Observable. If a `seed` value is specified, then\n * that value will be used as the initial value for the accumulator. If no seed\n * value is specified, the first item of the source is used as the seed.\n *\n * @example <caption>Count the number of click events</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var ones = clicks.mapTo(1);\n * var seed = 0;\n * var count = ones.scan((acc, one) => acc + one, seed);\n * count.subscribe(x => console.log(x));\n *\n * @see {@link expand}\n * @see {@link mergeScan}\n * @see {@link reduce}\n *\n * @param {function(acc: R, value: T, index: number): R} accumulator\n * The accumulator function called on each source value.\n * @param {T|R} [seed] The initial accumulation value.\n * @return {Observable<R>} An observable of the accumulated values.\n * @method scan\n * @owner Observable\n */\nfunction scan(accumulator, seed) {\n    var hasSeed = false;\n    // providing a seed of `undefined` *should* be valid and trigger\n    // hasSeed! so don't use `seed !== undefined` checks!\n    // For this reason, we have to check it here at the original call site\n    // otherwise inside Operator/Subscriber we won't know if `undefined`\n    // means they didn't provide anything or if they literally provided `undefined`\n    if (arguments.length >= 2) {\n        hasSeed = true;\n    }\n    return function scanOperatorFunction(source) {\n        return source.lift(new ScanOperator(accumulator, seed, hasSeed));\n    };\n}\nexports.scan = scan;\nvar ScanOperator = (function () {\n    function ScanOperator(accumulator, seed, hasSeed) {\n        if (hasSeed === void 0) { hasSeed = false; }\n        this.accumulator = accumulator;\n        this.seed = seed;\n        this.hasSeed = hasSeed;\n    }\n    ScanOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new ScanSubscriber(subscriber, this.accumulator, this.seed, this.hasSeed));\n    };\n    return ScanOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar ScanSubscriber = (function (_super) {\n    __extends(ScanSubscriber, _super);\n    function ScanSubscriber(destination, accumulator, _seed, hasSeed) {\n        _super.call(this, destination);\n        this.accumulator = accumulator;\n        this._seed = _seed;\n        this.hasSeed = hasSeed;\n        this.index = 0;\n    }\n    Object.defineProperty(ScanSubscriber.prototype, \"seed\", {\n        get: function () {\n            return this._seed;\n        },\n        set: function (value) {\n            this.hasSeed = true;\n            this._seed = value;\n        },\n        enumerable: true,\n        configurable: true\n    });\n    ScanSubscriber.prototype._next = function (value) {\n        if (!this.hasSeed) {\n            this.seed = value;\n            this.destination.next(value);\n        }\n        else {\n            return this._tryNext(value);\n        }\n    };\n    ScanSubscriber.prototype._tryNext = function (value) {\n        var index = this.index++;\n        var result;\n        try {\n            result = this.accumulator(this.seed, value, index);\n        }\n        catch (err) {\n            this.destination.error(err);\n        }\n        this.seed = result;\n        this.destination.next(result);\n    };\n    return ScanSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=scan.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/scan.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/skip.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operators/skip.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/**\n * Returns an Observable that skips the first `count` items emitted by the source Observable.\n *\n * <img src=\"./img/skip.png\" width=\"100%\">\n *\n * @param {Number} count - The number of times, items emitted by source Observable should be skipped.\n * @return {Observable} An Observable that skips values emitted by the source Observable.\n *\n * @method skip\n * @owner Observable\n */\nfunction skip(count) {\n    return function (source) { return source.lift(new SkipOperator(count)); };\n}\nexports.skip = skip;\nvar SkipOperator = (function () {\n    function SkipOperator(total) {\n        this.total = total;\n    }\n    SkipOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new SkipSubscriber(subscriber, this.total));\n    };\n    return SkipOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar SkipSubscriber = (function (_super) {\n    __extends(SkipSubscriber, _super);\n    function SkipSubscriber(destination, total) {\n        _super.call(this, destination);\n        this.total = total;\n        this.count = 0;\n    }\n    SkipSubscriber.prototype._next = function (x) {\n        if (++this.count > this.total) {\n            this.destination.next(x);\n        }\n    };\n    return SkipSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=skip.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/skip.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/startWith.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/operators/startWith.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar ArrayObservable_1 = __webpack_require__(/*! ../observable/ArrayObservable */ \"./node_modules/rxjs/observable/ArrayObservable.js\");\nvar ScalarObservable_1 = __webpack_require__(/*! ../observable/ScalarObservable */ \"./node_modules/rxjs/observable/ScalarObservable.js\");\nvar EmptyObservable_1 = __webpack_require__(/*! ../observable/EmptyObservable */ \"./node_modules/rxjs/observable/EmptyObservable.js\");\nvar concat_1 = __webpack_require__(/*! ../observable/concat */ \"./node_modules/rxjs/observable/concat.js\");\nvar isScheduler_1 = __webpack_require__(/*! ../util/isScheduler */ \"./node_modules/rxjs/util/isScheduler.js\");\n/* tslint:enable:max-line-length */\n/**\n * Returns an Observable that emits the items you specify as arguments before it begins to emit\n * items emitted by the source Observable.\n *\n * <img src=\"./img/startWith.png\" width=\"100%\">\n *\n * @param {...T} values - Items you want the modified Observable to emit first.\n * @param {Scheduler} [scheduler] - A {@link IScheduler} to use for scheduling\n * the emissions of the `next` notifications.\n * @return {Observable} An Observable that emits the items in the specified Iterable and then emits the items\n * emitted by the source Observable.\n * @method startWith\n * @owner Observable\n */\nfunction startWith() {\n    var array = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        array[_i - 0] = arguments[_i];\n    }\n    return function (source) {\n        var scheduler = array[array.length - 1];\n        if (isScheduler_1.isScheduler(scheduler)) {\n            array.pop();\n        }\n        else {\n            scheduler = null;\n        }\n        var len = array.length;\n        if (len === 1) {\n            return concat_1.concat(new ScalarObservable_1.ScalarObservable(array[0], scheduler), source);\n        }\n        else if (len > 1) {\n            return concat_1.concat(new ArrayObservable_1.ArrayObservable(array, scheduler), source);\n        }\n        else {\n            return concat_1.concat(new EmptyObservable_1.EmptyObservable(scheduler), source);\n        }\n    };\n}\nexports.startWith = startWith;\n//# sourceMappingURL=startWith.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/startWith.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/take.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/operators/take.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar ArgumentOutOfRangeError_1 = __webpack_require__(/*! ../util/ArgumentOutOfRangeError */ \"./node_modules/rxjs/util/ArgumentOutOfRangeError.js\");\nvar EmptyObservable_1 = __webpack_require__(/*! ../observable/EmptyObservable */ \"./node_modules/rxjs/observable/EmptyObservable.js\");\n/**\n * Emits only the first `count` values emitted by the source Observable.\n *\n * <span class=\"informal\">Takes the first `count` values from the source, then\n * completes.</span>\n *\n * <img src=\"./img/take.png\" width=\"100%\">\n *\n * `take` returns an Observable that emits only the first `count` values emitted\n * by the source Observable. If the source emits fewer than `count` values then\n * all of its values are emitted. After that, it completes, regardless if the\n * source completes.\n *\n * @example <caption>Take the first 5 seconds of an infinite 1-second interval Observable</caption>\n * var interval = Rx.Observable.interval(1000);\n * var five = interval.take(5);\n * five.subscribe(x => console.log(x));\n *\n * @see {@link takeLast}\n * @see {@link takeUntil}\n * @see {@link takeWhile}\n * @see {@link skip}\n *\n * @throws {ArgumentOutOfRangeError} When using `take(i)`, it delivers an\n * ArgumentOutOrRangeError to the Observer's `error` callback if `i < 0`.\n *\n * @param {number} count The maximum number of `next` values to emit.\n * @return {Observable<T>} An Observable that emits only the first `count`\n * values emitted by the source Observable, or all of the values from the source\n * if the source emits fewer than `count` values.\n * @method take\n * @owner Observable\n */\nfunction take(count) {\n    return function (source) {\n        if (count === 0) {\n            return new EmptyObservable_1.EmptyObservable();\n        }\n        else {\n            return source.lift(new TakeOperator(count));\n        }\n    };\n}\nexports.take = take;\nvar TakeOperator = (function () {\n    function TakeOperator(total) {\n        this.total = total;\n        if (this.total < 0) {\n            throw new ArgumentOutOfRangeError_1.ArgumentOutOfRangeError;\n        }\n    }\n    TakeOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new TakeSubscriber(subscriber, this.total));\n    };\n    return TakeOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar TakeSubscriber = (function (_super) {\n    __extends(TakeSubscriber, _super);\n    function TakeSubscriber(destination, total) {\n        _super.call(this, destination);\n        this.total = total;\n        this.count = 0;\n    }\n    TakeSubscriber.prototype._next = function (value) {\n        var total = this.total;\n        var count = ++this.count;\n        if (count <= total) {\n            this.destination.next(value);\n            if (count === total) {\n                this.destination.complete();\n                this.unsubscribe();\n            }\n        }\n    };\n    return TakeSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=take.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/take.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/takeLast.js":
/*!*************************************************!*\
  !*** ./node_modules/rxjs/operators/takeLast.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar ArgumentOutOfRangeError_1 = __webpack_require__(/*! ../util/ArgumentOutOfRangeError */ \"./node_modules/rxjs/util/ArgumentOutOfRangeError.js\");\nvar EmptyObservable_1 = __webpack_require__(/*! ../observable/EmptyObservable */ \"./node_modules/rxjs/observable/EmptyObservable.js\");\n/**\n * Emits only the last `count` values emitted by the source Observable.\n *\n * <span class=\"informal\">Remembers the latest `count` values, then emits those\n * only when the source completes.</span>\n *\n * <img src=\"./img/takeLast.png\" width=\"100%\">\n *\n * `takeLast` returns an Observable that emits at most the last `count` values\n * emitted by the source Observable. If the source emits fewer than `count`\n * values then all of its values are emitted. This operator must wait until the\n * `complete` notification emission from the source in order to emit the `next`\n * values on the output Observable, because otherwise it is impossible to know\n * whether or not more values will be emitted on the source. For this reason,\n * all values are emitted synchronously, followed by the complete notification.\n *\n * @example <caption>Take the last 3 values of an Observable with many values</caption>\n * var many = Rx.Observable.range(1, 100);\n * var lastThree = many.takeLast(3);\n * lastThree.subscribe(x => console.log(x));\n *\n * @see {@link take}\n * @see {@link takeUntil}\n * @see {@link takeWhile}\n * @see {@link skip}\n *\n * @throws {ArgumentOutOfRangeError} When using `takeLast(i)`, it delivers an\n * ArgumentOutOrRangeError to the Observer's `error` callback if `i < 0`.\n *\n * @param {number} count The maximum number of values to emit from the end of\n * the sequence of values emitted by the source Observable.\n * @return {Observable<T>} An Observable that emits at most the last count\n * values emitted by the source Observable.\n * @method takeLast\n * @owner Observable\n */\nfunction takeLast(count) {\n    return function takeLastOperatorFunction(source) {\n        if (count === 0) {\n            return new EmptyObservable_1.EmptyObservable();\n        }\n        else {\n            return source.lift(new TakeLastOperator(count));\n        }\n    };\n}\nexports.takeLast = takeLast;\nvar TakeLastOperator = (function () {\n    function TakeLastOperator(total) {\n        this.total = total;\n        if (this.total < 0) {\n            throw new ArgumentOutOfRangeError_1.ArgumentOutOfRangeError;\n        }\n    }\n    TakeLastOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new TakeLastSubscriber(subscriber, this.total));\n    };\n    return TakeLastOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar TakeLastSubscriber = (function (_super) {\n    __extends(TakeLastSubscriber, _super);\n    function TakeLastSubscriber(destination, total) {\n        _super.call(this, destination);\n        this.total = total;\n        this.ring = new Array();\n        this.count = 0;\n    }\n    TakeLastSubscriber.prototype._next = function (value) {\n        var ring = this.ring;\n        var total = this.total;\n        var count = this.count++;\n        if (ring.length < total) {\n            ring.push(value);\n        }\n        else {\n            var index = count % total;\n            ring[index] = value;\n        }\n    };\n    TakeLastSubscriber.prototype._complete = function () {\n        var destination = this.destination;\n        var count = this.count;\n        if (count > 0) {\n            var total = this.count >= this.total ? this.total : this.count;\n            var ring = this.ring;\n            for (var i = 0; i < total; i++) {\n                var idx = (count++) % total;\n                destination.next(ring[idx]);\n            }\n        }\n        destination.complete();\n    };\n    return TakeLastSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=takeLast.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/takeLast.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/takeUntil.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/operators/takeUntil.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\n/**\n * Emits the values emitted by the source Observable until a `notifier`\n * Observable emits a value.\n *\n * <span class=\"informal\">Lets values pass until a second Observable,\n * `notifier`, emits something. Then, it completes.</span>\n *\n * <img src=\"./img/takeUntil.png\" width=\"100%\">\n *\n * `takeUntil` subscribes and begins mirroring the source Observable. It also\n * monitors a second Observable, `notifier` that you provide. If the `notifier`\n * emits a value or a complete notification, the output Observable stops\n * mirroring the source Observable and completes.\n *\n * @example <caption>Tick every second until the first click happens</caption>\n * var interval = Rx.Observable.interval(1000);\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var result = interval.takeUntil(clicks);\n * result.subscribe(x => console.log(x));\n *\n * @see {@link take}\n * @see {@link takeLast}\n * @see {@link takeWhile}\n * @see {@link skip}\n *\n * @param {Observable} notifier The Observable whose first emitted value will\n * cause the output Observable of `takeUntil` to stop emitting values from the\n * source Observable.\n * @return {Observable<T>} An Observable that emits the values from the source\n * Observable until such time as `notifier` emits its first value.\n * @method takeUntil\n * @owner Observable\n */\nfunction takeUntil(notifier) {\n    return function (source) { return source.lift(new TakeUntilOperator(notifier)); };\n}\nexports.takeUntil = takeUntil;\nvar TakeUntilOperator = (function () {\n    function TakeUntilOperator(notifier) {\n        this.notifier = notifier;\n    }\n    TakeUntilOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new TakeUntilSubscriber(subscriber, this.notifier));\n    };\n    return TakeUntilOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar TakeUntilSubscriber = (function (_super) {\n    __extends(TakeUntilSubscriber, _super);\n    function TakeUntilSubscriber(destination, notifier) {\n        _super.call(this, destination);\n        this.notifier = notifier;\n        this.add(subscribeToResult_1.subscribeToResult(this, notifier));\n    }\n    TakeUntilSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        this.complete();\n    };\n    TakeUntilSubscriber.prototype.notifyComplete = function () {\n        // noop\n    };\n    return TakeUntilSubscriber;\n}(OuterSubscriber_1.OuterSubscriber));\n//# sourceMappingURL=takeUntil.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/takeUntil.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/tap.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operators/tap.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\n/* tslint:enable:max-line-length */\n/**\n * Perform a side effect for every emission on the source Observable, but return\n * an Observable that is identical to the source.\n *\n * <span class=\"informal\">Intercepts each emission on the source and runs a\n * function, but returns an output which is identical to the source as long as errors don't occur.</span>\n *\n * <img src=\"./img/do.png\" width=\"100%\">\n *\n * Returns a mirrored Observable of the source Observable, but modified so that\n * the provided Observer is called to perform a side effect for every value,\n * error, and completion emitted by the source. Any errors that are thrown in\n * the aforementioned Observer or handlers are safely sent down the error path\n * of the output Observable.\n *\n * This operator is useful for debugging your Observables for the correct values\n * or performing other side effects.\n *\n * Note: this is different to a `subscribe` on the Observable. If the Observable\n * returned by `do` is not subscribed, the side effects specified by the\n * Observer will never happen. `do` therefore simply spies on existing\n * execution, it does not trigger an execution to happen like `subscribe` does.\n *\n * @example <caption>Map every click to the clientX position of that click, while also logging the click event</caption>\n * var clicks = Rx.Observable.fromEvent(document, 'click');\n * var positions = clicks\n *   .do(ev => console.log(ev))\n *   .map(ev => ev.clientX);\n * positions.subscribe(x => console.log(x));\n *\n * @see {@link map}\n * @see {@link subscribe}\n *\n * @param {Observer|function} [nextOrObserver] A normal Observer object or a\n * callback for `next`.\n * @param {function} [error] Callback for errors in the source.\n * @param {function} [complete] Callback for the completion of the source.\n * @return {Observable} An Observable identical to the source, but runs the\n * specified Observer or callback(s) for each item.\n * @name tap\n */\nfunction tap(nextOrObserver, error, complete) {\n    return function tapOperatorFunction(source) {\n        return source.lift(new DoOperator(nextOrObserver, error, complete));\n    };\n}\nexports.tap = tap;\nvar DoOperator = (function () {\n    function DoOperator(nextOrObserver, error, complete) {\n        this.nextOrObserver = nextOrObserver;\n        this.error = error;\n        this.complete = complete;\n    }\n    DoOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new DoSubscriber(subscriber, this.nextOrObserver, this.error, this.complete));\n    };\n    return DoOperator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar DoSubscriber = (function (_super) {\n    __extends(DoSubscriber, _super);\n    function DoSubscriber(destination, nextOrObserver, error, complete) {\n        _super.call(this, destination);\n        var safeSubscriber = new Subscriber_1.Subscriber(nextOrObserver, error, complete);\n        safeSubscriber.syncErrorThrowable = true;\n        this.add(safeSubscriber);\n        this.safeSubscriber = safeSubscriber;\n    }\n    DoSubscriber.prototype._next = function (value) {\n        var safeSubscriber = this.safeSubscriber;\n        safeSubscriber.next(value);\n        if (safeSubscriber.syncErrorThrown) {\n            this.destination.error(safeSubscriber.syncErrorValue);\n        }\n        else {\n            this.destination.next(value);\n        }\n    };\n    DoSubscriber.prototype._error = function (err) {\n        var safeSubscriber = this.safeSubscriber;\n        safeSubscriber.error(err);\n        if (safeSubscriber.syncErrorThrown) {\n            this.destination.error(safeSubscriber.syncErrorValue);\n        }\n        else {\n            this.destination.error(err);\n        }\n    };\n    DoSubscriber.prototype._complete = function () {\n        var safeSubscriber = this.safeSubscriber;\n        safeSubscriber.complete();\n        if (safeSubscriber.syncErrorThrown) {\n            this.destination.error(safeSubscriber.syncErrorValue);\n        }\n        else {\n            this.destination.complete();\n        }\n    };\n    return DoSubscriber;\n}(Subscriber_1.Subscriber));\n//# sourceMappingURL=tap.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/tap.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/toArray.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/operators/toArray.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar reduce_1 = __webpack_require__(/*! ./reduce */ \"./node_modules/rxjs/operators/reduce.js\");\nfunction toArrayReducer(arr, item, index) {\n    if (index === 0) {\n        return [item];\n    }\n    arr.push(item);\n    return arr;\n}\nfunction toArray() {\n    return reduce_1.reduce(toArrayReducer, []);\n}\nexports.toArray = toArray;\n//# sourceMappingURL=toArray.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/toArray.js?");

/***/ }),

/***/ "./node_modules/rxjs/operators/zip.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/operators/zip.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar ArrayObservable_1 = __webpack_require__(/*! ../observable/ArrayObservable */ \"./node_modules/rxjs/observable/ArrayObservable.js\");\nvar isArray_1 = __webpack_require__(/*! ../util/isArray */ \"./node_modules/rxjs/util/isArray.js\");\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar OuterSubscriber_1 = __webpack_require__(/*! ../OuterSubscriber */ \"./node_modules/rxjs/OuterSubscriber.js\");\nvar subscribeToResult_1 = __webpack_require__(/*! ../util/subscribeToResult */ \"./node_modules/rxjs/util/subscribeToResult.js\");\nvar iterator_1 = __webpack_require__(/*! ../symbol/iterator */ \"./node_modules/rxjs/symbol/iterator.js\");\n/* tslint:enable:max-line-length */\n/**\n * @param observables\n * @return {Observable<R>}\n * @method zip\n * @owner Observable\n */\nfunction zip() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    return function zipOperatorFunction(source) {\n        return source.lift.call(zipStatic.apply(void 0, [source].concat(observables)));\n    };\n}\nexports.zip = zip;\n/* tslint:enable:max-line-length */\n/**\n * Combines multiple Observables to create an Observable whose values are calculated from the values, in order, of each\n * of its input Observables.\n *\n * If the latest parameter is a function, this function is used to compute the created value from the input values.\n * Otherwise, an array of the input values is returned.\n *\n * @example <caption>Combine age and name from different sources</caption>\n *\n * let age$ = Observable.of<number>(27, 25, 29);\n * let name$ = Observable.of<string>('Foo', 'Bar', 'Beer');\n * let isDev$ = Observable.of<boolean>(true, true, false);\n *\n * Observable\n *     .zip(age$,\n *          name$,\n *          isDev$,\n *          (age: number, name: string, isDev: boolean) => ({ age, name, isDev }))\n *     .subscribe(x => console.log(x));\n *\n * // outputs\n * // { age: 27, name: 'Foo', isDev: true }\n * // { age: 25, name: 'Bar', isDev: true }\n * // { age: 29, name: 'Beer', isDev: false }\n *\n * @param observables\n * @return {Observable<R>}\n * @static true\n * @name zip\n * @owner Observable\n */\nfunction zipStatic() {\n    var observables = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        observables[_i - 0] = arguments[_i];\n    }\n    var project = observables[observables.length - 1];\n    if (typeof project === 'function') {\n        observables.pop();\n    }\n    return new ArrayObservable_1.ArrayObservable(observables).lift(new ZipOperator(project));\n}\nexports.zipStatic = zipStatic;\nvar ZipOperator = (function () {\n    function ZipOperator(project) {\n        this.project = project;\n    }\n    ZipOperator.prototype.call = function (subscriber, source) {\n        return source.subscribe(new ZipSubscriber(subscriber, this.project));\n    };\n    return ZipOperator;\n}());\nexports.ZipOperator = ZipOperator;\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar ZipSubscriber = (function (_super) {\n    __extends(ZipSubscriber, _super);\n    function ZipSubscriber(destination, project, values) {\n        if (values === void 0) { values = Object.create(null); }\n        _super.call(this, destination);\n        this.iterators = [];\n        this.active = 0;\n        this.project = (typeof project === 'function') ? project : null;\n        this.values = values;\n    }\n    ZipSubscriber.prototype._next = function (value) {\n        var iterators = this.iterators;\n        if (isArray_1.isArray(value)) {\n            iterators.push(new StaticArrayIterator(value));\n        }\n        else if (typeof value[iterator_1.iterator] === 'function') {\n            iterators.push(new StaticIterator(value[iterator_1.iterator]()));\n        }\n        else {\n            iterators.push(new ZipBufferIterator(this.destination, this, value));\n        }\n    };\n    ZipSubscriber.prototype._complete = function () {\n        var iterators = this.iterators;\n        var len = iterators.length;\n        if (len === 0) {\n            this.destination.complete();\n            return;\n        }\n        this.active = len;\n        for (var i = 0; i < len; i++) {\n            var iterator = iterators[i];\n            if (iterator.stillUnsubscribed) {\n                this.add(iterator.subscribe(iterator, i));\n            }\n            else {\n                this.active--; // not an observable\n            }\n        }\n    };\n    ZipSubscriber.prototype.notifyInactive = function () {\n        this.active--;\n        if (this.active === 0) {\n            this.destination.complete();\n        }\n    };\n    ZipSubscriber.prototype.checkIterators = function () {\n        var iterators = this.iterators;\n        var len = iterators.length;\n        var destination = this.destination;\n        // abort if not all of them have values\n        for (var i = 0; i < len; i++) {\n            var iterator = iterators[i];\n            if (typeof iterator.hasValue === 'function' && !iterator.hasValue()) {\n                return;\n            }\n        }\n        var shouldComplete = false;\n        var args = [];\n        for (var i = 0; i < len; i++) {\n            var iterator = iterators[i];\n            var result = iterator.next();\n            // check to see if it's completed now that you've gotten\n            // the next value.\n            if (iterator.hasCompleted()) {\n                shouldComplete = true;\n            }\n            if (result.done) {\n                destination.complete();\n                return;\n            }\n            args.push(result.value);\n        }\n        if (this.project) {\n            this._tryProject(args);\n        }\n        else {\n            destination.next(args);\n        }\n        if (shouldComplete) {\n            destination.complete();\n        }\n    };\n    ZipSubscriber.prototype._tryProject = function (args) {\n        var result;\n        try {\n            result = this.project.apply(this, args);\n        }\n        catch (err) {\n            this.destination.error(err);\n            return;\n        }\n        this.destination.next(result);\n    };\n    return ZipSubscriber;\n}(Subscriber_1.Subscriber));\nexports.ZipSubscriber = ZipSubscriber;\nvar StaticIterator = (function () {\n    function StaticIterator(iterator) {\n        this.iterator = iterator;\n        this.nextResult = iterator.next();\n    }\n    StaticIterator.prototype.hasValue = function () {\n        return true;\n    };\n    StaticIterator.prototype.next = function () {\n        var result = this.nextResult;\n        this.nextResult = this.iterator.next();\n        return result;\n    };\n    StaticIterator.prototype.hasCompleted = function () {\n        var nextResult = this.nextResult;\n        return nextResult && nextResult.done;\n    };\n    return StaticIterator;\n}());\nvar StaticArrayIterator = (function () {\n    function StaticArrayIterator(array) {\n        this.array = array;\n        this.index = 0;\n        this.length = 0;\n        this.length = array.length;\n    }\n    StaticArrayIterator.prototype[iterator_1.iterator] = function () {\n        return this;\n    };\n    StaticArrayIterator.prototype.next = function (value) {\n        var i = this.index++;\n        var array = this.array;\n        return i < this.length ? { value: array[i], done: false } : { value: null, done: true };\n    };\n    StaticArrayIterator.prototype.hasValue = function () {\n        return this.array.length > this.index;\n    };\n    StaticArrayIterator.prototype.hasCompleted = function () {\n        return this.array.length === this.index;\n    };\n    return StaticArrayIterator;\n}());\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar ZipBufferIterator = (function (_super) {\n    __extends(ZipBufferIterator, _super);\n    function ZipBufferIterator(destination, parent, observable) {\n        _super.call(this, destination);\n        this.parent = parent;\n        this.observable = observable;\n        this.stillUnsubscribed = true;\n        this.buffer = [];\n        this.isComplete = false;\n    }\n    ZipBufferIterator.prototype[iterator_1.iterator] = function () {\n        return this;\n    };\n    // NOTE: there is actually a name collision here with Subscriber.next and Iterator.next\n    //    this is legit because `next()` will never be called by a subscription in this case.\n    ZipBufferIterator.prototype.next = function () {\n        var buffer = this.buffer;\n        if (buffer.length === 0 && this.isComplete) {\n            return { value: null, done: true };\n        }\n        else {\n            return { value: buffer.shift(), done: false };\n        }\n    };\n    ZipBufferIterator.prototype.hasValue = function () {\n        return this.buffer.length > 0;\n    };\n    ZipBufferIterator.prototype.hasCompleted = function () {\n        return this.buffer.length === 0 && this.isComplete;\n    };\n    ZipBufferIterator.prototype.notifyComplete = function () {\n        if (this.buffer.length > 0) {\n            this.isComplete = true;\n            this.parent.notifyInactive();\n        }\n        else {\n            this.destination.complete();\n        }\n    };\n    ZipBufferIterator.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {\n        this.buffer.push(innerValue);\n        this.parent.checkIterators();\n    };\n    ZipBufferIterator.prototype.subscribe = function (value, index) {\n        return subscribeToResult_1.subscribeToResult(this, this.observable, this, index);\n    };\n    return ZipBufferIterator;\n}(OuterSubscriber_1.OuterSubscriber));\n//# sourceMappingURL=zip.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/operators/zip.js?");

/***/ }),

/***/ "./node_modules/rxjs/scheduler/Action.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/scheduler/Action.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Subscription_1 = __webpack_require__(/*! ../Subscription */ \"./node_modules/rxjs/Subscription.js\");\n/**\n * A unit of work to be executed in a {@link Scheduler}. An action is typically\n * created from within a Scheduler and an RxJS user does not need to concern\n * themselves about creating and manipulating an Action.\n *\n * ```ts\n * class Action<T> extends Subscription {\n *   new (scheduler: Scheduler, work: (state?: T) => void);\n *   schedule(state?: T, delay: number = 0): Subscription;\n * }\n * ```\n *\n * @class Action<T>\n */\nvar Action = (function (_super) {\n    __extends(Action, _super);\n    function Action(scheduler, work) {\n        _super.call(this);\n    }\n    /**\n     * Schedules this action on its parent Scheduler for execution. May be passed\n     * some context object, `state`. May happen at some point in the future,\n     * according to the `delay` parameter, if specified.\n     * @param {T} [state] Some contextual data that the `work` function uses when\n     * called by the Scheduler.\n     * @param {number} [delay] Time to wait before executing the work, where the\n     * time unit is implicit and defined by the Scheduler.\n     * @return {void}\n     */\n    Action.prototype.schedule = function (state, delay) {\n        if (delay === void 0) { delay = 0; }\n        return this;\n    };\n    return Action;\n}(Subscription_1.Subscription));\nexports.Action = Action;\n//# sourceMappingURL=Action.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/scheduler/Action.js?");

/***/ }),

/***/ "./node_modules/rxjs/scheduler/AsyncAction.js":
/*!****************************************************!*\
  !*** ./node_modules/rxjs/scheduler/AsyncAction.js ***!
  \****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar root_1 = __webpack_require__(/*! ../util/root */ \"./node_modules/rxjs/util/root.js\");\nvar Action_1 = __webpack_require__(/*! ./Action */ \"./node_modules/rxjs/scheduler/Action.js\");\n/**\n * We need this JSDoc comment for affecting ESDoc.\n * @ignore\n * @extends {Ignored}\n */\nvar AsyncAction = (function (_super) {\n    __extends(AsyncAction, _super);\n    function AsyncAction(scheduler, work) {\n        _super.call(this, scheduler, work);\n        this.scheduler = scheduler;\n        this.pending = false;\n        this.work = work;\n    }\n    AsyncAction.prototype.schedule = function (state, delay) {\n        if (delay === void 0) { delay = 0; }\n        if (this.closed) {\n            return this;\n        }\n        // Always replace the current state with the new state.\n        this.state = state;\n        // Set the pending flag indicating that this action has been scheduled, or\n        // has recursively rescheduled itself.\n        this.pending = true;\n        var id = this.id;\n        var scheduler = this.scheduler;\n        //\n        // Important implementation note:\n        //\n        // Actions only execute once by default, unless rescheduled from within the\n        // scheduled callback. This allows us to implement single and repeat\n        // actions via the same code path, without adding API surface area, as well\n        // as mimic traditional recursion but across asynchronous boundaries.\n        //\n        // However, JS runtimes and timers distinguish between intervals achieved by\n        // serial `setTimeout` calls vs. a single `setInterval` call. An interval of\n        // serial `setTimeout` calls can be individually delayed, which delays\n        // scheduling the next `setTimeout`, and so on. `setInterval` attempts to\n        // guarantee the interval callback will be invoked more precisely to the\n        // interval period, regardless of load.\n        //\n        // Therefore, we use `setInterval` to schedule single and repeat actions.\n        // If the action reschedules itself with the same delay, the interval is not\n        // canceled. If the action doesn't reschedule, or reschedules with a\n        // different delay, the interval will be canceled after scheduled callback\n        // execution.\n        //\n        if (id != null) {\n            this.id = this.recycleAsyncId(scheduler, id, delay);\n        }\n        this.delay = delay;\n        // If this action has already an async Id, don't request a new one.\n        this.id = this.id || this.requestAsyncId(scheduler, this.id, delay);\n        return this;\n    };\n    AsyncAction.prototype.requestAsyncId = function (scheduler, id, delay) {\n        if (delay === void 0) { delay = 0; }\n        return root_1.root.setInterval(scheduler.flush.bind(scheduler, this), delay);\n    };\n    AsyncAction.prototype.recycleAsyncId = function (scheduler, id, delay) {\n        if (delay === void 0) { delay = 0; }\n        // If this action is rescheduled with the same delay time, don't clear the interval id.\n        if (delay !== null && this.delay === delay && this.pending === false) {\n            return id;\n        }\n        // Otherwise, if the action's delay time is different from the current delay,\n        // or the action has been rescheduled before it's executed, clear the interval id\n        return root_1.root.clearInterval(id) && undefined || undefined;\n    };\n    /**\n     * Immediately executes this action and the `work` it contains.\n     * @return {any}\n     */\n    AsyncAction.prototype.execute = function (state, delay) {\n        if (this.closed) {\n            return new Error('executing a cancelled action');\n        }\n        this.pending = false;\n        var error = this._execute(state, delay);\n        if (error) {\n            return error;\n        }\n        else if (this.pending === false && this.id != null) {\n            // Dequeue if the action didn't reschedule itself. Don't call\n            // unsubscribe(), because the action could reschedule later.\n            // For example:\n            // ```\n            // scheduler.schedule(function doWork(counter) {\n            //   /* ... I'm a busy worker bee ... */\n            //   var originalAction = this;\n            //   /* wait 100ms before rescheduling the action */\n            //   setTimeout(function () {\n            //     originalAction.schedule(counter + 1);\n            //   }, 100);\n            // }, 1000);\n            // ```\n            this.id = this.recycleAsyncId(this.scheduler, this.id, null);\n        }\n    };\n    AsyncAction.prototype._execute = function (state, delay) {\n        var errored = false;\n        var errorValue = undefined;\n        try {\n            this.work(state);\n        }\n        catch (e) {\n            errored = true;\n            errorValue = !!e && e || new Error(e);\n        }\n        if (errored) {\n            this.unsubscribe();\n            return errorValue;\n        }\n    };\n    /** @deprecated internal use only */ AsyncAction.prototype._unsubscribe = function () {\n        var id = this.id;\n        var scheduler = this.scheduler;\n        var actions = scheduler.actions;\n        var index = actions.indexOf(this);\n        this.work = null;\n        this.state = null;\n        this.pending = false;\n        this.scheduler = null;\n        if (index !== -1) {\n            actions.splice(index, 1);\n        }\n        if (id != null) {\n            this.id = this.recycleAsyncId(scheduler, id, null);\n        }\n        this.delay = null;\n    };\n    return AsyncAction;\n}(Action_1.Action));\nexports.AsyncAction = AsyncAction;\n//# sourceMappingURL=AsyncAction.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/scheduler/AsyncAction.js?");

/***/ }),

/***/ "./node_modules/rxjs/scheduler/AsyncScheduler.js":
/*!*******************************************************!*\
  !*** ./node_modules/rxjs/scheduler/AsyncScheduler.js ***!
  \*******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\nvar Scheduler_1 = __webpack_require__(/*! ../Scheduler */ \"./node_modules/rxjs/Scheduler.js\");\nvar AsyncScheduler = (function (_super) {\n    __extends(AsyncScheduler, _super);\n    function AsyncScheduler() {\n        _super.apply(this, arguments);\n        this.actions = [];\n        /**\n         * A flag to indicate whether the Scheduler is currently executing a batch of\n         * queued actions.\n         * @type {boolean}\n         */\n        this.active = false;\n        /**\n         * An internal ID used to track the latest asynchronous task such as those\n         * coming from `setTimeout`, `setInterval`, `requestAnimationFrame`, and\n         * others.\n         * @type {any}\n         */\n        this.scheduled = undefined;\n    }\n    AsyncScheduler.prototype.flush = function (action) {\n        var actions = this.actions;\n        if (this.active) {\n            actions.push(action);\n            return;\n        }\n        var error;\n        this.active = true;\n        do {\n            if (error = action.execute(action.state, action.delay)) {\n                break;\n            }\n        } while (action = actions.shift()); // exhaust the scheduler queue\n        this.active = false;\n        if (error) {\n            while (action = actions.shift()) {\n                action.unsubscribe();\n            }\n            throw error;\n        }\n    };\n    return AsyncScheduler;\n}(Scheduler_1.Scheduler));\nexports.AsyncScheduler = AsyncScheduler;\n//# sourceMappingURL=AsyncScheduler.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/scheduler/AsyncScheduler.js?");

/***/ }),

/***/ "./node_modules/rxjs/scheduler/async.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/scheduler/async.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar AsyncAction_1 = __webpack_require__(/*! ./AsyncAction */ \"./node_modules/rxjs/scheduler/AsyncAction.js\");\nvar AsyncScheduler_1 = __webpack_require__(/*! ./AsyncScheduler */ \"./node_modules/rxjs/scheduler/AsyncScheduler.js\");\n/**\n *\n * Async Scheduler\n *\n * <span class=\"informal\">Schedule task as if you used setTimeout(task, duration)</span>\n *\n * `async` scheduler schedules tasks asynchronously, by putting them on the JavaScript\n * event loop queue. It is best used to delay tasks in time or to schedule tasks repeating\n * in intervals.\n *\n * If you just want to \"defer\" task, that is to perform it right after currently\n * executing synchronous code ends (commonly achieved by `setTimeout(deferredTask, 0)`),\n * better choice will be the {@link asap} scheduler.\n *\n * @example <caption>Use async scheduler to delay task</caption>\n * const task = () => console.log('it works!');\n *\n * Rx.Scheduler.async.schedule(task, 2000);\n *\n * // After 2 seconds logs:\n * // \"it works!\"\n *\n *\n * @example <caption>Use async scheduler to repeat task in intervals</caption>\n * function task(state) {\n *   console.log(state);\n *   this.schedule(state + 1, 1000); // `this` references currently executing Action,\n *                                   // which we reschedule with new state and delay\n * }\n *\n * Rx.Scheduler.async.schedule(task, 3000, 0);\n *\n * // Logs:\n * // 0 after 3s\n * // 1 after 4s\n * // 2 after 5s\n * // 3 after 6s\n *\n * @static true\n * @name async\n * @owner Scheduler\n */\nexports.async = new AsyncScheduler_1.AsyncScheduler(AsyncAction_1.AsyncAction);\n//# sourceMappingURL=async.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/scheduler/async.js?");

/***/ }),

/***/ "./node_modules/rxjs/symbol/iterator.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/symbol/iterator.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar root_1 = __webpack_require__(/*! ../util/root */ \"./node_modules/rxjs/util/root.js\");\nfunction symbolIteratorPonyfill(root) {\n    var Symbol = root.Symbol;\n    if (typeof Symbol === 'function') {\n        if (!Symbol.iterator) {\n            Symbol.iterator = Symbol('iterator polyfill');\n        }\n        return Symbol.iterator;\n    }\n    else {\n        // [for Mozilla Gecko 27-35:](https://mzl.la/2ewE1zC)\n        var Set_1 = root.Set;\n        if (Set_1 && typeof new Set_1()['@@iterator'] === 'function') {\n            return '@@iterator';\n        }\n        var Map_1 = root.Map;\n        // required for compatability with es6-shim\n        if (Map_1) {\n            var keys = Object.getOwnPropertyNames(Map_1.prototype);\n            for (var i = 0; i < keys.length; ++i) {\n                var key = keys[i];\n                // according to spec, Map.prototype[@@iterator] and Map.orototype.entries must be equal.\n                if (key !== 'entries' && key !== 'size' && Map_1.prototype[key] === Map_1.prototype['entries']) {\n                    return key;\n                }\n            }\n        }\n        return '@@iterator';\n    }\n}\nexports.symbolIteratorPonyfill = symbolIteratorPonyfill;\nexports.iterator = symbolIteratorPonyfill(root_1.root);\n/**\n * @deprecated use iterator instead\n */\nexports.$$iterator = exports.iterator;\n//# sourceMappingURL=iterator.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/symbol/iterator.js?");

/***/ }),

/***/ "./node_modules/rxjs/symbol/observable.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/symbol/observable.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar root_1 = __webpack_require__(/*! ../util/root */ \"./node_modules/rxjs/util/root.js\");\nfunction getSymbolObservable(context) {\n    var $$observable;\n    var Symbol = context.Symbol;\n    if (typeof Symbol === 'function') {\n        if (Symbol.observable) {\n            $$observable = Symbol.observable;\n        }\n        else {\n            $$observable = Symbol('observable');\n            Symbol.observable = $$observable;\n        }\n    }\n    else {\n        $$observable = '@@observable';\n    }\n    return $$observable;\n}\nexports.getSymbolObservable = getSymbolObservable;\nexports.observable = getSymbolObservable(root_1.root);\n/**\n * @deprecated use observable instead\n */\nexports.$$observable = exports.observable;\n//# sourceMappingURL=observable.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/symbol/observable.js?");

/***/ }),

/***/ "./node_modules/rxjs/symbol/rxSubscriber.js":
/*!**************************************************!*\
  !*** ./node_modules/rxjs/symbol/rxSubscriber.js ***!
  \**************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar root_1 = __webpack_require__(/*! ../util/root */ \"./node_modules/rxjs/util/root.js\");\nvar Symbol = root_1.root.Symbol;\nexports.rxSubscriber = (typeof Symbol === 'function' && typeof Symbol.for === 'function') ?\n    Symbol.for('rxSubscriber') : '@@rxSubscriber';\n/**\n * @deprecated use rxSubscriber instead\n */\nexports.$$rxSubscriber = exports.rxSubscriber;\n//# sourceMappingURL=rxSubscriber.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/symbol/rxSubscriber.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/ArgumentOutOfRangeError.js":
/*!***********************************************************!*\
  !*** ./node_modules/rxjs/util/ArgumentOutOfRangeError.js ***!
  \***********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\n/**\n * An error thrown when an element was queried at a certain index of an\n * Observable, but no such index or position exists in that sequence.\n *\n * @see {@link elementAt}\n * @see {@link take}\n * @see {@link takeLast}\n *\n * @class ArgumentOutOfRangeError\n */\nvar ArgumentOutOfRangeError = (function (_super) {\n    __extends(ArgumentOutOfRangeError, _super);\n    function ArgumentOutOfRangeError() {\n        var err = _super.call(this, 'argument out of range');\n        this.name = err.name = 'ArgumentOutOfRangeError';\n        this.stack = err.stack;\n        this.message = err.message;\n    }\n    return ArgumentOutOfRangeError;\n}(Error));\nexports.ArgumentOutOfRangeError = ArgumentOutOfRangeError;\n//# sourceMappingURL=ArgumentOutOfRangeError.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/ArgumentOutOfRangeError.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/EmptyError.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/util/EmptyError.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\n/**\n * An error thrown when an Observable or a sequence was queried but has no\n * elements.\n *\n * @see {@link first}\n * @see {@link last}\n * @see {@link single}\n *\n * @class EmptyError\n */\nvar EmptyError = (function (_super) {\n    __extends(EmptyError, _super);\n    function EmptyError() {\n        var err = _super.call(this, 'no elements in sequence');\n        this.name = err.name = 'EmptyError';\n        this.stack = err.stack;\n        this.message = err.message;\n    }\n    return EmptyError;\n}(Error));\nexports.EmptyError = EmptyError;\n//# sourceMappingURL=EmptyError.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/EmptyError.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/ObjectUnsubscribedError.js":
/*!***********************************************************!*\
  !*** ./node_modules/rxjs/util/ObjectUnsubscribedError.js ***!
  \***********************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\n/**\n * An error thrown when an action is invalid because the object has been\n * unsubscribed.\n *\n * @see {@link Subject}\n * @see {@link BehaviorSubject}\n *\n * @class ObjectUnsubscribedError\n */\nvar ObjectUnsubscribedError = (function (_super) {\n    __extends(ObjectUnsubscribedError, _super);\n    function ObjectUnsubscribedError() {\n        var err = _super.call(this, 'object unsubscribed');\n        this.name = err.name = 'ObjectUnsubscribedError';\n        this.stack = err.stack;\n        this.message = err.message;\n    }\n    return ObjectUnsubscribedError;\n}(Error));\nexports.ObjectUnsubscribedError = ObjectUnsubscribedError;\n//# sourceMappingURL=ObjectUnsubscribedError.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/ObjectUnsubscribedError.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/UnsubscriptionError.js":
/*!*******************************************************!*\
  !*** ./node_modules/rxjs/util/UnsubscriptionError.js ***!
  \*******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar __extends = (this && this.__extends) || function (d, b) {\n    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];\n    function __() { this.constructor = d; }\n    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());\n};\n/**\n * An error thrown when one or more errors have occurred during the\n * `unsubscribe` of a {@link Subscription}.\n */\nvar UnsubscriptionError = (function (_super) {\n    __extends(UnsubscriptionError, _super);\n    function UnsubscriptionError(errors) {\n        _super.call(this);\n        this.errors = errors;\n        var err = Error.call(this, errors ?\n            errors.length + \" errors occurred during unsubscription:\\n  \" + errors.map(function (err, i) { return ((i + 1) + \") \" + err.toString()); }).join('\\n  ') : '');\n        this.name = err.name = 'UnsubscriptionError';\n        this.stack = err.stack;\n        this.message = err.message;\n    }\n    return UnsubscriptionError;\n}(Error));\nexports.UnsubscriptionError = UnsubscriptionError;\n//# sourceMappingURL=UnsubscriptionError.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/UnsubscriptionError.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/errorObject.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/util/errorObject.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n// typeof any so that it we don't have to cast when comparing a result to the error object\nexports.errorObject = { e: {} };\n//# sourceMappingURL=errorObject.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/errorObject.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/identity.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/util/identity.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nfunction identity(x) {\n    return x;\n}\nexports.identity = identity;\n//# sourceMappingURL=identity.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/identity.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isArray.js":
/*!*******************************************!*\
  !*** ./node_modules/rxjs/util/isArray.js ***!
  \*******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nexports.isArray = Array.isArray || (function (x) { return x && typeof x.length === 'number'; });\n//# sourceMappingURL=isArray.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isArray.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isArrayLike.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/util/isArrayLike.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nexports.isArrayLike = (function (x) { return x && typeof x.length === 'number'; });\n//# sourceMappingURL=isArrayLike.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isArrayLike.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isDate.js":
/*!******************************************!*\
  !*** ./node_modules/rxjs/util/isDate.js ***!
  \******************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nfunction isDate(value) {\n    return value instanceof Date && !isNaN(+value);\n}\nexports.isDate = isDate;\n//# sourceMappingURL=isDate.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isDate.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isFunction.js":
/*!**********************************************!*\
  !*** ./node_modules/rxjs/util/isFunction.js ***!
  \**********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nfunction isFunction(x) {\n    return typeof x === 'function';\n}\nexports.isFunction = isFunction;\n//# sourceMappingURL=isFunction.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isFunction.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isNumeric.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/util/isNumeric.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar isArray_1 = __webpack_require__(/*! ../util/isArray */ \"./node_modules/rxjs/util/isArray.js\");\nfunction isNumeric(val) {\n    // parseFloat NaNs numeric-cast false positives (null|true|false|\"\")\n    // ...but misinterprets leading-number strings, particularly hex literals (\"0x...\")\n    // subtraction forces infinities to NaN\n    // adding 1 corrects loss of precision from parseFloat (#15100)\n    return !isArray_1.isArray(val) && (val - parseFloat(val) + 1) >= 0;\n}\nexports.isNumeric = isNumeric;\n;\n//# sourceMappingURL=isNumeric.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isNumeric.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isObject.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/util/isObject.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nfunction isObject(x) {\n    return x != null && typeof x === 'object';\n}\nexports.isObject = isObject;\n//# sourceMappingURL=isObject.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isObject.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isPromise.js":
/*!*********************************************!*\
  !*** ./node_modules/rxjs/util/isPromise.js ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nfunction isPromise(value) {\n    return value && typeof value.subscribe !== 'function' && typeof value.then === 'function';\n}\nexports.isPromise = isPromise;\n//# sourceMappingURL=isPromise.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isPromise.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/isScheduler.js":
/*!***********************************************!*\
  !*** ./node_modules/rxjs/util/isScheduler.js ***!
  \***********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nfunction isScheduler(value) {\n    return value && typeof value.schedule === 'function';\n}\nexports.isScheduler = isScheduler;\n//# sourceMappingURL=isScheduler.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/isScheduler.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/noop.js":
/*!****************************************!*\
  !*** ./node_modules/rxjs/util/noop.js ***!
  \****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n/* tslint:disable:no-empty */\nfunction noop() { }\nexports.noop = noop;\n//# sourceMappingURL=noop.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/noop.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/pipe.js":
/*!****************************************!*\
  !*** ./node_modules/rxjs/util/pipe.js ***!
  \****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar noop_1 = __webpack_require__(/*! ./noop */ \"./node_modules/rxjs/util/noop.js\");\n/* tslint:enable:max-line-length */\nfunction pipe() {\n    var fns = [];\n    for (var _i = 0; _i < arguments.length; _i++) {\n        fns[_i - 0] = arguments[_i];\n    }\n    return pipeFromArray(fns);\n}\nexports.pipe = pipe;\n/* @internal */\nfunction pipeFromArray(fns) {\n    if (!fns) {\n        return noop_1.noop;\n    }\n    if (fns.length === 1) {\n        return fns[0];\n    }\n    return function piped(input) {\n        return fns.reduce(function (prev, fn) { return fn(prev); }, input);\n    };\n}\nexports.pipeFromArray = pipeFromArray;\n//# sourceMappingURL=pipe.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/pipe.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/root.js":
/*!****************************************!*\
  !*** ./node_modules/rxjs/util/root.js ***!
  \****************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("/* WEBPACK VAR INJECTION */(function(global) {\n// CommonJS / Node have global context exposed as \"global\" variable.\n// We don't want to include the whole node.d.ts this this compilation unit so we'll just fake\n// the global \"global\" var for now.\nvar __window = typeof window !== 'undefined' && window;\nvar __self = typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined' &&\n    self instanceof WorkerGlobalScope && self;\nvar __global = typeof global !== 'undefined' && global;\nvar _root = __window || __global || __self;\nexports.root = _root;\n// Workaround Closure Compiler restriction: The body of a goog.module cannot use throw.\n// This is needed when used with angular/tsickle which inserts a goog.module statement.\n// Wrap in IIFE\n(function () {\n    if (!_root) {\n        throw new Error('RxJS could not find any global context (window, self, global)');\n    }\n})();\n//# sourceMappingURL=root.js.map\n/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../../webpack/buildin/global.js */ \"./node_modules/webpack/buildin/global.js\")))\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/root.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/subscribeToResult.js":
/*!*****************************************************!*\
  !*** ./node_modules/rxjs/util/subscribeToResult.js ***!
  \*****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar root_1 = __webpack_require__(/*! ./root */ \"./node_modules/rxjs/util/root.js\");\nvar isArrayLike_1 = __webpack_require__(/*! ./isArrayLike */ \"./node_modules/rxjs/util/isArrayLike.js\");\nvar isPromise_1 = __webpack_require__(/*! ./isPromise */ \"./node_modules/rxjs/util/isPromise.js\");\nvar isObject_1 = __webpack_require__(/*! ./isObject */ \"./node_modules/rxjs/util/isObject.js\");\nvar Observable_1 = __webpack_require__(/*! ../Observable */ \"./node_modules/rxjs/Observable.js\");\nvar iterator_1 = __webpack_require__(/*! ../symbol/iterator */ \"./node_modules/rxjs/symbol/iterator.js\");\nvar InnerSubscriber_1 = __webpack_require__(/*! ../InnerSubscriber */ \"./node_modules/rxjs/InnerSubscriber.js\");\nvar observable_1 = __webpack_require__(/*! ../symbol/observable */ \"./node_modules/rxjs/symbol/observable.js\");\nfunction subscribeToResult(outerSubscriber, result, outerValue, outerIndex) {\n    var destination = new InnerSubscriber_1.InnerSubscriber(outerSubscriber, outerValue, outerIndex);\n    if (destination.closed) {\n        return null;\n    }\n    if (result instanceof Observable_1.Observable) {\n        if (result._isScalar) {\n            destination.next(result.value);\n            destination.complete();\n            return null;\n        }\n        else {\n            destination.syncErrorThrowable = true;\n            return result.subscribe(destination);\n        }\n    }\n    else if (isArrayLike_1.isArrayLike(result)) {\n        for (var i = 0, len = result.length; i < len && !destination.closed; i++) {\n            destination.next(result[i]);\n        }\n        if (!destination.closed) {\n            destination.complete();\n        }\n    }\n    else if (isPromise_1.isPromise(result)) {\n        result.then(function (value) {\n            if (!destination.closed) {\n                destination.next(value);\n                destination.complete();\n            }\n        }, function (err) { return destination.error(err); })\n            .then(null, function (err) {\n            // Escaping the Promise trap: globally throw unhandled errors\n            root_1.root.setTimeout(function () { throw err; });\n        });\n        return destination;\n    }\n    else if (result && typeof result[iterator_1.iterator] === 'function') {\n        var iterator = result[iterator_1.iterator]();\n        do {\n            var item = iterator.next();\n            if (item.done) {\n                destination.complete();\n                break;\n            }\n            destination.next(item.value);\n            if (destination.closed) {\n                break;\n            }\n        } while (true);\n    }\n    else if (result && typeof result[observable_1.observable] === 'function') {\n        var obs = result[observable_1.observable]();\n        if (typeof obs.subscribe !== 'function') {\n            destination.error(new TypeError('Provided object does not correctly implement Symbol.observable'));\n        }\n        else {\n            return obs.subscribe(new InnerSubscriber_1.InnerSubscriber(outerSubscriber, outerValue, outerIndex));\n        }\n    }\n    else {\n        var value = isObject_1.isObject(result) ? 'an invalid object' : \"'\" + result + \"'\";\n        var msg = (\"You provided \" + value + \" where a stream was expected.\")\n            + ' You can provide an Observable, Promise, Array, or Iterable.';\n        destination.error(new TypeError(msg));\n    }\n    return null;\n}\nexports.subscribeToResult = subscribeToResult;\n//# sourceMappingURL=subscribeToResult.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/subscribeToResult.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/toSubscriber.js":
/*!************************************************!*\
  !*** ./node_modules/rxjs/util/toSubscriber.js ***!
  \************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar Subscriber_1 = __webpack_require__(/*! ../Subscriber */ \"./node_modules/rxjs/Subscriber.js\");\nvar rxSubscriber_1 = __webpack_require__(/*! ../symbol/rxSubscriber */ \"./node_modules/rxjs/symbol/rxSubscriber.js\");\nvar Observer_1 = __webpack_require__(/*! ../Observer */ \"./node_modules/rxjs/Observer.js\");\nfunction toSubscriber(nextOrObserver, error, complete) {\n    if (nextOrObserver) {\n        if (nextOrObserver instanceof Subscriber_1.Subscriber) {\n            return nextOrObserver;\n        }\n        if (nextOrObserver[rxSubscriber_1.rxSubscriber]) {\n            return nextOrObserver[rxSubscriber_1.rxSubscriber]();\n        }\n    }\n    if (!nextOrObserver && !error && !complete) {\n        return new Subscriber_1.Subscriber(Observer_1.empty);\n    }\n    return new Subscriber_1.Subscriber(nextOrObserver, error, complete);\n}\nexports.toSubscriber = toSubscriber;\n//# sourceMappingURL=toSubscriber.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/toSubscriber.js?");

/***/ }),

/***/ "./node_modules/rxjs/util/tryCatch.js":
/*!********************************************!*\
  !*** ./node_modules/rxjs/util/tryCatch.js ***!
  \********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar errorObject_1 = __webpack_require__(/*! ./errorObject */ \"./node_modules/rxjs/util/errorObject.js\");\nvar tryCatchTarget;\nfunction tryCatcher() {\n    try {\n        return tryCatchTarget.apply(this, arguments);\n    }\n    catch (e) {\n        errorObject_1.errorObject.e = e;\n        return errorObject_1.errorObject;\n    }\n}\nfunction tryCatch(fn) {\n    tryCatchTarget = fn;\n    return tryCatcher;\n}\nexports.tryCatch = tryCatch;\n;\n//# sourceMappingURL=tryCatch.js.map\n\n//# sourceURL=webpack:///./node_modules/rxjs/util/tryCatch.js?");

/***/ }),

/***/ "./node_modules/webpack/buildin/global.js":
/*!***********************************!*\
  !*** (webpack)/buildin/global.js ***!
  \***********************************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("var g;\n\n// This works in non-strict mode\ng = (function() {\n\treturn this;\n})();\n\ntry {\n\t// This works if eval is allowed (see CSP)\n\tg = g || new Function(\"return this\")();\n} catch (e) {\n\t// This works if the window reference is available\n\tif (typeof window === \"object\") g = window;\n}\n\n// g can still be undefined, but nothing to do about it...\n// We return undefined, instead of nothing here, so it's\n// easier to handle this case. if(!global) { ...}\n\nmodule.exports = g;\n\n\n//# sourceURL=webpack:///(webpack)/buildin/global.js?");

/***/ }),

/***/ "./src/ui/jb-rx.js":
/*!*************************!*\
  !*** ./src/ui/jb-rx.js ***!
  \*************************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var rxjs_Subject__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! rxjs/Subject */ \"./node_modules/rxjs/Subject.js\");\n/* harmony import */ var rxjs_Subject__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(rxjs_Subject__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var rxjs_Observable__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! rxjs/Observable */ \"./node_modules/rxjs/Observable.js\");\n/* harmony import */ var rxjs_Observable__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(rxjs_Observable__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var rxjs_observable_FromObservable__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! rxjs/observable/FromObservable */ \"./node_modules/rxjs/observable/FromObservable.js\");\n/* harmony import */ var rxjs_observable_FromObservable__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(rxjs_observable_FromObservable__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var rxjs_add_operator_map__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! rxjs/add/operator/map */ \"./node_modules/rxjs/add/operator/map.js\");\n/* harmony import */ var rxjs_add_operator_map__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_map__WEBPACK_IMPORTED_MODULE_3__);\n/* harmony import */ var rxjs_add_operator_filter__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! rxjs/add/operator/filter */ \"./node_modules/rxjs/add/operator/filter.js\");\n/* harmony import */ var rxjs_add_operator_filter__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_filter__WEBPACK_IMPORTED_MODULE_4__);\n/* harmony import */ var rxjs_add_operator_catch__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! rxjs/add/operator/catch */ \"./node_modules/rxjs/add/operator/catch.js\");\n/* harmony import */ var rxjs_add_operator_catch__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_catch__WEBPACK_IMPORTED_MODULE_5__);\n/* harmony import */ var rxjs_add_operator_do__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! rxjs/add/operator/do */ \"./node_modules/rxjs/add/operator/do.js\");\n/* harmony import */ var rxjs_add_operator_do__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_do__WEBPACK_IMPORTED_MODULE_6__);\n/* harmony import */ var rxjs_add_operator_merge__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! rxjs/add/operator/merge */ \"./node_modules/rxjs/add/operator/merge.js\");\n/* harmony import */ var rxjs_add_operator_merge__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_merge__WEBPACK_IMPORTED_MODULE_7__);\n/* harmony import */ var rxjs_add_operator_concat__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! rxjs/add/operator/concat */ \"./node_modules/rxjs/add/operator/concat.js\");\n/* harmony import */ var rxjs_add_operator_concat__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_concat__WEBPACK_IMPORTED_MODULE_8__);\n/* harmony import */ var rxjs_add_operator_mergeMap__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! rxjs/add/operator/mergeMap */ \"./node_modules/rxjs/add/operator/mergeMap.js\");\n/* harmony import */ var rxjs_add_operator_mergeMap__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_mergeMap__WEBPACK_IMPORTED_MODULE_9__);\n/* harmony import */ var rxjs_add_operator_concatMap__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! rxjs/add/operator/concatMap */ \"./node_modules/rxjs/add/operator/concatMap.js\");\n/* harmony import */ var rxjs_add_operator_concatMap__WEBPACK_IMPORTED_MODULE_10___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_concatMap__WEBPACK_IMPORTED_MODULE_10__);\n/* harmony import */ var rxjs_add_operator_startWith__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! rxjs/add/operator/startWith */ \"./node_modules/rxjs/add/operator/startWith.js\");\n/* harmony import */ var rxjs_add_operator_startWith__WEBPACK_IMPORTED_MODULE_11___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_startWith__WEBPACK_IMPORTED_MODULE_11__);\n/* harmony import */ var rxjs_add_operator_takeUntil__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! rxjs/add/operator/takeUntil */ \"./node_modules/rxjs/add/operator/takeUntil.js\");\n/* harmony import */ var rxjs_add_operator_takeUntil__WEBPACK_IMPORTED_MODULE_12___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_takeUntil__WEBPACK_IMPORTED_MODULE_12__);\n/* harmony import */ var rxjs_add_observable_fromPromise__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! rxjs/add/observable/fromPromise */ \"./node_modules/rxjs/add/observable/fromPromise.js\");\n/* harmony import */ var rxjs_add_observable_fromPromise__WEBPACK_IMPORTED_MODULE_13___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_observable_fromPromise__WEBPACK_IMPORTED_MODULE_13__);\n/* harmony import */ var rxjs_add_observable_fromEvent__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! rxjs/add/observable/fromEvent */ \"./node_modules/rxjs/add/observable/fromEvent.js\");\n/* harmony import */ var rxjs_add_observable_fromEvent__WEBPACK_IMPORTED_MODULE_14___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_observable_fromEvent__WEBPACK_IMPORTED_MODULE_14__);\n/* harmony import */ var rxjs_add_observable_from__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! rxjs/add/observable/from */ \"./node_modules/rxjs/add/observable/from.js\");\n/* harmony import */ var rxjs_add_observable_from__WEBPACK_IMPORTED_MODULE_15___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_observable_from__WEBPACK_IMPORTED_MODULE_15__);\n/* harmony import */ var rxjs_add_observable_of__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! rxjs/add/observable/of */ \"./node_modules/rxjs/add/observable/of.js\");\n/* harmony import */ var rxjs_add_observable_of__WEBPACK_IMPORTED_MODULE_16___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_observable_of__WEBPACK_IMPORTED_MODULE_16__);\n/* harmony import */ var rxjs_add_observable_zip__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! rxjs/add/observable/zip */ \"./node_modules/rxjs/add/observable/zip.js\");\n/* harmony import */ var rxjs_add_observable_zip__WEBPACK_IMPORTED_MODULE_17___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_observable_zip__WEBPACK_IMPORTED_MODULE_17__);\n/* harmony import */ var rxjs_add_observable_interval__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! rxjs/add/observable/interval */ \"./node_modules/rxjs/add/observable/interval.js\");\n/* harmony import */ var rxjs_add_observable_interval__WEBPACK_IMPORTED_MODULE_18___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_observable_interval__WEBPACK_IMPORTED_MODULE_18__);\n/* harmony import */ var rxjs_add_operator_distinctUntilChanged__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! rxjs/add/operator/distinctUntilChanged */ \"./node_modules/rxjs/add/operator/distinctUntilChanged.js\");\n/* harmony import */ var rxjs_add_operator_distinctUntilChanged__WEBPACK_IMPORTED_MODULE_19___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_distinctUntilChanged__WEBPACK_IMPORTED_MODULE_19__);\n/* harmony import */ var rxjs_add_operator_debounceTime__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! rxjs/add/operator/debounceTime */ \"./node_modules/rxjs/add/operator/debounceTime.js\");\n/* harmony import */ var rxjs_add_operator_debounceTime__WEBPACK_IMPORTED_MODULE_20___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_debounceTime__WEBPACK_IMPORTED_MODULE_20__);\n/* harmony import */ var rxjs_add_operator_debounce__WEBPACK_IMPORTED_MODULE_21__ = __webpack_require__(/*! rxjs/add/operator/debounce */ \"./node_modules/rxjs/add/operator/debounce.js\");\n/* harmony import */ var rxjs_add_operator_debounce__WEBPACK_IMPORTED_MODULE_21___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_debounce__WEBPACK_IMPORTED_MODULE_21__);\n/* harmony import */ var rxjs_add_operator_buffer__WEBPACK_IMPORTED_MODULE_22__ = __webpack_require__(/*! rxjs/add/operator/buffer */ \"./node_modules/rxjs/add/operator/buffer.js\");\n/* harmony import */ var rxjs_add_operator_buffer__WEBPACK_IMPORTED_MODULE_22___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_buffer__WEBPACK_IMPORTED_MODULE_22__);\n/* harmony import */ var rxjs_add_operator_skip__WEBPACK_IMPORTED_MODULE_23__ = __webpack_require__(/*! rxjs/add/operator/skip */ \"./node_modules/rxjs/add/operator/skip.js\");\n/* harmony import */ var rxjs_add_operator_skip__WEBPACK_IMPORTED_MODULE_23___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_skip__WEBPACK_IMPORTED_MODULE_23__);\n/* harmony import */ var rxjs_add_operator_last__WEBPACK_IMPORTED_MODULE_24__ = __webpack_require__(/*! rxjs/add/operator/last */ \"./node_modules/rxjs/add/operator/last.js\");\n/* harmony import */ var rxjs_add_operator_last__WEBPACK_IMPORTED_MODULE_24___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_last__WEBPACK_IMPORTED_MODULE_24__);\n/* harmony import */ var rxjs_add_operator_delay__WEBPACK_IMPORTED_MODULE_25__ = __webpack_require__(/*! rxjs/add/operator/delay */ \"./node_modules/rxjs/add/operator/delay.js\");\n/* harmony import */ var rxjs_add_operator_delay__WEBPACK_IMPORTED_MODULE_25___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_delay__WEBPACK_IMPORTED_MODULE_25__);\n/* harmony import */ var rxjs_add_operator_take__WEBPACK_IMPORTED_MODULE_26__ = __webpack_require__(/*! rxjs/add/operator/take */ \"./node_modules/rxjs/add/operator/take.js\");\n/* harmony import */ var rxjs_add_operator_take__WEBPACK_IMPORTED_MODULE_26___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_take__WEBPACK_IMPORTED_MODULE_26__);\n/* harmony import */ var rxjs_add_operator_toArray__WEBPACK_IMPORTED_MODULE_27__ = __webpack_require__(/*! rxjs/add/operator/toArray */ \"./node_modules/rxjs/add/operator/toArray.js\");\n/* harmony import */ var rxjs_add_operator_toArray__WEBPACK_IMPORTED_MODULE_27___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_toArray__WEBPACK_IMPORTED_MODULE_27__);\n/* harmony import */ var rxjs_add_operator_toPromise__WEBPACK_IMPORTED_MODULE_28__ = __webpack_require__(/*! rxjs/add/operator/toPromise */ \"./node_modules/rxjs/add/operator/toPromise.js\");\n/* harmony import */ var rxjs_add_operator_toPromise__WEBPACK_IMPORTED_MODULE_28___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_toPromise__WEBPACK_IMPORTED_MODULE_28__);\n/* harmony import */ var rxjs_add_operator_race__WEBPACK_IMPORTED_MODULE_29__ = __webpack_require__(/*! rxjs/add/operator/race */ \"./node_modules/rxjs/add/operator/race.js\");\n/* harmony import */ var rxjs_add_operator_race__WEBPACK_IMPORTED_MODULE_29___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_race__WEBPACK_IMPORTED_MODULE_29__);\n/* harmony import */ var rxjs_add_operator_finally__WEBPACK_IMPORTED_MODULE_30__ = __webpack_require__(/*! rxjs/add/operator/finally */ \"./node_modules/rxjs/add/operator/finally.js\");\n/* harmony import */ var rxjs_add_operator_finally__WEBPACK_IMPORTED_MODULE_30___default = /*#__PURE__*/__webpack_require__.n(rxjs_add_operator_finally__WEBPACK_IMPORTED_MODULE_30__);\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\njb.rx.Observable = rxjs_Observable__WEBPACK_IMPORTED_MODULE_1__[\"Observable\"];\r\njb.rx.Subject = rxjs_Subject__WEBPACK_IMPORTED_MODULE_0__[\"Subject\"];\r\n\n\n//# sourceURL=webpack:///./src/ui/jb-rx.js?");

/***/ })

/******/ });;

(function() {
const is = (previous, current) => previous === current
const UNIQUE = {}

jb.callbag = {
    range: function* (from, to) {
        let i = from
        while (i <= to) {
            yield i
            i++
        }
    },
    forEach: operation => source => {
        let talkback
        source(0, (t, d) => {
            if (t === 0) talkback = d
            if (t === 1) operation(d)
            if (t === 1 || t === 0) talkback(1)
        })
    },
    fromIter: iter => (start, sink) => {
        if (start !== 0) return
        const iterator =
            typeof Symbol !== 'undefined' && iter[Symbol.iterator]
            ? iter[Symbol.iterator]()
            : iter
        let inloop = false
        let got1 = false
        let res
        function loop() {
            inloop = true
            while (got1) {
                got1 = false
                res = iterator.next()
                if (res.done) sink(2)
                else sink(1, res.value)
            }
            inloop = false
        }
        sink(0, t => {
            if (t === 1) {
                got1 = true
                if (!inloop && !(res && res.done)) loop()
            }
        })
    },
    Do: f => source => (start, sink) => {
        if (start !== 0) return
        source(0, (t, d) => {
            if (t == 1) f(d)
            sink(t, d)
        })
    },
    filter: condition => source => (start, sink) => {
        if (start !== 0) return
        let talkback
        source(0, (t, d) => {
          if (t === 0) {
            talkback = d
            sink(t, d)
          } else if (t === 1) {
            if (condition(d)) sink(t, d)
            else talkback(1)
          }
          else sink(t, d)
        })
    },
    map: f => source => (start, sink) => {
        if (start !== 0) return
        source(0, (t, d) => {
            sink(t, t === 1 ? f(d) : d)
        })
    },
    pipe(...cbs) {
        let res = cbs[0]
        for (let i = 1, n = cbs.length; i < n; i++) res = cbs[i](res)
        return res
    },
    distinctUntilChanged(compare = is) {
        return source => (start, sink) => {
            if (start !== 0) return
            let inited = false
            let prev
            let talkback
            source(0, (type, data) => {
                if (type === 0) {
                    talkback = data
                }

                if (type !== 1) {
                    sink(type, data)
                    return
                }

                if (inited && compare(prev, data)) {
                    talkback(1)
                    return
                }

                inited = true
                prev = data
                sink(1, data)
            })
        }
    },
    takeUntil: notifier => source => (start, sink) => {
        if (start !== 0) return
        let sourceTalkback
        let notifierTalkback
        let inited = false
        let done = UNIQUE

        source(0, (type, data) => {
            if (type === 0) {
                sourceTalkback = data

                notifier(0, (t, d) => {
                    if (t === 0) {
                        notifierTalkback = d
                        notifierTalkback(1)
                        return
                    }
                    if (t === 1) {
                        done = void 0
                        notifierTalkback(2)
                        sourceTalkback(2)
                        if (inited) sink(2)
                        return
                    }
                    if (t === 2) {
                        notifierTalkback = null
                        done = d
                        if (d != null) {
                            sourceTalkback(2)
                            if (inited) sink(t, d)
                        }
                    }
                })
                inited = true

                sink(0, (t, d) => {
                    if (done !== UNIQUE) return
                    if (t === 2 && notifierTalkback) notifierTalkback(2)
                    sourceTalkback(t, d)
                })

                if (done !== UNIQUE) sink(2, done)
                return
            }
            if (type === 2) notifierTalkback(2)
            if (done === UNIQUE) sink(type, data)
        })
    },
    flatMap: (makeSource, combineResults) => inputSource => (start, sink) => {
        if (start !== 0) return

        if (!combineResults) combineResults = (x, y) => y

        let index = 0
        let talkbacks = {}
        let sourceEnded = false
        let inputSourceTalkback = null

        let pullHandle = (t, d) => {
            var currTalkback = Object.values(talkbacks).pop()
            if (t === 1) {
                if (currTalkback) currTalkback(1)
                else if (!sourceEnded) inputSourceTalkback(1)
                else sink(2)
            }
            if (t === 2) {
                if (currTalkback) currTalkback(2)
                inputSourceTalkback(2)
            }
        }

        let stopOrContinue = d => {
            if (sourceEnded && Object.keys(talkbacks).length === 0) sink(2, d)
            else inputSourceTalkback(1)
        }

        let makeSink = (i, d, talkbacks) =>
            (currT, currD) => {
                if (currT === 0) {talkbacks[i] = currD; talkbacks[i](1)}
                if (currT === 1) sink(1, combineResults(d, currD))
                if (currT === 2) {
                    delete talkbacks[i]
                    stopOrContinue(currD)
                }
            }

        inputSource(0, (t, d) => {
            if (t === 0) {
                inputSourceTalkback = d
                sink(0, pullHandle)
            }
            if (t === 1) {
                makeSource(d)(0, makeSink(index++, d, talkbacks))
            }
            if (t === 2) {
                sourceEnded = true
                stopOrContinue(d)
            }
    })
    },
    merge(...sources) {
        return (start, sink) => {
          if (start !== 0) return
          const n = sources.length
          const sourceTalkbacks = new Array(n)
          let startCount = 0
          let endCount = 0
          let ended = false
          const talkback = (t, d) => {
            if (t === 2) ended = true
            for (let i = 0; i < n; i++) sourceTalkbacks[i] && sourceTalkbacks[i](t, d)
          }
          for (let i = 0; i < n; i++) {
            if (ended) return
            sources[i](0, (t, d) => {
              if (t === 0) {
                sourceTalkbacks[i] = d
                if (++startCount === 1) sink(0, talkback)
              } else if (t === 2 && d) {
                ended = true
                for (let j = 0; j < n; j++) {
                  if (j !== i) sourceTalkbacks[j] && sourceTalkbacks[j](2)
                }
                sink(2, d)
              } else if (t === 2) {
                sourceTalkbacks[i] = void 0
                if (++endCount === n) sink(2)
              } else sink(t, d)
            })
          }
        }
    },
    fromEvent: (node, name, options) => (start, sink) => {
        if (start !== 0) return
        let disposed = false
        const handler = ev => {
          sink(1, ev)
        }
      
        sink(0, t => {
          if (t !== 2) {
            return
          }
          disposed = true
          if (node.removeEventListener) node.removeEventListener(name, handler, options)
          else if (node.removeListener) node.removeListener(name, handler)
          else throw new Error('cannot remove listener from node. No method found.')
        })
      
        if (disposed) {
          return
        }
      
        if (node.addEventListener) node.addEventListener(name, handler, options)
        else if (node.addListener) node.addListener(name, handler)
        else throw new Error('cannot add listener to node. No method found.')
    },
    fromPromise: promise => (start, sink) => {
        if (start !== 0) return
        let ended = false
        const onfulfilled = val => {
          if (ended) return
          sink(1, val)
          if (ended) return
          sink(2)
        }
        const onrejected = (err = new Error()) => {
          if (ended) return
          sink(2, err)
        }
        promise.then(onfulfilled, onrejected)
        sink(0, t => {
          if (t === 2) ended = true
        })
    },
    subject() {
        let sinks = []
        return (type, data) => {
          if (type === 0) {
            const sink = data
            sinks.push(sink)
            sink(0, t => {
              if (t === 2) {
                const i = sinks.indexOf(sink)
                if (i > -1) sinks.splice(i, 1)
              }
            })
          } else {
            const zinkz = sinks.slice(0)
            for (let i = 0, n = zinkz.length, sink; i < n; i++) {
              sink = zinkz[i]
              if (sinks.indexOf(sink) > -1) sink(type, data)
            }
          }
        }
    },
    catchError: fn => source => (start, sink) => {
        if (start !== 0) return
      
        source(0, (type, data) => {
          type === 2 && typeof data !== 'undefined' ? fn(data) : sink(type, data);
        })
    },
    concat: (...sources) => (start, sink) => {
        if (start !== 0) return
        const n = sources.length
        if (n === 0) {
          sink(0, () => {})
          sink(2)
          return
        }
        let i = 0
        let sourceTalkback
        let lastPull = UNIQUE
        const talkback = (t, d) => {
          if (t === 1) lastPull = d
          sourceTalkback(t, d)
        }
        (function next() {
          if (i === n) {
            sink(2)
            return
          }
          sources[i](0, (t, d) => {
            if (t === 0) {
              sourceTalkback = d
              if (i === 0) sink(0, talkback)
              else if (lastPull !== UNIQUE) sourceTalkback(1, lastPull)
            } else if (t === 2 && d) {
              sink(2, d)
            } else if (t === 2) {
              i++
              next()
            } else {
              sink(t, d)
            }
          })
        })()
    },
    create: prod => (start, sink) => {
        if (start !== 0) return
        if (typeof prod !== 'function') {
          sink(0, () => {})
          sink(2)
          return
        }
        let end = false
        let clean
        sink(0, (t) => {
          if (!end) {
            end = t === 2
            if (end && typeof clean === 'function') clean()
          }
        })
        if (end) return
        clean = prod((v) => {
          if (!end) sink(1, v)
        }, (e) => {
          if (!end && e !== undefined) {
            end = true
            sink(2, e)
          }
        }, () => {
          if (!end) {
            end = true
            sink(2)
          }
        })
    },
    debounceTime: duration => source => (start, sink) => {
        if (start !== 0) return
        let timeout
        source(0, (t, d) => {
          // every event clears the existing timeout, if any
          if (timeout) clearTimeout(timeout)
          if (t === 1) timeout = setTimeout(() => sink(1, d), duration)
          else sink(t, d)
        })
    } 
}   

})();

(function() {

// const sampleRef = {
//     $jb_obj: {}, // real object (or parent) val - may exist only in older version of the resource. may contain $jb_id for tracking
//     $jb_childProp: 'title', // used for primitive props
// }

const isProxy = Symbol.for("isProxy")
const originalVal = Symbol.for("originalVal")
const targetVal = Symbol.for("targetVal")
const jbId = Symbol("jbId")

class WatchableValueByRef {
  constructor(resources) {
    this.resources = resources
    this.objToPath = new Map()
    this.idCounter = 1
    this.allowedTypes = [Object.getPrototypeOf({}),Object.getPrototypeOf([])]
    this.resourceChange = new jb.rx.Subject()
    this.observables = []
    this.primitiveArraysDeltas = {}

    jb.ui.originalResources = jb.resources
    const resourcesObj = resources()
    resourcesObj[jbId] = this.idCounter++
    this.objToPath.set(resourcesObj[jbId],[])
    this.propagateResourceChangeToObservables()
  }
  doOp(ref,opOnRef,srcCtx) {
    try {
      const opVal = opOnRef.$set || opOnRef.$merge || opOnRef.$push || opOnRef.$splice;
      if (!this.isRef(ref))
        ref = this.asRef(ref);
      jb.log('doOp',[this.asStr(ref),opVal,...arguments]);

      const path = this.removeLinksFromPath(this.pathOfRef(ref)), op = {}, oldVal = this.valOfPath(path);
      if (!path || ref.$jb_val) return;
      if (opOnRef.$set !== undefined && opOnRef.$set === oldVal) return;
      if (opOnRef.$push) opOnRef.$push = jb.asArray(opOnRef.$push)
      this.addJbId(path) // hash ancestors with jbId because the objects will be re-generated by redux
      jb.path(op,path,opOnRef) // create op as nested object
      const insertedIndex = jb.path(opOnRef.$splice,[0,2]) && jb.path(opOnRef.$splice,[0,0])
      const insertedPath = insertedIndex != null && path.concat(insertedIndex)
      const opEvent = {op: opOnRef, path: [...path], insertedPath, ref, srcCtx, oldVal, opVal, timeStamp: new Date().getTime()}
      this.resources(jb.ui.update(this.resources(),op),opEvent)
      const newVal = (opVal != null && opVal[isProxy]) ? opVal : this.valOfPath(path);
      if (opOnRef.$push) {
        opOnRef.$push.forEach((toAdd,i)=>
          this.addObjToMap(toAdd,[...path,oldVal.length+i]))
        newVal[jbId] = oldVal[jbId]
        opEvent.path.push(oldVal.length)
        opEvent.ref = this.refOfPath(opEvent.path)
      } else if (opOnRef.$set === null && typeof oldVal === 'object') { // delete object should return the path that was deleted
        this.removeObjFromMap(oldVal)
        this.addObjToMap(newVal,path)
        opEvent.ref.$jb_path = () => path
      } else if (opOnRef.$splice) {
        // TODO: make is more effecient in case of move
        opOnRef.$splice.forEach(ar=> {
          oldVal.slice(ar[0],ar[0]+ar[1]).forEach(toRemove=>this.removeObjFromMap(toRemove));
          jb.asArray(ar[2]).forEach(toAdd=>this.addObjToMap(toAdd,path.concat(newVal.indexOf(toAdd))))
        })
        this.fixSplicedPaths(path,opOnRef.$splice)
      } else {
          // TODO: make is more effecient in case of $merge
          this.removeObjFromMap(oldVal)
          this.addObjToMap(newVal,path)
      }
      if (opOnRef.$splice) {
        this.primitiveArraysDeltas[ref.$jb_obj[jbId]] = this.primitiveArraysDeltas[ref.$jb_obj[jbId]] || []
        this.primitiveArraysDeltas[ref.$jb_obj[jbId]].push(opOnRef.$splice)
      }
      opEvent.newVal = newVal;
      // TODO: split splice event to delete, push, and insert
      if (this.transactionEventsLog)
        this.transactionEventsLog.push(opEvent)
      else
        this.resourceChange.next(opEvent);
      return opEvent;
    } catch(e) {
      jb.logException(e,'doOp',srcCtx,...arguments)
    }
  }
  resourceReferred(resName) {
    const resource = this.resources()[resName]
    if (!this.objToPath.has(resource))
    this.addObjToMap(resource,[resName])
  }
  addJbId(path) {
    for(let i=0;i<path.length;i++) {
      const innerPath = path.slice(0,i+1)
      const val = this.valOfPath(innerPath,true)
      if (val && typeof val === 'object' && !val[jbId]) {
          val[jbId] = this.idCounter++
          this.addObjToMap(val,innerPath)
      }
    }
  }
  addObjToMap(top,path) {
    if (!top || top[isProxy] || top.$jb_val || typeof top !== 'object' || this.allowedTypes.indexOf(Object.getPrototypeOf(top)) == -1) return
    if (top[jbId]) {
        this.objToPath.set(top[jbId],path)
        this.objToPath.delete(top)
    } else {
        this.objToPath.set(top,path)
    }
    Object.keys(top).filter(key=>typeof top[key] === 'object' && key.indexOf('$jb_') != 0)
        .forEach(key => this.addObjToMap(top[key],[...path,key]))
  }
  removeObjFromMap(top,isInner) {
    if (!top || typeof top !== 'object' || this.allowedTypes.indexOf(Object.getPrototypeOf(top)) == -1) return
    this.objToPath.delete(top)
    if (top[jbId] && isInner)
        this.objToPath.delete(top[jbId])
    Object.keys(top).filter(key=>key=>typeof top[key] === 'object' && key.indexOf('$jb_') != 0).forEach(key => this.removeObjFromMap(top[key],true))
  }
  fixSplicedPaths(path,spliceOp) {
    const propDepth = path.length
    Array.from(this.objToPath.keys())
      .filter(k=>startsWithPath(this.objToPath.get(k)))
//      .filter(k=>! spliceOp.reduce((res,ar) => res || jb.asArray(ar[2]).indexOf(k) != -1, false)) // do not touch the moved elem itslef
      .forEach(k=>{
        const newPath = this.objToPath.get(k)
        newPath[propDepth] = fixIndexProp(+newPath[propDepth])
        if (newPath[propDepth] >= 0)
          this.objToPath.set(k,newPath)
      })

    function startsWithPath(toCompare) {
      if (toCompare.length <= propDepth) return
      for(let i=0;i<propDepth;i++)
        if (toCompare[i] != path[i]) return
      return true
    }
    function fixIndexProp(oldIndex) {
      return oldIndex + spliceOp.reduce((delta,ar) => (oldIndex < ar[0]) ? 0 : jb.asArray(ar[2]).length - ar[1],0)
    }
  }
  pathOfRef(ref) {
    if (ref.$jb_path)
      return ref.$jb_path()
    const path = this.isRef(ref) && (this.objToPath.get(ref.$jb_obj) || this.objToPath.get(ref.$jb_obj[jbId]))
    if (path && ref.$jb_childProp !== undefined) {
        this.refreshPrimitiveArrayRef(ref)
        return [...path, ref.$jb_childProp]
    }
    return path
  }
  urlOfRef(ref) {
    const path = this.pathOfRef(ref)
    this.addJbId(path)
    const byId = [ref.$jb_obj[jbId],ref.$jb_childProp].filter(x=>x != null).map(x=>(''+x).replace(/~|;|,/g,'')).join('~')
    const byPath = path.map(x=>(''+x).replace(/~|;|,/g,'')).join('~')
    return `${this.resources.id}://${byId};${byPath}`
  }
  refOfUrl(url) {
    const path = url.split(';')[0].split('~')
    return { handler: this, $jb_obj: {[jbId]: +path[0] }, ...path[1] ? {$jb_childProp: path[1]} : {} }
  }
  asRef(obj, silent) {
    if (this.isRef(obj))
      return obj
    if (!obj || typeof obj !== 'object') return obj;
    const actualObj = obj[isProxy] ? obj[targetVal] : obj
    const path = this.objToPath.get(actualObj) || this.objToPath.get(actualObj[jbId])
    if (path)
        return { $jb_obj: this.valOfPath(path), handler: this, path: function() { return this.handler.pathOfRef(this)} }
    if (!silent)
      jb.logError('asRef can not make a watchable ref of obj',obj)
    return null;
  }
  valOfPath(path) {
    return path.reduce((o,p)=>this.noProxy(o && o[p]),this.resources())
  }
  noProxy(val) {
    return (val && val[isProxy] && val[originalVal]) || val
  }
  hasLinksInPath(path) {
    let val = this.resources()
    for(let i=0;i<path.length;i++) {
      if (val && val[isProxy])
        return true
      val = val && val[path[i]]
    }
  }
  removeLinksFromPath(path) {
    if (!Array.isArray(path)) return
    if (!this.hasLinksInPath(path))
      return path
    return path.reduce(({val,path} ,p) => {
      const proxy = (val && val[isProxy])
      const inner =  proxy ? val[originalVal] : val
      const newPath = proxy ? (this.objToPath.get(inner) || this.objToPath.get(inner[jbId])) : path
      return { val: inner && inner[p], path: [newPath,p].join('~') }
    }, {val: this.resources(), path: ''}).path
  }
  refOfPath(path) {
    const val = this.valOfPath(path);
    if (!val || typeof val !== 'object' && path.length > 0) {
      const parent = this.asRef(this.valOfPath(path.slice(0,-1)), true);
      if (path.length == 1)
        return {$jb_obj: this.resources(), $jb_childProp: path[0], handler: this, $jb_path: () => path }
      return this.objectProperty(parent,path.slice(-1)[0])
    }
    return this.asRef(val)
  }
  asStr(ref) { // for logs
    return this.pathOfRef(ref).join('~')
  }
  isValid(ref) {
    return this.isRef(ref) && this.pathOfRef(ref)
  }
  val(ref) {
    if (ref == null) return ref;
    if (ref.$jb_val) return ref.$jb_val();

    if (!ref.$jb_obj) return ref;
    if (ref.handler != this) {
      if (typeof ref.handler.val != 'function') debugger
      return ref.handler.val(ref)
    }
    this.refreshPrimitiveArrayRef(ref)
    const path = this.pathOfRef(ref);
    if (!path) {
      debugger
      this.pathOfRef(ref)
    }
    return this.valOfPath(path)
  }
  watchable(val) {
    return this.resources() === val || this.objToPath.get(val) || (val && this.objToPath.get(val[jbId]))
  }
  isRef(ref) {
    return ref && ref.$jb_obj && this.watchable(ref.$jb_obj);
  }
  objectProperty(obj,prop,ctx) {
    jb.log('objectProperty',[...arguments]);
    if (!obj)
      return jb.logError('objectProperty: null obj',ctx);
    var ref = this.asRef(obj);
    if (ref && ref.$jb_obj) {
      const ret = {$jb_obj: ref.$jb_obj, $jb_childProp: prop, handler: this, path: function() { return this.handler.pathOfRef(this)}}
      if (this.isPrimitiveArray(ref.$jb_obj)) {
        ret.$jb_delta_version = (this.primitiveArraysDeltas[ref.$jb_obj[jbId]] || []).length
        ret.$jb_childProp = +prop
      }
      return ret
    } else {
      return obj[prop]; // not reffable
    }
  }
  writeValue(ref,value,srcCtx) {
    if (!ref || !this.isRef(ref) || !this.pathOfRef(ref))
      return jb.logError('writeValue: err in ref', srcCtx, ref, value);

    jb.log('writeValue',['watchable',this.asStr(ref),value,ref,srcCtx]);
    if (ref.$jb_val)
      return ref.$jb_val(value);
    if (this.val(ref) === value) return;
    return this.doOp(ref,{$set: this.createSecondaryLink(value)},srcCtx)
  }
  createSecondaryLink(val) {
    if (val && typeof val === 'object' && !val[isProxy]) {
      const ref = this.asRef(val,true);
      if (ref && ref.$jb_obj)
        return new Proxy(val, {
          get: (o,p) => (p === targetVal) ? o : (p === isProxy) ? true : (p === originalVal ? val : (jb.val(this.asRef(val)))[p]),
          set: (o,p,v) => o[p] = v
        })
    }
    return val;
  }
  splice(ref,args,srcCtx) {
    return this.doOp(ref,{$splice: args },srcCtx)
  }
  move(fromRef,toRef,srcCtx) {
    const fromPath = this.pathOfRef(fromRef), toPath = this.pathOfRef(toRef);
    const sameArray = fromPath.slice(0,-1).join('~') == toPath.slice(0,-1).join('~');
    const fromIndex = Number(fromPath.slice(-1));
    let toIndex = Number(toPath.slice(-1));
    const fromArray = this.refOfPath(fromPath.slice(0,-1)),toArray = this.refOfPath(toPath.slice(0,-1));
    if (isNaN(fromIndex) || isNaN(toIndex))
        return jb.logError('move: not array element',srcCtx,fromRef,toRef);

    var valToMove = jb.val(fromRef);
    if (sameArray) {
        //if (fromIndex < toIndex) toIndex--; // the deletion changes the index
        const spliceParam = [[fromIndex,1],[toIndex,0,valToMove]]
        spliceParam.fromIndex = fromIndex
        spliceParam.toIndex = toIndex
        return this.doOp(fromArray,{$splice: spliceParam },srcCtx)
    }
    this.startTransaction()
    const spliceParam = [[fromIndex,1]]
    spliceParam.fromIndex = fromIndex
    spliceParam.toIndex = toIndex
    spliceParam.toArray = toArray
    this.doOp(fromArray,{$splice: spliceParam },srcCtx),
    this.doOp(toArray,{$splice: [[toIndex,0,valToMove]] },srcCtx),
    this.endTransaction()
  }
  isPrimitiveArray(arr) {
    return Array.isArray(arr) && arr.some(x=> x != null && typeof x != 'object')
  }
  refreshPrimitiveArrayRef(ref) {
    if (!this.isPrimitiveArray(ref.$jb_obj)) return
    const arrayId = ref.$jb_obj[jbId]
    const deltas = this.primitiveArraysDeltas[arrayId] || []
    deltas.slice(ref.$jb_delta_version).forEach(group => {
        if (group.fromIndex != undefined && group.fromIndex === ref.$jb_childProp) { // move
          ref.$jb_childProp = group.toIndex
          if (group.toArray)
            ref.$jb_obj = group.toArray.$jb_obj
          return
        }
        group.forEach(([from,toDelete,toAdd]) => { // splice
          if (ref.$jb_childProp == -1) return
          if (ref.$jb_childProp >= from && ref.$jb_childProp < from+toDelete) {
            ref.$jb_childProp = -1
          } else if (ref.$jb_childProp >= from) {
            ref.$jb_childProp = ref.$jb_childProp - toDelete + (toAdd != null) ? 1 : 0
          }
        })
    })
    ref.$jb_delta_version = deltas.length
  }

  startTransaction() {
    this.transactionEventsLog = []
  }
  endTransaction(doNotNotify) {
    if (!doNotNotify)
      (this.transactionEventsLog || []).forEach(opEvent=>this.resourceChange.next(opEvent))
    delete this.transactionEventsLog
  }
  push(ref,value,srcCtx) {
    return this.doOp(ref,{$push: this.createSecondaryLink(value)},srcCtx)
  }
  merge(ref,value,srcCtx) {
    return this.doOp(ref,{$merge: this.createSecondaryLink(value)},srcCtx)
  }
  getOrCreateObservable(req) {
      const subject = new jb.rx.Subject()
      req.srcCtx = req.srcCtx || { path: ''}
      const ctx = req.cmpOrElem.ctx || jb.ui.ctxOfElem(req.cmpOrElem)
      const key = this.pathOfRef(req.ref).join('~') + ' : ' + ctx.path
      const recycleCounter = req.cmpOrElem.getAttribute && +(req.cmpOrElem.getAttribute('recycleCounter') || 0)
      const obs = { ...req, subject, key, recycleCounter, ctx }

      this.observables.push(obs);
      this.observables.sort((e1,e2) => jb.ui.comparePaths(e1.ctx.path, e2.ctx.path))
      jb.log('registerCmpObservable',[obs])
      return subject
  }
  frame() {
    return this.resources.frame || jb.frame
  }
  propagateResourceChangeToObservables() {
    this.resourceChange.subscribe(e=>{
      const observablesToUpdate = this.observables.slice(0) // this.observables array may change in the notification process !!
      const changed_path = this.removeLinksFromPath(this.pathOfRef(e.ref))
      if (changed_path) observablesToUpdate.forEach(obs=> {
        const isOld = obs.cmpOrElem.NodeType && (+obs.cmpOrElem.getAttribute('recycleCounter')) > obs.recycleCounter
        if (obs.cmpOrElem._destroyed || isOld) {
          if (this.observables.indexOf(obs) != -1) {
            jb.log('removeCmpObservable',[obs])
            this.observables.splice(this.observables.indexOf(obs), 1);
          }
        } else {
          this.notifyOneObserver(e,obs,changed_path)
        }
      })
    })
  }

  notifyOneObserver(e,obs,changed_path) {
      let obsPath = jb.refHandler(obs.ref).pathOfRef(obs.ref)
      obsPath = obsPath && this.removeLinksFromPath(obsPath)
      if (!obsPath)
        return jb.logError('observer ref path is empty',obs,e)
      const diff = jb.ui.comparePaths(changed_path, obsPath)
      const isChildOfChange = diff == 1
      const includeChildrenYes = isChildOfChange && (obs.includeChildren === 'yes' || obs.includeChildren === true)
      const includeChildrenStructure = isChildOfChange && obs.includeChildren === 'structure' && (typeof e.oldVal == 'object' || typeof e.newVal == 'object')
      if (diff == -1 || diff == 0 || includeChildrenYes || includeChildrenStructure) {
          jb.log('notifyCmpObservable',['notify change',e.srcCtx,obs,e])
          obs.subject.next(e)
      }
  }

  dispose() {
    this.resourceChange.complete()
  }
}

// 0- equals, -1,1 means contains -2,2 lexical
jb.ui.comparePaths = function(path1,path2) {
    path1 = path1 || ''
    path2 = path2 || ''
    let i=0;
    while(path1[i] === path2[i] && i < path1.length) i++;
    if (i == path1.length && i == path2.length) return 0;
    if (i == path1.length && i < path2.length) return -1;
    if (i == path2.length && i < path1.length) return 1;
    return path1[i] < path2[i] ? -2 : 2
}

function resourcesRef(val) {
  if (typeof val == 'undefined')
    return jb.resources;
  else
    jb.resources = val;
}
resourcesRef.id = 'resources'

jb.setMainWatchableHandler(new WatchableValueByRef(resourcesRef));
jb.rebuildRefHandler = () => {
  jb.mainWatchableHandler && jb.mainWatchableHandler.dispose()
  jb.setMainWatchableHandler(new WatchableValueByRef(resourcesRef))
}
jb.isWatchable = ref => jb.refHandler(ref) instanceof WatchableValueByRef || ref && ref.$jb_observable

jb.ui.refObservable = (ref,cmpOrElem,settings={}) => {
  if (ref && ref.$jb_observable)
    return ref.$jb_observable(cmpOrElem);
  if (!jb.isWatchable(ref)) {
    jb.logError('ref is not watchable', ref)
    return jb.rx.Observable.from([])
  }
  return jb.refHandler(ref).getOrCreateObservable({ref,cmpOrElem,...settings})
  //jb.refHandler(ref).refObservable(ref,cmpOrElem,settings);
}

jb.ui.extraWatchableHandler = (resources,oldHandler) => {
  const res = jb.extraWatchableHandler(new WatchableValueByRef(resources),oldHandler)
  jb.ui.subscribeToRefChange(res)
  return res
}

jb.ui.resourceChange = () => jb.mainWatchableHandler.resourceChange;

jb.component('run-transaction', { /* runTransaction */
  type: 'action',
  params: [
    {id: 'actions', type: 'action[]', dynamic: true, composite: true, mandatory: true, defaultValue: []},
    {id: 'disableNotifications', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,actions,disableNotifications) => {
		jb.mainWatchableHandler.startTransaction()
		return actions.reduce((def,action,index) =>
				def.then(_ => ctx.runInner(action, { as: 'single'}, innerPath + index ))
			,Promise.resolve())
			.catch((e) => jb.logException(e,ctx))
			.then(() => jb.mainWatchableHandler.endTransaction(disableNotifications))
	}
})

})()
;

class VNode {
    constructor(cmpOrTag, _attributes, _children) {
        const attributes = jb.objFromEntries(jb.entries(_attributes).map(e=>[e[0].toLowerCase(),e[1]]))
        let children = (_children === '') ? null : _children
        if (['string','boolean','number'].indexOf(typeof children) !== -1) {
            attributes.$text = children
            children = null
        }
        if (children && typeof children.then == 'function') {
            attributes.$text = '...'
            children = null
        }
        if (children != null && !Array.isArray(children)) children = [children]
        if (children != null)
            children = children.filter(x=>x).map(item=> typeof item == 'string' ? jb.ui.h('span',{$text: item}) : item)
        Object.assign(this,{...{[typeof cmpOrTag === 'string' ? 'tag' : 'cmp'] : cmpOrTag} ,attributes,children})
    }
    getAttribute(att) {
        return (this.attributes || {})[att]
    }
    setAttribute(att,val) {
        this.attributes = this.attributes || {}
        this.attributes[att] = val
    }
    addClass(clz) {
        this.attributes = this.attributes || {};
        if (this.attributes.class === undefined) this.attributes.class = ''
        if (clz && this.attributes.class.split(' ').indexOf(clz) == -1)
            this.attributes.class = [this.attributes.class,clz].filter(x=>x).join(' ');
        return this;
    }
    hasClass(clz) {
        return (jb.path(this,'attributes.class') || '').split(' ').indexOf(clz) != -1
    }
    querySelectorAll(selector,{includeSelf}={}) {
        const hasAtt = selector.match(/^\[([a-zA-Z0-9_\-]+)\]$/)
        const attEquals = selector.match(/^\[([a-zA-Z0-9_\-]+)="([a-zA-Z0-9_\-]+)"\]$/)
        const hasClass = selector.match(/^\.([a-zA-Z0-9_\-]+)$/)
        const hasTag = selector.match(/^[a-zA-Z0-9_\-]+$/)
        const selectorMatcher = hasAtt ? el => el.attributes && el.attributes[hasAtt[1]]
            : hasClass ? el => el.hasClass(hasClass[1])
            : hasTag ? el => el.tag === hasTag[0]
            : attEquals ? el => el.attributes && el.attributes[attEquals[1]] == attEquals[2]
            : null

        return selectorMatcher && doFind(this,selectorMatcher,!includeSelf)

        function doFind(vdom,selectorMatcher,excludeSelf) {
            return [ ...(!excludeSelf && selectorMatcher(vdom) ? [vdom] : []), 
                ...(vdom.children||[]).flatMap(ch=> doFind(ch,selectorMatcher))
            ]
        }
    }
}

function toVdomOrStr(val) {
    if (val &&  (typeof val.then == 'function' || typeof val.subscribe == 'function'))
        return jb.synchArray(val).then(v => jb.ui.toVdomOrStr(v[0]))

    const res1 = Array.isArray(val) ? val.map(v=>jb.val(v)): val
    let res = jb.val((Array.isArray(res1) && res1.length == 1) ? res1[0] : res1)
    if (res && res instanceof VNode || Array.isArray(res)) return res
    if (typeof res === 'boolean' || typeof res === 'object')
        res = '' + res
    else if (typeof res === 'string')
        res = res.slice(0,1000)
    return res
}

Object.assign(jb.ui, {VNode, toVdomOrStr});

(function(){
const ui = jb.ui;
const tryWrapper = (f,msg) => { try { return f() } catch(e) { jb.logException(e,msg,this.ctx) }}

function h(cmpOrTag,attributes,children) {
    if (cmpOrTag instanceof ui.VNode) return cmpOrTag // Vdom
    if (cmpOrTag && cmpOrTag.renderVdom)
        return cmpOrTag.renderVdom()
   
    return new jb.ui.VNode(cmpOrTag,attributes,children)
}

function compareVdom(b,a) {
    const attributes = jb.objectDiff(a.attributes || {}, b.attributes || {})
    if (attributes.style == undefined) delete attributes.style // do not delete style attributes defined by interactive
    const children = childDiff(b.children || [],a.children || [])
    return { 
        ...(Object.keys(attributes).length ? {attributes} : {}), 
        ...(children ? {children} : {}),
        ...(a.tag != b.tag ? { tag: a.tag} : {})
    }

    function childDiff(b,a) {
        if (b.length == 0 && a.length ==0) return
        if (a.length == 1 && b.length == 1 && a[0].tag == b[0].tag)
            return { 0: {...compareVdom(b[0],a[0]),__afterIndex: 0}, length: 1 }
        jb.log('childDiff',[...arguments])
        const beforeWithIndex = b.map((e,i)=> ({i, ...e}))
        let remainingBefore = beforeWithIndex.slice(0)
        // locating before-objects in after-array. done in two stages. also calcualing the remaining before objects that were not found
        const afterToBeforeMap = a.map(toLocate => locateVdom(toLocate,remainingBefore))
        a.forEach((toLocate,i) => afterToBeforeMap[i] = afterToBeforeMap[i] || sameIndexSameTag(toLocate,i,remainingBefore))

        const reused = []
        const res = { length: beforeWithIndex.length }
        beforeWithIndex.forEach( (e,i) => {
            const __afterIndex = afterToBeforeMap.indexOf(e);
            if (__afterIndex == -1) {
                res [i] =  {$: 'delete', __afterIndex }
            } else {
                reused[__afterIndex] = true
                res [i] = { __afterIndex, ...compareVdom(e, a[__afterIndex]), ...(e.$remount ? {remount: true}: {}) }
            }
        })
        res.toAppend = a.flatMap((e,i) => reused[i] ? [] : [{...compareVdom({},e), __afterIndex: i}])
        jb.log('childDiffRes',[res,...arguments])
        if (!res.length && !res.toAppend.length) return null
        return res

        function locateVdom(toLocate,remainingBefore) {
            const found = remainingBefore.findIndex(before=>sameSource(before,toLocate))
            if (found != -1)                
                return remainingBefore.splice(found,1)[0]
        }
        function sameIndexSameTag(toLocate,index,remainingBefore) {
            const found = remainingBefore.findIndex(before=>before.tag && before.i == index && before.tag === toLocate.tag)
            if (found != -1) {
                const ret = remainingBefore.splice(found,1)[0]
                if (ret.attributes.ctxId && !sameSource(ret,toLocate))
                    ret.$remount = true
                return ret
            }
        }
    }
}

function filterDelta(delta) {
    const doFilter = dlt => ({
        attributes: jb.objFromEntries(jb.entries(dlt.attributes)
            .filter(e=> ['jb-ctx','cmp-id','originators','__afterIndex','mount-ctx','interactive'].indexOf(e[0]) == -1)),
        children: dlt.children
    })
    return doFilter(delta)
}

function sameSource(vdomBefore,vdomAfter) {
    if (vdomBefore.cmp && vdomBefore.cmp === vdomAfter.cmp) return true
    const atts1 = vdomBefore.attributes || {}, atts2 = vdomAfter.attributes || {}
    if (atts1.cmpId && atts1.cmpId === atts2.cmpId || atts1.ctxId && atts1.ctxId === atts2.ctxId) return true
    if (compareCtxAtt('path',atts1,atts2) && compareCtxAtt('data',atts1,atts2)) return true
    if (compareAtts(['id','path','name'],atts1,atts2)) return true
}

function compareAtts(attsToCompare,atts1,atts2) {
    for(let i=0;i<attsToCompare.length;i++)
        if (atts1[attsToCompare[i]] && atts1[attsToCompare[i]] == atts2[attsToCompare[i]])
            return true
}

function compareCtxAtt(att,atts1,atts2) {
    const val1 = atts1.ctxId && jb.path(jb.ui.ctxDictionary[atts1.ctxId],att)
    const val2 = atts2.ctxId && jb.path(jb.ui.ctxDictionary[atts2.ctxId],att)
    return val1 && val2 && val1 == val2
}

// dom related functions

function applyVdomDiff(elem,vdomAfter,{strongRefresh, ctx} = {}) {
    jb.log('applyDeltaTop',['start',...arguments])
    const vdomBefore = elem instanceof ui.VNode ? elem : elemToVdom(elem)
    const delta = compareVdom(vdomBefore,vdomAfter)
    if (elem instanceof ui.VNode) { // runs on worker
        const cmpId = elem.getAttribute('cmp-id'), elemId = elem.getAttribute('id')
        if (elem != vdomAfter) { // update the elem
            Object.keys(elem).forEach(k=>delete elem[k])
            Object.assign(elem,vdomAfter)
        }
        return jb.ui.updateRenderer(delta,elemId,cmpId,ctx && ctx.vars.widgetId) // deligate to the main thread 
    }
    const active = jb.ui.activeElement() === elem
    jb.log('applyDeltaTop',['apply',vdomBefore,vdomAfter,delta,active,...arguments],
        {modifier: record => record.push(filterDelta(delta)) })
    if (delta.tag || strongRefresh) {
        unmount(elem)
        const newElem = render(vdomAfter,elem.parentElement)
        elem.parentElement.replaceChild(newElem,elem)
        jb.log('replaceTop',[newElem,elem,delta])
        elem = newElem
    } else {
        applyDeltaToDom(elem,delta)
    }
    ui.findIncludeSelf(elem,'[interactive]').forEach(el=> 
        el._component ? el._component.recalcPropsFromElem() : mountInteractive(el))
    if (active) jb.ui.focus(elem,'apply Vdom diff',ctx)
    ui.garbageCollectCtxDictionary(elem)
}

function elemToVdom(elem) {
    return {
        tag: elem.tagName.toLowerCase(),
        attributes: jb.objFromEntries([
            ...Array.from(elem.attributes).map(e=>[e.name,e.value]), 
            ...(jb.path(elem,'firstChild.nodeName') == '#text' ? [['$text',elem.firstChild.nodeValue]] : [])
        ]),
        ...( elem.childElementCount && !elem.getAttribute('jb_external') 
            ? { children: Array.from(elem.children).map(el=> elemToVdom(el)) } : {})
    }
}

function appendItems(elem, vdomToAppend,ctx) { // used in infinite scroll
    if (elem instanceof ui.VNode) { // runs on worker
        const cmpId = elem.getAttribute('cmp-id'), elemId = elem.getAttribute('id')
        // TODO: update the elem
        return jb.ui.updateRenderer(vdomToAppend,elemId,cmpId,ctx && ctx.vars.widgetId) // deligate to the main thread 
    }
    (vdomToAppend.children ||[]).forEach(vdom => render(vdom,elem))
}

function applyDeltaToDom(elem,delta) {
    jb.log('applyDelta',[...arguments])
    const children = delta.children
    if (delta.children) {
        const childrenArr = delta.children.length ? Array.from(Array(delta.children.length).keys()).map(i=>children[i]) : []
        const childElems = Array.from(elem.children), toAppend = delta.children.toAppend || []
        const sameOrder = childrenArr.reduce((acc,e,i) => acc && e.__afterIndex ==i, true) && !toAppend.length
            || !childrenArr.length && toAppend.reduce((acc,e,i) => acc && e.__afterIndex ==i, true)
        childrenArr.forEach((e,i) => {
            if (e.$ == 'delete') {
                unmount(childElems[i])
                elem.removeChild(childElems[i])
                jb.log('removeChild',[childElems[i],e,elem,delta])
            } else {
                applyDeltaToDom(childElems[i],e)
                !sameOrder && (childElems[i].setAttribute('__afterIndex',e.__afterIndex))
            }
        })
        toAppend.forEach(e=>{
            const newChild = elem.ownerDocument.createElement(e.tag)
            elem.appendChild(newChild)
            applyDeltaToDom(newChild,e)
            jb.log('appendChild',[newChild,e,elem,delta])
            !sameOrder && (newChild.setAttribute('__afterIndex',e.__afterIndex))
        })
        if (!sameOrder) {
            Array.from(elem.children)
                .sort((x,y) => Number(x.getAttribute('__afterIndex')) - Number(y.getAttribute('__afterIndex')))
                .forEach(el=> {
                    const index = Number(el.getAttribute('__afterIndex'))
                    if (elem.children[index] != el)
                        elem.insertBefore(el, elem.children[index])
                    el.removeAttribute('__afterIndex')
                })
            }
        // remove leftover text nodes in mixed
        if (elem.childElementCount)
            Array.from(elem.childNodes).filter(ch=>ch.nodeName == '#text')
                .forEach(ch=>{
                    elem.removeChild(ch)
                    jb.log('removeChild',['remove leftover',ch,elem,delta])
                })
    }
    jb.entries(delta.attributes)
        .filter(e=> !(e[0] === '$text' && elem.firstElementChild) ) // elem with $text should not have children
        .forEach(e=> setAtt(elem,e[0],e[1]))
}

function setAtt(elem,att,val) {
    if (att[0] !== '$' && val == null) {
        elem.removeAttribute(att)
        jb.log('htmlChange',['remove',...arguments])
    } else if (att === 'checked' && elem.tagName.toLowerCase() === 'input') {
        if (val === true)
            elem.checked = true
        jb.log('htmlChange',['checked',...arguments])
    } else if (att === '$text') {
        elem.innerText = val || ''
        jb.log('htmlChange',['text',...arguments])
    } else if (att === '$html') {
        elem.innerHTML = val || ''
        jb.log('htmlChange',['html',...arguments])
    } else if (att === 'style' && typeof val === 'object') {
        elem.setAttribute(att,jb.entries(val).map(e=>`${e[0]}:${e[1]}`).join(';'))
        jb.log('htmlChange',['setAtt',...arguments])
    } else if (att == 'value' && elem.tagName.match(/select|input|textarea/i) ) {
        const active = document.activeElement === elem
        if (elem.value == val) return
        elem.value = val
        if (active)
            elem.focus()
        jb.log('htmlChange',['setAtt',...arguments])
    } else {
        elem.setAttribute(att,val)
        jb.log('htmlChange',['setAtt',...arguments])
    }
}

function unmount(elem) {
    jb.log('unmount',[...arguments]);
    if (!elem || !elem.setAttribute) return
    jb.ui.findIncludeSelf(elem,'[interactive]').forEach(el=> el._component && el._component.destroy())
}

function render(vdom,parentElem) {
    jb.log('render',[...arguments])
    function doRender(vdom,parentElem) {
        jb.log('htmlChange',['createElement',...arguments])
        const elem = parentElem.ownerDocument.createElement(vdom.tag)
        jb.entries(vdom.attributes).forEach(e=>setAtt(elem,e[0],e[1])) // filter(e=>e[0].indexOf('on') != 0 && !isAttUndefined(e[0],vdom.attributes)).
        jb.asArray(vdom.children).map(child=> doRender(child,elem)).forEach(el=>elem.appendChild(el))
        parentElem.appendChild(elem)
        return elem
    }
    const res = doRender(vdom,parentElem)
    ui.findIncludeSelf(res,'[interactive]').forEach(el=> mountInteractive(el))
    ui.garbageCollectCtxDictionary(parentElem)
    return res
}

Object.assign(jb.ui, {
    h, render, unmount, applyVdomDiff, applyDeltaToDom, elemToVdom, mountInteractive, compareVdom, appendItems,
    handleCmpEvent(specificHandler, ev) {
        ev = typeof event != 'undefined' ? event : ev
        const el = jb.ui.parents(ev.currentTarget,{includeSelf: true}).find(el=> el.getAttribute && el.getAttribute('jb-ctx') != null)
        if (!el) return
        if (ev.type == 'scroll') // needs to be here to support the worker scenario
            ev.scrollPercentFromTop = ev.scrollPercentFromTop || (el.scrollTop + jb.ui.offset(el).height)/ el.scrollHeight;

        if (el.getAttribute('worker')) { // forward the event to the worker
            return jb.ui.workers[el.getAttribute('worker')].handleBrowserEvent(el,ev,specificHandler)
        }
        const cmp = el._component
        const action = specificHandler ? specificHandler : `on${ev.type}Handler`
        return (cmp && cmp[action]) ? cmp[action](ev) : ui.runActionOfElem(el,action,ev)
    },
    runActionOfElem(elem,action,ev) {
        if (elem.getAttribute('contenteditable')) return
        ev = typeof event != 'undefined' ? event : ev
        const ctxToRun = (elem.getAttribute('handlers') || '').split(',').filter(x=>x.indexOf(action+'-') == 0)
            .map(str=>jb.ui.ctxDictOfElem(elem)[str.split('-')[1]])
            .filter(x=>x)
            .map(ctx=> ctx.setVar('cmp',elem._component).setVars({ev}))[0]

        return ctxToRun && ctxToRun.runInner(ctxToRun.profile.action,'action','action')
    },
    ctrl(context,options) {
        const $state = context.vars.$refreshElemCall ? context.vars.$state : {}
        const ctx = context.setVars({ $model: { ctx: context, ...context.params} , $state, $refreshElemCall : undefined })
        const styleOptions = defaultStyle(ctx) || {}
        if (styleOptions instanceof ui.JbComponent)  {// style by control
            return styleOptions.orig(ctx).jbExtend(options,ctx).applyParamFeatures(ctx)
        }
        return new ui.JbComponent(ctx).jbExtend(options,ctx).jbExtend(styleOptions,ctx).applyParamFeatures(ctx)
    
        function defaultStyle(ctx) {
            const profile = context.profile
            const defaultVar = '$theme.' + (profile.$ || '')
            if (!profile.style && context.vars[defaultVar])
                return ctx.run({$:context.vars[defaultVar]})
            return context.params.style ? context.params.style(ctx) : {}
        }
    },
    garbageCollectCtxDictionary(elem,force) {
        if (!elem.ownerDocument.contains(elem)) return // tests

        const now = new Date().getTime()
        ui.ctxDictionaryLastCleanUp = ui.ctxDictionaryLastCleanUp || now
        const timeSinceLastCleanUp = now - ui.ctxDictionaryLastCleanUp
        if (!force && timeSinceLastCleanUp < 10000) return
        ui.ctxDictionaryLastCleanUp = now
    
        const used = 'jb-ctx,mount-ctx,pick-ctx,props-ctx,handlers,interactive,originators'.split(',')
            .flatMap(att=>Array.from(document.querySelectorAll(`[${att}]`))
                .flatMap(el => el.getAttribute(att).split(',').map(x=>Number(x.split('-').pop()))))
                    .sort((x,y)=>x-y);

        // remove unused ctx from dictionary
        const dict = Object.keys(jb.ctxDictionary).map(x=>Number(x)).sort((x,y)=>x-y);
        let lastUsedIndex = 0;
        const removedCtxs = [], removedResources = []
        for(let i=0;i<dict.length;i++) {
            while (used[lastUsedIndex] < dict[i])
                lastUsedIndex++;
            if (used[lastUsedIndex] != dict[i]) {
                removedCtxs.push(i)
                delete jb.ctxDictionary[''+dict[i]]
            }
        }
        // remove unused vars from resources
        const ctxToPath = ctx => Object.values(ctx.vars).filter(v=>jb.isWatchable(v)).map(v => jb.asRef(v))
            .map(ref=>jb.refHandler(ref).pathOfRef(ref)).flat()
        const globalVarsUsed = jb.unique(used.map(x=>jb.ctxDictionary[''+x]).filter(x=>x).map(ctx=>ctxToPath(ctx)).flat())
        Object.keys(jb.resources).filter(id=>id.indexOf(':') != -1)
            .filter(id=>globalVarsUsed.indexOf(id) == -1)
            .forEach(id => { removedResources.push(id); delete jb.resources[id]})

        jb.log('garbageCollect',[removedCtxs,removedResources])
    },

    refreshElem(elem, state, options) {
        if (jb.path(elem,'_component.status') == 'initializing') 
            return jb.logError('circular refresh',[...arguments]);
        jb.log('refreshElem',[...arguments]);
        const _ctx = ui.ctxOfElem(elem)
        if (!_ctx) 
            return jb.logError('refreshElem - no ctx for elem',elem)
        const strongRefresh = jb.path(options,'strongRefresh')
        let ctx = _ctx.setVar('$state', strongRefresh ? {} : state || {}) // strongRefresh kills state
        if (options && options.extendCtx)
            ctx = options.extendCtx(ctx)
        ctx = ctx.setVar('$refreshElemCall',true)
        const cmp = ctx.profile.$ == 'open-dialog' ? jb.ui.dialogs.buildComp(ctx) : ctx.runItself()
        const hash = cmp.init()
        if (hash != null && hash == elem.getAttribute('cmpHash'))
            return jb.log('refreshElem',['stopped by hash', hash, ...arguments]);
        cmp && applyVdomDiff(elem, h(cmp), {strongRefresh, ctx})
        jb.execInStudio({ $: 'animate.refresh-elem', elem: () => elem })
    },

    subscribeToRefChange: watchHandler => watchHandler.resourceChange.subscribe(e=> {
        const changed_path = watchHandler.removeLinksFromPath(watchHandler.pathOfRef(e.ref))
        if (!changed_path) debugger
        //observe="resources://2~name;person~name
        const elemsToCheck = jb.ui.find(e.srcCtx,'[observe]')
        const elemsToCheckCtx = elemsToCheck.map(el=>el.getAttribute('jb-ctx'))
        jb.log('notifyObservableElems',['elemsToCheck',elemsToCheck,e])
        elemsToCheck.forEach((elem,i) => {
            if (elemsToCheckCtx[i] != elem.getAttribute('jb-ctx')) return // the elem was changed by it parent 
            let refresh = false, strongRefresh = false
            elem.getAttribute('observe').split(',').map(obsStr=>observerFromStr(obsStr,elem)).filter(x=>x).forEach(obs=>{
                const path = jb.path(elem,'_component.ctx.componentContext.callerPath')
                //if (!obs.allowSelfRefresh && path && e.srcCtx && e.srcCtx.callStack().indexOf(path) != -1)  return
                const obsPath = watchHandler.removeLinksFromPath(watchHandler.pathOfRef(obs.ref))
                if (!obsPath)
                    return jb.logError('observer ref path is empty',obs,e)
                strongRefresh = strongRefresh || obs.strongRefresh
                const diff = ui.comparePaths(changed_path, obsPath)
                const isChildOfChange = diff == 1
                const includeChildrenYes = isChildOfChange && (obs.includeChildren === 'yes' || obs.includeChildren === true)
                const includeChildrenStructure = isChildOfChange && obs.includeChildren === 'structure' && (typeof e.oldVal == 'object' || typeof e.newVal == 'object')
                if (diff == -1 || diff == 0 || includeChildrenYes || includeChildrenStructure) {
                    jb.log('notifyObservableElem',['notify refresh',elem,e.srcCtx,obs,e])
                    //if (!checkCircularity({srcCtx: e.srcCtx, callerPath: elem._component.ctx.componentContext.callerPath, ...obs}))
                    refresh = true
                }
            })
            refresh && ui.refreshElem(elem,null,{srcCtx: e.srcCtx, strongRefresh})
        })

        function observerFromStr(obsStr) {
            const parts = obsStr.split('://')
            const innerParts = parts[1].split(';')
            const includeChildren = (innerParts[2].match(/includeChildren=([a-z]+)/) || ['',''])[1]
            const strongRefresh = innerParts[3] === 'strongRefresh'
            return parts[0] == watchHandler.resources.id && 
                { ref: watchHandler.refOfUrl(innerParts[0]), includeChildren, strongRefresh }
        }
    }),
    // databindObservable(cmp,settings) {
	//     return cmp.databindRefChanged.merge(jb.rx.Observable.of(cmp.state.databindRef)).flatMap(ref =>
	// 		(!cmp.watchRefOn && jb.isWatchable(ref) && ui.refObservable(ref,cmp,settings)
    //             .map(e=>Object.assign({ref},e)) ) || [])
    // },
})

ui.subscribeToRefChange(jb.mainWatchableHandler)

function checkCircularity(obs) {
    let ctxStack=[]; for(let innerCtx=obs.srcCtx; innerCtx; innerCtx = innerCtx.componentContext) ctxStack = ctxStack.concat(innerCtx)
    const callerPaths = ctxStack.filter(x=>x).map(ctx=>ctx.callerPath).filter(x=>x)
        .filter(x=>x.indexOf('jb-editor') == -1)
        .filter(x=>!x.match(/^studio-helper/))
    const callerPathsUniqe = jb.unique(callerPaths)
    if (callerPathsUniqe.length !== callerPaths.length) {
        jb.logError('circular watchRef',callerPaths)
        return true
    }

    if (!obs.allowSelfRefresh && obs.srcCtx && obs.callerPath) {
        const callerPathsToCompare = callerPaths.map(x=> x.replace(/~features~?[0-9]*$/,'').replace(/~style$/,''))
        const ctxStylePath = obs.callerPath.replace(/~features~?[0-9]*$/,'')
        return callerPathsToCompare.reduce((res,path) => res || path.indexOf(ctxStylePath) == 0, false)
    }
}

function mountInteractive(elem, keepState) {
    const ctx = jb.ui.ctxOfElem(elem,'mount-ctx')
    if (!ctx)
        return jb.logError('no ctx for elem',[elem])
    const cmp = (ctx.profile.$ == 'open-dialog') ? jb.ui.dialogs.buildComp(ctx) : ctx.runItself();
    const mountedCmp = {
        state: { ...(keepState && jb.path(elem._component,'state')) },
        base: elem,
        refresh(state, options) {
            jb.log('refreshReq',[...arguments])
            if (this._deleted) return
            Object.assign(this.state, state)
            ui.refreshElem(elem,{...this.state, ...state},options)
            ;(this.componentDidUpdateFuncs||[]).forEach(f=> tryWrapper(() => f(this), 'componentDidUpdate'))
        },
        destroy() {
            this._deleted = true
            this.resolveDestroyed() // notifications to takeUntil(this.destroyed) observers
            ;(cmp.destroyFuncs||[]).forEach(f=> tryWrapper(() => f(this), 'destroy'));
        },
        status: 'initializing',
        recalcPropsFromElem() {
            if (elem.getAttribute('worker')) return
            this.ctx = jb.ui.ctxOfElem(elem,'mount-ctx').setVar('cmp',this)
            this.cmpId = elem.getAttribute('cmp-id')
            ;(elem.getAttribute('interactive') || '').split(',').filter(x=>x).forEach(op => {
                [id, ctxId] = op.split('-')
                const ctx = jb.ui.ctxDictOfElem(elem)[ctxId]
                this[id] = jb.val(ctx.setVar('state',this.state).runInner(ctx.profile.value,'value','value'))
            })
            this.doRefresh && this.doRefresh()
        },
        componentDidUpdateFuncs: cmp.componentDidUpdateFuncs
    }
    mountedCmp.destroyed = new Promise(resolve=>mountedCmp.resolveDestroyed = resolve)
    elem._component = mountedCmp
    mountedCmp.recalcPropsFromElem()

    jb.unique(cmp.eventObservables)
        .forEach(op => mountedCmp[op] = jb.rx.Observable.fromEvent(elem, op.slice(2)).takeUntil( mountedCmp.destroyed ))

    ;(cmp.componentDidMountFuncs||[]).forEach(f=> tryWrapper(() => f(mountedCmp), 'componentDidMount'))
    mountedCmp.status = 'ready'
}

})();

(function(){
const ui = jb.ui
let cssId = 0, cmpId = 0;
ui.propCounter = 0
const cssSelectors_hash = ui.cssSelectors_hash = {};
const tryWrapper = (f,msg) => { try { return f() } catch(e) { jb.logException(e,msg,this.ctx) }}
const lifeCycle = new Set('init,componentDidMount,componentWillUpdate,componentDidUpdate,destroy,extendCtx,templateModifier,extendItem'.split(','))
const arrayProps = new Set('enrichField,dynamicCss,watchAndCalcModelProp,staticCssLines,defHandler,interactiveProp,calcProp'.split(','))
const singular = new Set('template,calcRenderProps,toolbar,styleCtx,calcHash,ctxForPick'.split(','))

class JbComponent {
    constructor(ctx) {
        this.ctx = ctx // used to calc features
        this.cmpId = cmpId++
        this.eventObservables = []
        this.staticCssLines = []
        this.contexts = []
        this.originators = [ctx]
    }
    init() {
        jb.log('initCmp',[this]);
        this.ctx = (this.extendCtxFuncs||[])
            .reduce((acc,extendCtx) => tryWrapper(() => extendCtx(acc,this),'extendCtx'), this.ctx.setVar('cmpId',this.cmpId))
        this.renderProps = {}
        this.state = this.ctx.vars.$state
        this.calcCtx = this.ctx.setVar('$props',this.renderProps).setVar('cmp',this)

        this.renderProps.cmpHash = this.calcHash && tryWrapper(() => this.calcHash(this.calcCtx))
        this.initialized = true
        return this.renderProps.cmpHash
    }
 
    renderVdom() {
        jb.log('renderVdom',[this]);
        if (!this.initialized)
            this.init();
        (this.initFuncs||[]).sort((p1,p2) => p1.phase - p2.phase)
            .forEach(f =>  tryWrapper(() => f.action(this.calcCtx), 'init'));
   
        this.toObserve = this.watchRef ? this.watchRef.map(obs=>({...obs,ref: obs.refF(this.ctx)})).filter(obs=>jb.isWatchable(obs.ref)) : []
        this.watchAndCalcModelProp && this.watchAndCalcModelProp.forEach(e=>{
            const ref = this.ctx.vars.$model[e.prop](this.ctx)
            if (jb.isWatchable(ref))
                this.toObserve.push({id: e.prop, cmp: this, ref,...e})
            const val = jb.val(ref)
            this.renderProps[e.prop] = e.transformValue(this.ctx.setData(val == null ? '' : val))
        })

        Object.assign(this.renderProps,(this.styleCtx || {}).params, this.state);
        
        const filteredPropsByPriority = (this.calcProp || []).filter(toFilter=> 
                this.calcProp.filter(p=>p.id == toFilter.id && p.priority > toFilter.priority).length == 0)
        filteredPropsByPriority.sort((p1,p2) => (p1.phase - p2.phase) || (p1.index - p2.index))
            .forEach(prop=> { 
                const value = jb.val( tryWrapper(() => prop.value(this.calcCtx),`renderProp:${prop.id}`))
                Object.assign(this.renderProps, { ...(prop.id == '$props' ? value : { [prop.id]: value })})
            })
        jb.log('renderProps',[this.renderProps, this])
        if (this.ctx.probe && this.ctx.probe.outOfTime) return
        this.template = this.template || (() => '')
        const initialVdom = tryWrapper(() => this.template(this,this.renderProps,ui.h), 'template') || {}
        const vdom = (this.templateModifierFuncs||[]).reduce((vd,modifier) =>
                (vd && typeof vd === 'object') ? tryWrapper(() => modifier(vd,this,this.renderProps,ui.h) || vd, 'templateModifier') 
                    : vd ,initialVdom)

        const observe = this.toObserve.map(x=>[x.ref.handler.urlOfRef(x.ref),
            x.includeChildren ? `includeChildren=${x.includeChildren}` : '',
            x.strongRefresh ? `strongRefresh` : ''
        ].join(';')).join(',')
        const handlers = (this.defHandler||[]).map(h=>`${h.id}-${ui.preserveCtx(h.ctx)}`).join(',')
        const interactive = (this.interactiveProp||[]).map(h=>`${h.id}-${ui.preserveCtx(h.ctx)}`).join(',')
        const originators = this.originators.map(ctx=>ui.preserveCtx(ctx)).join(',')

        const atts = jb.frame.workerId ? 
            { worker: jb.frame.workerId, 'cmp-id': this.cmpId, ...(handlers && {handlers}) } : 
            Object.assign(vdom.attributes || {}, {
                'jb-ctx': ui.preserveCtx(this.originatingCtx()),
                'cmp-id': this.cmpId, 
                'mount-ctx': ui.preserveCtx(this.ctx),
                // 'props-ctx': ui.preserveCtx(this.calcCtx),
            },
            observe && {observe}, 
            handlers && {handlers}, 
            originators && {originators},
            this.ctxForPick && { 'pick-ctx': ui.preserveCtx(this.ctxForPick) },
            (this.componentDidMountFuncs || interactive) && {interactive}, 
            this.renderProps.cmpHash != null && {cmpHash: this.renderProps.cmpHash}
        )        
        if (vdom instanceof jb.ui.VNode) {
            vdom.addClass(this.jbCssClass())
            vdom.attributes = Object.assign(vdom.attributes || {}, {
                    'jb-ctx': ui.preserveCtx(this.originatingCtx()),
                    'cmp-id': this.cmpId, 
                    'mount-ctx': ui.preserveCtx(this.ctx),
                    // 'props-ctx': ui.preserveCtx(this.calcCtx),
                },
                observe && {observe}, 
                handlers && {handlers}, 
                originators && {originators},
                this.ctxForPick && { 'pick-ctx': ui.preserveCtx(this.ctxForPick) },
                jb.frame.workerId && { 'worker': jb.frame.workerId },
                (this.componentDidMountFuncs || interactive) && {interactive}, 
                this.renderProps.cmpHash != null && {cmpHash: this.renderProps.cmpHash}
            )
        }
        fixHandlers(vdom)
        jb.log('renRes',[this.ctx, vdom, this]);
        return vdom

        function fixHandlers(vdom) {
            jb.entries(vdom.attributes).forEach(([att,val]) => att.indexOf('on') == 0 && (''+val).indexOf('jb.ui') != 0 &&
                (vdom.attributes[att] = `jb.ui.handleCmpEvent(${typeof val == 'string' && val ? "'" + val + "'" : '' })`))
            ;(vdom.children || []).forEach(vd => fixHandlers(vd))
        }
    }

    jbCssClass() {
        if (this.cachedClass)
            return this.cachedClass
        const ctx = this.ctx
        const cssLines = (this.staticCssLines || []).concat((this.dynamicCss || [])
            .map(dynCss=>dynCss(this.calcCtx))).filter(x=>x)
        const cssKey = cssLines.join('\n')
        const classPrefix = jb.frame.isWorker ? 'w'+frame.workerId : 'jb-'
        if (!cssKey) return ''
        if (!cssSelectors_hash[cssKey]) {
            cssId++;
            cssSelectors_hash[cssKey] = cssId;
            const cssStyle = cssLines.map(selectorPlusExp=>{
                const selector = selectorPlusExp.split('{')[0];
                const fixed_selector = selector.split(',').map(x=>x.trim().replace('|>',' '))
                    .map(x=>x.indexOf('~') == -1 ? `.${classPrefix}${cssId}${x}` : x.replace('~',`.${classPrefix}${cssId}`));
                return fixed_selector + ' { ' + selectorPlusExp.split('{')[1];
            }).join('\n');
            const remark = `/*style: ${ctx.profile.style && ctx.profile.style.$}, path: ${ctx.path}*/\n`;
            ui.addStyleElem(remark + cssStyle)
        }
        const jbClass = `${classPrefix}${cssSelectors_hash[cssKey]}`
        if (!this.dynamicCss)
            this.cachedClass = jbClass
        return jbClass
    }
    originatingCtx() {
        return this.originators[this.originators.length-1]
    }

    field() {
        if (this._field) return this._field
        const ctx = this.originatingCtx()
        this._field = {
            class: '',
            ctxId: ui.preserveCtx(ctx),
            control: (item,index,noCache) => this.getOrCreateItemField(item, () => ctx.setData(item).setVars({index: (index||0)+1}).runItself(),noCache),
        }
        this.enrichField && this.enrichField.forEach(enrichField=>enrichField(this._field))
        let title = jb.tosingle(jb.val(ctx.params.title)) || (() => '');
        if (this._field.title !== undefined)
            title = this._field.title
        // make it always a function 
        this._field.title = typeof title == 'function' ? title : () => ''+title;
        this.itemfieldCache = new Map()
        return this._field
    }
    getOrCreateItemField(item,factory,noCache) {
        if (noCache)
            return factory()
        if (!this.itemfieldCache.get(item))
            this.itemfieldCache.set(item,factory())
        return this.itemfieldCache.get(item)
    }
    orig(ctx) {
        if (jb.comps[ctx.profile && ctx.profile.$].type.split(/,|-/).indexOf('control') == -1)
            debugger
        this.originators.push(ctx)
        return this
    }
    applyParamFeatures(ctx) {
        (ctx.params.features && ctx.params.features(ctx) || []).forEach(f => this.jbExtend(f,ctx))
        return this;
    }

    jbExtend(_options,ctx) {
        if (!_options) return this;
        if (!ctx) debugger
        ctx = ctx || this.ctx;
        if (!ctx)
            console.log('no ctx provided for jbExtend');
        if (typeof _options != 'object')
            debugger;
        const options = _options.$ ? ctx.run(_options) : _options
        if (Array.isArray(options)) {
            options.forEach(o=>this.jbExtend(o,ctx))
            return this
        }

        if (options.afterViewInit) 
            options.componentDidMount = options.afterViewInit
        if (typeof options.class == 'string') 
            options.templateModifier = vdom => vdom.addClass(options.class)

        Object.keys(options).forEach(key=>{
            if (lifeCycle.has(key)) {
                this[key+'Funcs'] = this[key+'Funcs'] || []
                this[key+'Funcs'].push(options[key])
            }
            if (arrayProps.has(key)) {
                this[key] = this[key] || []
                this[key].push(options[key])
            }
            if (singular.has(key))
                this[key] = this[key] || options[key]
        })
        if (options.watchRef) {
            this.watchRef = this.watchRef || []
            this.watchRef.push(Object.assign({cmp: this},options.watchRef));
        }

        // eventObservables
        this.eventObservables = this.eventObservables.concat(Object.keys(options).filter(op=>op.indexOf('on') == 0))

        if (options.css)
            this.staticCssLines = (this.staticCssLines || []).concat(options.css.split(/}\s*/m)
                .map(x=>x.trim()).filter(x=>x)
                .map(x=>x+'}')
                .map(x=>x.replace(/^!/,' ')));

        jb.asArray(options.featuresOptions || []).forEach(f => this.jbExtend(f.$ ? ctx.run(f) : f , ctx))
        jb.asArray(ui.inStudio() && options.studioFeatures).forEach(f => this.jbExtend(ctx.run(f), ctx))
        return this;
    }
}

ui.JbComponent = JbComponent

jb.jstypes.renderable = value => {
    if (value == null) return '';
    if (value instanceof ui.VNode) return value;
    if (value instanceof JbComponent) return ui.h(value)
    if (Array.isArray(value))
        return ui.h('div',{},value.map(item=>jb.jstypes.renderable(item)));
    return '' + jb.val(value,true);
}

})();

(function(){
const ui = jb.ui;

// ****************** jbart ui utils ***************
Object.assign(jb.ui,{
    focus(elem,logTxt,srcCtx) {
        if (!elem) debugger;
        // block the preview from stealing the studio focus
        const now = new Date().getTime();
        const lastStudioActivity = jb.studio.lastStudioActivity || jb.path(jb,['studio','studioWindow','jb','studio','lastStudioActivity']);
        jb.log('focus',['request',srcCtx, logTxt, now - lastStudioActivity, elem,srcCtx]);
          if (jb.studio.previewjb == jb && lastStudioActivity && now - lastStudioActivity < 1000)
            return;
          jb.delay(1).then(_=> {
               jb.log('focus',['apply',srcCtx,logTxt,elem,srcCtx]);
            elem.focus()
          })
    },
    wrapWithLauchingElement: (f,ctx,elem,options={}) => ctx2 => {
        if (!elem) debugger;
        return f(ctx.extendVars(ctx2).setVars({ $launchingElement: { el : elem, ...options }}));
    },
    withUnits: v => (v === '' || v === undefined) ? '' : (''+v||'').match(/[^0-9]$/) ? v : `${v}px`,
    propWithUnits: (prop,v) => (v === '' || v === undefined) ? '' : `${prop}: ` + ((''+v||'').match(/[^0-9]$/) ? v : `${v}px`) + ';',
    fixCssLine: css => css.indexOf('/n') == -1 && ! css.match(/}\s*/) ? `{ ${css} }` : css,
    ctxDictOfElem: elem => (!jb.frame.isWorker && elem.getAttribute('worker') ? jb.ui.workers[elem.getAttribute('worker')] : jb).ctxDictionary,
    ctxOfElem: (elem,att) => elem && elem.getAttribute && jb.ui.ctxDictOfElem(elem)[elem.getAttribute(att || 'jb-ctx')],
    preserveCtx(ctx) {
        jb.ctxDictionary[ctx.id] = ctx
        return ctx.id
    },
    inStudio() { return jb.studio && jb.studio.studioWindow },
    inPreview() {
        try {
            return !ui.inStudio() && jb.frame.parent.jb.studio.initPreview
        } catch(e) {}
    },
    parentCmps(el) {
        if (!el) return []
        const parents = jb.ui.parents(el)
        const dialogElem = parents[parents.length-5]
        return (jb.ui.hasClass(dialogElem,'jb-dialog')
                ? parents.slice(0,-4).concat(jb.ui.ctxOfElem(dialogElem).exp('%$$launchingElement.el._component.base%') || [])
                : parents)
            .map(el=>el._component).filter(x=>x)
    },
    closestCmp(el) {
        return el._component || this.parentCmps(el)[0]
    },
    document(ctx) {
        if (jb.frame.isWorker)
            return jb.ui.widgets[ctx.vars.widgetId].top
        return ctx.vars.elemToTest || typeof document !== 'undefined' && document
    },
    item(cmp,vdom,data) {
        cmp.extendItemFuncs && cmp.extendItemFuncs.forEach(f=>f(cmp,vdom,data));
        return vdom;
    },
})

// ****************** html utils ***************
Object.assign(jb.ui, {
    outerWidth(el) {
        const style = getComputedStyle(el);
        return el.offsetWidth + parseInt(style.marginLeft) + parseInt(style.marginRight);
    },
    outerHeight(el) {
        const style = getComputedStyle(el);
        return el.offsetHeight + parseInt(style.marginTop) + parseInt(style.marginBottom);
    },
    offset(el) { return el.getBoundingClientRect() },
    parents(el,{includeSelf} = {}) {
        const res = [] 
        el = includeSelf ? el : el && el.parentNode;
        while(el) {
          res.push(el);
          el = el.parentNode;
        }
        return res
    },
    closest(el,query) {
        while(el) {
          if (ui.matches(el,query)) return el;
          el = el.parentNode;
        }
    },
    activeElement() { return document.activeElement },
    find(el,selector,options) {
        if (el instanceof jb.jbCtx)
            el = this.document(el) // el is ctx
        return el instanceof jb.ui.VNode ? el.querySelectorAll(selector,options) :
            [... (options && options.includeSelf && ui.matches(el,selector) ? [el] : []),
             ...Array.from(el.querySelectorAll(selector))]
    },
    findIncludeSelf: (el,selector) => jb.ui.find(el,selector,{includeSelf: true}),
    addClass: (el,clz) => el.classList.add(clz),
    removeClass: (el,clz) => el.classList.remove(clz),
    hasClass: (el,clz) => el && el.classList.contains(clz),
    matches: (el,query) => el && el.matches && el.matches(query),
    index: el => Array.from(el.parentNode.children).indexOf(el),
    limitStringLength(str,maxLength) {
        if (typeof str == 'string' && str.length > maxLength-3)
          return str.substring(0,maxLength) + '...';
        return str;
    },
    addHTML(el,html) {
        const elem = document.createElement('div');
        elem.innerHTML = html;
        el.appendChild(elem.firstChild)
    },
    addStyleElem(innerHtml) {
        const style_elem = document.createElement('style');
        style_elem.innerHTML = innerHtml;
        document.head.appendChild(style_elem);
    }
})

ui.renderWidget = function(profile,top) {
	let blockedParentWin = false // catch security execption from the browser if parent is not accessible
	try {
		const x = typeof window != 'undefined' && window.parent.jb
	} catch (e) {
		blockedParentWin = true
	}
	try {
		if (!blockedParentWin && typeof window != 'undefined' && window.parent != window && window.parent.jb)
			window.parent.jb.studio.initPreview(window,[Object.getPrototypeOf({}),Object.getPrototypeOf([])]);
	} catch(e) {
		return jb.logException(e)
    }

    let currentProfile = profile
    let lastRenderTime = 0, fixedDebounce = 500
    const debounceTime = () => Math.min(2000,lastRenderTime*3 + fixedDebounce)

    if (jb.studio.studioWindow) {
        const studioWin = jb.studio.studioWindow
        const st = studioWin.jb.studio;
        const project = studioWin.jb.resources.studio.project
        const page = studioWin.jb.resources.studio.page
        if (project && page)
            currentProfile = {$: `${project}.${page}`}

        st.pageChange.filter(({page})=>page != currentProfile.$).subscribe(({page})=> doRender(page))
        st.scriptChange.filter(e=>(jb.path(e,'path.0') || '').indexOf('data-resource.') != 0) // do not update on data change
            .debounce(() => jb.delay(debounceTime()))
            .subscribe(() =>{
                doRender()
                jb.ui.dialogs.reRenderAll()
            });
    }
    const elem = top.ownerDocument.createElement('div')
    top.appendChild(elem)

    doRender()

	function doRender(page) {
        if (page) currentProfile = {$: page}
        const cmp = new jb.jbCtx().run(currentProfile)
        const start = new Date().getTime()
        jb.ui.unmount(top)
        top.innerHTML = ''
        jb.ui.render(ui.h(cmp),top)
        lastRenderTime = new Date().getTime() - start
    }
}

jb.objectDiff = function(newObj, orig) {
    if (orig === newObj) return {}
    if (!jb.isObject(orig) || !jb.isObject(newObj)) return newObj
    const deletedValues = Object.keys(orig).reduce((acc, key) =>
        newObj.hasOwnProperty(key) ? acc : { ...acc, [key]: jb.frame.isWorker ? '__undefined' : undefined}
    , {})

    return Object.keys(newObj).reduce((acc, key) => {
      if (!orig.hasOwnProperty(key)) return { ...acc, [key]: newObj[key] } // return added r key
      const difference = jb.objectDiff(newObj[key], orig[key])
      if (jb.isObject(difference) && jb.isEmpty(difference)) return acc // return no diff
      return { ...acc, [key]: difference } // return updated key
    }, deletedValues)
}

// ****************** components ****************

jb.component('custom-style', { /* customStyle */
  typePattern: t => /\.style$/.test(t),
  category: 'advanced:10,all:10',
  params: [
    {id: 'template', as: 'single', mandatory: true, dynamic: true, ignore: true},
    {id: 'css', as: 'string'},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: (context,css,features) => ({
          template: context.profile.template,
          css: css,
          featuresOptions: features(),
          styleCtx: context._parent
    })
})

jb.component('style-by-control', { /* styleByControl */
  typePattern: t => /\.style$/.test(t),
  category: 'advanced:10,all:20',
  params: [
    {id: 'control', type: 'control', mandatory: true, dynamic: true},
    {id: 'modelVar', as: 'string', mandatory: true}
  ],
  impl: (ctx,control,modelVar) => control(ctx.setVar(modelVar,ctx.vars.$model))
})

jb.component('style-with-features', { /* styleWithFeatures */
  typePattern: t => /\.style$/.test(t),
  description: 'customize, add more features to style',
  category: 'advanced:10,all:20',
  params: [
    {id: 'style', type: '$asParent', mandatory: true, composite: true},
    {id: 'features', type: 'feature[]', templateValue: [], dynamic: true, mandatory: true}
  ],
  impl: (ctx,style,features) => style && {...style,featuresOptions: (style.featuresOptions || []).concat(features())}
})

jb.component('control-with-features', { /* controlWithFeatures */
  type: 'control',
  description: 'customize, add more features to control',
  category: 'advanced:10,all:20',
  params: [
    {id: 'control', type: 'control', mandatory: true},
    {id: 'features', type: 'feature[]', templateValue: [], mandatory: true}
  ],
  impl: (ctx,control,features) => control.jbExtend(features,ctx).orig(ctx)
})

})()
;

jb.component('def-handler', { /* defHandler */
  type: 'feature',
  description: 'define custom event handler',
  params: [
    {id: 'id', as: 'string', mandatory: true, description: 'to be used in html, e.g. onclick=\"clicked\" '},
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true}
  ],
  impl: (ctx,id) => ({defHandler: {id, ctx}})
})

jb.component('watch-and-calc-model-prop', { /* watchAndCalcModelProp */
  type: 'feature',
  description: 'Use a model property in the rendering and watch its changes (refresh on change)',
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'transformValue', dynamic: true, defaultValue: '%%'}
  ],
  impl: (ctx,prop,transformValue) => ({watchAndCalcModelProp: { prop, transformValue }})
})

jb.component('calc-prop', { /* calcProp */
  type: 'feature',
  description: 'define a variable to be used in the rendering calculation process',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'value', mandatory: true, dynamic: true},
    {id: 'priority', as: 'number', defaultValue: 1, description: 'if same prop was defined elsewhere who will win. range 1-1000'},
    {id: 'phase', as: 'number', defaultValue: 10, description: 'props from different features can use each other, phase defines the calculation order'}
  ],
  impl: ctx => ({calcProp: {... ctx.params, index: jb.ui.propCounter++}})
})

jb.component('interactive-prop', { /* interactiveProp */
  type: 'feature',
  description: 'define a variable for the interactive comp',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'value', mandatory: true, dynamic: true}
  ],
  impl: (ctx,id) => ({interactiveProp: {id, ctx }})
})

jb.component('calc-props', { /* calcProps */
  type: 'feature',
  description: 'define variables to be used in the rendering calculation process',
  params: [
    {id: 'props', as: 'object', mandatory: true, description: 'props as object', dynamic: true},
    {id: 'phase', as: 'number', defaultValue: 10, description: 'props from different features can use each other, phase defines the calculation order'}
  ],
  impl: (ctx,propsF,phase) => ({
      calcProp: {id: '$props', value: ctx => propsF(ctx), phase, index: jb.ui.propCounter++ }
    })
})

jb.component('feature.init', { /* feature.init */
  type: 'feature',
  category: 'lifecycle',
  params: [
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true},
    {id: 'phase', as: 'number', defaultValue: 10, description: 'init funcs from different features can use each other, phase defines the calculation order'}
  ],
  impl: (ctx,action,phase) => ({ init: { action, phase }})
})

jb.component('feature.beforeInit', { 
  type: 'feature',
  category: 'lifecycle',
  params: [
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true},
  ],
  impl: feature.init('%$action%',5)
})

jb.component('feature.after-load', { /* feature.afterLoad */
  type: 'feature',
  description: 'init, onload, defines the interactive part of the component',
  category: 'lifecycle',
  params: [
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true}
  ],
  impl: ctx => ({ afterViewInit: cmp => ctx.params.action(cmp.ctx) })
})
jb.component('interactive', jb.comps['feature.after-load'])

jb.component('template-modifier', { /* templateModifier */
  type: 'feature',
  description: 'change the html template',
  params: [
    {id: 'value', mandatory: true, dynamic: true}
  ],
  impl: (ctx,value) => ({ templateModifier: (vdom,cmp) => value(ctx.setVars({cmp,vdom, ...cmp.renderProps})) })
})

jb.component('features', { /* features */
  type: 'feature',
  description: 'list of features, auto flattens',
  params: [
    {id: 'features', type: 'feature[]', as: 'array', composite: true}
  ],
  impl: (ctx,features) => features.flatMap(x=>Array.isArray(x) ? x: [x])
})

jb.component('watch-ref', { /* watchRef */
  type: 'feature',
  category: 'watch:100',
  description: 'subscribes to data changes to refresh component',
  params: [
    {id: 'ref', mandatory: true, as: 'ref', dynamic: true, description: 'reference to data'},
    {id: 'includeChildren', as: 'string', options: 'yes,no,structure', defaultValue: 'no', description: 'watch childern change as well'},
    {id: 'allowSelfRefresh', as: 'boolean', description: 'allow refresh originated from the components or its children', type: 'boolean'},
    {id: 'strongRefresh', as: 'boolean', description: 'rebuild the component and reinit wait for data', type: 'boolean'}
  ],
  impl: ctx => ({ watchRef: {refF: ctx.params.ref, ...ctx.params}})
})

jb.component('watch-observable', { /* watchObservable */
  type: 'feature',
  category: 'watch',
  description: 'subscribes to a custom rx.observable to refresh component',
  params: [
    {id: 'toWatch', mandatory: true}
  ],
  impl: interactive(
    (ctx,{cmp},{toWatch}) =>
    toWatch.takeUntil(cmp.destroyed).subscribe(()=>cmp.refresh(null,{srcCtx:ctx.componentContext}))
  )
})

jb.component('group.data', { /* group.data */
  type: 'feature',
  category: 'general:100,watch:80',
  params: [
    {id: 'data', mandatory: true, dynamic: true, as: 'ref'},
    {id: 'itemVariable', as: 'string', description: 'optional. define data as a local variable'},
    {id: 'watch', as: 'boolean', type: 'boolean'},
    {id: 'includeChildren', as: 'string', options: 'yes,no,structure', defaultValue: 'no', description: 'watch childern change as well'}
  ],
  impl: (ctx, refF, itemVariable,watch,includeChildren) => ({
      ...(watch ? {watchRef: { refF, includeChildren }} : {}),
      extendCtx: ctx => {
          const ref = refF()
          return ctx.setData(ref).setVar(itemVariable,ref)
      },
  })
})

jb.component('html-attribute', { /* htmlAttribute */
  type: 'feature',
  description: 'set attribute to html element and give it value',
  params: [
    {id: 'attribute', mandatory: true, as: 'string'},
    {id: 'value', mandatory: true, as: 'string', dynamic: true}
  ],
  impl: (ctx,attribute,value) => ({
    templateModifier: (vdom,cmp) => {
        vdom.attributes = vdom.attributes || {};
        vdom.attributes[attribute] = value(cmp.ctx)
        return vdom;
      }
  })
})

jb.component('id', { /* id */
  type: 'feature',
  description: 'adds id to html element',
  params: [
    {id: 'id', mandatory: true, as: 'string', dynamic: true}
  ],
  impl: htmlAttribute(
    'id',
    (ctx,{},{id}) => id(ctx)
  )
})

jb.component('feature.hover-title', { /* feature.hoverTitle */
  type: 'feature',
  description: 'set element title, usually shown by browser on hover',
  params: [
    {id: 'title', as: 'string', mandatory: true}
  ],
  impl: htmlAttribute(
    'title',
    '%$title%'
  )
})

jb.component('variable', { /* variable */
  type: 'feature',
  category: 'general:90',
  description: 'define a variable. watchable or passive, local or global',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'value', dynamic: true, defaultValue: '', mandatory: true},
    {id: 'watchable', as: 'boolean', type: 'boolean', description: 'E.g., selected item variable'}
  ],
  impl: ({}, name, value, watchable) => ({
    destroy: cmp => {
      const fullName = name + ':' + cmp.cmpId;
      cmp.ctx.run(writeValue(`%$${fullName}%`,null))
    },
    extendCtx: (ctx,cmp) => {
      if (!watchable)
        return ctx.setVar(name,jb.val(value(ctx)))

      const fullName = name + ':' + cmp.cmpId;
      if (fullName == 'items') debugger
      jb.log('var',['new-watchable',ctx,fullName])
      const refToResource = jb.mainWatchableHandler.refOfPath([fullName]);
      jb.writeValue(refToResource,value(ctx),ctx)
      return ctx.setVar(name, refToResource);
    }
  })
})

jb.component('calculated-var', { /* calculatedVar */
  type: 'feature',
  category: 'general:60',
  description: 'defines a local variable that watches other variables with auto recalc',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'value', dynamic: true, defaultValue: '', mandatory: true},
    {id: 'watchRefs', as: 'array', dynamic: true, mandatory: true, defaultValue: [], description: 'variable to watch. needs to be in array'}
  ],
  impl: (ctx, name, value, watchRefs) => ({
      destroy: cmp => {
        const fullName = name + ':' + cmp.cmpId;
        cmp.ctx.run(writeValue(`%$${fullName}%`,null))
      },
      extendCtx: (_ctx,cmp) => {
        const fullName = name + ':' + cmp.cmpId;
        jb.log('calculated var',['new-resource',ctx,fullName])
        jb.resource(fullName, jb.val(value(_ctx)));
        const ref = _ctx.exp(`%$${fullName}%`,'ref')
        return _ctx.setVar(name, ref);
      },
      afterViewInit: cmp => {
        const fullName = name + ':' + cmp.cmpId;
        const refToResource = cmp.ctx.exp(`%$${fullName}%`,'ref');
        (watchRefs(cmp.ctx)||[]).map(x=>jb.asRef(x)).filter(x=>x).forEach(ref=>
          jb.ui.refObservable(ref,cmp,{srcCtx: ctx}).subscribe(e=>
            jb.writeValue(refToResource,value(cmp.ctx),ctx))
        )
      }
  })
})

jb.component('feature.if', { /* feature.if */
  type: 'feature',
  category: 'feature:85',
  description: 'adds/remove element to dom by condition. keywords: hidden/show',
  params: [
    {id: 'showCondition', as: 'boolean', mandatory: true, dynamic: true, type: 'boolean'}
  ],
  impl: (ctx, condition) => ({
    templateModifier: (vdom,cmp) =>
      jb.toboolean(condition(cmp.ctx)) ? vdom : jb.ui.h('span',{style: {display: 'none'}})
  })
})

jb.component('hidden', { /* hidden */
  type: 'feature',
  category: 'feature:85',
  description: 'display:none on element. keywords: show',
  params: [
    {id: 'showCondition', type: 'boolean', mandatory: true, dynamic: true}
  ],
  impl: (ctx,showCondition) => ({
    templateModifier: (vdom,cmp) => {
      if (!jb.toboolean(showCondition(cmp.ctx)))
        jb.path(vdom,['attributes','style','display'],'none')
      return vdom
    }
  })
})

jb.component('conditional-class', { /* conditionalClass */
  type: 'feature',
  description: 'toggle class by condition',
  params: [
    {id: 'cssClass', as: 'string', mandatory: true, dynamic: true},
    {id: 'condition', type: 'boolean', mandatory: true, dynamic: true}
  ],
  impl: (ctx,cssClass,cond) => ({
    templateModifier: (vdom,cmp) => {
      if (jb.toboolean(cond(cmp.ctx)))
        vdom.addClass(cssClass())
      return vdom
    }
  })
})

jb.component('feature.keyboard-shortcut', { /* feature.keyboardShortcut */
  type: 'feature',
  category: 'events',
  description: 'listen to events at the document level even when the component is not active',
  params: [
    {id: 'key', as: 'string', description: 'e.g. Alt+C'},
    {id: 'action', type: 'action', dynamic: true}
  ],
  impl: (ctx,key,action) => ({
      afterViewInit: cmp =>
        jb.rx.Observable.fromEvent(cmp.base.ownerDocument, 'keydown')
            .takeUntil( cmp.destroyed )
            .subscribe(event=>{
              const keyStr = key.split('+').slice(1).join('+');
              const keyCode = keyStr.charCodeAt(0);
              if (key == 'Delete') keyCode = 46;

              const helper = (key.match('([A-Za-z]*)+') || ['',''])[1];
              if (helper == 'Ctrl' && !event.ctrlKey) return
              if (helper == 'Alt' && !event.altKey) return
              if (event.keyCode == keyCode || (event.key && event.key == keyStr))
                action();
            })
      })
})

jb.component('feature.onEvent', { /* feature.onEvent */
  type: 'feature',
  category: 'events',
  params: [
    {id: 'event', as: 'string', mandatory: true, options: 'load,blur,change,focus,keydown,keypress,keyup,click,dblclick,mousedown,mousemove,mouseup,mouseout,mouseover,scroll'},
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true},
    {id: 'debounceTime', as: 'number', defaultValue: 0, description: 'used for mouse events such as mousemove'}
  ],
  impl: (ctx,event,action,debounceTime) => ({
      [`on${event}`]: true,
      afterViewInit: cmp => {
        if (event == 'load') {
          jb.delay(1).then(() => jb.ui.wrapWithLauchingElement(action, cmp.ctx, cmp.base)())
        } else {
          (debounceTime ? cmp[`on${event}`].debounceTime(debounceTime) : cmp[`on${event}`])
            .subscribe(event=>
                  jb.ui.wrapWithLauchingElement(action, cmp.ctx.setVars({event}), cmp.base)())
        }
      }
  })
})

jb.component('feature.onHover', { /* feature.onHover */
  type: 'feature',
  description: 'on mouse enter',
  category: 'events',
  params: [
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true},
    {id: 'onLeave', type: 'action[]', mandatory: true, dynamic: true},
    {id: 'debounceTime', as: 'number', defaultValue: 0}
  ],
  impl: (ctx,action,onLeave,debounceTime) => ({
      onmouseenter: true, onmouseleave: true,
      afterViewInit: cmp => {
        cmp.onmouseenter.debounceTime(debounceTime).subscribe(()=>
              jb.ui.wrapWithLauchingElement(action, cmp.ctx, cmp.base)())
        cmp.onmouseleave.debounceTime(debounceTime).subscribe(()=>
              jb.ui.wrapWithLauchingElement(onLeave, cmp.ctx, cmp.base)())
      }
  })
})

jb.component('feature.class-on-hover', { /* feature.classOnHover */
  type: 'feature',
  description: 'set css class on mouse enter',
  category: 'events',
  params: [
    {id: 'class', type: 'string', defaultValue: 'item-hover', description: 'css class to add/remove on hover'}
  ],
  impl: (ctx,clz) => ({
    onmouseenter: true, onmouseleave: true,
    afterViewInit: cmp => {
      cmp.onmouseenter.subscribe(()=> jb.ui.addClass(cmp.base,clz))
      cmp.onmouseleave.subscribe(()=> jb.ui.removeClass(cmp.base,clz))
    }
  })
})

jb.ui.checkKey = function(e, key) {
	if (!key) return;
  const dict = { tab: 9, delete: 46, tab: 9, esc: 27, enter: 13, right: 39, left: 37, up: 38, down: 40}

  key = key.replace(/-/,'+');
  const keyWithoutPrefix = key.split('+').pop()
  let keyCode = dict[keyWithoutPrefix.toLowerCase()]
  if (+keyWithoutPrefix)
    keyCode = +keyWithoutPrefix
  if (keyWithoutPrefix.length == 1)
    keyCode = keyWithoutPrefix.charCodeAt(0);

	if (key.match(/^[Cc]trl/) && !e.ctrlKey) return;
	if (key.match(/^[Aa]lt/) && !e.altKey) return;
	return e.keyCode == keyCode
}

jb.component('feature.onKey', { /* feature.onKey */
  type: 'feature',
  category: 'events',
  macroByValue: true,
  params: [
    {id: 'key', as: 'string', description: 'E.g., a,27,Enter,Esc,Ctrl+C or Alt+V'},
    {id: 'action', type: 'action', mandatory: true, dynamic: true},
    {id: 'doNotWrapWithLauchingElement', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,key,action) => ({
      onkeydown: true,
      afterViewInit: cmp => cmp.onkeydown.subscribe(e=> {
          if (!jb.ui.checkKey(e,key)) return
          ctx.params.doNotWrapWithLauchingElement ? action(cmp.ctx) :
            jb.ui.wrapWithLauchingElement(action, cmp.ctx, cmp.base)()
      })
  })
})

jb.component('feature.onEnter', { /* feature.onEnter */
  type: 'feature',
  category: 'events',
  params: [
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true}
  ],
  impl: feature.onKey(
    'Enter',
    call('action')
  )
})

jb.component('feature.onEsc', { /* feature.onEsc */
  type: 'feature',
  category: 'events',
  params: [
    {id: 'action', type: 'action[]', mandatory: true, dynamic: true}
  ],
  impl: feature.onKey(
    'Esc',
    call('action')
  )
})

jb.component('refresh-control-by-id', { /* refreshControlById */
  type: 'action',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'strongRefresh', as: 'boolean', description: 'rebuild the component and promises', type: 'boolean'}
  ],
  impl: (ctx,id) => {
    const elem = jb.ui.document(ctx).querySelector('#'+id)
    if (!elem)
      return jb.logError('refresh-control-by-id can not find elem for #'+id, ctx)
    jb.ui.refreshElem(elem,null,{srcCtx: ctx})
  }
})

jb.component('group.auto-focus-on-first-input', { /* group.autoFocusOnFirstInput */
  type: 'feature',
  impl: ctx => ({
      afterViewInit: cmp => {
          const elem = Array.from(cmp.base.querySelectorAll('input,textarea,select'))
            .filter(e => e.getAttribute('type') != 'checkbox')[0];
          elem && jb.ui.focus(elem,'group.auto-focus-on-first-input',ctx);
        }
  })
})

jb.component('focus-on-first-element', { /* focusOnFirstElement */
  type: 'action',
  params: [
    {id: 'selector', as: 'string', defaultValue: 'input'}
  ],
  impl: (ctx, selector) =>
      jb.delay(50).then(() => {
        const elem = document.querySelector(selector)
        elem && jb.ui.focus(elem,'focus-on-first-element',ctx)
    })
})

jb.component('feature.byCondition', { /* feature.byCondition */
  type: 'feature',
  description: 'conditional feature, define feature if then else condition',
  macroByValue: true,
  params: [
    {id: 'condition', type: 'boolean', as: 'boolean', mandatory: true},
    {id: 'then', type: 'feature', mandatory: true, dynamic: true, composite: true},
    {id: 'else', type: 'feature', dynamic: true}
  ],
  impl: (ctx,cond,_then,_else) =>	cond ? _then() : _else()
})
;

(function() {
const withUnits = jb.ui.withUnits
const fixCssLine = jb.ui.fixCssLine

jb.component('css', { /* css */
  description: 'e.g. {color: red; width: 20px} or div>.myClas {color: red} ',
  type: 'feature,dialog-feature',
  params: [
    {id: 'css', mandatory: true, as: 'string'}
  ],
  impl: (ctx,css) => ({css: fixCssLine(css)})
})

jb.component('css.dynamic', { /* css.dynamic */
  description: 'recalc the css on refresh/watchRef. e.g. {color: %$color%}',
  type: 'feature,dialog-feature',
  params: [
    {id: 'css', mandatory: true, as: 'string', dynamic: true}
  ],
  impl: (ctx,css) => ({dynamicCss: ctx2 => css(ctx2)})
})

jb.component('css.with-condition', { /* css.withCondition */
  description: 'css with dynamic condition. e.g. .myclz {color: red}',
  type: 'feature,dialog-feature',
  params: [
    {id: 'condition', as: 'boolean', mandatory: true, dynamic: true, type: 'boolean'},
    {id: 'css', mandatory: true, as: 'string', dynamic: true}
  ],
  impl: (ctx,cond,css) => ({dynamicCss: ctx2 => cond(ctx2) ? fixCssLine(css(ctx2)) : ''})
})

jb.component('css.class', { /* css.class */
  type: 'feature,dialog-feature',
  params: [
    {id: 'class', mandatory: true, as: 'string'}
  ],
  impl: (ctx,clz) => ({class: clz})
})

jb.component('css.width', { /* css.width */
  type: 'feature,dialog-feature',
  params: [
    {id: 'width', mandatory: true, as: 'string', description: 'e.g. 200, 100%, calc(100% - 100px)'},
    {id: 'overflow', as: 'string', options: ',auto,hidden,scroll'},
    {id: 'minMax', as: 'string', options: ',min,max'},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,width,overflow,minMax) =>
    ({css: `${ctx.params.selector} { ${minMax ? minMax +'-':''}width: ${withUnits(width)} ${overflow ? '; overflow-x:' + overflow + ';' : ''} }`})
})

jb.component('css.height', { /* css.height */
  type: 'feature,dialog-feature',
  params: [
    {id: 'height', mandatory: true, as: 'string', description: 'e.g. 200, 100%, calc(100% - 100px)'},
    {id: 'overflow', as: 'string', options: ',auto,hidden,scroll'},
    {id: 'minMax', as: 'string', options: ',min,max'},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,height,overflow,minMax) =>
    ({css: `${ctx.params.selector} { ${minMax ? minMax +'-':''}height: ${withUnits(height)} ${overflow ? '; overflow-y:' + overflow : ''} }`})
})

jb.component('css.opacity', { /* css.opacity */
  type: 'feature',
  params: [
    {id: 'opacity', mandatory: true, as: 'string', description: '0-1'},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,opacity) =>
    ({css: `${ctx.params.selector} { opacity: ${opacity} }`})
})

jb.component('css.padding', { /* css.padding */
  type: 'feature,dialog-feature',
  params: [
    {id: 'top', as: 'string', description: 'e.g. 20, 20%, 0.4em'},
    {id: 'left', as: 'string'},
    {id: 'right', as: 'string'},
    {id: 'bottom', as: 'string'},
    {id: 'selector', as: 'string'}
  ],
  impl: ctx => {
    const css = ['top','left','right','bottom']
      .filter(x=>ctx.params[x] != null)
      .map(x=> `padding-${x}: ${withUnits(ctx.params[x])}`)
      .join('; ');
    return {css: `${ctx.params.selector} {${css}}`};
  }
})

jb.component('css.margin', { /* css.margin */
  type: 'feature,dialog-feature',
  params: [
    {id: 'top', as: 'string', description: 'e.g. 20, 20%, 0.4em, -20'},
    {id: 'right', as: 'string'},
    {id: 'bottom', as: 'string'},
    {id: 'left', as: 'string'},
    {id: 'selector', as: 'string'}
  ],
  impl: ctx => {
    const css = ['top','left','right','bottom']
      .filter(x=>ctx.params[x] != null)
      .map(x=> `margin-${x}: ${withUnits(ctx.params[x])}`)
      .join('; ');
    return {css: `${ctx.params.selector} {${css}}`};
  }
})

jb.component('css.margin-all-sides', {
  type: 'feature,dialog-feature',
  params: [
    {id: 'value', as: 'string', mandatory: true, description: 'e.g. 20, 20%, 0.4em'},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,value,selector) => ({css: `${selector} margin: ${withUnits(value)}`})
})

jb.component('css.margin-vertical-horizontal', {
  type: 'feature,dialog-feature',
  params: [
    {id: 'vertical', as: 'string', mandatory: true},
    {id: 'horizontal', as: 'string', mandatory: true},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,vertical,horizontal,selector) => 
    ({css: `${selector} margin: ${withUnits(vertical)+ ' ' +withUnits(horizontal)}`})
})

jb.component('css.transform-rotate', { /* css.transformRotate */
  type: 'feature',
  params: [
    {id: 'angle', as: 'string', description: '0-360'},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,angle,selector) => ({css: `${selector} {transform:rotate(${angle}deg)}`})
})

jb.component('css.color', { /* css.color */
  type: 'feature',
  params: [
    {id: 'color', as: 'string'},
    {id: 'background', as: 'string'},
    {id: 'selector', as: 'string'}
  ],
  impl: (ctx,color) => {
		const css = ['color','background']
      .filter(x=>ctx.params[x])
      .map(x=> `${x}: ${ctx.params[x]}`)
      .join('; ');
    return css && ({css: `${ctx.params.selector} {${css}}`});
  }
})

jb.component('css.transform-scale', { /* css.transformScale */
  type: 'feature',
  params: [
    {id: 'x', as: 'string', description: '0-1'},
    {id: 'y', as: 'string', description: '0-1'},
    {id: 'selector', as: 'string'}
  ],
  impl: ctx => ({css: `${ctx.params.selector} {transform:scale(${ctx.params.x},${ctx.params.y})}`})
})

jb.component('css.bold', { /* css.bold */
  type: 'feature',
  impl: ctx => ({css: `{font-weight: bold}`})
})

jb.component('css.underline', { /* css.underline */
  type: 'feature',
  impl: ctx => ({css: `{text-decoration: underline}`})
})

jb.component('css.box-shadow', { /* css.boxShadow */
  type: 'feature,dialog-feature',
  params: [
    {id: 'blurRadius', as: 'string', templateValue: '5'},
    {id: 'spreadRadius', as: 'string', templateValue: '0'},
    {id: 'shadowColor', as: 'string', templateValue: '#000000'},
    {id: 'opacity', as: 'string', templateValue: 0.5, description: '0-1'},
    {id: 'horizontal', as: 'string', templateValue: '10'},
    {id: 'vertical', as: 'string', templateValue: '10'},
    {id: 'selector', as: 'string'}
  ],
  impl: (context,blurRadius,spreadRadius,shadowColor,opacity,horizontal,vertical,selector) => {
    const color = [parseInt(shadowColor.slice(1,3),16) || 0, parseInt(shadowColor.slice(3,5),16) || 0, parseInt(shadowColor.slice(5,7),16) || 0]
      .join(',');
    return ({css: `${selector} { box-shadow: ${withUnits(horizontal)} ${withUnits(vertical)} ${withUnits(blurRadius)} ${withUnits(spreadRadius)} rgba(${color},${opacity}) }`})
  }
})

jb.component('css.border', { /* css.border */
  type: 'feature,dialog-feature',
  params: [
    {id: 'width', as: 'string', defaultValue: '1'},
    {id: 'side', as: 'string', options: 'top,left,bottom,right'},
    {id: 'style', as: 'string', options: 'solid,dotted,dashed,double,groove,ridge,inset,outset', defaultValue: 'solid'},
    {id: 'color', as: 'string', defaultValue: 'black'},
    {id: 'selector', as: 'string'}
  ],
  impl: (context,width,side,style,color,selector) =>
    ({css: `${selector} { border${side?'-'+side:''}: ${withUnits(width)} ${style} ${color} }`})
})

jb.component('css.line-clamp', { /* css.lineClamp */
  type: 'feature',
  description: 'ellipsis after X lines',
  params: [
    {id: 'lines', mandatory: true, as: 'string', templateValue: 3, description: 'no of lines to clump'},
    {id: 'selector', as: 'string'}
  ],
  impl: css(
    '%$selector% { overflow: hidden; text-overflow: ellipsis; -webkit-box-orient: vertical; display: -webkit-box; -webkit-line-clamp: %$lines% }'
  )
})

jb.component('css.layout', {
  type: 'feature:0',
  params: [
    {id: 'css', mandatory: true, as: 'string'}
  ],
  impl: (ctx,css) => ({css: fixCssLine(css)})
})

jb.component('css.typography', {
  type: 'feature:0',
  params: [
    {id: 'css', mandatory: true, as: 'string'}
  ],
  impl: (ctx,css) => ({css: fixCssLine(css)})
})


})();

jb.ns('text')

jb.component('text', { /* text */
  type: 'control',
  category: 'control:100,common:100',
  params: [
    {id: 'text', as: 'ref', mandatory: true, templateValue: 'my text', dynamic: true},
    {id: 'title', as: 'ref', mandatory: true, templateValue: 'my title', dynamic: true},
    {id: 'style', type: 'text.style', defaultValue: text.span(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx)
})

jb.component('label', {...jb.comps.text,type: 'depricated-control'} )

jb.component('text.bind-text', { /* text.bindText */
  type: 'feature',
  category: 'text:0',
  impl: features(
    watchAndCalcModelProp('text', ({data}) => jb.ui.toVdomOrStr(data)),
    () => ({studioFeatures :{$: 'feature.content-editable', param: 'text' }})
  )
})

jb.component('text.allow-asynch-value', { /* text.allowAsynchValue */
  type: 'feature',
  impl: features(
    calcProp({id: 'text', value: (ctx,{cmp}) => cmp.text || ctx.vars.$props.text}),
    interactive(
        (ctx,{cmp}) => {
      if (cmp.text) return
      const val = jb.ui.toVdomOrStr(ctx.vars.$model.text(cmp.ctx))
      if (val && typeof val.then == 'function')
        val.then(res=>cmp.refresh({text: jb.ui.toVdomOrStr(res)},{srcCtx: ctx.componentContext}))
    }
      )
  )
})

jb.component('text.htmlTag', { /* text.htmlTag */
  type: 'text.style',
  params: [
    {id: 'htmlTag', as: 'string', defaultValue: 'p', options: 'span,p,h1,h2,h3,h4,h5,div,li,article,aside,details,figcaption,figure,footer,header,main,mark,nav,section,summary,label'},
    {id: 'cssClass', as: 'string'}
  ],
  impl: customStyle({
    template: (cmp,{text,htmlTag,cssClass},h) => h(htmlTag,{class: cssClass},text),
    features: text.bindText()
  })
})

jb.component('text.no-wrapping-tag', { /* text.noWrappingTag */
  type: 'text.style',
  category: 'text:0',
  impl: customStyle({
    template: (cmp,{text},h) => text,
    features: text.bindText()
  })
})

jb.component('text.span', { /* text.span */
  type: 'text.style',
  impl: customStyle({
    template: (cmp,{text},h) => h('span',{},text),
    features: text.bindText()
  })
})

;[1,2,3,4,5,6].map(level=>jb.component(`header.h${level}`, {
  type: 'text.style',
  impl: customStyle({
    template: (cmp,{text},h) => h(`h${level}`,{},text),
    features: text.bindText()
  })
}))

;[1,2,3,4,5,6].map(level=>jb.component(`header.mdc-headline${level}`, {
  type: 'text.style',
  impl: customStyle({
    template: (cmp,{text},h) => h('h2',{class: `mdc-typography mdc-typography--headline${level}`},text),
    features: text.bindText()
  })
}))

;[1,2].map(level=>jb.component(`header.mdc-subtitle${level}`, {
  type: 'text.style',
  impl: customStyle({
    template: (cmp,{text},h) => h('h2',{class: `mdc-typography mdc-typography--subtitle${level}`},text),
    features: text.bindText()
  })
}))

;[1,2].map(level=>jb.component(`text.mdc-body${level}`, {
  type: 'text.style',
  impl: customStyle({
    template: (cmp,{text},h) => h('h2',{class: `mdc-typography mdc-typography--body${level}`},text),
    features: text.bindText()
  })
}))

jb.component('text.highlight', { /* text.highlight */
  type: 'data',
  macroByValue: true,
  params: [
    {id: 'base', as: 'string', dynamic: true},
    {id: 'highlight', as: 'string', dynamic: true},
    {id: 'cssClass', as: 'string', defaultValue: 'mdl-color-text--deep-purple-A700'}
  ],
  impl: (ctx,base,highlightF,cssClass) => {
    const h = highlightF(), b = base();
    if (!h || !b) return b;
    const highlight = (b.match(new RegExp(h,'i'))||[])[0]; // case sensitive highlight
    if (!highlight) return b;
    return jb.ui.h('div',{},[  b.split(highlight)[0],
              jb.ui.h('span',{class: cssClass},highlight),
              b.split(highlight).slice(1).join(highlight)])
  }
})
;

jb.ns('group,layout,tabs')

jb.component('group', { /* group */
  type: 'control',
  category: 'group:100,common:90',
  params: [
    {id: 'title', as: 'string', dynamic: true},
    {id: 'layout', type: 'layout'},
    {id: 'style', type: 'group.style', defaultValue: group.div(), mandatory: true, dynamic: true},
    {id: 'controls', type: 'control[]', mandatory: true, flattenArray: true, dynamic: true, composite: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx, ctx.params.layout)
})

jb.component('group.init-group', { /* group.initGroup */
  type: 'feature',
  category: 'group:0',
  impl: calcProp({
    id: 'ctrls',
    value: '%$$model.controls%'
  })
})

jb.component('inline-controls', { /* inlineControls */
  type: 'control',
  description: 'controls without a wrapping group',
  params: [
    {id: 'controls', type: 'control[]', mandatory: true, flattenArray: true, dynamic: true, composite: true}
  ],
  impl: ctx => ctx.params.controls().filter(x=>x)
})

jb.component('dynamic-controls', { /* dynamicControls */
  type: 'control',
  description: 'calculated controls by data items without a wrapping group',
  params: [
    {id: 'controlItems', type: 'data', as: 'array', mandatory: true, dynamic: true},
    {id: 'genericControl', type: 'control', mandatory: true, dynamic: true},
    {id: 'itemVariable', as: 'string', defaultValue: 'controlItem'},
    {id: 'indexVariable', as: 'string'}
  ],
  impl: (ctx,controlItems,genericControl,itemVariable,indexVariable) => (controlItems() || [])
      .map((controlItem,i) => jb.tosingle(genericControl(
        ctx.setVar(itemVariable,controlItem).setVar(indexVariable,i).setData(controlItem))))
})

jb.component('group.first-succeeding', { /* group.firstSucceeding */
  type: 'feature',
  category: 'group:70',
  description: 'Used with controlWithCondition. Takes the fhe first succeeding control',
  impl: features(
    () => ({calcHash: ctx => jb.asArray(ctx.vars.$model.controls.profile).reduce((res,prof,i) => {
        if (res) return res
        const found = prof.condition == undefined || ctx.vars.$model.ctx.setVars(ctx.vars).runInner(prof.condition,{ as: 'boolean'},`controls.${i}.condition`)
        if (found) 
          return i + 1 // avoid index 0
      }, null),
    }),
    calcProp({
        id: 'ctrls',
        value: ctx => {
      const index = ctx.vars.$props.cmpHash-1
      if (isNaN(index)) return []
      const prof = jb.asArray(ctx.vars.$model.controls.profile)[index]
      return [ctx.vars.$model.ctx.setVars(ctx.vars).runInner(prof,{type: 'control'},`controls.${index}`)]
     },
        priority: 5
      })
  )
})

jb.component('control-with-condition', { /* controlWithCondition */
  type: 'control',
  description: 'Used with group.firstSucceeding',
  category: 'group:10',
  macroByValue: true,
  params: [
    {id: 'condition', type: 'boolean', dynamic: true, mandatory: true, as: 'boolean'},
    {id: 'control', type: 'control', mandatory: true, dynamic: true},
    {id: 'title', as: 'string'}
  ],
  impl: (ctx,condition,ctrl) => condition(ctx) && ctrl(ctx)
})

jb.component('group.wait', { /* group.wait */
  type: 'feature',
  category: 'group:70',
  description: 'wait for asynch data before showing the control',
  params: [
    {id: 'for', mandatory: true, dynamic: true},
    {id: 'loadingControl', type: 'control', defaultValue: text('loading ...'), dynamic: true},
    {id: 'error', type: 'control', defaultValue: text('error: %$error%'), dynamic: true},
    {id: 'varName', as: 'string'}
  ],
  impl: features(
    calcProp({
        id: 'ctrls',
        value: (ctx,{cmp},{loadingControl,error}) => {
        const ctrl = cmp.state.error ? error() : loadingControl(ctx)
        return cmp.ctx.profile.$ == 'itemlist' ? [[ctrl]] : [ctrl]
      },
        priority: ctx => jb.path(ctx.vars.$state,'dataArrived') ? 0: 10
      }),
    interactive(
        (ctx,{cmp},{varName}) => !cmp.state.dataArrived && !cmp.state.error &&
      Promise.resolve(ctx.componentContext.params.for()).then(data =>
          cmp.refresh({ dataArrived: true }, {
            srcCtx: ctx.componentContext,
            extendCtx: ctx => ctx.setVar(varName,data).setData(data)
          }))
          .catch(e=> cmp.refresh({error: JSON.stringify(e)}))
      )
  )
})
;

jb.ns('html')

jb.component('html', { /* html */
  type: 'control',
  description: 'rich text',
  category: 'control:100,common:80',
  params: [
    {id: 'title', as: 'string', mandatory: true, templateValue: 'html', dynamic: true},
    {id: 'html', as: 'ref', mandatory: true, templateValue: '<p>html here</p>', dynamic: true},
    {id: 'style', type: 'html.style', defaultValue: html.plain(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx)
})

jb.component('html.plain', { /* html.plain */
  type: 'html.style',
  impl: customStyle({
    template: (cmp,{html},h) => h('html',{$html: html, jb_external: true } ) ,
    features: [
        watchAndCalcModelProp('html'),
        () => ({ studioFeatures :{$: 'feature.content-editable', param: 'html' } })
    ]
  })
})

jb.component('html.in-iframe', { /* html.inIframe */
  type: 'html.style',
  params: [
    {id: 'width', as: 'string', defaultValue: '100%'},
    {id: 'height', as: 'string', defaultValue: '100%'}
  ],
  impl: customStyle({
    template: (cmp,{width,height},h) => h('iframe', {
        sandbox: 'allow-same-origin allow-forms allow-scripts',
        frameborder: 0, width, height,
        src: 'javascript: document.write(parent.contentForIframe)'
    }),
    features: [
      interactiveProp('html', '%$$model/html%'),
      interactive(({},{cmp}) => window.contentForIframe = cmp.html)
    ]
  })
})
;

jb.ns('image,css')

jb.component('image', { /* image */
  type: 'control,image',
  category: 'control:50,common:70',
  params: [
    {id: 'url', as: 'string', mandatory: true, templateValue: 'https://freesvg.org/img/UN-CONSTRUCTION-2.png'},
    {id: 'width', as: 'string', mandatory: true, templateValue: '100', description: 'e.g: 100, 20%'},
    {id: 'height', as: 'string', mandatory: true, description: 'e.g: 100, 20%'},
    {id: 'resize', type: 'image.resize', description: 'background-size, resize the image', defaultValue: image.fullyVisible()},
    {id: 'position', type: 'image.position', description: 'move/shift image'},
    {id: 'style', type: 'image.style', dynamic: true, defaultValue: image.background()},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx, {
    studioFeatures :{$: 'feature.content-editable' },
  })
})

jb.component('image.width-height', { /* image.widthHeight */
  type: 'image.resize',
  description: 'fixed size or precentage of the original',
  params: [
    {id: 'width', as: 'string', description: 'e.g: 100, 20%'},
    {id: 'height', as: 'string', description: 'e.g: 100, 20%'}
  ],
  impl: (ctx,width,height) => [ jb.ui.withUnits(width) ||'auto',jb.ui.withUnits(height)||'auto'].join(' ')
})

jb.component('image.cover', { /* image.cover */
  description: 'auto resize or crop to cover all area',
  type: 'image.resize',
  impl: 'cover'
})

jb.component('image.fully-visible', { /* image.fullyVisible */
  description: 'contain, auto resize to ensure the image is fully visible',
  type: 'image.resize',
  impl: 'contain'
})

jb.component('image.position', { /* image.position */
  description: 'offset move shift original image',
  type: 'image.position',
  params: [
    {id: 'x', as: 'string', description: 'e.g. 7, 50%, right'},
    {id: 'y', as: 'string', description: 'e.g. 10, 50%, bottom'}
  ],
  impl: (ctx,x,y) => [x && `x: ${jb.ui.withUnits(x)}`,y && `y: ${jb.ui.withUnits(y)}`]
    .filter(x=>x).map(x=>`background-position-${x}`).join(';')
})

jb.component('image.background', { /* image.background */
  type: 'image.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div'),
    css: pipeline(
      Var(
          'url',
          (ctx,{$model}) => $model.url.replace(/__WIDTH__/,$model.width).replace(/__HEIGHT__/,$model.height)
        ),
      Var('width', (ctx,{$model}) => jb.ui.withUnits($model.width)),
      Var('height', (ctx,{$model}) => jb.ui.withUnits($model.height)),
      `
      { 
          background-image: url('%$url%');
          {? background-size: %$$model/resize%; ?}
          {? %$$model/position%; ?}
          background-repeat: no-repeat;
          {?width: %$width%; ?}
          {?height: %$height%; ?}
      }`
    )
  })
})

jb.component('image.img', { 
  type: 'image.style',
  impl: customStyle({
    features: calcProp('url', '%$$model/url%'),
    template: ({},{url},h) => h('img', { src: url}),
    css: pipeline(
      Var('width', (ctx,{$model}) => jb.ui.withUnits($model.width)),
      Var('height', (ctx,{$model}) => jb.ui.withUnits($model.height)),
      `
      { 
          {?width: %$width%; ?}
          {?height: %$height%; ?}
      }`
    )
  })
});

jb.ns('button')

jb.component('button', { /* button */
  type: 'control,clickable',
  category: 'control:100,common:100',
  params: [
    {id: 'title', as: 'ref', mandatory: true, templateValue: 'click me', dynamic: true},
    {id: 'action', type: 'action', mandatory: true, dynamic: true},
    {id: 'style', type: 'button.style', defaultValue: button.mdc(), dynamic: true},
    {id: 'raised', as: 'boolean', dynamic: true, type: 'boolean'},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx, ctx.run(features(
      watchAndCalcModelProp('title'),
      watchAndCalcModelProp('raised'),
      defHandler('onclickHandler', (ctx,{cmp, ev}) => {
        //const ev = event
        if (ev && ev.ctrlKey && cmp.ctrlAction)
          cmp.ctrlAction(cmp.ctx.setVar('event',ev))
        else if (ev && ev.altKey && cmp.altAction)
          cmp.altAction(cmp.ctx.setVar('event',ev))
        else
          cmp.action && cmp.action(cmp.ctx.setVar('event',ev))
      }),
      interactive( ({},{cmp}) => cmp.action = jb.ui.wrapWithLauchingElement(ctx.params.action, cmp.ctx, cmp.base)),
      ctx => ({studioFeatures :{$: 'feature.content-editable', param: 'title' }}),
    )))
})

jb.component('ctrl-action', { /* ctrlAction */
  type: 'feature',
  category: 'button:70',
  description: 'action to perform on control+click',
  params: [
    {id: 'action', type: 'action', mandatory: true, dynamic: true}
  ],
  impl: interactive(
    (ctx,{cmp},{action}) => cmp.ctrlAction = jb.ui.wrapWithLauchingElement(action, ctx, cmp.base)
  )
})

jb.component('alt-action', { /* altAction */
  type: 'feature',
  category: 'button:70',
  description: 'action to perform on alt+click',
  params: [
    {id: 'action', type: 'action', mandatory: true, dynamic: true}
  ],
  impl: interactive(
    (ctx,{cmp},{action}) => cmp.altAction = jb.ui.wrapWithLauchingElement(action, ctx, cmp.base)
  )
})

jb.component('button-disabled', { /* buttonDisabled */
  type: 'feature',
  category: 'button:70',
  description: 'define condition when button is enabled',
  params: [
    {id: 'enabledCondition', type: 'boolean', mandatory: true, dynamic: true}
  ],
  impl: interactive(
    (ctx,{cmp},{enabledCondition}) => cmp.isEnabled = ctx2 => enabledCondition(ctx.extendVars(ctx2))
  )
})
;

(function() {
jb.ui.field_id_counter = jb.ui.field_id_counter || 0;

jb.component('field.databind', { /* field.databind */
  type: 'feature',
  category: 'field:0',
  params: [
    {id: 'debounceTime', as: 'number', defaultValue: 0},
    {id: 'oneWay', type: 'boolean', as: 'boolean'}
  ],
  impl: features(
    If(
        '%$oneWay%',
        calcProp({id: 'databind', value: '%$$model/databind%'}),
        watchAndCalcModelProp('databind')
      ),
    calcProp({id: 'title', value: '%$$model/title%'}),
    calcProp({id: 'fieldId', value: () => jb.ui.field_id_counter++}),
    defHandler(
        'onblurHandler',
        (ctx,{cmp, ev},{oneWay}) => writeFieldData(ctx,cmp,ev.target.value,oneWay)
      ),
    defHandler(
        'onchangeHandler',
        (ctx,{$model, cmp, ev},{oneWay}) => !$model.updateOnBlur && writeFieldData(ctx,cmp,ev.target.value,oneWay)
      ),
    defHandler(
        'onkeyupHandler',
        (ctx,{$model, cmp, ev},{oneWay}) => !$model.updateOnBlur && writeFieldData(ctx,cmp,ev.target.value,oneWay)
      ),
    defHandler(
        'onkeydownHandler',
        (ctx,{$model, cmp, ev},{oneWay}) => !$model.updateOnBlur && writeFieldData(ctx,cmp,ev.target.value,oneWay)
      ),
    interactiveProp(
        'jbModel',
        (ctx,{cmp}) => value => 
          value == null ? ctx.exp('%$$mode/databind','number') : writeFieldData(ctx,cmp,{target:{value}},true)
      )
  )
})

function writeFieldData(ctx,cmp,value,oneWay) {
  jb.ui.checkValidationError(cmp,value);
  jb.writeValue(ctx.vars.$model.databind(cmp.ctx),value,ctx);
  !oneWay && jb.ui.refreshElem(cmp.base,null,{srcCtx: ctx.componentContext});
}

jb.ui.checkValidationError = (cmp,val) => {
  const err = validationError();
  if (cmp.state.error != err) {
    jb.log('field',['setErrState',cmp,err])
    cmp.refresh({valid: !err, error:err});
  }

  function validationError() {
    if (!cmp.validations) return;
    const ctx = cmp.ctx.setData(val);
    const err = (cmp.validations || [])
      .filter(validator=>!validator.validCondition(ctx))
      .map(validator=>validator.errorMessage(ctx))[0];
    if (ctx.exp('formContainer'))
      ctx.run(writeValue('%$formContainer/err%',err));
    return err;
  }
}

jb.ui.fieldTitle = function(cmp,fieldOrCtrl,h) {
  let field = fieldOrCtrl.field && fieldOrCtrl.field() || fieldOrCtrl
  field = typeof field === 'function' ? field() : field
	if (field.titleCtrl) {
		const ctx = cmp.ctx.setData(field).setVars({input: cmp.ctx.data})
		const jbComp = field.titleCtrl(ctx);
		return jbComp && h(jbComp,{'jb-ctx': jb.ui.preserveCtx(ctx) })
	}
	return field.title(cmp.ctx)
}

jb.ui.preserveFieldCtxWithItem = (field,item) => {
	const ctx = jb.ctxDictionary[field.ctxId]
	return ctx && jb.ui.preserveCtx(ctx.setData(item))
}

jb.component('field.databind-text', { /* field.databindText */
  type: 'feature',
  category: 'field:0',
  params: [
    {id: 'debounceTime', as: 'number', defaultValue: 0},
    {id: 'oneWay', type: 'boolean', as: 'boolean', defaultValue: true}
  ],
  impl: field.databind(
    '%$debounceTime%',
    '%$oneWay%'
  )
})

jb.component('field.keyboard-shortcut', { /* field.keyboardShortcut */
  type: 'feature',
  category: 'events',
  description: 'listen to events at the document level even when the component is not active',
  params: [
    {id: 'key', as: 'string', description: 'e.g. Alt+C'},
    {id: 'action', type: 'action', dynamic: true}
  ],
  impl: interactive(
    (ctx,{cmp},{key,action}) => {
        const elem = cmp.base.querySelector('input') || cmp.base
        if (elem.tabIndex === undefined) elem.tabIndex = -1
        jb.rx.Observable.fromEvent(elem, 'keydown')
            .takeUntil( cmp.destroyed )
            .subscribe(event=>{
              const keyStr = key.split('+').slice(1).join('+');
              const keyCode = keyStr.charCodeAt(0);
              if (key == 'Delete') keyCode = 46;

              const helper = (key.match('([A-Za-z]*)+') || ['',''])[1];
              if (helper == 'Ctrl' && !event.ctrlKey) return
              if (helper == 'Alt' && !event.altKey) return
              if (event.keyCode == keyCode || (event.key && event.key == keyStr))
                action();
        })
    }
  )
})

jb.component('field.toolbar', { /* field.toolbar */
  type: 'feature',
  params: [
    {id: 'toolbar', type: 'control', mandatory: true, dynamic: true}
  ],
  impl: (ctx,toolbar) => ({ toolbar: toolbar() })
})

// ***** validation

jb.component('validation', { /* validation */
  type: 'feature',
  category: 'validation:100',
  params: [
    {id: 'validCondition', mandatory: true, as: 'boolean', dynamic: true, type: 'boolean'},
    {id: 'errorMessage', mandatory: true, as: 'string', dynamic: true}
  ],
  impl: interactive(
    (ctx,{cmp},{validCondition,errorMessage}) => {
          cmp.validations = (cmp.validations || []).concat([{validCondition,errorMessage}]);
          if (jb.ui.inPreview()) {
            const _ctx = ctx.setData(cmp.state.model);
            validCondition(_ctx)
            errorMessage(_ctx)
          }
      }
  )
})

jb.component('field.title', { /* field.title */
  description: 'used to set table title in button and label',
  type: 'feature',
  category: 'table:80',
  params: [
    {id: 'title', as: 'string', dynamic: true, mandatory: true}
  ],
  impl: (ctx,title) => ({
      enrichField: field => field.title = ctx => title(ctx)
  })
})

jb.component('field.title-ctrl', { /* field.titleCtrl */
  description: 'title as control, buttons are usefull',
  type: 'feature',
  category: 'table:80',
  params: [
    {id: 'titleCtrl', type: 'control', mandatory: true, dynamic: true, templateValue: button({title: '%title%', style: button.href()})}
  ],
  impl: (ctx,titleCtrl) => ({
      enrichField: field => field.titleCtrl = ctx => titleCtrl(ctx)
  })
})

jb.component('field.column-width', { /* field.columnWidth */
  description: 'used in itemlist fields',
  type: 'feature',
  category: 'table:80',
  params: [
    {id: 'width', as: 'number', mandatory: true}
  ],
  impl: (ctx,width) => ({
      enrichField: field => field.width = width
  })
})


})();

jb.ns('editableText')
jb.ns('dialog')

jb.component('editable-text', { /* editableText */
  type: 'control',
  category: 'input:100,common:80',
  params: [
    {id: 'title', as: 'string', dynamic: true},
    {id: 'databind', as: 'ref', mandaroy: true, dynamic: true},
    {id: 'updateOnBlur', as: 'boolean', type: 'boolean'},
    {id: 'style', type: 'editable-text.style', defaultValue: editableText.mdcInput(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx)
})

jb.component('editable-text.x-button', { /* editableText.xButton */
  type: 'feature',
  impl: features(
    defHandler('cleanValue', writeValue('%$$model/databind%', '')),
    templateModifier(
        ({},{vdom,databind}) =>
      jb.ui.h('div', {},[vdom,
          ...(databind ? [jb.ui.h('button', { class: 'delete', onclick: 'cleanValue' } ,'×')]  : [])]
    )
      ),
    css(
        `>.delete {
          margin-left: -16px;
          float: right;
          cursor: pointer; font: 20px sans-serif;
          border: none; background: transparent; color: #000;
          text-shadow: 0 1px 0 #fff; opacity: .1;
      }
      { display : flex }
      >.delete:hover { opacity: .5 }`
      )
  )
})

jb.component('editable-text.helper-popup', { /* editableText.helperPopup */
  type: 'feature',
  params: [
    {id: 'control', type: 'control', dynamic: true, mandatory: true},
    {id: 'popupId', as: 'string', mandatory: true},
    {id: 'popupStyle', type: 'dialog.style', dynamic: true, defaultValue: dialog.popup()},
    {id: 'showHelper', as: 'boolean', dynamic: true, defaultValue: notEmpty('%value%'), description: 'show/hide helper according to input content', type: 'boolean'},
    {id: 'autoOpen', as: 'boolean', type: 'boolean'},
    {id: 'onEnter', type: 'action', dynamic: true},
    {id: 'onEsc', type: 'action', dynamic: true}
  ],
  impl: ctx =>({
    onkeyup: true,
    onkeydown: true, // used for arrows
//    extendCtx: (ctx,cmp) => ctx.setVar('selectionKeySource', {}),

    afterViewInit: cmp => {
      const input = jb.ui.findIncludeSelf(cmp.base,'input')[0];
      if (!input) return;

      cmp.openPopup = jb.ui.wrapWithLauchingElement( ctx2 =>
            ctx2.run( openDialog({
              id: ctx.params.popupId,
              style: _ctx => ctx.params.popupStyle(_ctx),
              content: _ctx => ctx.params.control(_ctx),
              features: [
                dialogFeature.maxZIndexOnClick(),
                dialogFeature.uniqueDialog(ctx.params.popupId),
              ]
            }))
          ,cmp.ctx, cmp.base);

      cmp.popup = _ => jb.ui.dialogs.dialogs.filter(d=>d.id == ctx.params.popupId)[0];
      cmp.closePopup = _ => cmp.popup() && cmp.popup().close();
      cmp.refreshSuggestionPopupOpenClose = _ => {
          const showHelper = ctx.params.showHelper(cmp.ctx.setData(input))
          jb.log('helper-popup', ['refreshSuggestionPopupOpenClose', showHelper,input.value,cmp.ctx,cmp,ctx] );
          if (!showHelper) {
            jb.log('helper-popup', ['close popup', showHelper,input.value,cmp.ctx,cmp,ctx])
            cmp.closePopup();
          } else if (!cmp.popup()) {
            jb.log('helper-popup', ['open popup', showHelper,input.value,cmp.ctx,cmp,ctx])
            cmp.openPopup(cmp.ctx)
          }
      }

      cmp.selectionKeySource = true
      cmp.input = input;
      const keyup = cmp.keyup = cmp.onkeyup.delay(1); // delay to have input updated

      jb.delay(500).then(_=>{
        cmp.onkeydown.filter(e=> e.keyCode == 13).subscribe(_=>{
          const showHelper = ctx.params.showHelper(cmp.ctx.setData(input))
          jb.log('helper-popup', ['onEnter', showHelper, input.value,cmp.ctx,cmp,ctx])
          if (!showHelper)
            ctx.params.onEnter(cmp.ctx)
        });
        cmp.onkeydown.filter(e=> e.keyCode == 27 ).subscribe(_=> ctx.params.onEsc(cmp.ctx));
      })

      keyup.filter(e=> [13,27,37,38,40].indexOf(e.keyCode) == -1)
        .subscribe(_=>cmp.refreshSuggestionPopupOpenClose())

      keyup.filter(e=>e.keyCode == 27) // ESC
          .subscribe(_=>cmp.closePopup())
      if (ctx.params.autoOpen)
        cmp.refreshSuggestionPopupOpenClose()
    },
    destroy: cmp => cmp.closePopup(),
  })
})
;

jb.ns('editableBoolean')

jb.component('editable-boolean', { /* editableBoolean */
  type: 'control',
  category: 'input:20',
  params: [
    {id: 'databind', as: 'ref', type: 'boolean', mandaroy: true, dynamic: true, aa: 5},
    {id: 'style', type: 'editable-boolean.style', defaultValue: editableBoolean.checkbox(), dynamic: true},
    {id: 'title', as: 'string', dynamic: true},
    {id: 'textForTrue', as: 'string', defaultValue: 'yes', dynamic: true},
    {id: 'textForFalse', as: 'string', defaultValue: 'no', dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx, features(
    calcProp('text',data.if('%$$model/databind%','%$$model/textForTrue%','%$$model/textForFalse%' )),
    defHandler('toggle', writeValue('%$$model/databind%',not('%$$model/databind%'))),
    defHandler('setChecked', writeValue('%$$model/databind%','true')),
		))
})

jb.component('editable-boolean.keyboard-support', { /* editableBoolean.keyboardSupport */
  type: 'feature',
  impl: feature.onEvent({
    event: 'click',
    action: action.if(
      () => event.keyCode == 37 || event.keyCode == 39,
      writeValue('%$$model/databind%', not('%$$model/databind%'))
    )
  })
})
;

jb.ns('editableNumber')

jb.component('editable-number', { /* editableNumber */
  type: 'control',
  category: 'input:30',
  params: [
    {id: 'databind', as: 'ref', mandaroy: true, dynamic: true},
    {id: 'title', as: 'string', dynamic: true},
    {id: 'style', type: 'editable-number.style', defaultValue: editableText.mdcInput(), dynamic: true},
    {id: 'symbol', as: 'string', description: 'leave empty to parse symbol from value'},
    {id: 'min', as: 'number', defaultValue: 0},
    {id: 'max', as: 'number', defaultValue: 100},
    {id: 'displayString', as: 'string', dynamic: true, defaultValue: '%$Value%%$Symbol%'},
    {id: 'dataString', as: 'string', dynamic: true, defaultValue: '%$Value%%$Symbol%'},
    {id: 'autoScale', as: 'boolean', defaultValue: true, description: 'adjust its scale if at edges', type: 'boolean'},
    {id: 'step', as: 'number', defaultValue: 1, description: 'used by slider'},
    {id: 'initialPixelsPerUnit', as: 'number', description: 'used by slider'},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => {
      class editableNumber {
        constructor(params) {
          Object.assign(this,params);
          if (this.min == null) this.min = NaN;
          if (this.max == null) this.max = NaN;
        }
        numericPart(dataString) {
          if (!dataString) return NaN;
          var parts = (''+dataString).match(/([^0-9\.\-]*)([0-9\.\-]+)([^0-9\.\-]*)/); // prefix-number-suffix
          if ((!this.symbol) && parts)
            this.symbol = parts[1] || parts[3] || this.symbol;
          return (parts && parts[2]) || '';
        }

        calcDisplayString(number,ctx) {
          if (isNaN(number)) return this.placeholder || '';
          return this.displayString(ctx.setVars({ Value: ''+number, Symbol: this.symbol }));
        }

        calcDataString(number,ctx) {
          if (isNaN(number)) return '';
          return this.dataString(ctx.setVars({ Value: ''+number, Symbol: this.symbol }));
        }
      }
      return jb.ui.ctrl(ctx.setVars({ editableNumber: new editableNumber(ctx.params) }))
  }
})


;

jb.component('open-dialog', { /* openDialog */
  type: 'action',
  params: [
    {id: 'id', as: 'string'},
    {id: 'style', type: 'dialog.style', dynamic: true, defaultValue: dialog.default()},
    {id: 'content', type: 'control', dynamic: true, templateValue: group({})},
    {id: 'menu', type: 'control', dynamic: true},
    {id: 'title', as: 'renderable', dynamic: true},
    {id: 'onOK', type: 'action', dynamic: true},
    {id: 'modal', type: 'boolean', as: 'boolean'},
    {id: 'features', type: 'dialog-feature[]', dynamic: true}
  ],
  impl: function(context,id) {
		const dialog = { id, modal: context.params.modal, em: new jb.rx.Subject() }
		const ctx = context.setVars({
			$dialog: dialog,
			dialogData: {},
			formContainer: { err: ''}
		})
		dialog.content = () => jb.ui.dialogs.buildComp(ctx).renderVdom() // used by probe as breaking prop
		if (!context.probe)	jb.ui.dialogs.addDialog(dialog,ctx);
		return dialog
	}
})

jb.component('dialog.close-containing-popup', { /* dialog.closeContainingPopup */
  description: 'close parent dialog',
  type: 'action',
  params: [
    {id: 'OK', type: 'boolean', as: 'boolean', defaultValue: true}
  ],
  impl: (context,OK) => context.vars.$dialog && context.vars.$dialog.close({OK:OK})
})

jb.component('dialog-feature.unique-dialog', { /* dialogFeature.uniqueDialog */
  description: 'automatic close dialogs of the same id',
  type: 'dialog-feature',
  params: [
    {id: 'id', as: 'string'},
    {id: 'remeberLastLocation', type: 'boolean', as: 'boolean'}
  ],
  impl: function(context,id,remeberLastLocation) {
		if (!id) return;
		const dialog = context.vars.$dialog;
		dialog.id = id;
		dialog.em.filter(e=> e.type == 'new-dialog')
			.subscribe(e=> {
				if (e.dialog != dialog && e.dialog.id == id )
					dialog.close();
		})
	}
})

jb.component('dialog-feature.drag-title', { /* dialogFeature.dragTitle */
	type: 'dialog-feature',
	params: [
	  {id: 'id', as: 'string'}
	],
	impl: function(context, id) {
		  const dialog = context.vars.$dialog;
		  const {pipe,fromEvent,takeUntil,merge,Do, map,flatMap,distinctUntilChanged,fromPromise, forEach} = jb.callbag
		  return {
				 css: '>.dialog-title { cursor: pointer }',
				 afterViewInit: function(cmp) {
					const titleElem = cmp.base.querySelector('.dialog-title');
					const destroyed = fromPromise(cmp.destroyed)
					cmp.mousedownEm = pipe(fromEvent(titleElem, 'mousedown'),takeUntil(destroyed));

					if (id && sessionStorage.getItem(id)) {
						  const pos = JSON.parse(sessionStorage.getItem(id));
						  dialog.el.style.top  = pos.top  + 'px';
						  dialog.el.style.left = pos.left + 'px';
					}

					let mouseUpEm = pipe(fromEvent(document, 'mouseup'), takeUntil(destroyed))
					let mouseMoveEm = pipe(fromEvent(document, 'mousemove'), takeUntil(destroyed))

					if (jb.studio.previewWindow) {
						mouseUpEm = merge(mouseUpEm, pipe(fromEvent(jb.studio.previewWindow.document, 'mouseup')), takeUntil(destroyed))
						mouseMoveEm = merge(mouseMoveEm, pipe(fromEvent(jb.studio.previewWindow.document, 'mousemove')), takeUntil(destroyed))
					}

					pipe(
							cmp.mousedownEm,
							Do(e => e.preventDefault()),
							map(e =>  ({
								left: e.clientX - dialog.el.getBoundingClientRect().left,
								top:  e.clientY - dialog.el.getBoundingClientRect().top
						  	})),
							flatMap(imageOffset =>
								 pipe(mouseMoveEm, takeUntil(mouseUpEm),
									map(pos => ({
									top:  Math.max(0,pos.clientY - imageOffset.top),
									left: Math.max(0,pos.clientX - imageOffset.left)
									}))
								 )
							),
							//distinctUntilChanged(),
							forEach(pos => {
								dialog.el.style.top  = pos.top  + 'px';
								dialog.el.style.left = pos.left + 'px';
								if (id) sessionStorage.setItem(id, JSON.stringify(pos))
							})
					)
				}
			 }
	  }
  })

  jb.component('dialog.default', { /* dialog.default */
	type: 'dialog.style',
	impl: customStyle({
	  template: (cmp,{title,contentComp},h) => h('div',{ class: 'jb-dialog jb-default-dialog'},[
			  h('div',{class: 'dialog-title'},title),
			  h('button',{class: 'dialog-close', onclick: 'dialogClose' },'×'),
			  h(contentComp),
		  ]),
	  features: dialogFeature.dragTitle()
	})
  })

jb.component('dialog-feature.near-launcher-position', { /* dialogFeature.nearLauncherPosition */
  type: 'dialog-feature',
  params: [
    {id: 'offsetLeft', as: 'number', dynamic: true, defaultValue: 0},
    {id: 'offsetTop', as: 'number', dynamic: true, defaultValue: 0},
    {id: 'rightSide', as: 'boolean', type: 'boolean'}
  ],
  impl: function(context,offsetLeftF,offsetTopF,rightSide) {
		return {
			afterViewInit: function(cmp) {
				let offsetLeft = offsetLeftF() || 0, offsetTop = offsetTopF() || 0;
				if (!context.vars.$launchingElement)
					return console.log('no launcher for dialog');
				const control = context.vars.$launchingElement.el;
				const launcherHeightFix = context.vars.$launchingElement.launcherHeightFix || jb.ui.outerHeight(control)
				const pos = jb.ui.offset(control);
				const jbDialog = jb.ui.findIncludeSelf(cmp.base,'.jb-dialog')[0];
				offsetLeft += rightSide ? jb.ui.outerWidth(control) : 0;
				const fixedPosition = fixDialogOverflow(control,jbDialog,offsetLeft,offsetTop);
				jbDialog.style.display = 'block';
				jbDialog.style.left = (fixedPosition ? fixedPosition.left : pos.left + offsetLeft) + 'px';
				jbDialog.style.top = (fixedPosition ? fixedPosition.top : pos.top + launcherHeightFix + offsetTop) + 'px';
			}
		}

		function fixDialogOverflow(control,dialog,offsetLeft,offsetTop) {
			let top,left
			const padding = 2,control_offset = jb.ui.offset(control), dialog_height = jb.ui.outerHeight(dialog), dialog_width = jb.ui.outerWidth(dialog);
			if (control_offset.top > dialog_height && control_offset.top + dialog_height + padding + (offsetTop||0) > window.innerHeight + window.pageYOffset)
				top = control_offset.top - dialog_height;
			if (control_offset.left > dialog_width && control_offset.left + dialog_width + padding + (offsetLeft||0) > window.innerWidth + window.pageXOffset)
				left = control_offset.left - dialog_width;
			if (top || left)
				return { top: top || control_offset.top , left: left || control_offset.left}
		}
	}
})

jb.component('dialog-feature.onClose', { /* dialogFeature.onClose */
  type: 'dialog-feature',
  params: [
    {id: 'action', type: 'action', dynamic: true}
  ],
  impl: (ctx,action) => ctx.vars.$dialog.em.filter(e => e.type == 'close').take(1)
			.subscribe(e=> action(ctx.setData(e.OK)))
})

jb.component('dialog-feature.close-when-clicking-outside', { /* dialogFeature.closeWhenClickingOutside */
  type: 'dialog-feature',
  params: [
    {id: 'delay', as: 'number', defaultValue: 100}
  ],
  impl: function(context,delay) {
		const dialog = context.vars.$dialog;
		dialog.isPopup = true;
		jb.delay(10).then(() =>  { // delay - close older before
			let clickoutEm = jb.rx.Observable.fromEvent(document, 'mousedown');
			if (jb.studio.previewWindow)
				clickoutEm = clickoutEm.merge(jb.rx.Observable.fromEvent(
			      				(jb.studio.previewWindow || {}).document, 'mousedown'));

		 	clickoutEm.filter(e => jb.ui.closest(e.target,'.jb-dialog') == null)
   				.takeUntil(dialog.em.filter(e => e.type == 'close'))
   				.take(1).delay(delay).subscribe(()=>
		  			dialog.close())
  		})
	}
})

jb.component('dialog.close-dialog', { /* dialog.closeDialog */
  type: 'action',
  params: [
    {id: 'id', as: 'string'},
    {id: 'delay', as: 'number', defaultValue: 200}
  ],
  impl: (ctx,id,delay) => jb.ui.dialogs.closeDialogs(jb.ui.dialogs.dialogs.filter(d=>d.id == id))
})

jb.component('dialog.close-all', { /* dialog.closeAll */
  type: 'action',
  impl: ctx => jb.ui.dialogs.closeAll()
})

jb.component('dialog-feature.auto-focus-on-first-input', { /* dialogFeature.autoFocusOnFirstInput */
  type: 'dialog-feature',
  params: [
    {id: 'selectText', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,selectText) => ({
		afterViewInit: cmp => {
			jb.delay(1).then(_=> {
				const elem = ctx.vars.$dialog.el.querySelector('input,textarea,select');
				if (elem)
					jb.ui.focus(elem, 'dialog-feature.auto-focus-on-first-input',ctx);
				if (selectText)
					elem.select();
			})
		}
	})
})

jb.component('dialog-feature.css-class-on-launching-element', { /* dialogFeature.cssClassOnLaunchingElement */
  type: 'dialog-feature',
  impl: context => ({
		afterViewInit: cmp => {
			const dialog = context.vars.$dialog;
			const control = context.vars.$launchingElement.el;
			jb.ui.addClass(control,'dialog-open');
			dialog.em.filter(e=> e.type == 'close').take(1).subscribe(()=> jb.ui.removeClass(control,'dialog-open'))
		}
	})
})

jb.component('dialog-feature.max-zIndex-on-click', { /* dialogFeature.maxZIndexOnClick */
  type: 'dialog-feature',
  params: [
    {id: 'minZIndex', as: 'number'}
  ],
  impl: function(context,minZIndex) {
		const dialog = context.vars.$dialog;

		return ({
			afterViewInit: cmp => {
				setAsMaxZIndex();
				dialog.el.onmousedown = setAsMaxZIndex;
			}
		})

		function setAsMaxZIndex() {
			const maxIndex = jb.ui.dialogs.dialogs.reduce((max,d) =>
				Math.max(max,(d.el && parseInt(d.el.style.zIndex || 100)+1) || 100)
			, minZIndex || 100)
			dialog.el.style.zIndex = maxIndex;
		}
	}
})

jb.component('dialog.dialog-ok-cancel', { /* dialog.dialogOkCancel */
  type: 'dialog.style',
  params: [
    {id: 'okLabel', as: 'string', defaultValue: 'OK'},
    {id: 'cancelLabel', as: 'string', defaultValue: 'Cancel'}
  ],
  impl: customStyle({
    template: (cmp,{title,contentComp,cancelLabel,okLabel},h) => h('div',{ class: 'jb-dialog jb-default-dialog'},[
			h('div',{class: 'dialog-title'},title),
			h('button',{class: 'dialog-close', onclick: 'dialogClose' },'×'),
			h(contentComp),
			h('div',{class: 'dialog-buttons'},[
				h('button',{class: 'mdc-button', onclick: 'dialogClose' },cancelLabel),
				h('button',{class: 'mdc-button', onclick: 'dialogCloseOK' },okLabel),
			]),
		]),
    css: '>.dialog-buttons { display: flex; justify-content: flex-end; margin: 5px }'
  })
})

jb.component('dialog-feature.resizer', { /* dialogFeature.resizer */
  type: 'dialog-feature',
  params: [
    {id: 'resizeInnerCodemirror', as: 'boolean', description: 'effective only for dialog with a single codemirror element', type: 'boolean'}
  ],
  impl: (ctx,codeMirror) => ({
	templateModifier: (vdom,cmp,state) => {
            if (vdom && vdom.tag != 'div') return vdom;
				vdom.children.push(jb.ui.h('img', {class: 'jb-resizer'}));
			return vdom;
	},
	css: '>.jb-resizer { cursor: pointer; position: absolute; right: 1px; bottom: 1px }',

	afterViewInit: function(cmp) {
		const resizerElem = cmp.base.querySelector('.jb-resizer');
		cmp.mousedownEm = jb.rx.Observable.fromEvent(resizerElem, 'mousedown').takeUntil( cmp.destroyed );

		let mouseUpEm = jb.rx.Observable.fromEvent(document, 'mouseup').takeUntil( cmp.destroyed );
		let mouseMoveEm = jb.rx.Observable.fromEvent(document, 'mousemove').takeUntil( cmp.destroyed );

		if (jb.studio.previewWindow) {
			mouseUpEm = mouseUpEm.merge(jb.rx.Observable.fromEvent(jb.studio.previewWindow.document, 'mouseup'))
				.takeUntil( cmp.destroyed );
			mouseMoveEm = mouseMoveEm.merge(jb.rx.Observable.fromEvent(jb.studio.previewWindow.document, 'mousemove'))
				.takeUntil( cmp.destroyed );
		}

		let codeMirrorElem,codeMirrorSizeDiff;
		const mousedrag = cmp.mousedownEm.do(e=>{
			if (codeMirror) {
					codeMirrorElem = cmp.base.querySelector('.CodeMirror,.jb-textarea-alternative-for-codemirror');
					if (codeMirrorElem)
					codeMirrorSizeDiff = codeMirrorElem.getBoundingClientRect().top - cmp.base.getBoundingClientRect().top
						+ (cmp.base.getBoundingClientRect().bottom - codeMirrorElem.getBoundingClientRect().bottom);
			}
			}).map(e =>  ({
				left: cmp.base.getBoundingClientRect().left,
				top:  cmp.base.getBoundingClientRect().top
			})).flatMap(imageOffset =>
					mouseMoveEm.takeUntil(mouseUpEm)
					.map(pos => ({ top:  pos.clientY - imageOffset.top, left: pos.clientX - imageOffset.left }))
			)

		mousedrag.distinctUntilChanged().subscribe(pos => {
			cmp.base.style.height  = pos.top  + 'px';
			cmp.base.style.width = pos.left + 'px';
			if (codeMirrorElem)
				codeMirrorElem.style.height  = (pos.top - codeMirrorSizeDiff) + 'px';
			})
		}
	})
})

jb.component('dialog.popup', { /* dialog.popup */
  type: 'dialog.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{ class: 'jb-dialog jb-popup'},h(state.contentComp)),
    css: '{ position: absolute; background: white; box-shadow: 2px 2px 3px #d5d5d5; padding: 3px 0; border: 1px solid rgb(213, 213, 213) }',
    features: [
      dialogFeature.maxZIndexOnClick(),
      dialogFeature.closeWhenClickingOutside(),
      dialogFeature.cssClassOnLaunchingElement(),
      dialogFeature.nearLauncherPosition({})
    ]
  })
})

jb.component('dialog.div', { /* dialog.div */
  type: 'dialog.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{ class: 'jb-dialog jb-popup'},h(state.contentComp)),
    css: '{ position: absolute }'
  })
})

jb.ui.dialogs = {
	dialogs: [],
	buildComp(ctx) { // used with addDialog profile
		const dialog = ctx.vars.$dialog
		return jb.ui.ctrl(ctx, features(
			calcProp('title', _ctx=> _ctx.vars.$model.title(_ctx)),
			calcProp('contentComp', '%$$model.content%'),
			calcProp('hasMenu', '%$$model/menu/profile%'),
			calcProp('menuComp', '%$$model/menu%'),
			feature.init( ({},{cmp}) => cmp.dialog = dialog),
			interactive( ({},{cmp}) => {
				dialog.cmp = cmp
				cmp.dialog = dialog
				dialog.onOK = ctx2 => ctx.params.onOK(cmp.ctx.extendVars(ctx2));
				cmp.dialogCloseOK = () => dialog.close({OK: true});
				cmp.dialogClose = args => dialog.close(args);
				dialog.el = cmp.base;
				if (!cmp.base.style.zIndex) cmp.base.style.zIndex = 100;
		})))
	},

	addDialog(dialog,ctx) {
		const self = this;
		jb.log('addDialog',[dialog])
		this.dialogs.push(dialog);
		if (dialog.modal && !document.querySelector('.modal-overlay'))
			jb.ui.addHTML(document.body,'<div class="modal-overlay"></div>');
		jb.ui.render(jb.ui.h(this.buildComp(ctx)), this.dialogsTopElem(ctx))
		this.dialogs.forEach(d=> d.em.next({ type: 'new-dialog', dialog }));

		dialog.close = function(args) {
			jb.log('closeDialog',[dialog])
			if (ctx.vars.formContainer.err && args && args.OK) // not closing dialog with errors
				return;
			return Promise.resolve().then(_=>{
				if (dialog.closing) return;
				dialog.closing = true;
				if (dialog.onOK && args && args.OK)
					return dialog.onOK(ctx)
			}).then( _ => {
				dialog.em.next({type: 'close', OK: args && args.OK})
				dialog.em.complete();

				const index = self.dialogs.indexOf(dialog);
				if (index != -1)
					self.dialogs.splice(index, 1);
				if (dialog.modal && document.querySelector('.modal-overlay'))
					document.body.removeChild(document.querySelector('.modal-overlay'));
				jb.ui.unmount(dialog.el)
				if (dialog.el.parentElement === self.dialogsTopElem(ctx))
					self.dialogsTopElem(ctx).removeChild(dialog.el)
			})
		},
		dialog.closed = () => self.dialogs.indexOf(dialog) == -1;
	},
	closeDialogs(dialogs) {
		return dialogs.slice(0).reduce((pr,dialog) => pr.then(()=>dialog.close()), Promise.resolve())
	},
	closeAll() {
		return this.closeDialogs(this.dialogs)
	},
	closePopups() {
		return jb.ui.dialogs.closeDialogs(jb.ui.dialogs.dialogs.filter(d=>d.isPopup))
	},
	dialogsTopElem(ctx) {
		if (!this._dialogsTopElem) {
			this._dialogsTopElem = (ctx.vars.elemToTest || document.body).ownerDocument.createElement('div')
			this._dialogsTopElem.className = 'jb-dialogs'
			;(ctx.vars.elemToTest || document.body).appendChild(this._dialogsTopElem)
		}
		return this._dialogsTopElem
	},
	reRenderAll(ctx) {
		this._dialogsTopElem && Array.from(this._dialogsTopElem.children).filter(x=>x).forEach(el=> jb.ui.refreshElem(el,null,{srcCtx: ctx}))
	}
}
;

jb.ns('itemlist,itemlistContainer')

jb.component('itemlist', { /* itemlist */
  description: 'list, dynamic group, collection, repeat',
  type: 'control',
  category: 'group:80,common:80',
  params: [
    {id: 'title', as: 'string'},
    {id: 'items', as: 'array', dynamic: true, mandatory: true},
    {id: 'controls', type: 'control[]', mandatory: true, dynamic: true},
    {id: 'style', type: 'itemlist.style', dynamic: true, defaultValue: itemlist.ulLi()},
    {id: 'itemVariable', as: 'string', defaultValue: 'item'},
    {id: 'visualSizeLimit', as: 'number', defaultValue: 100, description: 'by default itemlist is limmited to 100 shown items'},
    {id: 'features', type: 'feature[]', dynamic: true, flattenArray: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx)
})

jb.component('itemlist.no-container', { /* itemlist.noContainer */
  type: 'feature',
  category: 'group:20',
  impl: ctx => ({ extendCtx: (ctx,cmp) => ctx.setVars({itemlistCntr: null}) })
})

jb.component('itemlist.init-container-with-items', { /* itemlist.initContainerWithItems */
  type: 'feature',
  category: 'itemlist:20',
  impl: calcProp({
    id: 'updateItemlistCntr',
    value: action.if(
      '%$itemlistCntr%',
      writeValue('%$itemlistCntr.items%', '%$$props.items%')
    ),
    phase: 100
  })
})

jb.component('itemlist.init', { /* itemlist.init */
  type: 'feature',
  impl: features(
    calcProp({id: 'items', value: '%$$model.items%'}),
    calcProp({
        id: 'ctrls',
        value: (ctx,{cmp}) => {
          const controlsOfItem = item =>
            ctx.vars.$model.controls(ctx.setVar(ctx.vars.$model.itemVariable,item).setData(item)).filter(x=>x)
          return jb.ui.addSlicedState(cmp, ctx.vars.$props.items, ctx.vars.$model.visualSizeLimit).map(item=>
            Object.assign(controlsOfItem(item),{item})).filter(x=>x.length > 0);
        }
      }),
    itemlist.initContainerWithItems()
  )
})

jb.component('itemlist.infinite-scroll', { 
  type: 'feature',
  params: [
    { id: 'pageSize', as: 'number', defaultValue: 2 }
  ],
  impl: features(
    defHandler('onscrollHandler', (ctx,{ev, $state},{pageSize}) => {
      const elem = ev.target
      if (!ev.scrollPercentFromTop || ev.scrollPercentFromTop < 0.9) return
      const allItems = ctx.vars.$model.items()
      const needsToLoadMoreItems = $state.visualLimit.shownItems && $state.visualLimit.shownItems < allItems.length
      if (!needsToLoadMoreItems) return
      const cmpCtx = jb.ui.ctxOfElem(elem)
      if (!cmpCtx) return
      const itemsToAppend = allItems.slice($state.visualLimit.shownItems, $state.visualLimit.shownItems + pageSize)
      const ctxToRun = cmpCtx.ctx({profile: Object.assign({},cmpCtx.profile,{ items: () => itemsToAppend}), path: ''}) // change the profile to return itemsToAppend
      const vdom = ctxToRun.runItself().renderVdom()
      const itemlistVdom = jb.ui.findIncludeSelf(vdom,'.jb-itemlist')[0]
      if (itemlistVdom) {
        console.log(itemsToAppend,ev)
        jb.ui.appendItems(elem,itemlistVdom,ctx)
        $state.visualLimit.shownItems += itemsToAppend.length
      }
    }),
    templateModifier(({},{vdom}) => vdom.setAttribute('onscroll',true))
  )
})

jb.component('itemlist.init-table', { /* itemlist.initTable */
  type: 'feature',
  impl: features(
    calcProp({
        id: 'items',
        value: pipeline(
          '%$$model.items%',
          slice(0, firstSucceeding('%$$model.visualSizeLimit%', 100))
        )
      }),
    calcProp({id: 'fields', value: '%$$model/controls/field%'}),
    itemlist.initContainerWithItems()
  )
})

jb.component('itemlist.fast-filter', { /* itemlist.fastFilter */
  type: 'feature',
  description: 'use display:hide to filter itemlist elements',
  params: [
    {id: 'showCondition', mandatory: true, dynamic: true, defaultValue: itemlistContainer.conditionFilter()},
    {id: 'filtersRef', mandatory: true, as: 'ref', dynamic: true, defaultValue: '%$itemlistCntrData/search_pattern%'}
  ],
  impl: interactive(
    (ctx,{cmp},{showCondition,filtersRef}) =>
        jb.ui.refObservable(filtersRef(cmp.ctx),cmp,{srcCtx: ctx})
          .subscribe(() => Array.from(cmp.base.querySelectorAll('.jb-item,*>.jb-item,*>*>.jb-item')).forEach(elem=>
                elem.style.display = showCondition(jb.ctxDictionary[elem.getAttribute('jb-ctx')]) ? 'block' : 'none'))
  )
})

jb.component('itemlist.ul-li', { /* itemlist.ulLi */
  type: 'itemlist.style',
  impl: customStyle({
    template: (cmp,{ctrls},h) => h('ul',{ class: 'jb-itemlist'},
        ctrls.map(ctrl=> h('li',
          {class: 'jb-item', 'jb-ctx': jb.ui.preserveCtx(ctrl[0] && ctrl[0].ctx)} ,
          ctrl.map(singleCtrl=>h(singleCtrl))))),
    css: `{ list-style: none; padding: 0; margin: 0;}
    >li { list-style: none; padding: 0; margin: 0;}`,
    features: itemlist.init()
  })
})

jb.component('itemlist.horizontal', { /* itemlist.horizontal */
  type: 'itemlist.style',
  params: [
    {id: 'spacing', as: 'number', defaultValue: 0}
  ],
  impl: customStyle({
    template: (cmp,{ctrls},h) => h('div',{ class: 'jb-drag-parent'},
        ctrls.map(ctrl=> h('div', {class: 'jb-item', 'jb-ctx': jb.ui.preserveCtx(ctrl[0] && ctrl[0].ctx)} ,
          ctrl.map(singleCtrl=>h(singleCtrl))))),
    css: `{display: flex}
        >* { margin-right: %$spacing%px }
        >*:last-child { margin-right:0 }`,
    features: itemlist.init()
  })
})

jb.ui.itemlistInitCalcItems = cmp => cmp.calcItems = cmp.calcItems || (() => Array.from(cmp.base.querySelectorAll('.jb-item,*>.jb-item,*>*>.jb-item'))
    .map(el=>(jb.ctxDictionary[el.getAttribute('jb-ctx')] || {}).data).filter(x=>x))

jb.ui.addSlicedState = (cmp,items,visualLimit) => {
  if (items.length > visualLimit)
    cmp.state.visualLimit = { totalItems: items.length, shownItems: visualLimit }
    return items.slice(0,visualLimit)
}

// ****************** Selection ******************

jb.component('itemlist.selection', { /* itemlist.selection */
  type: 'feature',
  params: [
    {id: 'databind', as: 'ref', defaultValue: '%$itemlistCntrData/selected%', dynamic: true},
    {id: 'selectedToDatabind', dynamic: true, defaultValue: '%%'},
    {id: 'databindToSelected', dynamic: true, defaultValue: '%%'},
    {id: 'onSelection', type: 'action', dynamic: true},
    {id: 'onDoubleClick', type: 'action', dynamic: true},
    {id: 'autoSelectFirst', type: 'boolean'},
    {id: 'cssForSelected', as: 'string', description: 'e.g. background: #bbb', defaultValue: 'background: #bbb !important; color: #fff !important'}
  ],
  impl: (ctx,databind) => ({
    onclick: true,
    ondblclick: true,
    afterViewInit: cmp => {
        cmp.selectionEmitter = new jb.rx.Subject();
        cmp.clickEmitter = cmp.onclick.merge(cmp.ondblclick).map(e=>dataOfElem(e.target)).filter(x=>x)
        cmp.ondblclick.map(e=> dataOfElem(e.target)).filter(x=>x)
          .subscribe(data => ctx.params.onDoubleClick(cmp.ctx.setData(data)))

        jb.ui.itemlistInitCalcItems(cmp)
        cmp.items = cmp.calcItems()

        cmp.setSelected = selected => {
          cmp.state.selected = selected
          if (!cmp.base) return
          Array.from(cmp.base.querySelectorAll('.jb-item.selected,*>.jb-item.selected,*>*>.jb-item.selected'))
            .forEach(elem=>elem.classList.remove('selected'))
          Array.from(cmp.base.querySelectorAll('.jb-item,*>.jb-item,*>*>.jb-item'))
            .filter(elem=> (jb.ctxDictionary[elem.getAttribute('jb-ctx')] || {}).data === selected)
            .forEach(elem=> {elem.classList.add('selected'); elem.scrollIntoViewIfNeeded()})
        }

        cmp.selectionEmitter.merge(cmp.clickEmitter).distinctUntilChanged().filter(x=>x)
          .subscribe( selected => {
              writeSelectedToDatabind(selected);
              cmp.setSelected(selected)
              ctx.params.onSelection(cmp.ctx.setData(selected));
        })

        const selectedRef = databind()

        jb.isWatchable(selectedRef) && jb.ui.refObservable(selectedRef,cmp,{throw: true, srcCtx: ctx})
          .catch(e=>cmp.setSelected(null) || [])
          .subscribe(() => cmp.setSelected(selectedOfDatabind()))

        if (cmp.state.selected && cmp.items.indexOf(cmp.state.selected) == -1) // clean irrelevant selection
          cmp.state.selected = null;
        if (selectedOfDatabind()) //selectedRef && jb.val(selectedRef))
          cmp.setSelected(selectedOfDatabind())
        if (!cmp.state.selected)
          autoSelectFirstWhenEnabled()

        function autoSelectFirstWhenEnabled() {
          if (ctx.params.autoSelectFirst && cmp.items[0] && !jb.val(selectedRef))
              jb.delay(1).then(()=> cmp.selectionEmitter.next(cmp.items[0]))
        }
        function writeSelectedToDatabind(selected) {
          return selectedRef && jb.writeValue(selectedRef,ctx.params.selectedToDatabind(ctx.setData(selected)), ctx)
        }
        function selectedOfDatabind() {
          return selectedRef && jb.val(ctx.params.databindToSelected(ctx.setVars({items: cmp.calcItems()}).setData(jb.val(selectedRef))))
        }
        function dataOfElem(el) {
          const itemElem = jb.ui.closest(el,'.jb-item')
          const ctxId = itemElem && itemElem.getAttribute('jb-ctx')
          return ((ctxId && jb.ctxDictionary[ctxId]) || {}).data
        }
    },
    css: ['>.selected','>*>.selected','>*>*>.selected'].map(sel=>sel+ ' ' + jb.ui.fixCssLine(ctx.params.cssForSelected)).join('\n')
  })
})

jb.component('itemlist.keyboard-selection', { /* itemlist.keyboardSelection */
  type: 'feature',
  macroByValue: false,
  params: [
    {id: 'autoFocus', type: 'boolean'},
    {id: 'onEnter', type: 'action', dynamic: true}
  ],
  impl: ctx => ({
    templateModifier: vdom => {
      vdom.attributes = vdom.attributes || {};
      vdom.attributes.tabIndex = 0
    },
    afterViewInit: cmp => {
        const selectionKeySourceCmp = jb.ui.parentCmps(cmp.base).find(_cmp=>_cmp.selectionKeySource)
        let onkeydown = jb.path(cmp.ctx.vars,'itemlistCntr.keydown') || jb.path(selectionKeySourceCmp,'onkeydown');
        if (!onkeydown) {
          onkeydown = jb.rx.Observable.fromEvent(cmp.base, 'keydown')
          if (ctx.params.autoFocus)
            jb.ui.focus(cmp.base,'itemlist.keyboard-selection init autoFocus',ctx)
        } else {
          onkeydown = onkeydown.merge(jb.rx.Observable.fromEvent(cmp.base, 'keydown'))
        }
        cmp.onkeydown = onkeydown.takeUntil( cmp.destroyed )
        jb.ui.itemlistInitCalcItems(cmp)

        cmp.onkeydown.filter(e=> e.keyCode == 13 && cmp.state.selected)
          .subscribe(() => ctx.params.onEnter(cmp.ctx.setData(cmp.state.selected)));

        cmp.onkeydown.filter(ev => !ev.ctrlKey && (ev.keyCode == 38 || ev.keyCode == 40))
            .map(ev => {
              ev.stopPropagation();
              const diff = ev.keyCode == 40 ? 1 : -1;
              cmp.items = cmp.calcItems()
              const selectedIndex = cmp.items.indexOf(cmp.state.selected) + diff
              return cmp.items[Math.min(cmp.items.length-1,Math.max(0,selectedIndex))];
        }).subscribe(selected => cmp.selectionEmitter && cmp.selectionEmitter.next(selected) )
      },
    })
})

jb.component('itemlist.drag-and-drop', { /* itemlist.dragAndDrop */
  type: 'feature',
  impl: ctx => ({
      afterViewInit: function(cmp) {
        jb.ui.itemlistInitCalcItems(cmp)

        const drake = dragula([cmp.base.querySelector('.jb-drag-parent') || cmp.base] , {
          moves: (el,source,handle) =>
            jb.ui.hasClass(handle,'drag-handle')
        });

        drake.on('drag', function(el, source) {
          cmp.items = cmp.calcItems()
          let item = el.getAttribute('jb-ctx') && jb.ctxDictionary[el.getAttribute('jb-ctx')].data;
          if (!item) {
            const item_comp = el._component || (el.firstElementChild && el.firstElementChild._component);
            item = item_comp && item_comp.ctx.data;
          }
          el.dragged = {
            item,
            remove: item => cmp.items.splice(cmp.items.indexOf(item), 1)
          }
          cmp.selectionEmitter && cmp.selectionEmitter.next(el.dragged.item);
        });
        drake.on('drop', (dropElm, target, source,sibling) => {
            const draggedIndex = cmp.items.indexOf(dropElm.dragged.item);
            const targetIndex = sibling ? jb.ui.index(sibling) : cmp.items.length;
            jb.splice(jb.asRef(cmp.items),[[draggedIndex,1],[targetIndex-1,0,dropElm.dragged.item]],ctx);

            dropElm.dragged = null;
        })
        cmp.dragAndDropActive = true

        // ctrl + Up/Down
//        jb.delay(1).then(_=>{ // wait for the keyboard selection to register keydown
        if (!cmp.onkeydown) return;
          cmp.onkeydown.filter(e=>
            e.ctrlKey && (e.keyCode == 38 || e.keyCode == 40))
            .subscribe(e=> {
              cmp.items = cmp.calcItems()
              const diff = e.keyCode == 40 ? 1 : -1;
              const selectedIndex = cmp.items.indexOf(cmp.state.selected);
              if (selectedIndex == -1) return;
              const index = (selectedIndex + diff+ cmp.items.length) % cmp.items.length;
              const itemsF = jb.path(jb.ctxDictionary,`${cmp.base.getAttribute('jb-ctx')}.params.items`)
              itemsF && jb.splice(jb.asRef(itemsF()),[[selectedIndex,1],[index,0,cmp.state.selected]],ctx);
          })
//        })
      }
    })
})

jb.component('itemlist.drag-handle', { /* itemlist.dragHandle */
  description: 'put on the control inside the item which is used to drag the whole line',
  type: 'feature',
  impl: list(
    css.class('drag-handle'),
    css('{cursor: pointer}')
  )
})

jb.component('itemlist.shown-only-on-item-hover', { /* itemlist.shownOnlyOnItemHover */
  type: 'feature',
  category: 'itemlist:75',
  description: 'put on the control inside the item which is shown when the mouse enters the line',
  impl: (ctx,cssClass,cond) => ({
    class: 'jb-shown-on-item-hover',
  })
})

jb.component('itemlist.divider', { /* itemlist.divider */
  type: 'feature',
  params: [
    {id: 'space', as: 'number', defaultValue: 5}
  ],
  impl: (ctx,space) =>
    ({css: `>.jb-item:not(:first-of-type) { border-top: 1px solid rgba(0,0,0,0.12); padding-top: ${space}px }`})
})
;

(function() {

const createItemlistCntr = (ctx,params) => ({
	id: params.id,
	defaultItem: params.defaultItem,
	filter_data: {},
	filters: [],
	selectedRef: ctx.exp('%$itemlistCntrData/selected%','ref'),
	selected: function(selected) {
		if (!jb.isValid(this.selectedRef)) return;
		return (typeof selected != 'undefined') ?
			jb.writeValue(this.selectedRef,selected,ctx) : jb.val(this.selectedRef)
	},
	reSelectAfterFilter: function(filteredItems) {
		if (filteredItems.indexOf(this.selected()) == -1)
			this.selected(filteredItems[0])
	},
	changeSelectionBeforeDelete: function() {
		if (this.items && this.selected) {
			const curIndex = this.items.indexOf(this.selected);
			if (curIndex == -1)
				this.selected = null;
			else if (curIndex == 0 && this.items.length > 0)
				this.selected = this.items[1];
			else if (this.items.length > 0)
				this.selected = this.items[curIndex -1];
			else
				this.selected = null;
		}
	}
})

jb.component('group.itemlist-container', { /* group.itemlistContainer */
  description: 'itemlist writable container to support addition, deletion and selection',
  type: 'feature',
  category: 'itemlist:80,group:70',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'defaultItem', as: 'single'},
    {id: 'initialSelection', as: 'single'}
  ],
  impl: features(
    variable({
        name: 'itemlistCntrData',
        value: {
          '$': 'object',
          search_pattern: '',
          selected: '%$initialSelection%',
        },
        watchable: true
      }),
    variable({
        name: 'itemlistCntr',
        value: ctx => createItemlistCntr(ctx,ctx.componentContext.params)
      }),
  )
})

jb.component('itemlist.itemlist-selected', { /* itemlist.itemlistSelected */
  type: 'feature',
  category: 'itemlist:20,group:0',
  impl: list(
    group.data('%$itemlistCntrData/selected%'),
    hidden(notEmpty('%$itemlistCntrData/selected%'))
  )
})

jb.component('itemlist-container.filter', { /* itemlistContainer.filter */
  type: 'aggregator',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'updateCounters', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,updateCounters) => {
			if (!ctx.vars.itemlistCntr) return;
			const res = ctx.vars.itemlistCntr.filters.reduce((items,filter) =>
									filter(items), ctx.data || []);
			if (ctx.vars.itemlistCntrData.countAfterFilter != res.length)
				jb.delay(1).then(_=>ctx.vars.itemlistCntr.reSelectAfterFilter(res));
			if (updateCounters) { // use merge
					jb.delay(1).then(_=>{
					jb.writeValue(ctx.exp('%$itemlistCntrData/countBeforeFilter%','ref'),(ctx.data || []).length, ctx);
					jb.writeValue(ctx.exp('%$itemlistCntrData/countBeforeMaxFilter%','ref'),resBeforeMaxFilter.length, ctx);
					jb.writeValue(ctx.exp('%$itemlistCntrData/countAfterFilter%','ref'),res.length, ctx);
			}) } else {
				ctx.vars.itemlistCntrData.countAfterFilter = res.length
			}
			return res;
	}
})

jb.component('itemlist-container.condition-filter', { /* itemlistContainer.conditionFilter */
  type: 'boolean',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  impl: ctx => ctx.vars.itemlistCntr &&
		ctx.vars.itemlistCntr.filters.reduce((res,filter) => res && filter([ctx.data]).length, true)
})

jb.component('itemlist-container.search', { /* itemlistContainer.search */
  type: 'control',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'title', as: 'string', dynamic: true, defaultValue: 'Search'},
    {id: 'searchIn', as: 'string', dynamic: true, defaultValue: itemlistContainer.searchInAllProperties()},
    {id: 'databind', as: 'ref', dynamic: true, defaultValue: '%$itemlistCntrData/search_pattern%'},
    {id: 'style', type: 'editable-text.style', defaultValue: editableText.mdcSearch(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: (ctx,title,searchIn,databind) =>
		jb.ui.ctrl(ctx,{
			afterViewInit: cmp => {
				if (!ctx.vars.itemlistCntr) return;
				const databindRef = databind()

				ctx.vars.itemlistCntr.filters.push( items => {
					const toSearch = jb.val(databindRef) || '';
					if (typeof searchIn.profile == 'function') { // improved performance
						return items.filter(item=>toSearch == '' || searchIn.profile(item).toLowerCase().indexOf(toSearch.toLowerCase()) != -1)
					}

					return items.filter(item=>toSearch == '' || searchIn(ctx.setData(item)).toLowerCase().indexOf(toSearch.toLowerCase()) != -1)
				});
				const keydown_src = new jb.rx.Subject();
				cmp.base.onkeydown = e => {
					if ([38,40,13,27].indexOf(e.keyCode) != -1) { // stop propagation for up down arrows
						keydown_src.next(e);
						return false;
					}
					return true;
				}
				ctx.vars.itemlistCntr.keydown = keydown_src.takeUntil(cmp.destroyed);
			}
		})
})

jb.component('itemlist-container.more-items-button', { /* itemlistContainer.moreItemsButton */
  type: 'control',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'title', as: 'string', dynamic: true, defaultValue: 'show %$delta% more ... (%$itemlistCntrData/countAfterFilter%/%$itemlistCntrData/countBeforeMaxFilter%)'},
    {id: 'delta', as: 'number', defaultValue: 200},
    {id: 'style', type: 'button.style', defaultValue: button.href(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: controlWithFeatures(
    ctx=>jb.ui.ctrl(ctx),
    [
      watchRef('%$itemlistCntrData/maxItems%'),
      defHandler(
        'onclickHandler',
        writeValue(
          '%$itemlistCntrData/maxItems%',
          (ctx,{itemlistCntrData},{delta}) => delta + itemlistCntrData.maxItems
        )
      ),
      calcProp({
        id: 'title',
        value: (ctx,{},{title,delta}) => title(ctx.setVar('delta',delta))
      }),
      ctx => ({
		templateModifier: (vdom,cmp,state) => { // hide the button when not needed
			if (cmp.ctx.exp('%$itemlistCntrData/countBeforeMaxFilter%','number') == cmp.ctx.exp('%$itemlistCntrData/countAfterFilter%','number'))
				return '';
			return vdom;
		}
	  })
    ]
  )
})

jb.ui.extractPropFromExpression = exp => { // performance for simple cases such as %prop1%
	if (exp.match(/^%.*%$/) && !exp.match(/[./[]/))
		return exp.match(/^%(.*)%$/)[1]
}

// match fields in pattern itemlistCntrData/FLDNAME_filter to data
jb.component('itemlist-container.filter-field', { /* itemlistContainer.filterField */
  type: 'feature',
  category: 'itemlist:80',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'fieldData', dynamic: true, mandatory: true},
    {id: 'filterType', type: 'filter-type'}
  ],
  impl: (ctx,fieldData,filterType) => ({
			afterViewInit: cmp => {
				const propToFilter = jb.ui.extractPropFromExpression(ctx.params.fieldData.profile);
				if (propToFilter)
					cmp.itemToFilterData = item => item[propToFilter];
				else
					cmp.itemToFilterData = item => fieldData(ctx.setData(item));

				ctx.vars.itemlistCntr && ctx.vars.itemlistCntr.filters.push(items=>{
						const filterValue = jb.val(ctx.vars.$model.databind());
						if (!filterValue) return items;
						const res = items.filter(item=>filterType.filter(filterValue,cmp.itemToFilterData(item)) );
						if (filterType.sort && (!cmp.state.sortOptions || cmp.state.sortOptions.length == 0) )
							filterType.sort(res,cmp.itemToFilterData,filterValue);
						return res;
				})
		}
	})
})

jb.component('filter-type.text', { /* filterType.text */
  type: 'filter-type',
  params: [
    {id: 'ignoreCase', as: 'boolean', defaultValue: true, type: 'boolean'}
  ],
  impl: (ctx,ignoreCase) => ignoreCase ? ({
		filter: (filter,data) => (data||'').toLowerCase().indexOf((filter||'').toLowerCase()) != -1,
		sort: (items,itemToData,filter) =>  {
			const asWord = new RegExp('\\b' + filter + '\\b','i');
			const score = txt => (asWord.test(txt) ? 5 : 0) + (txt.toLowerCase().indexOf(filter.toLowerCase()) == 0 ? 3 : 0); // higher score for wholeWord or beginsWith
			items.sort((item1,item2)=> score(itemToData(item1) || '') - score(itemToData(item2) || ''))
		}
	}) : ({
		filter: (filter,data) => (data||'').indexOf(filter||'') != -1,
		sort: (items,itemToData,filter) =>  {
			const asWord = new RegExp('\\b' + filter + '\\b');
			const score = txt => (asWord.test(txt) ? 5 : 0) + (txt.indexOf(filter) == 0 ? 3 : 0);
			items.sort((item1,item2)=> score(itemToData(item1) || '') - score(itemToData(item2) || ''))
		}
	})
})

jb.component('filter-type.exact-match', { /* filterType.exactMatch */
  type: 'filter-type',
  impl: ctx => ({
		filter: (filter,data) =>  {
			const _filter = (filter||'').trim(), _data = (data||'').trim();
			return _data.indexOf(_filter) == 0 && _data.length == _filter.length;
		}
	})
})

jb.component('filter-type.numeric', { /* filterType.numeric */
  type: 'filter-type',
  impl: ctx => ({
		filter: (filter,data) => Number(data) >= Number(filter),
		sort: (items,itemToData) => items.sort((item1,item2)=> Number(itemToData(item1)) - Number(itemToData(item2)))
	})
})

jb.component('itemlist-container.search-in-all-properties', { /* itemlistContainer.searchInAllProperties */
  type: 'data',
  category: 'itemlist:40',
  impl: ctx => {
		if (typeof ctx.data == 'string') return ctx.data;
		if (typeof ctx.data != 'object') return '';
		return jb.entries(ctx.data).map(e=>e[1]).filter(v=>typeof v == 'string').join('#');
	}
})


})()
;

jb.ns('menuStyle')
jb.ns('menuSeparator')
jb.ns('mdc')

jb.component('menu.menu', { /* menu.menu */
  type: 'menu.option',
  params: [
    {id: 'title', as: 'string', dynamic: true, mandatory: true},
    {id: 'options', type: 'menu.option[]', dynamic: true, flattenArray: true, mandatory: true, defaultValue: []},
    {id: 'optionsFilter', type: 'data', dynamic: true, defaultValue: '%%'}
  ],
  impl: ctx => ({
		options: ctx2 => ctx.params.optionsFilter(ctx.setData(ctx.params.options(ctx2))),
		title: ctx.params.title(),
		applyShortcut: function(e) {
			return this.options().reduce((res,o)=> res || (o.applyShortcut && o.applyShortcut(e)),false)
		},
		ctx
	})
})

jb.component('menu.options-group', { /* menu.optionsGroup */
  type: 'menu.option',
  params: [
    {id: 'options', type: 'menu.option[]', dynamic: true, flattenArray: true, mandatory: true}
  ],
  impl: (ctx,options) => options()
})

jb.component('menu.dynamic-options', { /* menu.dynamicOptions */
  type: 'menu.option',
  params: [
    {id: 'items', type: 'data', as: 'array', mandatory: true, dynamic: true},
    {id: 'genericOption', type: 'menu.option', mandatory: true, dynamic: true}
  ],
  impl: (ctx,items,generic) => items().map(item => generic(ctx.setData(item)))
})

jb.component('menu.end-with-separator', { /* menu.endWithSeparator */
  type: 'menu.option',
  params: [
    {id: 'options', type: 'menu.option[]', dynamic: true, flattenArray: true, mandatory: true},
    {id: 'separator', type: 'menu.option', as: 'array', defaultValue: menu.separator()},
    {id: 'title', as: 'string'}
  ],
  impl: (ctx) => {
		const options = ctx.params.options();
		if (options.length > 0)
			return options.concat(ctx.params.separator)
		return []
	}
})


jb.component('menu.separator', { /* menu.separator */
  type: 'menu.option',
  impl: ctx => ({ separator: true })
})

jb.component('menu.action', { /* menu.action */
  type: 'menu.option',
  params: [
    {id: 'title', as: 'string', dynamic: true, mandatory: true},
    {id: 'action', type: 'action', dynamic: true, mandatory: true},
    {id: 'icon', as: 'string'},
    {id: 'shortcut', as: 'string'},
    {id: 'showCondition', type: 'boolean', as: 'boolean', defaultValue: true}
  ],
  impl: ctx => ctx.params.showCondition && ({
			leaf : ctx.params,
			action: _ => ctx.params.action(ctx.setVars({topMenu:null})), // clean topMenu from context after the action
			title: ctx.params.title(ctx),
			applyShortcut: e=> {
				if (jb.ui.checkKey(e,ctx.params.shortcut)) {
					e.stopPropagation();
					ctx.params.action();
					return true;
				}
			},
			ctx
		})
})

// ********* actions / controls ************

jb.component('menu.control', { /* menu.control */
  type: 'control,clickable,menu',
  params: [
    {id: 'menu', type: 'menu.option', dynamic: true, mandatory: true},
    {id: 'style', type: 'menu.style', defaultValue: menuStyle.contextMenu(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => {
		const menuModel = ctx.params.menu() || { options: [], ctx, title: ''};
    return jb.ui.ctrl(ctx.setVars({	topMenu: ctx.vars.topMenu || { popups: []},	menuModel	}), features(
      () => ({ctxForPick: menuModel.ctx }),
      calcProp('title','%$menuModel.title%'),
    ))
	}
})

jb.component('menu.open-context-menu', { /* menu.openContextMenu */
  type: 'action',
  params: [
    {id: 'menu', type: 'menu.option', dynamic: true, mandatory: true},
    {id: 'popupStyle', type: 'dialog.style', dynamic: true, defaultValue: dialog.contextMenuPopup()},
    {id: 'features', type: 'dialog-feature[]', dynamic: true}
  ],
  impl: openDialog({
    style: call('popupStyle'),
    content: menu.control({menu: call('menu'), style: menuStyle.contextMenu()}),
    features: call('features')
  })
})

// ********* styles ************

jb.component('menu-style.pulldown', { /* menuStyle.pulldown */
  type: 'menu.style',
  params: [
    {id: 'innerMenuStyle', type: 'menu.style', dynamic: true, defaultValue: menuStyle.popupAsOption()},
    {id: 'leafOptionStyle', type: 'menu-option.style', dynamic: true, defaultValue: menuStyle.optionLine()},
    {id: 'layout', type: 'group.style', dynamic: true, defaultValue: itemlist.horizontal()}
  ],
  impl: styleByControl(
    Var('optionsParentId', ctx => ctx.id),
    Var('innerMenuStyle', ctx => ctx.componentContext.params.innerMenuStyle),
    Var('leafOptionStyle', ctx => ctx.componentContext.params.leafOptionStyle),
    itemlist({
      vars: [
        Var('optionsParentId', ctx => ctx.id),
        Var('innerMenuStyle', ctx => ctx.componentContext.params.innerMenuStyle),
        Var('leafOptionStyle', ctx => ctx.componentContext.params.leafOptionStyle)
      ],
      items: ctx => ctx.vars.menuModel.options && ctx.vars.menuModel.options().filter(x=>x) || [],
      controls: menu.control({menu: '%$item%', style: menuStyle.popupThumb()}),
      style: call('layout'),
      features: menu.selection()
    })
  )
})

jb.component('menu-style.context-menu', { /* menuStyle.contextMenu */
  type: 'menu.style',
  params: [
    {id: 'leafOptionStyle', type: 'menu-option.style', dynamic: true, defaultValue: menuStyle.optionLine()}
  ],
  impl: styleByControl(
    Var('optionsParentId', ctx => ctx.id),
    Var('leafOptionStyle', ctx => ctx.componentContext.params.leafOptionStyle),
    itemlist({
      vars: [
        Var('optionsParentId', ctx => ctx.id),
        Var('leafOptionStyle', ctx => ctx.componentContext.params.leafOptionStyle)
      ],
      items: ctx => ctx.vars.menuModel.options && ctx.vars.menuModel.options().filter(x=>x) || [],
      controls: menu.control({menu: '%$item%', style: menuStyle.applyMultiLevel({})}),
      features: menu.selection(true)
    })
  )
})


jb.component('menu.init-popup-menu', { /* menu.initPopupMenu */
  type: 'feature',
  params: [
    {id: 'popupStyle', type: 'dialog.style', dynamic: true, defaultValue: dialog.contextMenuPopup()}
  ],
  impl: features(
    () => ({destroy: cmp => cmp.closePopup()}),
    calcProp({id: 'title', value: '%$menuModel.title%'}),
    interactive(
        (ctx,{cmp}) => {
				cmp.mouseEnter = _ => {
					if (jb.ui.find(ctx,'.context-menu-popup')[0]) // first open with click...
  					cmp.openPopup()
				};
				cmp.openPopup = jb.ui.wrapWithLauchingElement( ctx2 => {
					cmp.ctx.vars.topMenu.popups.push(ctx.vars.menuModel);
					ctx2.run( {$: 'menu.open-context-menu',
							popupStyle: _ctx => ctx.componentContext.params.popupStyle(_ctx),
							menu: _ctx =>	ctx.vars.$model.menu()
						})
					}, cmp.ctx, cmp.base );

				cmp.closePopup = () => jb.ui.dialogs.closeDialogs(jb.ui.dialogs.dialogs
              .filter(d=>d.id == ctx.vars.optionsParentId))
              .then(()=> cmp.ctx.vars.topMenu.popups.pop()),

				jb.delay(1).then(_=>{ // wait for topMenu keydown initalization
					if (ctx.vars.topMenu && ctx.vars.topMenu.keydown) {
						const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );

							keydown.filter(e=>e.keyCode == 39) // right arrow
									.subscribe(_=>{
										if (ctx.vars.topMenu.selected == ctx.vars.menuModel && cmp.openPopup)
											cmp.openPopup();
									})
							keydown.filter(e=>e.keyCode == 37) // left arrow
									.subscribe(_=>{
										if (cmp.ctx.vars.topMenu.popups.slice(-1)[0] == ctx.vars.menuModel) {
											ctx.vars.topMenu.selected = ctx.vars.menuModel;
											cmp.closePopup();
										}
									})
						}
				})
			}
      )
  )
})

jb.component('menu.init-menu-option', { /* menu.initMenuOption */
  type: 'feature',
  impl: features(
    calcProp({id: 'title', value: '%$menuModel.leaf.title%'}),
    calcProp({id: 'icon', value: '%$menuModel.leaf.icon%'}),
    calcProp({id: 'shortcut', value: '%$menuModel.leaf.shortcut%'}),
    interactive(
        (ctx,{cmp}) => {
			// const leafParams = ctx.vars.menuModel.leaf;
			// 		cmp.setState({title:  leafParams.title() ,icon : leafParams.icon ,shortcut: leafParams.shortcut});
			cmp.action = jb.ui.wrapWithLauchingElement( () =>
            jb.ui.dialogs.closePopups()
//              .then(()=>jb.delay(50))
              .then(() =>	ctx.vars.menuModel.action())
					, ctx, cmp.base);

				jb.delay(1).then(_=>{ // wait for topMenu keydown initalization
				if (ctx.vars.topMenu && ctx.vars.topMenu.keydown) {
					const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );
						keydown.filter(e=>e.keyCode == 13 && ctx.vars.topMenu.selected == ctx.vars.menuModel) // Enter
								.subscribe(_=> cmp.action())
				}
			})
		}
      )
  )
})

jb.component('menu-style.apply-multi-level', { /* menuStyle.applyMultiLevel */
  type: 'menu.style',
  params: [
    {id: 'menuStyle', type: 'menu.style', dynamic: true, defaultValue: menuStyle.popupAsOption()},
    {id: 'leafStyle', type: 'menu.style', dynamic: true, defaultValue: menuStyle.optionLine()},
    {id: 'separatorStyle', type: 'menu.style', dynamic: true, defaultValue: menuSeparator.line()}
  ],
  impl: ctx => {
			if (ctx.vars.menuModel.leaf)
				return ctx.vars.leafOptionStyle ? ctx.vars.leafOptionStyle(ctx) : ctx.params.leafStyle();
			else if (ctx.vars.menuModel.separator)
				return ctx.params.separatorStyle()
			else if (ctx.vars.innerMenuStyle)
				return ctx.vars.innerMenuStyle(ctx)
			else
				return ctx.params.menuStyle();
		}
})

// jb.component('menu.apply-context-menu-shortcuts', {
//   type: 'feature',
//   impl: ctx => ({
//   	 onkeydown: true,
//      afterViewInit: cmp => {
//         cmp.base.setAttribute('tabIndex','0');
//         if (!ctx.vars.topMenu.keydown) {
//   	        ctx.vars.topMenu.keydown = cmp.onkeydown;
//             jb.ui.focus(cmp.base,'menu.keyboard init autoFocus',ctx);
//       	};
//         const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );
//         keydown.subscribe(e=>cmp.ctx.vars.topMenu.applyShortcut(e))
//       }
//     })
// })

jb.component('menu.selection', { /* menu.selection */
  type: 'feature',
  params: [
    {id: 'autoSelectFirst', type: 'boolean'}
  ],
  impl: ctx => ({
    onkeydown: true,
    onmousemove: true,
		templateModifier: vdom => {
				vdom.attributes = vdom.attributes || {};
				vdom.attributes.tabIndex = 0
    },
		afterViewInit: cmp => {
				// putting the emitter at the top-menu only and listen at all sub menus
				if (!ctx.vars.topMenu.keydown) {
					ctx.vars.topMenu.keydown = cmp.onkeydown;
						jb.ui.focus(cmp.base,'menu.keyboard init autoFocus',ctx);
			  }
      cmp.items = Array.from(cmp.base.querySelectorAll('.jb-item,*>.jb-item,*>*>.jb-item'))
        .map(el=>(jb.ctxDictionary[el.getAttribute('jb-ctx')] || {}).data)

			const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );
      cmp.onmousemove.map(e=> dataOfElems(e.target.ownerDocument.elementsFromPoint(e.pageX, e.pageY)))
        .filter(x=>x).filter(data => data != ctx.vars.topMenu.selected)
        .subscribe(data => cmp.select(data))
			keydown.filter(e=> e.keyCode == 38 || e.keyCode == 40 )
					.map(event => {
						event.stopPropagation();
						const diff = event.keyCode == 40 ? 1 : -1;
						const items = cmp.items.filter(item=>!item.separator);
						const selectedIndex = ctx.vars.topMenu.selected.separator ? 0 : items.indexOf(ctx.vars.topMenu.selected);
						if (selectedIndex != -1)
							return items[(selectedIndex + diff + items.length) % items.length];
				}).filter(x=>x).subscribe(data => cmp.select(data))

			keydown.filter(e=>e.keyCode == 27) // close all popups
					.subscribe(_=> jb.ui.dialogs.closePopups().then(()=> {
              cmp.ctx.vars.topMenu.popups = [];
              cmp.ctx.run({$:'tree.regain-focus'}) // very ugly
          }))

      cmp.select = selected => {
				ctx.vars.topMenu.selected = selected
        if (!cmp.base) return
        Array.from(cmp.base.querySelectorAll('.jb-item.selected, *>.jb-item.selected'))
          .forEach(elem=>elem.classList.remove('selected'))
        Array.from(cmp.base.querySelectorAll('.jb-item, *>.jb-item'))
          .filter(elem=> (jb.ctxDictionary[elem.getAttribute('jb-ctx')] || {}).data === selected)
          .forEach(elem=> elem.classList.add('selected'))
      }
			cmp.state.selected = ctx.vars.topMenu.selected;
			if (ctx.params.autoSelectFirst && cmp.items[0])
            cmp.select(cmp.items[0])

      function dataOfElems(elems) {
        const itemElem = elems.find(el=>el.classList && el.classList.contains('jb-item'))
        const ctxId = itemElem && itemElem.getAttribute('jb-ctx')
        return ((ctxId && jb.ctxDictionary[ctxId]) || {}).data
      }
		},
		// extendItem: (cmp,vdom,data) => {
		// 		jb.ui.toggleClassInVdom(vdom,'selected', ctx.vars.topMenu.selected == data);
		// },
		css: '>.selected { background: #bbb !important; color: #fff !important }',
		})
})

jb.component('menu-style.option-line', { /* menuStyle.optionLine */
  type: 'menu-option.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'line noselect', onmousedown: 'action'
			},[
				h('i',{class:'material-icons'},state.icon),
				h('span',{class:'title'},state.title),
				h('span',{class:'shortcut'},state.shortcut),
        h('div',{class: 'mdc-line-ripple' }),
		]),
    css: `{ display: flex; cursor: pointer; font: 13px Arial; height: 24px}
				.selected { background: #d8d8d8 }
				>i { width: 24px; padding-left: 3px; padding-top: 3px; font-size:16px; }
				>span { padding-top: 3px }
						>.title { display: block; text-align: left; white-space: nowrap; }
				>.shortcut { margin-left: auto; text-align: right; padding-right: 15px }`,
    features: [menu.initMenuOption(), mdc.rippleEffect()]
  })
})

jb.component('menu.option-as-icon24', { /* menu.optionAsIcon24 */
  type: 'menu-option.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'line noselect', onclick: true, title: state.title
			},[
				h('i',{class:'material-icons'},state.icon),
		]),
    css: `{ display: flex; cursor: pointer; height: 24px}
				>i { width: 24px; padding-left: 3px; padding-top: 3px; font-size:16px; }`
  })
})

jb.component('menu-style.popup-as-option', { /* menuStyle.popupAsOption */
  type: 'menu.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'line noselect', onmousedown: 'action'
			},[
				h('span',{class:'title'},state.title),
				h('i',{class:'material-icons', onmouseenter: 'openPopup' },'play_arrow'),
		]),
    css: `{ display: flex; cursor: pointer; font: 13px Arial; height: 24px}
				>i { width: 100%; text-align: right; font-size:16px; padding-right: 3px; padding-top: 3px; }
						>.title { display: block; text-align: left; padding-top: 3px; padding-left: 26px; white-space: nowrap; }
			`,
    features: menu.initPopupMenu(dialog.contextMenuPopup(-24, true))
  })
})

jb.component('menu-style.popup-thumb', { /* menuStyle.popupThumb */
  type: 'menu.style',
  description: 'used for pulldown',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'pulldown-top-menu-item',
				onmouseenter: 'mouseEnter',
				onclick: 'openPopup'
		},state.title),
    features: [menu.initPopupMenu(), mdc.rippleEffect()]
  })
})

jb.component('dialog.context-menu-popup', { /* dialog.contextMenuPopup */
  type: 'dialog.style',
  params: [
    {id: 'offsetTop', as: 'number'},
    {id: 'rightSide', as: 'boolean', type: 'boolean'}
  ],
  impl: customStyle({
    template: (cmp,state,h) => h('div',{ class: 'jb-dialog jb-popup context-menu-popup pulldown-mainmenu-popup'},
				h(state.contentComp)),
    features: [
      dialogFeature.uniqueDialog('%$optionsParentId%', false),
      dialogFeature.maxZIndexOnClick(),
      dialogFeature.closeWhenClickingOutside(),
      dialogFeature.cssClassOnLaunchingElement(),
      dialogFeature.nearLauncherPosition({
        offsetTop: '%$offsetTop%',
        rightSide: '%$rightSide%'
      })
    ]
  })
})

jb.component('menu-separator.line', { /* menuSeparator.line */
  type: 'menu-separator.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div'),
    css: '{ margin: 6px 0; border-bottom: 1px solid #EBEBEB;}'
  })
})
;

jb.ns('picklist')

jb.component('picklist', { /* picklist */
  type: 'control',
  category: 'input:80',
  params: [
    {id: 'title', as: 'string', dynamic: true},
    {id: 'databind', as: 'ref', mandaroy: true, dynamic: true},
    {id: 'options', type: 'picklist.options', dynamic: true, mandatory: true, defaultValue: {'$': 'picklist.options-by-comma', '$byValue': []}},
    {id: 'promote', type: 'picklist.promote', dynamic: true},
    {id: 'style', type: 'picklist.style', defaultValue: picklist.native(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx =>
    jb.ui.ctrl(ctx,features(
      calcProps( () => {
          var options = ctx.params.options(ctx);
          var groupsHash = {};
          var promotedGroups = (ctx.params.promote() || {}).groups || [];
          var groups = [];
          options.filter(x=>x.text).forEach(o=>{
            var groupId = groupOfOpt(o);
            var group = groupsHash[groupId] || { options: [], text: groupId};
            if (!groupsHash[groupId]) {
              groups.push(group);
              groupsHash[groupId] = group;
            }
            group.options.push({text: (o.text||'').split('.').pop(), code: o.code });
          })
          groups.sort((p1,p2)=>promotedGroups.indexOf(p2.text) - promotedGroups.indexOf(p1.text));
          return {
            groups: groups,
            options: options,
            hasEmptyOption: options.filter(x=>!x.text)[0]
          }
      }),
      // interactive((_ctx,{cmp}) => {
      //   if (cmp.databindRefChanged) jb.ui.databindObservable(cmp,{srcCtx: ctx})
      //     .subscribe(e=>cmp.onChange && cmp.onChange(_ctx.setData(jb.val(e.ref))))
      //   else jb.ui.refObservable(ctx.params.databind(),cmp,{srcCtx: ctx}).subscribe(e=>
      //     cmp.onChange && cmp.onChange(_ctx.setData(jb.val(e.ref))))
      // })
    ))
})

function groupOfOpt(opt) {
  if (!opt.group && opt.text.indexOf('.') == -1)
    return '---';
  return opt.group || opt.text.split('.').shift();
}

jb.component('picklist.dynamic-options', { /* picklist.dynamicOptions */
  type: 'feature',
  params: [
    {id: 'recalcEm', as: 'single'}
  ],
  impl: interactive(
    (ctx,{cmp},{recalcEm}) =>
      recalcEm && recalcEm.subscribe && recalcEm.takeUntil( cmp.destroyed ).subscribe(() => cmp.refresh())
  )
})

jb.component('picklist.onChange', { /* picklist.onChange */
  type: 'feature',
  description: 'action on picklist selection',
  params: [
    {id: 'action', type: 'action', dynamic: true}
  ],
  impl: interactive(
    (ctx,{cmp},{action}) => cmp.onChange = action
  )
})

// ********* options

jb.component('picklist.optionsByComma', { /* picklist.optionsByComma */
  type: 'picklist.options',
  params: [
    {id: 'options', as: 'string', mandatory: true},
    {id: 'allowEmptyValue', type: 'boolean'}
  ],
  impl: function(ctx,options,allowEmptyValue) {
    const emptyValue = allowEmptyValue ? [{code:'',value:''}] : [];
    return emptyValue.concat((options||'').split(',').map(code=> ({ code: code, text: code })));
  }
})

jb.component('picklist.options', { /* picklist.options */
  type: 'picklist.options',
  params: [
    {id: 'options', type: 'data', as: 'array', mandatory: true},
    {id: 'allowEmptyValue', type: 'boolean'}
  ],
  impl: function(context,options,allowEmptyValue) {
    const emptyValue = allowEmptyValue ? [{code:'',value:''}] : [];
    return emptyValue.concat(options.map(code=> ({ code: code, text: code })));
  }
})

jb.component('picklist.coded-options', { /* picklist.codedOptions */
  type: 'picklist.options',
  params: [
    {id: 'options', as: 'array', mandatory: true},
    {id: 'code', as: 'string', dynamic: true, mandatory: true},
    {id: 'text', as: 'string', dynamic: true, mandatory: true},
    {id: 'allowEmptyValue', type: 'boolean'}
  ],
  impl: function(ctx,options,code,text,allowEmptyValue) {
    const emptyValue = allowEmptyValue ? [{code:'',value:''}] : [];
    return emptyValue.concat(options.map(option => ({ code: code(null,option), text: text(null,option) })))
  }
})

jb.component('picklist.sorted-options', { /* picklist.sortedOptions */
  type: 'picklist.options',
  params: [
    {id: 'options', type: 'picklist.options', dynamic: true, mandatory: true, composite: true},
    {id: 'marks', as: 'array', description: 'e.g input:80,group:90. 0 mark means hidden. no mark means 50'}
  ],
  impl: (ctx,optionsFunc,marks) => {
    let options = optionsFunc() || [];
    marks.forEach(mark=> {
        const option = options.filter(opt=>opt.code == mark.code)[0];
        if (option)
          option.mark = Number(mark.mark || 50);
    });
    options = options.filter(op=>op.mark != 0);
    options.sort((o1,o2)=>(o2.mark || 50) - (o1.mark || 50));
    return options;
  }
})

jb.component('picklist.promote', { /* picklist.promote */
  type: 'picklist.promote',
  params: [
    {id: 'groups', as: 'array'},
    {id: 'options', as: 'array'}
  ],
  impl: ctx => ctx.params
})
;

jb.type('theme');

jb.component('group.theme', { /* group.theme */
  type: 'feature',
  params: [
    {id: 'theme', type: 'theme'}
  ],
  impl: (context,theme) => ({
    extendCtx: (ctx,cmp) => ctx.setVars(theme)
  })
})

jb.component('theme.material-design', { /* theme.materialDesign */
  type: 'theme',
  impl: () => ({
  	'$theme.editable-text': 'editable-text.mdc-input'
  })
})
;

jb.ns('icon')

jb.component('material-icon', { /* materialIcon */
  type: 'control',
  category: 'control:50',
  params: [
    {id: 'icon', as: 'string', mandatory: true},
    {id: 'title', as: 'string'},
    {id: 'style', type: 'icon.style', dynamic: true, defaultValue: icon.material()},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => jb.ui.ctrl(ctx, calcProp('icon','%$$model/icon%'))
})

jb.component('icon.material', { /* icon.material */
  type: 'icon-with-action.style',
  impl: customStyle(
    (cmp,{icon},h) => h('i',{ class: 'material-icons' }, icon)
  )
})
;

jb.ns('slider')

jb.component('editable-number.slider-no-text', { /* editableNumber.sliderNoText */
  type: 'editable-number.style',
  impl: customStyle({
    template: (cmp,state,h) => h('input',{ type: 'range',
        min: state.min, max: state.max, step: state.step,
        value: state.databind, mouseup: 'onblurHandler', tabindex: -1}),
    features: [field.databind(), slider.init()]
  })
})

jb.component('editable-number.slider', { /* editableNumber.slider */
  type: 'editable-number.style',
  impl: styleByControl(
    group({
      title: '%$editableNumberModel/title%',
      controls: group({
        layout: layout.horizontal(20),
        controls: [
          editableText({
            databind: '%$editableNumberModel/databind%',
            style: editableText.mdcNoLabel(36),
            features: [slider.handleArrowKeys(), css.margin(-3)]
          }),
          editableNumber({
            databind: '%$editableNumberModel/databind%',
            style: editableNumber.sliderNoText(),
            features: css.width(80)
          })
        ],
        features: variable({name: 'sliderCtx', value: {'$': 'object'}})
      })
    }),
    'editableNumberModel'
  )
})

jb.component('slider.init', { /* slider.init */
  type: 'feature',
  impl: ctx => ({
      onkeyup: true,
      onkeydown: true,
      onmouseup: true,
      onmousedown: true,
      onmousemove: true,
      afterViewInit: cmp => {

          cmp.handleArrowKey = e => {
              var val = Number(cmp.jbModel()) || 0;
              if (e.keyCode == 46) // delete
                jb.writeValue(ctx.vars.$model.databind(),null, ctx);
              if ([37,39].indexOf(e.keyCode) != -1) {
                var inc = e.shiftKey ? 9 : 1;
                if (val !=null && e.keyCode == 39)
                  cmp.jbModel(Math.min(cmp.max,val+inc));
                if (val !=null && e.keyCode == 37)
                  cmp.jbModel(Math.max(cmp.min,val-inc));
              }
          }

          cmp.__refresh =  _=> {
            var val = cmp.jbModel() !=null && Number(cmp.jbModel());
            cmp.max = Math.max.apply(0,[ctx.vars.$model.max,val,cmp.max].filter(x=>x!=null));
            cmp.min = Math.min.apply(0,[ctx.vars.$model.min,val,cmp.min].filter(x=>x!=null));
            if (val == cmp.max && ctx.vars.$model.autoScale)
              cmp.max += cmp.max - cmp.min;
            if (val == cmp.min && ctx.vars.$model.autoScale)
              cmp.min -= cmp.max - cmp.min;

            jb.ui.setState(cmp,{ min: cmp.min, max: cmp.max, step: ctx.vars.$model.step, val: cmp.jbModel() },null,ctx);
          },

          cmp.onkeydown.subscribe(e=> cmp.handleArrowKey(e));

          // drag
          cmp.onmousedown.flatMap(e=>
            cmp.onmousemove.takeUntil(cmp.onmouseup)
            ).subscribe(e=>cmp.jbModel(cmp.base.value))

          if (ctx.vars.sliderCtx) // supporting left/right arrow keys in the text field as well
            ctx.vars.sliderCtx.handleArrowKey = e => cmp.handleArrowKey(e);
        }
    })
})

jb.component('slider.handle-arrow-keys', { /* slider.handleArrowKeys */
  type: 'feature',
  impl: ctx => ({
      onkeyup: true,
      onkeydown: true,
      afterViewInit: cmp => {
          jb.delay(1).then(_=>{
            var sliderCtx = ctx.vars.sliderCtx;
            if (sliderCtx)
              cmp.onkeydown.subscribe(e=>sliderCtx.handleArrowKey(e));
          })
      }
    })
})

jb.component('slider.edit-as-text-popup', { /* slider.editAsTextPopup */
  type: 'feature',
  impl: openDialog({
    style: dialog.popup(),
    content: group({
      title: 'data-settings',
      layout: layout.vertical(3),
      controls: [
        editableText({
          title: '%title%',
          databind: '%databind%',
          style: editableText.mdcInput('270'),
          features: feature.onEnter(dialog.closeContainingPopup())
        })
      ],
      features: [group.data('%$editableNumber%'), css.padding({left: '10', right: '10'})]
    }),
    features: [
      dialogFeature.uniqueDialog('slider', false),
      dialogFeature.maxZIndexOnClick(),
      dialogFeature.closeWhenClickingOutside(),
      dialogFeature.cssClassOnLaunchingElement(),
      dialogFeature.nearLauncherPosition({}),
      dialogFeature.autoFocusOnFirstInput(true)
    ]
  })
})

;

jb.ns('table')

jb.component('table', { /* table */
  type: 'control,table',
  category: 'group:80,common:70',
  params: [
    {id: 'title', as: 'string'},
    {id: 'items', as: 'array', dynamic: true, mandatory: true},
    {id: 'fields', type: 'table-field[]', mandatory: true, dynamic: true},
    {id: 'style', type: 'table.style', dynamic: true, defaultValue: table.plain()},
    {id: 'visualSizeLimit', as: 'number', defaultValue: 100, description: 'by default table is limmited to 100 shown items'},
    {id: 'features', type: 'feature[]', dynamic: true, flattenArray: true}
  ],
  impl: ctx =>
    jb.ui.ctrl(ctx)
})

jb.component('field', { /* field */
  type: 'table-field',
  params: [
    {id: 'title', as: 'string', mandatory: true},
    {id: 'data', as: 'string', mandatory: true, dynamic: true},
    {id: 'hoverTitle', as: 'string', dynamic: true},
    {id: 'width', as: 'number'},
    {id: 'numeric', as: 'boolean', type: 'boolean'},
    {id: 'extendItems', as: 'boolean', type: 'boolean', description: 'extend the items with the calculated field using the title as field name'},
    {id: 'class', as: 'string'}
  ],
  impl: (ctx,title,data,hoverTitle,width,numeric,extendItems,_class) => ({
    title: () => title,
    fieldData: row => extendItems ? row[title] : data(ctx.setData(row)),
    calcFieldData: row => data(ctx.setData(row)),
    hoverTitle: hoverTitle.profile ? (row => hoverTitle(ctx.setData(row))) : null,
    class: _class,
    width: width,
    numeric: numeric,
    extendItems: extendItems,
    ctxId: jb.ui.preserveCtx(ctx)
  })
})

jb.component('field.index', { /* field.index */
  type: 'table-field',
  params: [
    {id: 'title', as: 'string', defaultValue: 'index'},
    {id: 'width', as: 'number', defaultValue: 10},
    {id: 'class', as: 'string'}
  ],
  impl: (ctx,title) => ({
    title: () => title,
    fieldData: (row,index) => index,
    class: _class,
    width: width,
    numeric: true,
    ctxId: jb.ui.preserveCtx(ctx)
  })
})

jb.component('field.control', { /* field.control */
  type: 'table-field',
  params: [
    {id: 'title', as: 'string', mandatory: true},
    {id: 'control', type: 'control', dynamic: true, mandatory: true, defaultValue: text('')},
    {id: 'width', as: 'number'},
    {id: 'dataForSort', dynamic: true},
    {id: 'numeric', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,title,control,width,dataForSort,numeric) => ({
    title: () => title,
    control: row => control(ctx.setData(row)),
    width: width,
    fieldData: row => dataForSort(ctx.setData(row)),
    numeric: numeric,
    ctxId: jb.ui.preserveCtx(ctx)
  })
})

// todo - move to styles

jb.component('button.table-cell-href', { /* button.tableCellHref */
  type: 'button.style',
  impl: customStyle({
    template: (cmp,state,h) => h('a',{href: 'javascript:;', onclick: true}, state.title),
    css: '{color: grey}'
  })
})

jb.component('table.init-table-or-itemlist', { /* table.initTableOrItemlist */
  type: 'feature',
  impl: ctx => ctx.run(ctx.vars.$model.fields ? table.init() : itemlist.initTable())
})

jb.component('table.init', { /* table.init */
  type: 'feature',
  category: 'table:10',
  impl: features(
    calcProp({id: 'fields', value: '%$$model.fields%'}),
    calcProp({
        id: 'updateItemlistCntr',
        value: writeValue('%$itemlistCntr.items%', '%$$props.items%'),
        phase: 100
      }),
    calcProp({
        id: 'items',
        value: pipeline(
          '%$$model.items%',
          slice(0, firstSucceeding('%$$model.visualSizeLimit%', 100))
        )
      }),
    interactiveProp(
        'items',
        pipeline(
          '%$$model.items%',
          slice(0, firstSucceeding('%$$model.visualSizeLimit%', 100))
        )
      )
  )
})

jb.component('table.init-sort', { /* table.initSort */
  type: 'feature',
  impl: ctx => ({
      afterViewInit: cmp => {
        cmp.toggleSort = ev => {
          const field = cmp.renderProps.fields[ev.currentTarget.getAttribute('fieldIndex')]
          const sortOptions = cmp.renderProps.sortOptions || [];
          var option = sortOptions.filter(o=>o.field == field)[0];
          if (!option)
            sortOptions = [{field: field,dir: 'none'}].concat(sortOptions).slice(0,2);
          option = sortOptions.filter(o=>o.field == field)[0];

          var directions = ['none','asc','des'];
          option.dir = directions[(directions.indexOf(option.dir)+1)%directions.length];
          if (option.dir == 'none')
            sortOptions.splice(sortOptions.indexOf(option),1);
          cmp.refresh({sortOptions: sortOptions});
        }
        cmp.sortItems = () => {
          if (!cmp.items || !cmp.renderProps.sortOptions || cmp.renderProps.sortOptions.length == 0) return;
          cmp.items.forEach((item,index)=>cmp.renderProps.sortOptions.forEach(o=> 
              item['$jb_$sort_'+o.field.title] = o.field.fieldData(item,index)));
          var major = cmp.renderProps.sortOptions[0], minor = cmp.renderProps.sortOptions[1];
          if (!minor)
            cmp.items.sort(sortFunc(major))
          else {
            var compareMajor = sortFunc(major), compareMinor = sortFunc(minor);
            var majorProp = '$jb_$sort_'+ major.field.title;
            cmp.items.sort((x,y)=> x[majorProp] == y[majorProp] ? compareMinor(x,y) : compareMajor(x,y) );
          }

          function sortFunc(option) {
            var prop = '$jb_$sort_'+ option.field.title;
            if (option.field.numeric)
              var SortFunc = (x,y) => x[prop] - y[prop]
            else
              var SortFunc = (x,y) => 
                x[prop] == y[prop] ? 0 : (x[prop] < y[prop] ? -1 : 1);
            if (option.dir == 'asc') 
              return SortFunc;
            return (x,y) => SortFunc(y,x);
          }

        }
      }
  })
})
;

jb.component('goto-url', { /* gotoUrl */
  type: 'action',
  description: 'navigate/open a new web page, change href location',
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'target', type: 'enum', values: ['new tab', 'self'], defaultValue: 'new tab', as: 'string'}
  ],
  impl: (ctx,url,target) => {
		var _target = (target == 'new tab') ? '_blank' : '_self';
		if (!ctx.probe)
			window.open(url,_target);
	}
})

;

jb.ns('mdc,mdc-style')

jb.component('mdc-style.init-dynamic', { /* mdcStyle.initDynamic */
  type: 'feature',
  params: [
    {id: 'query', as: 'string'}
  ],
  impl: ctx => ({
    afterViewInit: cmp => {
      if (!jb.ui.material) return jb.logError('please load mdc library')
      cmp.mdc_comps = cmp.mdc_comps || []
      if (cmp.base.classList.contains('mdc-text-field'))
        cmp.mdc_comps.push(new jb.ui.material.MDCTextField(cmp.base))
      else if (cmp.base.classList.contains('mdc-button') || cmp.base.classList.contains('mdc-fab'))
        cmp.mdc_comps.push(new jb.ui.material.MDCRipple(cmp.base))
      else if (cmp.base.classList.contains('mdc-switch'))
        cmp.mdc_comps.push(new jb.ui.material.MDCSwitch(cmp.base))
      else if (cmp.base.classList.contains('mdc-chip-set'))
        cmp.mdc_comps.push(new jb.ui.material.MDCChipSet(cmp.base))
    },
    destroy: cmp => (cmp.mdc_comps || []).forEach(mdc_cmp=>mdc_cmp.destroy())
  })
})

jb.component('mdc.ripple-effect', { /* mdc.rippleEffect */
  type: 'feature',
  description: 'add ripple effect',
  impl: ctx => ({
      templateModifier: vdom => {
        'mdc-ripple-surface mdc-ripple-radius-bounded mdc-states mdc-states-base-color(red)'.split(' ')
          .forEach(cl=>vdom.addClass(cl))
        return vdom;
      }
   })
})

jb.component('label.mdc-ripple-effect', { /* label.mdcRippleEffect */
  type: 'text.style',
  impl: customStyle({
    template: (cmp,state,h) => h('button',{class: 'mdc-button'},[
      h('div',{class:'mdc-button__ripple'}),
      h('span',{class:'mdc-button__label'},state.text),
    ]),
    css: '>span { text-transform: none; }',
    features: [text.bindText(), mdcStyle.initDynamic()]
  })
})



;

jb.component('button.href', { /* button.href */
  type: 'button.style',
  impl: customStyle({
    template: (cmp,{title,raised},h) => h('a',{class: raised ? 'raised' : '', href: 'javascript:;', onclick: true }, title),
    css: '{color: grey} .raised { font-weight: bold }'
  })
})

jb.component('button.x', { /* button.x */
  type: 'button.style',
  params: [
    {id: 'size', as: 'number', defaultValue: '21'}
  ],
  impl: customStyle({
    template: (cmp,state,h) => h('button',{title: state.title, onclick: true },'×'),
    css: `{
            padding: 0;
            cursor: pointer;
            font: %$size%px sans-serif;
            border: none;
            background: transparent;
            color: rgba(0,0,0,0.2);
            text-shadow: 0 1px 0 #fff;
            font-weight: 700;
        }
        :hover { color: rgba(0,0,0,0.5) }`
  })
})

jb.component('button.native', { /* button.native */
  type: 'button.style',
  impl: customStyle({
    template: (cmp,{title,raised},h) => h('button',{class: raised ? 'raised' : '', title, onclick: true },title),
    css: '.raised {font-weight: bold}'
  })
})

jb.component('button.mdc', { /* button.mdc */
  type: 'button.style',
  params: [
    {id: 'ripple', as: 'boolean', defaultValue: true, type: 'boolean'}
  ],
  impl: customStyle({
    template: (cmp,{title,raised},h) => h('button',{
      class: ['mdc-button',raised && 'raised mdc-button--raised'].filter(x=>x).join(' '), onclick: true},[
      h('div',{class:'mdc-button__ripple'}),
      h('span',{class:'mdc-button__label'},title),
    ]),
    features: mdcStyle.initDynamic()
  })
})

jb.component('button.mdc-icon', { /* button.mdcIcon */
  type: 'button.style,icon-with-action.style',
  params: [
    {id: 'icon', as: 'string', defaultValue: 'bookmark_border'},
    {id: 'raisedIcon', as: 'string'}
  ],
  impl: customStyle({
    template: (cmp,{title,icon,raised,raisedIcon},h) => h('button',{
          class: ['mdc-icon-button material-icons',raised && 'raised mdc-icon-button--on'].filter(x=>x).join(' '),
          title, tabIndex: -1, onclick:  true},[
            h('i',{class:'material-icons mdc-icon-button__icon mdc-icon-button__icon--on'}, raisedIcon || icon),
            h('i',{class:'material-icons mdc-icon-button__icon '}, icon),
        ]),
    css: '{ border-radius: 2px; padding: 0; width: 24px; height: 24px;}',
    features: mdcStyle.initDynamic()
  })
})

jb.component('button.mdc-chip-action', { /* button.mdcChipAction */
  type: 'button.style',
  params: [

  ],
  impl: customStyle({
    template: (cmp,{title,raised},h) =>
    h('div',{class: 'mdc-chip-set mdc-chip-set--choice'},
      h('div',{ class: ['mdc-chip',raised && 'mdc-chip--selected raised'].filter(x=>x).join(' ') }, [
        h('div',{ class: 'mdc-chip__ripple'}),
        h('span',{ role: 'gridcell'}, h('span', {role: 'button', tabindex: -1, class: 'mdc-chip__text'}, title )),
    ])),
    features: mdcStyle.initDynamic()
  })
})

jb.component('button.mdc-chip-with-icons', { /* button.mdcChipWithIcons */
  type: 'button.style,icon-with-action.style',
  params: [
    {id: 'leadingIcon', as: 'string', defaultValue: 'code'},
    {id: 'trailingIcon', as: 'string', defaultValue: 'code'}
  ],
  impl: customStyle({
    template: (cmp,{title,raised,leadingIcon,trailingIcon},h) =>
    h('div',{class: 'mdc-chip-set mdc-chip-set--choice'},
      h('div',{ class: ['mdc-chip',raised && 'mdc-chip--selected raised'].filter(x=>x).join(' ') }, [
        h('div',{ class: 'mdc-chip__ripple'}),
        ...(leadingIcon ? [h('i',{class:'material-icons mdc-chip__icon mdc-chip__icon--leading'},leadingIcon)] : []),
        h('span',{ role: 'gridcell'}, h('span', {role: 'button', tabindex: -1, class: 'mdc-chip__text'}, title )),
        ...(trailingIcon ? [h('i',{class:'material-icons mdc-chip__icon mdc-chip__icon--trailing'},trailingIcon)] : []),
    ])),
    features: mdcStyle.initDynamic()
  })
})

jb.component('button.mdc-floating-action', { /* button.mdcFloatingAction */
  type: 'button.style,icon-with-action.style',
  description: 'fab icon',
  params: [
    {id: 'icon', as: 'string', defaultValue: 'code'},
    {id: 'mini', as: 'boolean', type: 'boolean'}
  ],
  impl: customStyle({
    template: (cmp,{title,icon,mini,raised},h) =>
      h('button',{ class: ['mdc-fab',raised && 'raised mdc-icon-button--on',mini && 'mdc-fab--mini'].filter(x=>x).join(' ') ,
          title, tabIndex: -1, onclick:  true}, [
            h('div',{ class: 'mdc-fab__ripple'}),
            h('span',{ class: 'mdc-fab__icon material-icons'},icon),
      ]),
    features: mdcStyle.initDynamic()
  })
})

jb.component('button.mdc-floating-with-title', { /* button.mdcFloatingWithTitle */
  type: 'button.style,icon-with-action.style',
  params: [
    {id: 'icon', as: 'string', defaultValue: 'code'},
    {id: 'mini', as: 'boolean', type: 'boolean'}
  ],
  impl: customStyle({
    template: (cmp,{title,icon,mini,raised},h) =>
      h('button',{ class: ['mdc-fab mdc-fab--extended',raised && 'mdc-icon-button--on',mini && 'mdc-fab--mini'].filter(x=>x).join(' ') ,
          title, tabIndex: -1, onclick:  true}, [
        h('div',{ class: 'mdc-fab__ripple'}),
        ...(icon ? [h('span',{ class: 'mdc-fab__icon material-icons'},icon)]: []),
        h('span',{ class: 'mdc-fab__label'},title),
      ]),
    features: mdcStyle.initDynamic()
  })
})

jb.component('button.mdc-icon12', { /* button.mdcIcon12 */
  type: 'button.style,icon-with-action.style',
  params: [
    {id: 'icon', as: 'string', defaultValue: 'code'}
  ],
  impl: customStyle({
    template: (cmp,{icon,raised},h) => h('i',{class: ['material-icons',raised && 'raised mdc-icon-button--on'].filter(x=>x).join(' ') 
      , onclick: true},icon),
    css: '{ font-size:12px; cursor: pointer }'
  })
})

;

jb.ns('mdc,mdc-style')

jb.component('editable-text.input', { /* editableText.input */
  type: 'editable-text.style',
  impl: customStyle({
    template: (cmp,{databind},h) => h('input', {value: databind, onchange: true, onkeyup: true, onblur: true }),
    features: field.databindText()
  })
})

jb.component('editable-text.textarea', { /* editableText.textarea */
  type: 'editable-text.style',
  params: [
    {id: 'rows', as: 'number', defaultValue: 4},
    {id: 'cols', as: 'number', defaultValue: 120},
    {id: 'oneWay', type: 'boolean', as: 'boolean', defaultValue: true}
  ],
  impl: customStyle({
    template: (cmp,{databind,rows,cols},h) => h('textarea', {
        rows: rows, cols: cols, value: databind, onchange: true, onkeyup: true, onblur: true  }),
    features: field.databindText(0, '%$oneWay%')
  })
})

jb.component('editable-text.mdc-input', { /* editableText.mdcInput */
  type: 'editable-text.style,editable-number.style',
  params: [
    {id: 'width', as: 'number'}
  ],
  impl: customStyle({
    template: (cmp,state,h) => h('div',{class: ['mdc-text-field',state.error ? 'is-invalid' : ''].join(' ') },[
        h('input', { type: 'text', class: 'mdc-text-field__input', id: 'input_' + state.fieldId,
            value: state.databind, onchange: true, onkeyup: true, onblur: true,
        }),
        h('label',{class: 'mdc-floating-label', for: 'input_' + state.fieldId},state.title),
        h('div',{class: 'mdc-line-ripple' }),
        h('span',{class: 'mdc-text-field-helper-text' }, state.error || '')
      ]),
    css: '{ {?width: %$width%px?} }',
    features: [field.databindText(), mdcStyle.initDynamic()]
  })
})

jb.component('editable-text.mdc-no-label', { /* editableText.mdcNoLabel */
  type: 'editable-text.style',
  params: [
    {id: 'width', as: 'number'}
  ],
  impl: customStyle({
    template: (cmp,state,h) => h('div',{class: 'mdc-text-field mdc-text-field--no-label'},
        h('input', { class: 'mdc-text-field__input', type: 'text', value: state.databind, onchange: true, onkeyup: true, onblur: true }),
        h('div',{class: 'mdc-line-ripple' }),
        ),
    css: '{ padding: 0 !important; {?width: %$width%px?} } :focus { border-color: #3F51B5; border-width: 2px}',
    features: [field.databindText(), mdcStyle.initDynamic()]
  })
})

jb.component('editable-text.mdc-search', { /* editableText.mdcSearch */
  description: 'debounced and one way binding',
  type: 'editable-text.style',
  impl: customStyle({
    template: (cmp,{databind, fieldId, title},h) => h('div',{class:'mdc-text-field'},[
        h('input', { class: 'mdc-text-field__input', id: 'search_' + fieldId, type: 'text',
            value: databind, onchange: true, onkeyup: true, onblur: true,
        }),
        h('label',{class: 'mdc-floating-label mdc-floating-label--float-above', for: 'search_' + fieldId}, databind ? '' : title)
      ]),
    features: [field.databindText(), mdcStyle.initDynamic()]
  })
})

jb.component('editable-text.expandable', { /* editableText.expandable */
  description: 'label that changes to editable class on double click',
  type: 'editable-text.style',
  params: [
    {id: 'buttonFeatures', type: 'feature[]', flattenArray: true, dynamic: true},
    {id: 'editableFeatures', type: 'feature[]', flattenArray: true, dynamic: true},
    {id: 'buttonStyle', type: 'button.style', dynamic: true, defaultValue: button.href()},
    {id: 'editableStyle', type: 'editable-text.style', dynamic: true, defaultValue: editableText.input()},
    {id: 'onToggle', type: 'action', dynamic: true}
  ],
  impl: styleByControl(
    group({
      controls: [
        editableText({
          databind: '%$editableTextModel/databind%',
          updateOnBlur: true,
          style: call('editableStyle'),
          features: [
            watchRef('%$editable%'),
            hidden('%$editable%'),
            (ctx,{expandableContext}) => ({
              afterViewInit: cmp => {
                const elem = cmp.base.matches('input,textarea') ? cmp.base : cmp.base.querySelector('input,textarea')
                if (elem) {
                  elem.onblur = () => cmp.ctx.run(runActions(
                      toggleBooleanValue('%$editable%'),
                      (ctx,vars,{onToggle}) => onToggle(ctx)
                   ))
                }
                expandableContext.regainFocus = () =>
                  jb.delay(1).then(() => jb.ui.focus(elem, 'editable-text.expandable', ctx))
              }
            }),
            (ctx,vars,{editableFeatures}) => editableFeatures(ctx)
          ]
        }),
        button({
          title: '%$editableTextModel/databind%',
          action: runActions(
            toggleBooleanValue('%$editable%'),
            (ctx,{expandableContext}) => expandableContext.regainFocus(),
            (ctx,vars,{onToggle}) => onToggle(ctx)
          ),
          style: call('buttonStyle'),
          features: [
            watchRef('%$editable%'),
            hidden(not('%$editable%')),
            (ctx,vars,{buttonFeatures}) => buttonFeatures(ctx)
          ]
        })
      ],
      features: [
        variable({name: 'editable', watchable: true}),
        variable({name: 'expandableContext', value: obj()})
      ]
    }),
    'editableTextModel'
  )
})
;

jb.component('layout.vertical', { /* layout.vertical */
  type: 'layout,feature',
  params: [
    {id: 'spacing', as: 'string', defaultValue: 3}
  ],
  impl: css(
    ({},{},{spacing}) =>  `{display: flex; flex-direction: column}
          >* { ${jb.ui.propWithUnits('margin-bottom',spacing)} }
          >*:last-child { margin-bottom:0 }`
  )
})

jb.component('layout.horizontal', { /* layout.horizontal */
  type: 'layout,feature',
  params: [
    {id: 'spacing', as: 'string', defaultValue: 3}
  ],
  impl: css(
    ({},{},{spacing}) =>  `{display: flex}
        >* { ${jb.ui.propWithUnits('margin-right', spacing)} }
        >*:last-child { margin-right:0 }`
  )
})

jb.component('layout.horizontal-fixed-split', { /* layout.horizontalFixedSplit */
  type: 'layout,feature',
  params: [
    {id: 'leftWidth', as: 'string', defaultValue: '200px', mandatory: true},
    {id: 'rightWidth', as: 'string', defaultValue: '100%', mandatory: true},
    {id: 'spacing', as: 'string', defaultValue: 3}
  ],
  impl: ctx => ({
    css: `{display: flex}
        >*:first-child { ${jb.ui.propWithUnits('margin-right',ctx.params.spacing)}
        ${jb.ui.propWithUnits('width',ctx.params.leftWidth)} }
        >*:last-child { margin-right:0; ${jb.ui.propWithUnits('width',ctx.params.rightWidth)} }`,
  })
})

jb.component('layout.horizontal-wrapped', { /* layout.horizontalWrapped */
  type: 'layout,feature',
  params: [
    {id: 'spacing', as: 'string', defaultValue: 3}
  ],
  impl: ctx => ({
    css: `{display: flex}
        >* {${jb.ui.propWithUnits('margin-right',ctx.params.spacing)} }
        >*:last-child { margin-right:0 }`,
  })
})

jb.component('layout.flex', { /* layout.flex */
  type: 'layout,feature',
  params: [
    {id: 'direction', as: 'string', options: ',row,row-reverse,column,column-reverse'},
    {id: 'justifyContent', as: 'string', options: ',flex-start,flex-end,center,space-between,space-around'},
    {id: 'alignItems', as: 'string', options: ',normal,stretch,center,start,end,flex-start,flex-end,baseline,first baseline,last baseline,safe center,unsafe center'},
    {id: 'wrap', as: 'string', options: ',wrap,wrap-reverse,nowrap'},
    {id: 'spacing', as: 'string'}
  ],
  impl: ctx => ({
    css: ctx.setVars({spacingWithUnits: jb.ui.withUnits(ctx.params.spacing), ...ctx.params}).exp(
      `{ display: flex; {?align-items:%$alignItems%;?} {?justify-content:%$justifyContent%;?} {?flex-direction:%$direction%;?} {?flex-wrap:%$wrap%;?} }
      {?>* { margin-right: %$spacingWithUnits% }?}
    ${ctx.params.spacing ? '>*:last-child { margin-right:0 }' : ''}`),
  })
})

jb.component('layout.grid', { /* layout.grid */
  type: 'layout,feature',
  params: [
    {id: 'columnSizes', as: 'array', templateValue: list('auto', 'auto'), description: 'grid-template-columns, list of lengths'},
    {id: 'rowSizes', as: 'array', description: 'grid-template-rows, list of lengths'},
    {id: 'columnGap', as: 'string', description: 'grid-column-gap'},
    {id: 'rowGap', as: 'string', description: 'grid-row-gap'}
  ],
  impl: ctx => ({
    css: ctx.setVars({...ctx.params,
          colSizes: ctx.params.columnSizes.map(x=>jb.ui.withUnits(x)).join(' ') , rowSizes: ctx.params.rowSizes.map(x=>jb.ui.withUnits(x)).join(' ')
         }).exp(`{ display: grid; {?grid-template-columns:%$colSizes%;?} {?grid-template-rows:%$rowSizes%;?}
            {?grid-column-gap:%$columnGap%;?} {?grid-row-gap:%$rowGap%;?} }`)
  })
})

jb.component('flex-item.grow', { /* flexItem.grow */
  type: 'feature',
  category: 'flex-item',
  params: [
    {id: 'factor', as: 'string', defaultValue: '1'}
  ],
  impl: {
    '$': 'feature.css',
    '$byValue': ['flex-grow: %$factor%']
  }
})

jb.component('flex-item.basis', { /* flexItem.basis */
  type: 'feature',
  category: 'flex-item',
  params: [
    {id: 'factor', as: 'string', defaultValue: '1'}
  ],
  impl: {
    '$': 'feature.css',
    '$byValue': ['flex-basis: %$factor%']
  }
})

jb.component('flex-item.align-self', { /* flexItem.alignSelf */
  type: 'feature',
  category: 'flex-item',
  params: [
    {id: 'align', as: 'string', options: 'auto,flex-start,flex-end,center,baseline,stretch', defaultValue: 'auto'}
  ],
  impl: {
    '$': 'feature.css',
    '$byValue': ['align-self: %$align%']
  }
})

;

jb.ns('css')

jb.component('group.htmlTag', { /* group.htmlTag */
  type: 'group.style',
  params: [
    {id: 'htmlTag', as: 'string', defaultValue: 'section', options: 'div,ul,article,aside,details,figcaption,figure,footer,header,main,mark,nav,section,summary,label,form'},
    {id: 'groupClass', as: 'string'},
    {id: 'itemClass', as: 'string'}
  ],
  impl: customStyle({
    template: (cmp,{htmlTag,groupClass,itemClass,ctrls},h) => h(htmlTag,{ class: groupClass },
        ctrls.map(ctrl=> h(ctrl,{class: itemClass}))),
    features: group.initGroup()
  })
})

jb.component('group.div', { /* group.div */
  type: 'group.style',
  impl: group.htmlTag(
    'div'
  )
})

jb.component('group.section', { /* group.section */
  type: 'group.style',
  impl: group.htmlTag(
    'section'
  )
})

jb.component('group.ul-li', { /* group.ulLi */
  type: 'group.style',
  impl: customStyle({
    template: (cmp,{ctrls},h) => h('ul',{ class: 'jb-itemlist'},
        ctrls.map(ctrl=> h('li', {class: 'jb-item'} ,h(ctrl)))),
    css: `{ list-style: none; padding: 0; margin: 0;}
    >li { list-style: none; padding: 0; margin: 0;}`,
    features: group.initGroup()
  })
})

jb.component('group.card', { /* group.card */
  type: 'feature',
  category: 'card:100',
  params: [
    {id: 'padding', as: 'string', defaultValue: 10},
    {id: 'width', as: 'string', defaultValue: 320},
    {id: 'outlined', as: 'boolean', type: 'boolean'}
  ],
  impl: features(
    css.class(
        ({},{},{outlined}) => ['mdc-card', ...(outlined ? ['mdc-card--outlined']: [])].join(' ')
      ),
    css(
        ({},{},{padding,width}) => [jb.ui.propWithUnits('padding',padding), jb.ui.propWithUnits('width',width)].filter(x=>x).join(';')
      )
  )
})

jb.component('group.chip-set', { /* group.chipSet */
  type: 'feature',
  category: 'chip:100',
  params: [
    {id: 'spacing', as: 'string', defaultValue: 3}
  ],
  impl: features(
    css.class('mdc-chip-set'),
    mdcStyle.initDynamic()
  )
})

jb.component('group.tabs', { /* group.tabs */
  type: 'group.style',
  params: [
    {id: 'width', as: 'number'},
    {id: 'tabStyle', type: 'button.style', dynamic: true, defaultValue: button.mdc()}
  ],
  impl: styleByControl(
    group({
      controls: [
        group({
          title: 'thumbs',
          layout: layout.horizontal(),
          controls: dynamicControls({
            controlItems: '%$tabsModel/controls%',
            genericControl: button({
              title: '%$tab/field/title%',
              action: writeValue('%$selectedTab%', '%$tabIndex%'),
              style: call('tabStyle'),
              raised: '%$tabIndex% == %$selectedTab%',
              features: [css.width('%$width%'), css('{text-align: left}'), watchRef('%$selectedTab%')]
            }),
            itemVariable: 'tab',
            indexVariable: 'tabIndex'
          })
        }),
        controlWithFeatures(
          '%$tabsModel/controls[{%$selectedTab%}]%',
          watchRef('%$selectedTab%')
        )
      ],
      features: variable({name: 'selectedTab', value: 0, watchable: true})
    }),
    'tabsModel'
  )
})

jb.component('group.accordion', { /* group.accordion */
  type: 'group.style',
  params: [
    {id: 'titleStyle', type: 'button.style', dynamic: true, defaultValue: button.mdc()},
    {id: 'sectionStyle', type: 'group.style', dynamic: true, defaultValue: group.section()},
    {id: 'innerGroupStyle', type: 'group.style', dynamic: true, defaultValue: group.div()}
  ],
  impl: styleByControl(
    group({
      controls: dynamicControls({
        controlItems: '%$sectionsModel/controls%',
        genericControl: group({
          style: call('sectionStyle'),
          controls: [
            button({
              title: '%$section/field/title%',
              action: writeValue('%$selectedTab%', '%$sectionIndex%'),
              style: call('titleStyle'),
              raised: '%$sectionIndex% == %$selectedTab%',
              features: [
                css.width('%$width%'),
                css('{justify-content: left}'),
                watchRef('%$selectedTab%')
              ]
            }),
            group({
              style: call('innerGroupStyle'),
              controls: '%$sectionsModel/controls[{%$sectionIndex%}]%',
              features: [feature.if('%$sectionIndex% == %$selectedTab%'), watchRef('%$selectedTab%')]
            })
          ]
        }),
        itemVariable: 'section',
        indexVariable: 'sectionIndex'
      }),
      features: variable({name: 'selectedTab', value: 0, watchable: true})
    }),
    'sectionsModel'
  )
})

jb.component('group.sections', { /* group.sections */
  type: 'group.style',
  params: [
    {id: 'titleStyle', type: 'text.style', dynamic: true, defaultValue: header.mdcHeadline5()},
    {id: 'sectionStyle', type: 'group.style', dynamic: true, defaultValue: styleWithFeatures(group.div(), [group.card({}), css.padding({})])},
    {id: 'innerGroupStyle', type: 'group.style', dynamic: true, defaultValue: group.div()}
  ],
  impl: styleByControl(
    group({
      controls: dynamicControls({
        controlItems: '%$sectionsModel/controls%',
        genericControl: group({
          style: call('sectionStyle'),
          controls: [
            text({text: '%$section/field/title%', style: call('titleStyle')}),
            group({style: call('innerGroupStyle'), controls: '%$section%'})
          ]
        }),
        itemVariable: 'section'
      })
    }),
    'sectionsModel'
  )
})
;

jb.ns('mdc.style')
jb.component('table.plain', { /* table.plain */
  params: [
    {id: 'hideHeaders', as: 'boolean', type: 'boolean'}
  ],
  type: 'table.style,itemlist.style',
  impl: customStyle({
    template: (cmp,{items,fields,hideHeaders},h) => h('div',{},h('table',{},[
        ...(hideHeaders ? [] : [h('thead',{},h('tr',{},
          fields.map(f=>h('th',{'jb-ctx': f.ctxId, style: { width: f.width ? f.width + 'px' : ''} }, jb.ui.fieldTitle(cmp,f,h))) ))]),
        h('tbody',{class: 'jb-drag-parent'},
            items.map((item,index)=> jb.ui.item(cmp,h('tr',
                { class: 'jb-item', 'jb-ctx': jb.ui.preserveCtx(cmp.ctx.setData(item))},fields.map(f=>
              h('td', jb.filterEmpty({ 'jb-ctx': jb.ui.preserveFieldCtxWithItem(f,item), class: f.class, title: f.hoverTitle &&  f.hoverTitle(item) }),
                f.control ? h(f.control(item,index),{index, row: item}) : f.fieldData(item,index))))
              ,item))
        ),
        items.length == 0 ? 'no items' : ''
        ])),
    css: `>table{border-spacing: 0; text-align: left; width: 100%}
    >table>tbody>tr>td { padding-right: 5px }
    `,
    features: table.initTableOrItemlist()
  })
})

jb.component('table.mdc', { /* table.mdc */
  type: 'table.style,itemlist.style',
  params: [
    {id: 'hideHeaders', as: 'boolean', type: 'boolean'},
    {id: 'classForTable', as: 'string', defaultValue: 'mdc-data-table__table mdc-data-table--selectable'}
  ],
  impl: customStyle({
    template: (cmp,{items,fields,classForTable,classForTd,sortOptions,hideHeaders},h) => h('div',{class: 'mdc-data-table'}, h('table',{ class: classForTable },[
      ...(hideHeaders ? [] : [h('thead',{},h('tr',{class:'mdc-data-table__header-row'},fields.map((f,i) =>h('th',{
          'jb-ctx': f.ctxId, 
          class: ['mdc-data-table__header-cell']
            .concat([ 
              (sortOptions && sortOptions.filter(o=>o.field == f)[0] || {}).dir == 'asc' ? 'mdc-data-table__header--sorted-ascending': '',
              (sortOptions && sortOptions.filter(o=>o.field == f)[0] || {}).dir == 'des' ? 'mdc-data-table__header--sorted-descending': '',
            ]).filter(x=>x).join(' '), 
          style: { width: f.width ? f.width + 'px' : ''},
          onclick: 'toggleSort',
          fieldIndex: i
          }
          ,jb.ui.fieldTitle(cmp,f,h))) ))]),
        h('tbody',{class: 'jb-drag-parent mdc-data-table__content'},
            items.map((item,index)=> jb.ui.item(cmp,h('tr',{ class: 'jb-item mdc-data-table__row', 'jb-ctx': jb.ui.preserveCtx(cmp.ctx.setData(item))},fields.map(f=>
              h('td', jb.filterEmpty({ 
                'jb-ctx': jb.ui.preserveFieldCtxWithItem(f,item), 
                class: (f.class + ' ' + classForTd + ' mdc-data-table__cell').trim(), 
                title: f.hoverTitle &&  f.hoverTitle(item) 
              }) , f.control ? h(f.control(item,index)) : f.fieldData(item,index))))
              ,item))
        ),
        items.length == 0 ? 'no items' : ''
        ])),
    css: `{width: 100%} 
    ~ .mdc-data-table__header-cell {font-weight: 700}`,
    features: [table.initTableOrItemlist(), table.initSort(), mdcStyle.initDynamic()]
  })
})
;

jb.component('picklist.native', { /* picklist.native */
  type: 'picklist.style',
  impl: customStyle({
    template: (cmp,state,h) => h('select', { value: state.databind, onchange: true },
          state.options.map(option=>h('option',{value: option.code},option.text))
        ),
    css: `
{ display: block; width: 100%; height: 34px; padding: 6px 12px; font-size: 14px; line-height: 1.42857; color: #555555; background-color: #fff; background-image: none; border: 1px solid #ccc; border-radius: 4px; -webkit-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075); box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075); -webkit-transition: border-color ease-in-out 0.15s, box-shadow ease-in-out 0.15s; -o-transition: border-color ease-in-out 0.15s, box-shadow ease-in-out 0.15s; transition: border-color ease-in-out 0.15s, box-shadow ease-in-out 0.15s; }
:focus { border-color: #66afe9; outline: 0; -webkit-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075), 0 0 8px rgba(102, 175, 233, 0.6); box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075), 0 0 8px rgba(102, 175, 233, 0.6); }
::-webkit-input-placeholder { color: #999; }`,
    features: field.databind()
  })
})

jb.component('picklist.radio', { /* picklist.radio */
  type: 'picklist.style',
  params: [
    {id: 'radioCss', as: 'string', defaultValue: '', description: 'e.g. display: none'},
    {id: 'text', defaultValue: '%text%', dynamic: true}
  ],
  impl: customStyle({
    template: (cmp,{databind, options, fieldId, text},h) => h('div', {},
          options.flatMap((option,i)=> [h('input', {
              type: 'radio', name: fieldId, id: i, checked: databind === option.code, value: option.code, onchange: true
            }), h('label',{for: i}, text(cmp.ctx.setData(option))) ] )),
    css: '>input { %$radioCss% }',
    features: field.databind()
  })
})

jb.component('picklist.radio-vertical', { /* picklist.radioVertical */
  type: 'picklist.style',
  impl: styleWithFeatures(
    picklist.radio(),
    layout.grid({columnSizes: list('30px', 'auto')})
  )
})

jb.component('picklist.native-md-look-open', { /* picklist.nativeMdLookOpen */
  type: 'picklist.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{}, [
        h('input', { type: 'text', value: state.databind, list: 'list_' + cmp.ctx.id, onchange: true }),
        h('datalist', {id: 'list_' + cmp.ctx.id}, state.options.map(option=>h('option',{},option.text)))
    ]),
    css: `>input {  appearance: none; -webkit-appearance: none; font-family: inherit;
  background-color: transparent;
  padding: 6px 0;
  font-size: 14px;
  width: 100%;
  color: rgba(0,0,0, 0.82);
  border: none;
  border-bottom: 1px solid rgba(0,0,0, 0.12); }

  {
    font-family: 'Roboto','Helvetica','Arial',sans-serif;
    position: relative;
  }
  >input:focus { border-color: #3F51B5; border-width: 2px}

  :after { position: absolute;
        top: 0.75em;
        right: 0.5em;
        /* Styling the down arrow */
        width: 0;
        height: 0;
        padding: 0;
        content: '';
        border-left: .25em solid transparent;
        border-right: .25em solid transparent;
        border-top: .375em solid rgba(0,0,0, 0.12);
        pointer-events: none; }`,
    features: field.databind()
  })
})

jb.component('picklist.native-md-look', { /* picklist.nativeMdLook */
  type: 'picklist.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{},h('select',
      { value: state.databind, onchange: true },
          state.options.map(option=>h('option',{value: option.code},option.text)))),
    css: `>select {  appearance: none; -webkit-appearance: none; font-family: inherit;
  background-color: transparent;
  padding: 6px 0;
  font-size: 14px;
  width: 100%;
  color: rgba(0,0,0, 0.82);
  border: none;
  border-bottom: 1px solid rgba(0,0,0, 0.12); }

  {
    font-family: 'Roboto','Helvetica','Arial',sans-serif;
    position: relative;
  }
  >select:focus { border-color: #3F51B5; border-width: 2px}

  :after { position: absolute;
        top: 0.75em;
        right: 0.5em;
        /* Styling the down arrow */
        width: 0;
        height: 0;
        padding: 0;
        content: '';
        border-left: .25em solid transparent;
        border-right: .25em solid transparent;
        border-top: .375em solid rgba(0,0,0, 0.12);
        pointer-events: none; }`,
    features: field.databind()
  })
})

jb.component('picklist.label-list', { /* picklist.labelList */
  type: 'picklist.style',
  params: [
    {id: 'labelStyle', type: 'text.style', dynamic: true, defaultValue: text.span()},
    {id: 'itemlistStyle', type: 'itemlist.style', dynamic: true, defaultValue: itemlist.ulLi()},
    {id: 'cssForSelected', as: 'string', description: 'e.g. background: red OR >a { color: red }', defaultValue: 'background: #bbb; color: #fff'}
  ],
  impl: styleByControl(
    itemlist({
      items: '%$picklistModel/options%',
      controls: text({text: '%text%', style: call('labelStyle')}),
      style: call('itemlistStyle'),
      features: itemlist.selection({
        databind: '%$picklistModel/databind%',
        selectedToDatabind: '%code%',
        databindToSelected: ctx => ctx.vars.items.filter(o=>o.code == ctx.data)[0],
        cssForSelected: '%$cssForSelected%'
      })
    }),
    'picklistModel'
  )
})

jb.component('picklist.button-list', { /* picklist.buttonList */
  type: 'picklist.style',
  params: [
    {id: 'buttonStyle', type: 'button.style', dynamic: true, defaultValue: button.mdc()},
    {id: 'itemlistStyle', type: 'itemlist.style', dynamic: true, defaultValue: itemlist.horizontal()},
    {id: 'cssForSelected', as: 'string', description: 'e.g. background: red;color: blue;font-weight: bold;', defaultValue: 'background: #bbb; color: #fff'}
  ],
  impl: styleByControl(
    itemlist({
      items: '%$picklistModel/options%',
      controls: button({title: '%text%', style: call('buttonStyle')}),
      style: call('itemlistStyle'),
      features: itemlist.selection({
        databind: '%$picklistModel/databind%',
        selectedToDatabind: '%code%',
        databindToSelected: ctx => ctx.vars.items.filter(o=>o.code == ctx.data)[0],
        cssForSelected: '%$cssForSelected%'
      })
    }),
    'picklistModel'
  )
})

jb.component('picklist.hyperlinks', { /* picklist.hyperlinks */
  type: 'picklist.style',
  impl: picklist.buttonList({
    buttonStyle: button.href(),
    itemlistStyle: itemlist.horizontal('10'),
    cssForSelected: '>a { color: red }'
  })
})

jb.component('picklist.groups', { /* picklist.groups */
  type: 'picklist.style',
  impl: customStyle({
    template: (cmp,state,h) => h('select', { value: state.databind, onchange: true },
          (state.hasEmptyOption ? [h('option',{value:''},'')] : []).concat(
            state.groups.map(group=>h('optgroup',{label: group.text},
              group.options.map(option=>h('option',{value: option.code},option.text))
              ))
      )),
    css: `
 { display: block; width: 100%; height: 34px; padding: 6px 12px; font-size: 14px; line-height: 1.42857; color: #555555; background-color: #fff; background-image: none; border: 1px solid #ccc; border-radius: 4px; -webkit-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075); box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075); -webkit-transition: border-color ease-in-out 0.15s, box-shadow ease-in-out 0.15s; -o-transition: border-color ease-in-out 0.15s, box-shadow ease-in-out 0.15s; transition: border-color ease-in-out 0.15s, box-shadow ease-in-out 0.15s; }
select:focus { border-color: #66afe9; outline: 0; -webkit-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075), 0 0 8px rgba(102, 175, 233, 0.6); box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075), 0 0 8px rgba(102, 175, 233, 0.6); }
select::-webkit-input-placeholder { color: #999; }`,
    features: field.databind()
  })
})
;

jb.component('property-sheet.titles-left', { /* propertySheet.titlesLeft */
  type: 'group.style',
  params: [
    {id: 'titleStyle', type: 'text.style', defaultValue: styleWithFeatures(text.span(), css.bold()), dynamic: true},
    {id: 'titleText', defaultValue: '%%:', dynamic: true},
    {id: 'spacing', as: 'string', description: 'grid-column-gap', defaultValue: '10px'}
  ],
  impl: customStyle({
    template: (cmp,{ctrls,titleStyle,titleText},h) => h('div',{}, ctrls.flatMap(ctrl=>[
        h(cmp.ctx.run(text({text: ctx => titleText(ctx.setData(ctrl.field().title())), style: ctx => titleStyle(ctx)}))),
        h(ctrl)
      ])
    ),
    css: '{ display: grid; grid-template-columns: auto auto; grid-column-gap:%$spacing%}',
    features: group.initGroup()
  })
})

jb.component('property-sheet.titles-above', { /* propertySheet.titlesAbove */
  type: 'group.style',
  params: [
    {id: 'titleStyle', type: 'text.style', defaultValue: styleWithFeatures(text.span(), css.bold()), dynamic: true},
    {id: 'titleText', defaultValue: '%%', dynamic: true},
    {id: 'spacing', as: 'string', description: 'grid-column-gap', defaultValue: '10px'}
  ],
  impl: customStyle({
    template: (cmp,{ctrls,titleStyle,titleText},h) => h('div',{ style: {'grid-template-columns': ctrls.map(()=>'auto').join(' ')}}, [
        ...ctrls.map(ctrl=>
          h(cmp.ctx.run(text({
            text: ctx => titleText(ctx.setData(ctrl.field().title())), 
            style: ctx => titleStyle(ctx)})))), 
        ...ctrls.map(ctrl=>h(ctrl))
      ]
    ),
    css: '{ display: grid; grid-column-gap:%$spacing% }',
    features: group.initGroup()
  })
})
;

jb.component('editable-boolean.checkbox', { /* editableBoolean.checkbox */
  type: 'editable-boolean.style',
  impl: customStyle({
    template: (cmp,state,h) => h('input', { type: 'checkbox', checked: state.databind, onchange: 'setChecked', onkeyup: 'setChecked'  }),
    features: field.databind()
  })
})

jb.component('editable-boolean.checkbox-with-title', { /* editableBoolean.checkboxWithTitle */
  type: 'editable-boolean.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{}, [h('input', { type: 'checkbox',
        checked: state.databind, onchange: 'setChecked', onkeyup: 'setChecked'  }), state.text]),
    features: field.databind()
  })
})

jb.component('editable-boolean.expand-collapse', { /* editableBoolean.expandCollapse */
  type: 'editable-boolean.style',
  impl: customStyle({
    template: (cmp,{databind},h) => h('i',{class:'material-icons noselect', onclick: 'toggle' },
      databind ? 'keyboard_arrow_down' : 'keyboard_arrow_right'),
    css: '{ font-size:16px; cursor: pointer; }',
    features: field.databind()
  })
})

jb.component('editable-boolean.mdc-x-v', { /* editableBoolean.mdcXV */
  type: 'editable-boolean.style',
  description: 'two icons',
  params: [
    {id: 'yesIcon', as: 'string', mandatory: true, defaultValue: 'check'},
    {id: 'noIcon', as: 'string', mandatory: true, defaultValue: 'close'}
  ],
  impl: customStyle({
    template: (cmp,{title,databind,yesIcon,noIcon},h) => h('button',{
          class: ['mdc-icon-button material-icons',databind && 'raised mdc-icon-button--on'].filter(x=>x).join(' '),
          title, tabIndex: -1, onclick: 'toggle'},[
            h('i',{class:'material-icons mdc-icon-button__icon mdc-icon-button__icon--on'}, yesIcon),
            h('i',{class:'material-icons mdc-icon-button__icon '}, noIcon),
        ]),
    css: '{ border-radius: 2px; padding: 0; width: 24px; height: 24px;}',
    features: [field.databind(), mdcStyle.initDynamic()]
  })
})

jb.component('editable-boolean.mdc-slide-toggle', { /* editableBoolean.mdcSlideToggle */
  type: 'editable-boolean.style',
  params: [
    {id: 'width', as: 'string', defaultValue: 80}
  ],
  impl: customStyle({
    template: (cmp,state,h) => h('div',{class: 'mdc-switch'},[
      h('div',{class: 'mdc-switch__track'}),
      h('div',{class: 'mdc-switch__thumb-underlay'},[
        h('div',{class: 'mdc-switch__thumb'},
          h('input', { type: 'checkbox', role: 'switch', class: 'mdc-switch__native-control', id: 'switch_' + state.fieldId,
            checked: state.databind, onchange: 'setChecked' })),
      ]),
      h('label',{for: 'switch_' + state.fieldId},state.text)
    ]),
    css: ctx => jb.ui.propWithUnits('width',ctx.params.width),
    features: [field.databind(), editableBoolean.keyboardSupport(), mdcStyle.initDynamic()]
  })
})

jb.component('editable-boolean.checkbox-with-label', { /* editableBoolean.checkboxWithLabel */
  type: 'editable-boolean.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{},[
        h('input', { type: 'checkbox', id: "switch_"+state.fieldId,
          checked: state.databind,
          onchange: 'setChecked',
          onkeyup: 'setChecked'  },),
        h('label',{for: "switch_"+state.fieldId },state.text)
    ]),
    features: field.databind()
  })
})

;

jb.component('pretty-print', { /* prettyPrint */
  params: [
    {id: 'profile', defaultValue: '%%'},
    {id: 'forceFlat', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,profile) => jb.prettyPrint(jb.val(profile),ctx.params)
})

jb.prettyPrintComp = function(compId,comp,settings={}) {
  if (comp) {
    const macroRemark = ` /* ${jb.macroName(compId)} */`
    const res = "jb.component('" + compId + "', " + jb.prettyPrint(comp,settings) + ')'
    const withMacroName = res.replace(/\n/, macroRemark + '\n')
    return withMacroName
  }
}

jb.prettyPrint = function(val,settings = {}) {
  return jb.prettyPrintWithPositions(val,settings).text;
}

jb.prettyPrint.advanceLineCol = function({line,col},text) {
  const noOfLines = (text.match(/\n/g) || '').length
  const newCol = noOfLines ? text.match(/\n(.*)$/)[1].length : col + text.length
  return { line: line + noOfLines, col: newCol }
}
jb.prettyPrint.spaces = Array.from(new Array(200)).map(_=>' ').join('');

jb.prettyPrintWithPositions = function(val,{colWidth=80,tabSize=2,initialPath='',showNulls,comps,forceFlat} = {}) {
  comps = comps || jb.comps
  if (!val || typeof val !== 'object')
    return { text: val != null && val.toString ? val.toString() : JSON.stringify(val), map: {} }

  const advanceLineCol = jb.prettyPrint.advanceLineCol
  return valueToMacro({path: initialPath, line:0, col: 0}, val)

  function processList(ctx,items) {
    const res = items.reduce((acc,{prop, item}) => {
      const toAdd = typeof item === 'function' ? item(acc) : item
      const toAddStr = toAdd.text || toAdd, toAddMap = toAdd.map || {}, toAddPath = toAdd.path || ctx.path
      const startPos = advanceLineCol(acc,''), endPos = advanceLineCol(acc,toAddStr)
      const map = { ...acc.map, ...toAddMap, [[toAddPath,prop].join('~')]: [startPos.line, startPos.col, endPos.line, endPos.col] }
      return { text: acc.text + toAddStr, map, unflat: acc.unflat || toAdd.unflat, ...endPos}
    }, {text: '', map: {}, ...ctx})
    return {...ctx, ...res}
  }

  function joinVals({path, line, col}, innerVals, open, close, flat, isArray) {
    const ctx = {path, line, col}
    const _open = typeof open === 'string' ? [{prop: '!open', item: open}] : open
    const openResult = processList(ctx,[..._open, {prop: '!open-newline', item: () => newLine()}])
    const arrayOrObj = isArray? 'array' : 'obj'

    const beforeClose = innerVals.reduce((acc,{innerPath, val}, index) =>
      processList(acc,[
        {prop: `!${arrayOrObj}-prefix-${index}`, item: isArray ? '' : fixPropName(innerPath) + ': '},
        {prop: '!value', item: ctx => {
            const ctxWithPath = { ...ctx, path: [path,innerPath].join('~') }
            return {...ctxWithPath, ...valueToMacro(ctxWithPath, val, flat)}
          }
        },
        {prop: `!${arrayOrObj}-separator-${index}`, item: () => index === innerVals.length-1 ? '' : ',' + (flat ? ' ' : newLine())},
      ])
    , {...openResult, unflat: false} )
    const _close = typeof close === 'string' ? [{prop: '!close', item: close}] : close
    const result = processList(beforeClose, [{prop: '!close-newline', item: () => newLine(-1)}, ..._close])

    const unflat = shouldNotFlat(result)
    if ((forceFlat || !unflat) && !flat)
      return joinVals(ctx, innerVals, open, close, true, isArray)
    return Object.assign(result,{unflat})

    function newLine(offset = 0) {
      return flat ? '' : '\n' + jb.prettyPrint.spaces.slice(0,((path.match(/~/g)||'').length+offset+1)*tabSize)
    }

    function shouldNotFlat(result) {
      const val = jb.studio.valOfPath(path)
      if (path.match(/~params~[0-9]+$/)) return false
      const ctrls = path.match(/~controls$/) && Array.isArray(val) // && innerVals.length > 1// jb.studio.isOfType(path,'control') && !arrayElem
      const customStyle = jb.studio.compNameOfPath && jb.studio.compNameOfPath(path) === 'customStyle'
      const top = (path.match(/~/g)||'').length < 2
      const long = result.text.replace(/\n\s*/g,'').length > colWidth
      return result.unflat || customStyle || top || ctrls || long
    }
    function fixPropName(prop) {
      return prop.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/) ? prop : `'${prop}'`
    }
  }

  function profileToMacro({path, line, col}, profile,flat) {
    const ctx = {path, line, col}

    const id = [jb.compName(profile)].map(x=> x=='var' ? 'variable' : x)[0]
    const comp = comps[id]
    if (comp)
      jb.fixByValue(profile,comp)
    if (!id || !comp || ',object,var,'.indexOf(`,${id},`) != -1) { // result as is
      const props = Object.keys(profile)
      if (props.indexOf('$') > 0) { // make the $ first
        props.splice(props.indexOf('$'),1);
        props.unshift('$');
      }
      return joinVals(ctx, props.map(prop=>({innerPath: prop, val: profile[prop]})), '{', '}', flat, false)
    }
    const macro = jb.macroName(id)

    const params = comp.params || []
    const firstParamIsArray = (params[0] && params[0].type||'').indexOf('[]') != -1
    const vars = Object.keys(profile.$vars || {})
      .map(name => ({innerPath: `$vars~${name}`, val: {$: 'Var', name, val: profile.$vars[name]}}))
    const remark = profile.remark ? [{innerPath: 'remark', val: {$remark: profile.remark}} ] : []
    const systemProps = vars.concat(remark)
    const openProfileByValueGroup = [{prop: '!profile', item: macro}, {prop:'!open-by-value', item:'('}]
    const closeProfileByValueGroup = [{prop:'!close-by-value', item:')'}]
    const openProfileSugarGroup = [{prop: '!profile', item: macro}, {prop:'!open-sugar', item:'('}]
    const closeProfileSugarGroup = [{prop:'!close-sugar', item:')'}]
    const openProfileGroup = [{prop: '!profile', item: macro}, {prop:'!open-profile', item:'({'}]
    const closeProfileGroup = [{prop:'!close-profile', item:'})'}]

    if (params.length == 1 && firstParamIsArray) { // pipeline, or, and, plus
      const args = systemProps.concat(jb.asArray(profile['$'+id] || profile[params[0].id]).map((val,i) => ({innerPath: params[0].id + '~' + i, val})))
      return joinVals(ctx, args, openProfileSugarGroup, closeProfileSugarGroup, flat, true)
    }
    const keys = Object.keys(profile).filter(x=>x != '$')
    const oneFirstParam = keys.length === 1 && params[0] && params[0].id == keys[0]
        && (typeof propOfProfile(keys[0]) !== 'object' || Array.isArray(propOfProfile(keys[0])))
    if ((params.length < 3 && comp.macroByValue !== false) || comp.macroByValue || oneFirstParam) {
      const args = systemProps.concat(params.map(param=>({innerPath: param.id, val: propOfProfile(param.id)})))
      for(let i=0;i<5;i++)
        if (args.length && (!args[args.length-1] || args[args.length-1].val === undefined)) args.pop()
      return joinVals(ctx, args, openProfileByValueGroup, closeProfileByValueGroup, flat, true)
    }
    const remarkProp = profile.remark ? [{innerPath: 'remark', val: profile.remark} ] : []
    const systemPropsInObj = remarkProp.concat(vars.length ? [{innerPath: 'vars', val: vars.map(x=>x.val)}] : [])
    const args = systemPropsInObj.concat(params.filter(param=>propOfProfile(param.id) !== undefined)
        .map(param=>({innerPath: param.id, val: propOfProfile(param.id)})))
      return joinVals(ctx, args,openProfileGroup, closeProfileGroup, flat, false)

    function propOfProfile(paramId) {
      const isFirst = params[0] && params[0].id == paramId
      return isFirst && profile['$'+id] || profile[paramId]
    }
  }

  function valueToMacro({path, line, col}, val, flat) {
    const ctx = {path, line, col}
    let result = doValueToMacro()
    if (typeof result === 'string')
      result = { text: result, map: {}}
    return result

    function doValueToMacro() {
      if (Array.isArray(val)) return arrayToMacro(ctx, val, flat);
      if (val === null) return 'null';
      if (val === undefined) return 'undefined';
      if (typeof val === 'object') return profileToMacro(ctx, val, flat);
      if (typeof val === 'function') return val.toString();
      if (typeof val === 'string' && val.indexOf("'") == -1 && val.indexOf('\n') == -1)
        return processList(ctx,[
          {prop: '!value-text-start', item: "'"},
          {prop: '!value-text', item: JSON.stringify(val).slice(1,-1)},
          {prop: '!value-text-end', item: "'"},
        ])
      else if (typeof val === 'string' && val.indexOf('\n') != -1)
        return processList(ctx,[
          {prop: '!value-text-start', item: "`"},
          {prop: '!value-text', item: val.replace(/`/g,'\\`')},
          {prop: '!value-text-end', item: "`"},
        ])
      else
        return JSON.stringify(val); // primitives
    }
  }

  function arrayToMacro({path, line, col}, array, flat) {
    const ctx = {path, line, col}
    const vals = array.map((val,i) => ({innerPath: i, val}))
    const openArray = [{prop:'!open-array', item:'['}]
    const closeArray = [{prop:'!close-array', item:']'}]

    return joinVals(ctx, vals, openArray, closeArray, flat, true)
  }
}

;

(function() {
jb.ns('tree')

jb.component('tree', { /* tree */
  type: 'control',
  params: [
    {id: 'nodeModel', type: 'tree.node-model', dynamic: true, mandatory: true},
    {id: 'style', type: 'tree.style', defaultValue: tree.expandBox({}), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true, as: 'array'}
  ],
  impl: context => {
	  const tree = {}
	  const ctx = context.setVars({ $tree: tree })
	  const nodeModel = ctx.params.nodeModel()
	  if (!nodeModel)
	  	return jb.logError('missing nodeModel in tree',ctx);
	  return jb.ui.ctrl(ctx, features(
			defHandler('flipExpandCollapse', (ctx,{cmp}) => {
				const path = cmp.elemToPath(event.target)
				if (!path) debugger
				cmp.state.expanded[path] = !(cmp.state.expanded[path]);
				cmp.refresh();
			}),
			interactiveProp('model', '%$$model.nodeModel%'),
			interactive( (ctx,{cmp}) => {
				cmp.state.expanded =  { [cmp.model.rootPath] : true }
				tree.cmp = cmp
				cmp.selectionEmitter = new jb.rx.Subject()
				tree.redraw = cmp.redraw = () => cmp.refresh()

				cmp.expandPath = path => {
					const changed = jb.ui.treeExpandPath(cmp.state.expanded,path)
					if (changed) cmp.redraw()
					return changed
				}
				cmp.elemToPath = el => el && (el.getAttribute('path') || jb.ui.closest(el,'.treenode') && jb.ui.closest(el,'.treenode').getAttribute('path'))
			}),
			feature.init( (ctx,{cmp}) => {
				cmp.model = nodeModel
				cmp.state.expanded =  cmp.state.expanded || {}
				jb.ui.treeExpandPath(cmp.state.expanded, nodeModel.rootPath)
			}),
			css('{user-select: none}')
		))
	}
})

jb.ui.treeExpandPath = jb.ui.treeExpandPath || ((expanded, path) => {
	let changed = false
	path.split('~').reduce((base, x) => {
			const inner = base ? (base + '~' + x) : x;
			changed = changed || (!expanded[inner])
			expanded[inner] = true;
			return inner;
		},'')
	return changed
})

class TreeRenderer {
	constructor(args) {
		Object.assign(this,args)
		this.model = this.cmp.model
	}
	renderTree() {
		const {model,h} = this
		if (this.noHead)
			return h('div',{}, model.children(model.rootPath).map(childPath=> this.renderNode(childPath)))
		return this.renderNode(model.rootPath)
	}
	renderNode(path) {
		const {cmp,model,h} = this
		const disabled = model.disabled && model.disabled(path) ? 'jb-disabled' : ''
		const clz = ['treenode', model.isArray(path) ? 'jb-array-node': '',disabled].filter(x=>x).join(' ')
		const children = cmp.state.expanded[path] ? [h('div',{ class: 'treenode-children'} ,
			model.children(path).map(childPath=>this.renderNode(childPath)))] : []

		return h('div',{class: clz, path}, [ this.renderLine(path), ...children ] )
	}
}

jb.component('tree.plain', { /* tree.plain */
  type: 'tree.style',
  params: [
    {id: 'showIcon', as: 'boolean', type: 'boolean'},
    {id: 'noHead', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,showIcon,noHead) => ctx.run(customStyle({
	template: (cmp,state,h) => {
		function renderLine(path) {
			const model = cmp.model
			const icon = model.icon && model.icon(path) || 'radio_button_unchecked';
			return h('div',{ class: `treenode-line`},[
				model.isArray(path) ? h('i',{class:'material-icons noselect flip-icon', onclick: 'flipExpandCollapse', path },
					cmp.state.expanded[path] ? 'keyboard_arrow_down' : 'keyboard_arrow_right') : h('span',{class: 'no-children-holder'}),
				...(showIcon ? [h('i',{class: 'material-icons treenode-icon'}, icon)] : []),
				h('span',{class: 'treenode-label'}, model.title(path,!cmp.state.expanded[path])),
			])
		}
		return new TreeRenderer({cmp,h,showIcon,noHead,renderLine}).renderTree(cmp.model.rootPath)
	},
	css: `|>.treenode-children { padding-left: 10px; min-height: 7px }
	|>.treenode-label { margin-top: -1px }

	|>.treenode-label .treenode-val { color: red; padding-left: 4px; }
	|>.treenode-line { display: flex; box-orient: horizontal; padding-bottom: 3px; align-items: center }

	|>.treenode { display: block }
	|>.flip-icon { font-size: 16px; margin-right: 2px;}
	|>.treenode-icon { font-size: 16px; margin-right: 2px; }

	|>.treenode.selected>*>.treenode-label,.treenode.selected>*>.treenode-label  { background: #D9E8FB;}
	`
  }))
})

jb.component('tree.expand-box', { /* tree.expandBox */
  type: 'tree.style',
  params: [
    {id: 'showIcon', as: 'boolean', type: 'boolean'},
    {id: 'noHead', as: 'boolean', type: 'boolean'},
    {id: 'lineWidth', as: 'string', defaultValue: '300px'}
  ],
  impl: (ctx,showIcon,noHead,lineWidth) => ctx.run(customStyle({
	  template: (cmp,state,h) => {
		function renderLine(path) {
			const model = cmp.model
			const icon = model.icon && model.icon(path) || 'radio_button_unchecked';
			const nochildren = model.isArray(path) ? '' : ' nochildren'
			const collapsed = cmp.state.expanded[path] ? '' : ' collapsed';
			const showIconClass = showIcon ? ' showIcon' : '';

			return h('div',{ class: `treenode-line${collapsed}`},[
				h('button',{class: `treenode-expandbox${nochildren}${showIconClass}`, onclick: 'flipExpandCollapse', path },[
					h('div',{ class: 'frame'}),
					h('div',{ class: 'line-lr'}),
					h('div',{ class: 'line-tb'}),
				]),
				...(showIcon ? [h('i',{class: 'material-icons treenode-icon'}, icon)] : []),
				h('span',{class: 'treenode-label'}, model.title(path,!cmp.state.expanded[path])),
			])
		}
		return new TreeRenderer({cmp,h,showIcon,noHead,renderLine}).renderTree(cmp.model.rootPath)
	  },
	  css: `|>.treenode-children { padding-left: 10px; min-height: 7px }
	|>.treenode-label { margin-top: -2px }
	|>.treenode-label .treenode-val { color: red; padding-left: 4px; }
	|>.treenode-line { display: flex; box-orient: horizontal; width: ${lineWidth}; padding-bottom: 3px;}

	|>.treenode { display: block }
	|>.treenode.selected>*>.treenode-label,.treenode.selected>*>.treenode-label  { background: #D9E8FB;}

	|>.treenode-icon { font-size: 16px; margin-right: 2px; }
	|>.treenode-expandbox { border: none; background: none; position: relative; width:9px; height:9px; padding: 0; vertical-align: top;
		margin-top: 5px;  margin-right: 5px;  cursor: pointer;}
	|>.treenode-expandbox.showIcon { margin-top: 3px }
	|>.treenode-expandbox div { position: absolute; }
	|>.treenode-expandbox .frame { background: #F8FFF9; border-radius: 3px; border: 1px solid #91B193; top: 0; left: 0; right: 0; bottom: 0; }
	|>.treenode-expandbox .line-lr { background: #91B193; top: 4px; left: 2px; width: 5px; height: 1px; }
	|>.treenode-expandbox .line-tb { background: #91B193; left: 4px; top: 2px; height: 5px; width: 1px; display: none;}
	|>.treenode-line.collapsed .line-tb { display: block; }
	|>.treenode.collapsed .line-tb { display: block; }
	|>.treenode-expandbox.nochildren .frame { display: none; }
	|>.treenode-expandbox.nochildren .line-lr { display: none; }
	|>.treenode-expandbox.nochildren .line-tb { display: none;}`
	}))
})

jb.component('tree.selection', { /* tree.selection */
  type: 'feature',
  params: [
    {id: 'databind', as: 'ref', dynamic: true},
    {id: 'autoSelectFirst', as: 'boolean', type: 'boolean'},
    {id: 'onSelection', type: 'action', dynamic: true},
    {id: 'onRightClick', type: 'action', dynamic: true}
  ],
  impl: features(
    ctx => ({
		  onclick: true,
		  componentDidUpdate : cmp => cmp.setSelected(cmp.state.selected),
	  }),
    feature.init(
        (ctx,{cmp},{databind}) => {
		cmp.state.expanded = cmp.state.expanded||{}
		const selectedPath = jb.val(databind())
		selectedPath && jb.ui.treeExpandPath(cmp.state.expanded, selectedPath.split('~').slice(0,-1).join('~'))
	  },
        5
      ),
    interactive(
        (ctx,{cmp},{databind,autoSelectFirst,onSelection,onRightClick}) => {
			const selectedRef = databind()
  			const databindObs = jb.isWatchable(selectedRef) && jb.ui.refObservable(selectedRef,cmp,{srcCtx: ctx}).map(e=>jb.val(e.ref))

			cmp.setSelected = selected => {
				cmp.state.selected = selected
				if (!cmp.base) return
				jb.ui.findIncludeSelf(cmp.base,'.treenode.selected').forEach(elem=>elem.classList.remove('selected'))
				jb.ui.findIncludeSelf(cmp.base,'.treenode').filter(elem=> elem.getAttribute('path') === selected)
					.forEach(elem=> {elem.classList.add('selected'); elem.scrollIntoViewIfNeeded()})
			}
			cmp.getSelected = () => cmp.state.selected = cmp.elemToPath(jb.ui.findIncludeSelf(cmp.base,'.treenode.selected')[0])

			cmp.selectionEmitter.merge(databindObs || [])
				.merge(cmp.onclick.map(event => cmp.elemToPath(event.target)))
				.distinctUntilChanged()
				.filter(x=>x)
				.map(x=> jb.val(x))
				.subscribe(selected=> {
					cmp.setSelected(selected);
					selectedRef && jb.writeValue(selectedRef, selected, ctx);
					onSelection(cmp.ctx.setData(selected));
				})

			cmp.onclick.subscribe(_=>	cmp.regainFocus && cmp.regainFocus())

			if (onRightClick.profile)
				cmp.base.oncontextmenu = (e=> {
					jb.ui.wrapWithLauchingElement(onRightClick,
						ctx.setData(cmp.elemToPath(e.target)), e.target)();
					return false;
				});

			// first auto selection selection
			var first_selected = jb.val(selectedRef);
			if (!first_selected && autoSelectFirst) {
				var first = jb.ui.find(cmp.base.parentNode,'.treenode')[0];
				first_selected = cmp.elemToPath(first);
			}
			if (first_selected)
				jb.delay(1).then(() => cmp.selectionEmitter.next(first_selected))
  	   }
      )
  )
})

jb.component('tree.keyboard-selection', { /* tree.keyboardSelection */
  type: 'feature',
  params: [
    {id: 'onKeyboardSelection', type: 'action', dynamic: true},
    {id: 'onEnter', type: 'action', dynamic: true},
    {id: 'onRightClickOfExpanded', type: 'action', dynamic: true},
    {id: 'autoFocus', type: 'boolean'},
    {id: 'applyMenuShortcuts', type: 'menu.option', dynamic: true}
  ],
  impl: context => ({
			onkeydown: true,
			templateModifier: vdom => {
				vdom.attributes = vdom.attributes || {};
				vdom.attributes.tabIndex = 0
			},
			afterViewInit: cmp=> {
				const keyDownNoAlts = cmp.onkeydown.filter(e=> !e.ctrlKey && !e.altKey)

				context.vars.$tree.regainFocus = cmp.regainFocus = cmp.getKeyboardFocus = cmp.getKeyboardFocus || (_ => {
					jb.ui.focus(cmp.base,'tree.keyboard-selection regain focus',context);
					return false;
				})

				if (context.params.autoFocus)
					jb.ui.focus(cmp.base,'tree.keyboard-selection init autofocus',context);

				keyDownNoAlts.filter(e=> e.keyCode == 13).subscribe(e =>
							runActionInTreeContext(context.params.onEnter))

				keyDownNoAlts.filter(e=> e.keyCode == 38 || e.keyCode == 40)
					.map(event => {
						const diff = event.keyCode == 40 ? 1 : -1;
						const nodes = jb.ui.findIncludeSelf(cmp.base,'.treenode');
						const selectedEl = jb.ui.findIncludeSelf(cmp.base,'.treenode.selected')[0];
						return cmp.elemToPath(nodes[nodes.indexOf(selectedEl) + diff]) || cmp.getSelected();
					}).subscribe(x=> cmp.selectionEmitter.next(x))
				// expand collapse
				keyDownNoAlts
					.filter(e=> e.keyCode == 37 || e.keyCode == 39)
					.subscribe(event => {
						const selected = cmp.getSelected()
						const isArray = cmp.model.isArray(selected);
						if (!isArray || (cmp.state.expanded[selected] && event.keyCode == 39))
							return runActionInTreeContext(context.params.onRightClickOfExpanded);
						if (isArray && selected) {
							cmp.state.expanded[selected] = (event.keyCode == 39);
							cmp.redraw()
						}
					});

				function runActionInTreeContext(action) {
					console.log(cmp.getSelected())
					jb.ui.wrapWithLauchingElement(action,
						context.setData(cmp.getSelected()), jb.ui.findIncludeSelf(cmp.base,'.treenode.selected>.treenode-line')[0])()
				}
				// menu shortcuts - delay in order not to block registration of other features
		    jb.delay(1).then(_=> cmp.base && (cmp.base.onkeydown = e => {
					if ((e.ctrlKey || e.altKey || e.keyCode == 46) // also Delete
					 && (e.keyCode != 17 && e.keyCode != 18)) { // ctrl or alt alone
						var menu = context.params.applyMenuShortcuts(context.setData(cmp.getSelected()));
						if (menu && menu.applyShortcut && menu.applyShortcut(e))
							return false;  // stop propagation
					}
					return false;  // stop propagation always
				}))
			}
		})
})

jb.component('tree.regain-focus', { /* tree.regainFocus */
  type: 'action',
  impl: ctx => ctx.vars.$tree && ctx.vars.$tree.regainFocus && ctx.vars.$tree.regainFocus()
})

jb.component('tree.redraw', { /* tree.redraw */
  type: 'action',
  params: [
    {id: 'strong', type: 'boolean', as: 'boolean'}
  ],
  impl: (ctx,strong) => {
		jb.log('tree',['redraw',ctx.path, ...arguments]);
		return ctx.vars.$tree && ctx.vars.$tree.redraw && ctx.vars.$tree.redraw(strong)
	}
})

jb.component('tree.expand-path', { /* tree.expandPath */
  type: 'action',
  params: [
    {id: 'paths', as: 'array', descrition: 'array of paths to be expanded'}
  ],
  impl: (ctx,paths) => ctx.vars.cmp && paths.forEach(path => jb.ui.treeExpandPath(ctx.vars.cmp.state.expanded, path))
})

jb.component('tree.path-of-interactive-item', { /* tree.pathOfInteractiveItem */
  descrition: 'path of the clicked/dragged item using event.target',
  type: 'data',
  impl: ctx => {
		const {cmp,ev} = ctx.vars
		return cmp && cmp.elemToPath && ev && ev.target && cmp.elemToPath(ev.target)
	}
})

jb.component('tree.drag-and-drop', { /* tree.dragAndDrop */
  type: 'feature',
  impl: ctx => ({
		onkeydown: true,
		componentDidUpdate : cmp => cmp.drake && (cmp.drake.containers = jb.ui.find(cmp.base,'.jb-array-node>.treenode-children')),
  		afterViewInit: cmp => {
        	const drake = cmp.drake = dragula([], {
				moves: el => jb.ui.matches(el,'.jb-array-node>.treenode-children>div')
	    	})
          	drake.containers = jb.ui.find(cmp.base,'.jb-array-node>.treenode-children');
          //jb.ui.findIncludeSelf(cmp.base,'.jb-array-node').map(el=>el.children()).filter('.treenode-children').get();

			drake.on('drag', function(el, source) {
				const path = cmp.elemToPath(el.firstElementChild)
				el.dragged = { path, expanded: cmp.state.expanded[path]}
				delete cmp.state.expanded[path]; // collapse when dragging
			})

			drake.on('drop', (dropElm, target, source,_targetSibling) => {
				if (!dropElm.dragged) return;
				dropElm.parentNode.removeChild(dropElm);
				cmp.state.expanded[dropElm.dragged.path] = dropElm.dragged.expanded; // restore expanded state
				const state = treeStateAsRefs(cmp);
				const targetSibling = _targetSibling; // || target.lastElementChild == dropElm && target.previousElementSibling
				let targetPath = targetSibling ? cmp.elemToPath(targetSibling) : 
					target.lastElementChild ? addToIndex(cmp.elemToPath(target.lastElementChild),1) : cmp.elemToPath(target);
				// strange dragule behavior fix
				const draggedIndex = Number(dropElm.dragged.path.split('~').pop());
				const targetIndex = Number(targetPath.split('~').pop()) || 0;
				if (target === source && targetIndex > draggedIndex)
					targetPath = addToIndex(targetPath,-1)
				cmp.model.move(dropElm.dragged.path,targetPath,ctx);
				restoreTreeStateFromRefs(cmp,state);
				cmp.selectionEmitter.next(targetPath)
				dropElm.dragged = null;
				cmp.redraw(true);
		    })

	        // ctrl up and down
    		cmp.onkeydown.filter(e=>e.ctrlKey && (e.keyCode == 38 || e.keyCode == 40))
				.subscribe(e=> {
					const selected = cmp.getSelected()
					const selectedIndex = Number(selected.split('~').pop());
					if (isNaN(selectedIndex)) return;
					const no_of_siblings = Array.from(cmp.base.querySelector('.treenode.selected').parentNode.children).length;
					const diff = e.keyCode == 40 ? 1 : -1;
					let target = (selectedIndex + diff+ no_of_siblings) % no_of_siblings;
					const state = treeStateAsRefs(tree);
					cmp.model.move(selected, selected.split('~').slice(0,-1).concat([target]).join('~'),ctx)
						
					restoreTreeStateFromRefs(cmp,state);
				})
      		},
  	})
})

treeStateAsRefs = cmp => ({
	selected: pathToRef(cmp.model,cmp.getSelected()),
	expanded: jb.entries(cmp.state.expanded).filter(e=>e[1]).map(e=>pathToRef(cmp.model,e[0]))
})

restoreTreeStateFromRefs = (cmp,state) => {
	if (!cmp.model.refHandler) return
	refToPath(state.selected) && cmp.setSelected(refToPath(state.selected));
	cmp.state.expanded = {};
	state.expanded.forEach(ref=>cmp.state.expanded[refToPath(ref)] = true)
}

pathToRef = (model,path) => path && model.refHandler && model.refHandler.refOfPath(path.split('~'))
refToPath = ref => ref && ref.path ? ref.path().join('~') : ''

addToIndex = (path,toAdd) => {
	if (!path) debugger;
	if (isNaN(Number(path.slice(-1)))) return path
	const index = Number(path.slice(-1)) + toAdd;
	return path.split('~').slice(0,-1).concat([index]).join('~')
}


})()
;

jb.ns('table-tree,tree')
jb.ns('json')

jb.component('table-tree', { /* tableTree */
  type: 'control',
  params: [
    {id: 'treeModel', type: 'tree.node-model', dynamic: true, mandatory: true},
    {id: 'leafFields', type: 'control[]', dynamic: true},
    {id: 'commonFields', type: 'control[]', dynamic: true, as: 'array'},
    {id: 'chapterHeadline', type: 'control', dynamic: true, defaultValue: text(''), description: '$collapsed as parameter'},
    {id: 'style', type: 'table-tree.style', defaultValue: tableTree.plain({}), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true, as: 'array'}
  ],
  impl: ctx => jb.ui.ctrl(ctx)
})

jb.component('tree.model-filter', { /* tree.modelFilter */
  type: 'tree.node-model',
  description: 'filters a model by path filter predicate',
  params: [
    {id: 'model', type: 'tree.node-model', mandatory: true},
    {id: 'pathFilter', type: 'boolean', dynamic: true, mandatory: true, description: 'input is path. e.g a~b~c'}
  ],
  impl: (ctx, model, pathFilter) => Object.assign(Object.create(model),{
                children: path => model.children(path).filter(childPath => pathFilter(ctx.setData(childPath)))
    })
})

jb.component('table-tree.init', { /* tableTree.init */
  type: 'feature',
  params: [
    {id: 'autoOpenFirstLevel', as: 'boolean', type: 'boolean'}
  ],
  impl: features(
    calcProp({
        id: 'expanded',
        value: (ctx,{cmp,$props},{autoOpenFirstLevel}) => {
        const treeModel = cmp.treeModel
        cmp.state = cmp.state || {}
        const firstTime = !cmp.state.expanded
        cmp.state.expanded = cmp.state.expanded || {}
        if (firstTime) {
            const allPathsToExtend = [
                treeModel.rootPath,
                ...(autoOpenFirstLevel && treeModel.children(treeModel.rootPath) || []),
                ...($props.pathsToExtend || []),
            ]
            allPathsToExtend.forEach(path=>expandPathWithChildren(path))
        }
        return cmp.state.expanded

        function expandPathWithChildren(path) {
            path.split('~').reduce((base, x) => {
                const inner = base != null ? (base + '~' + x) : x;
                cmp.state.expanded[inner] = true
                return inner
            },null)
        }
    }
      }),
    calcProp({
        id: 'items',
        value: (ctx,{cmp}) => {
            const treeModel = cmp.treeModel
            if (ctx.vars.$model.includeRoot)
                return calcItems(treeModel.rootPath, 0)
            else
                return calcItems(treeModel.rootPath, -1).filter(x=>x.depth > -1)

            function calcItems(top, depth) {
                const item = [{path: top, depth, val: treeModel.val(top), expanded: cmp.state.expanded[top]}]
                if (cmp.state.expanded[top])
                    return treeModel.children(top).reduce((acc,child) =>
                        depth >= treeModel.maxDepth ? acc : acc = acc.concat(calcItems(child, depth+1)),item)
                return item
            }
        }
      }),
    interactiveProp('treeModel', '%$$model.treeModel%'),
    interactive(
        (ctx,{cmp}) => {
            cmp.state.expanded = jb.objFromEntries(Array.from(cmp.base.querySelectorAll('[expanded=true]'))
                    .map(x=>x.getAttribute('path')).concat([cmp.treeModel.rootPath]).map(x=>[x,true]))
            cmp.flip = (event) => {
                const path = elemToPath(event.target)
                if (!path) debugger
                path.split('~').slice(0,-1).reduce((base, x) => {
                    const inner = base != null ? (base + '~' + x) : x;
                    cmp.state.expanded[inner] = true
                    return inner
                },null)
                cmp.state.expanded[path] = !(cmp.state.expanded[path]);
                cmp.refresh();
            }
            function elemToPath(el) { return el && (el.getAttribute('path') || jb.ui.closest(el,'.jb-item') && jb.ui.closest(el,'.jb-item').getAttribute('path')) }
        }
      ),
    feature.init(
        (ctx,{cmp},{autoOpenFirstLevel}) => {
            const treeModel = cmp.treeModel = ctx.vars.$model.treeModel()
            cmp.renderProps.maxDepth = treeModel.maxDepth = (treeModel.maxDepth || 5)

            cmp.leafFields = calcFields('leafFields')
            cmp.commonFields = calcFields('commonFields')
            cmp.fieldsForPath = path => treeModel.isArray(path) ? cmp.commonFields : cmp.leafFields.concat(cmp.commonFields)
            cmp.headline = item => headlineCmp(item)

            cmp.expandingFieldsOfItem = item => {
                const maxDepthAr = Array.from(new Array(treeModel.maxDepth))
                const depthOfItem = (item.path.match(/~/g) || []).length - (treeModel.rootPath.match(/~/g) || []).length - 1
                // return tds until depth and then the '>' sign, and then the headline
                return maxDepthAr.filter((e,i) => i < depthOfItem+2)
                    .map((e,i) => {
                        if (i < depthOfItem || i == depthOfItem && !treeModel.isArray(item.path))
                            return { empty: true }
                        if (i == depthOfItem) return {
                            expanded: cmp.state.expanded[item.path],
                            toggle: true
                        }
                        if (i == depthOfItem+1) return {
                            headline: true,
                            colSpan: treeModel.maxDepth-i+1
                        }
                        debugger
                    }
                )
            }
            function calcFields(fieldsProp) {
                return ctx.vars.$model[fieldsProp]().map(x=>x.field())
            }
            function headlineCmp(item) {
                return ctx.vars.$model.chapterHeadline(
                        ctx.setData({path: item.path, val: treeModel.val(item.path)})
                            .setVars({item,collapsed: ctx2 => !cmp.state.expanded[item.path]}))
            }
        }
      )
  )
})

jb.component('table-tree.plain', { /* tableTree.plain */
  type: 'table-tree.style',
  params: [
    {id: 'hideHeaders', as: 'boolean', type: 'boolean'},
    {id: 'autoOpenFirstLevel', as: 'boolean', type: 'boolean'},
    {id: 'gapWidth', as: 'number', defaultValue: 30},
    {id: 'expColWidth', as: 'number', defaultValue: 16},
    {id: 'noItemsCtrl', type: 'control', dynamic: true, defaultValue: text('no items')}
  ],
  impl: customStyle({
    template: (cmp,{ expanded, items, maxDepth, hideHeaders, gapWidth, expColWidth, noItemsCtrl},h) => h('table',{},[
        ...Array.from(new Array(maxDepth)).map(f=>h('col',{width: expColWidth + 'px'})),
        h('col',{width: gapWidth + 'px'}),
        ...cmp.leafFields.concat(cmp.commonFields).map(f=>h('col',{width: f.width || '200px'})),
        ...(hideHeaders ? [] : [h('thead',{},h('tr',{},
        Array.from(new Array(maxDepth+1)).map(f=>h('th',{class: 'th-expand-collapse'})).concat(
            [...cmp.leafFields, ...cmp.commonFields].map(f=>h('th',{'jb-ctx': f.ctxId},jb.ui.fieldTitle(cmp,f,h))) )))]),
        h('tbody',{class: 'jb-drag-parent'},
          items.map((item,index)=> h('tr',{ class: 'jb-item', path: item.path, expanded: expanded[item.path] },
            [...cmp.expandingFieldsOfItem(item).map(f=>h('td',
              f.empty ? { class: 'empty-expand-collapse'} :
                f.toggle ? {class: 'expandbox' } : {class: 'headline', colSpan: f.colSpan, onclick: 'flip' },
              f.empty ? '' : f.toggle ? h('span',{}, h('i',{class:'material-icons noselect', onclick: 'flip'  },
                f.expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right')) : h(cmp.headline(item))
              )),
              ...cmp.fieldsForPath(item.path).map(f=>h('td', {'jb-ctx': jb.ui.preserveFieldCtxWithItem(f,item), class: 'tree-field'},
              h(f.control(item,index),{index: index})))
            ]
        ))),
        items.length == 0 ? h(noItemsCtrl()) : ''
      ]),
    css: `{border-spacing: 0; text-align: left;width: 100%; table-layout:fixed;}
      >tbody>tr>td { vertical-align: bottom; height: 30px; }
      >tbody>tr>td>span { font-size:16px; cursor: pointer; border: 1px solid transparent }
      >tbody>tr>td>span>i { font-size: 16px; vertical-align: middle;}
      `,
    features: tableTree.init('%$autoOpenFirstLevel%')
  })
})

jb.component('json.path-selector', { /* json.pathSelector */
  description: 'select, query, goto path',
  params: [
    {id: 'base', as: 'single', description: 'object to start with'},
    {id: 'path', description: 'string with ~ separator or array'}
  ],
  impl: (ctx,base) => {
        const path = jb.val(ctx.params.path)
        const path_array = typeof path == 'string' ? path.split('~').filter(x=>x) : jb.asArray(path)
        return path_array.reduce((o,p) => o && o[p], base)
    }
})

jb.component('table-tree.expand-path', { /* tableTree.expandPath */
  type: 'table-tree.style',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: calcProp({
    id: 'pathsToExtend',
    value: ({},{pathsToExtend},{path}) => [...path.split(','), ...(pathsToExtend || [])],
    phase: 5
  })
})

;

(function() {
jb.component('tree.json-read-only', { /* tree.jsonReadOnly */
  type: 'tree.node-model',
  params: [
    {id: 'object', as: 'single'},
    {id: 'rootPath', as: 'string'}
  ],
  impl: (ctx, json, rootPath) => new ROjson(json,rootPath)
})

class ROjson {
	constructor(json,rootPath) {
		this.json = json;
		this.rootPath = rootPath;
	}
	children(path) {
		var val = this.val(path);
		const out = (typeof val == 'object') ? Object.keys(val || {}) : [];
		return out.filter(p=>p.indexOf('$jb_') != 0).map(p=>path+'~'+p);
	}
	val(path) {
		if (path.indexOf('~') == -1)
			return jb.val(this.json);
		return jb.val(path.split('~').slice(1).reduce((o,p) =>o[p], this.json))
	}
	isArray(path) {
		var val = this.val(path);
		return typeof val == 'object' && val !== null;
	}
	icon() {
		return ''
	}
	title(path,collapsed) {
		var val = this.val(path);
		var prop = path.split('~').pop();
		var h = jb.ui.h;
		if (val == null)
			return h('div',{},prop + ': null');
		if (!collapsed && typeof val == 'object')
			return h('div',{},prop);

		if (typeof val != 'object')
			return h('div',{},[prop + ': ',h('span',{class:'treenode-val', title: ''+val},jb.ui.limitStringLength(''+val,20))]);

		return h('div',{},[h('span',{},prop + ': ')].concat(
			Object.keys(val).filter(p=>p.indexOf('$jb_') != 0).filter(p=> ['string','boolean','number'].indexOf(typeof val[p]) != -1)
			.map(p=> h('span',{class:'treenode-val', title: ''+val[p]},jb.ui.limitStringLength(''+val[p],20)))))
	}
}

jb.component('tree.json', { /* tree.json */
  type: 'tree.node-model',
  params: [
    {id: 'object', as: 'ref'},
    {id: 'rootPath', as: 'string'}
  ],
  impl: function(context, json, rootPath) {
		return new Json(json,rootPath)
	}
})

class Json {
	constructor(jsonRef,rootPath) {
		this.json = jsonRef;
		this.rootPath = rootPath;
		this.refHandler = jb.refHandler(jsonRef)
	}
	children(path) {
		var val = this.val(path);
		const out = (typeof val == 'object') ? Object.keys(val || {}) : [];
		return out.filter(p=>p.indexOf('$jb_') != 0).map(p=>path+'~'+p);
	}
	val(path) {
		if (path.indexOf('~') == -1)
			return jb.val(this.json);
		return jb.val(path.split('~').slice(1).reduce((o,p) =>o[p], jb.val(this.json)))
	}
	isArray(path) {
		var val = this.val(path);
		return typeof val == 'object' && val !== null;
	}
	icon() {
		return ''
	}
	title(path,collapsed) {
		var val = this.val(path);
		var prop = path.split('~').pop();
		var h = jb.ui.h;
		if (val == null)
			return prop + ': null';
		if (!collapsed && typeof val == 'object')
			return prop

		if (typeof val != 'object')
			return h('div',{},[prop + ': ',h('span',{class:'treenode-val', title: val},jb.ui.limitStringLength(val,20))]);

		return h('div',{},[h('span',{},prop + ': ')].concat(
			Object.keys(val).filter(p=> typeof val[p] == 'string' || typeof val[p] == 'number' || typeof val[p] == 'boolean')
			.map(p=> h('span',{class:'treenode-val', title: ''+val[p]},jb.ui.limitStringLength(''+val[p],20)))))
	}
	modify(op,path,args,ctx) {
		op.call(this,path,args);
	}
	move(dragged,_target,ctx) { // drag & drop
		const draggedArr = this.val(dragged.split('~').slice(0,-1).join('~'));
		const target = isNaN(Number(_target.split('~').slice(-1))) ? _target + '~0' : _target
		const targetArr = this.val(target.split('~').slice(0,-1).join('~'));
		if (Array.isArray(draggedArr) && Array.isArray(targetArr))
			jb.move(jb.asRef(this.val(dragged)), this.val(target) ? jb.asRef(this.val(target)) : this.extraArrayRef(target) ,ctx)
	}
	extraArrayRef(target) {
		const targetArr = this.val(target.split('~').slice(0,-1).join('~'));
		const targetArrayRef = jb.asRef(targetArr)
		const handler = targetArrayRef.handler
		return handler && handler.refOfPath(handler.pathOfRef(targetArrayRef).concat(target.split('~').slice(-1)))
	}
}

})();

(function(){

const storeId = Symbol.for("storeId")

jb.ui.serializeCtxOfVdom = function(vdom) {
    const store = {idCounter: 1, ctx: {}, data: {}, strs: []}
    mountCtxsOfVdom(vdom).forEach(ctxId=>serializeCtx(jb.ctxDictionary[ctxId], store))
    return JSON.stringify(store)

    function mountCtxsOfVdom(vdom) { // vdom or delta vdom
        return jb.unique([...([vdom['mount-ctx']] || []), 
            ...(Object.keys(vdom)
                .filter(k=> vdom[k] && typeof vdom[k] === 'object')
                    .flatMap(k=>mountCtxsOfVdom(vdom[k])))
        ]).filter(x=>x)
    }
    function serializeCtx(ctx) {
        if (ctx == null) return
        // store.ctx[ctx.id] = store.ctx[ctx.id] || { id: ctx.id, path: ctx.path , $inProcess: true}
        // Object.assign(store.ctx[ctx.id], { 
        //     componentContext: serializeCtx(ctx.componentContext), 
        //     vars: serializeData(ctx.vars), 
        //     data: serializeData(ctx.data)
        // })
        // delete store.ctx[ctx.id].$inProcess
        store.ctx[ctx.id] = store.ctx[ctx.id] || { id: ctx.id, path: ctx.path }
        return { $ctx: ctx.id }

        function serializeData(data) {
            if (data == null) return
            if (typeof data === 'number') return '#' + data
            if (typeof data === 'string' && data.match(/^#[0-9]+$/)) return '#' + data
            if (typeof data === 'string' && data.length > 10) {
                const index = store.strs.indexOf(data)
                if (index != -1) return { $str: index}
                store.strs.push(data)
                return { $str: store.strs.length -1 }
            }
            if (!data || typeof data !== 'object') return data

            if (data instanceof jb.jbCtx)
                 return { $ctx: serializeCtx(data,store) }
                
            if (data[storeId])
                return store.data[data[storeId]] = data[storeId]

            data[storeId] = store.idCounter++

            const ref = jb.asRef(data)
            const url = ref && ref.handler && ref.handler.urlOfRef(ref)
            if (url)
                store.data[data[storeId]] = url
            else
                store.data[data[storeId]] = jb.objFromEntries(jb.entries(data).map(e=> [e[0], serializeData(e[1])]))
            return data[storeId]
        }    
    }
}

jb.ui.deserializeCtxStore = function(storeAsJson) {
    const store = JSON.parse(storeAsJson)
    const resolvedStore = { data: {}, ctx: {}}
    Object.keys(store.ctx).forEach(k=>deserializeCtx(k))
    return resolvedStore

    function deserializeCtx(id) {
        if (id.$ctx)
            return deserializeCtx(id.$ctx)
        const ctx = store.ctx[id]
        if (resolvedStore.ctx[id]) 
            return resolvedStore.ctx[id]
        resolvedStore.ctx[id] = new jb.jbCtx()
        Object.assign(resolvedStore.ctx[id], { id , path: ctx.path, $inProcess: true })
        Object.assign(resolvedStore.ctx[id], { 
            componentContext: ctx.componentContext && deserializeCtx(ctx.componentContext), 
            vars: deserializeData(ctx.vars) || {}, 
            data: deserializeData(ctx.data),
            profile: ctx.path.split('~').reduce((o,p) => o && o[p],jb.comps)
        })
        if (!resolvedStore.ctx[id].profile) {
            debugger
            ctx.path.split('~').reduce((o,p) => o && o[p],jb.comps)
        }
        delete resolvedStore.ctx[id].$inProcess
        return resolvedStore.ctx[id]

        function deserializeData(data) {
            if (data == null) 
                return
            else if (typeof data === 'string')
                return data.match(/^#[0-9]+$/) ? +data.slice(1) : data.match(/^##[0-9]+$/) ? data.slice(1) : data
            else if (typeof data == 'object' && data.$ctx)
                return deserializeCtx(data.$ctx)
            else if (typeof data == 'object' && data.$str != null)
                return store.strs[data.$str]
            else if (typeof data == 'object')
                return jb.objFromEntries(jb.entries(data).map(e=>[e[0],deserializeData(e[1])]))
            else if (typeof data == 'number') {
                const id = data
                if (resolvedStore.data[id])
                    return resolvedStore.data[id]
                resolvedStore.data[id] = {$inProcess: true}
                Object.keys(store.data[id]).forEach(k=> resolvedStore.data[id][k] = deserializeData(store.data[id][k]))
                delete resolvedStore.data[id].$inProcess
                return resolvedStore.data[id]
            }
        }
    }
}

let messageCounter = 1;

if (jb.frame.isWorker) 
    Object.assign(jb.ui, {
        _stylesToAdd: [],
        widgets: {},
        activeElement() {},
        focus() {},
        updateRenderer(delta,elemId,cmpId,widgetId) {
            const css = this._stylesToAdd.join('\n')
            this._stylesToAdd = []
            const store = jb.ui.serializeCtxOfVdom(delta)
            postMessage(`delta-${widgetId}>`+JSON.stringify({delta,elemId, cmpId, css, store}))
        },
        addStyleElem(innerHtml) {
            this._stylesToAdd.push(innerHtml)
        },
        handleBrowserEvent({cmpId,event,specificHandler,widgetId}) {
            const action = specificHandler ? specificHandler : `on${event.type}Handler`
            const elem = jb.ui.find(jb.ui.widgets[widgetId].top,`[cmp-id="${cmpId}"]`,{includeSelf: true})[0]
            if (elem && event.target.value != null)
                elem.value = event.target.value
            event.target = elem
            ;(elem.attributes.handlers || '').split(',').filter(x=>x.indexOf(action+'-') == 0).forEach(str=> {
                const ctx = jb.ctxDictionary[str.split('-')[1]]
                ctx && ctx.setVars({ev: event, widgetId}).runInner(ctx.profile.action,'action','action')
            })
        },
    })

function createWorker(workerId) {
    const workerReceive = ({data}) => { // this function is serialized and run on the worker
        const messageId = (data.match(/^([0-9]+)>/) || ['',''])[1]
        if (messageId)
            Promise.resolve(jb.exec(eval(data.slice(messageId.length+1))))
                .then(res=>postMessage( messageId+'>'+JSON.stringify(res)))
    }
    const workerCode = `
    self.workerId = ${workerId}
    self.isWorker = true
    importScripts('http://${location.host}/dist/jb-react-all.js')
    self.onmessage= ${workerReceive.toString()}`
    const worker = new Worker(URL.createObjectURL(new Blob([workerCode], {type: 'application/javascript'})));
    
    Object.assign(worker,{
        response: new jb.rx.Subject(),
        onmessage(e) {
            const data = e.data
            const id = (data.match(/^([^>]+)>/) || ['',''])[1]
            jb.log('from-remote',data)
            worker.response.next(({id, data: data.slice(id.length+1) }))
        },
        handleBrowserEvent(el,event,specificHandler) {
            const widgetId = jb.ui.parents(el,{includeSelf: true}).filter(el=>el.getAttribute && el.getAttribute('widgetTop'))
                .map(el=>el.getAttribute('id'))[0]
            return this.exec(pipeline(
                        {$asIs: {
                            specificHandler, 
                            cmpId: el.getAttribute('cmp-id'), 
                            event: {type: event.type, target: { value: event.target.value}, scrollPercentFromTop: event.scrollPercentFromTop },
                            widgetId
                        }},
                        ctx => jb.ui.handleBrowserEvent(ctx.data)))
        },
        loadSource(sourceUrl) {
            if (!sourceUrl) 
                return worker
            const script = pipeline(sourceUrl, ctx => importScripts(ctx.data))
            return worker.exec(script).then(()=>worker)
        },
        exec(prof) {
            const messageId = messageCounter++
            const message = messageId + '>'+ jb.prettyPrint(prof)
            jb.log('to-remote',message)
            console.log('to-remote: ' + message)
            worker.postMessage(message)
            return worker.response.filter(({id}) => id == messageId).take(1).map(({data}) => data).toPromise()
        }
    })
    return worker
}

jb.ui.workers = {}

jb.component('worker.main',{
    type: 'remote',
    impl: ({
        getWorker() {
            if (jb.ui.mainWorker) 
                return Promise.resolve(jb.ui.mainWorker)
            jb.ui.workers[1] = jb.ui.mainWorker = createWorker(1)
            return jb.ui.mainWorker.exec('"init"').then(()=>jb.ui.mainWorker) // wait for first dummy run with empty input
        },
        createWidget(ctx,main,widgetId) { // widget receives events and updates back with vdom deltas
            const widgetProf = pipeline({$asIs: {widgetId,main}}, // runs on worker
                ctx => {
                    const {main, widgetId} = ctx.data
                    const cmp = ctx.setData(null).setVar('widgetId',widgetId).run({$: main})
                    const top = jb.ui.h(cmp)
                    top.attributes = Object.assign(top.attributes || {},{ worker: 1, id: widgetId })
                    jb.ui.widgets[widgetId] = { top }
                    jb.ui.updateRenderer(jb.ui.compareVdom({},top),widgetId,null,widgetId)
            })

            return this.getWorker().then( worker => {
                worker.response.filter(({id}) => id == `delta-${widgetId}`).subscribe(({data}) => {
                    const _data = JSON.parse(data.replace(/"__undefined"/g,'null'))
                    console.log('delta-from-remote',_data)
                    const {delta,elemId,cmpId,css,store} = _data
                    jb.ui.mainWorker.ctxDictionary = jb.ui.mainWorker.ctxDictionary || {}
                    Object.assign(jb.ui.mainWorker.ctxDictionary,jb.ui.deserializeCtxStore(store).ctx)
                    const elem = jb.ui.document(ctx).querySelector('#'+elemId) 
                        || jb.ui.document(ctx).querySelector(`[cmp-id="${cmpId}"]`)
                    elem && jb.ui.applyDeltaToDom(elem, delta)
                    css && jb.ui.addStyleElem(css)
                    jb.ui.findIncludeSelf(elem,'[interactive]').forEach(el=> 
                        el._component ? el._component.recalcPropsFromElem() : jb.ui.mountInteractive(el))
                })            
                return worker.exec(widgetProf)
            })
        },
    })
})

jb.component('remote.init-main-worker', {
    type: 'control',
    params: [
        {id: 'sourceUrl', as: 'string' },
        {id: 'remote', type: 'remote', mandatory: true, defaultValue: worker.main() },
    ],
    impl: (ctx,sourceUrl,remote) => remote.getWorker().then(worker => worker.loadSource(sourceUrl))
})

jb.component('remote.widget', {
    type: 'control',
    params: [
        {id: 'main', as: 'string', description: 'main profile to run'},
        {id: 'id', as: 'string'},
        {id: 'remote', type: 'remote', mandatory: true, defaultValue: worker.main() },
    ],
    impl: (ctx,main,id,remote) => {
        const widgetId = id || 'widget' + ctx.id
        remote.createWidget(ctx,main,widgetId)
        return jb.ui.h('div',{id: widgetId, widgetTop: 'true'})
    }
})

})();

