(function() {

class ImmutableWithPath {
  constructor(resources) {
    this.resources = resources;
    this.resourceVersions = {};
    this.pathId = 0;
    this.allowedTypes = [Object.getPrototypeOf({}),Object.getPrototypeOf([])];
    this.resourceChange = new jb.rx.Subject();
  }
  val(ref) {
    if (ref == null) return ref;
    if (ref.$jb_val) return ref.$jb_val();
    if (!ref.$jb_path) return ref;
    if (ref.handler != this) 
      return ref.handler.val(ref)

    var resource = ref.$jb_path[0];
    if (ref.$jb_resourceV == this.resourceVersions[resource]) 
      return ref.$jb_cache;
    this.refresh(ref);
    if (ref.$jb_invalid)
      return null;
    return ref.$jb_cache = ref.$jb_path.reduce((o,p)=>o[p],this.resources());
  }
  writeValue(ref,value,srcCtx) {
    if (!ref) 
      return jb.logError('writeValue: null ref');
    if (this.val(ref) == value) return;
    if (ref.$jb_val)
      return ref.$jb_val(value);
    return this.doOp(ref,{$set: value},srcCtx)
  }
  splice(ref,args,srcCtx) {
    return this.doOp(ref,{$splice: args },srcCtx)
  }
  push(ref,value,srcCtx) {
    return this.doOp(ref,{$push: value},srcCtx)
  }
  merge(ref,value,srcCtx) {
    return this.doOp(ref,{$merge: value},srcCtx)
  }
  doOp(ref,opOnRef,srcCtx) {
    if (!this.isRef(ref))
      ref = this.asRef(ref);
    if (!ref) return;
    var oldRef = Object.assign({},ref),oldResources = this.resources();

    if (!this.refresh(ref)) return;
    if (ref.$jb_path.length == 0)
      return jb.logError('doOp: ref not found');

    var op = {}, resource = ref.$jb_path[0];
    jb.path(op,ref.$jb_path,opOnRef);
    this.markPath(ref.$jb_path);
    this.resources(jb.ui.update(this.resources(),op));
    this.resourceVersions[resource] = this.resourceVersions[resource] ? this.resourceVersions[resource]+1 : 1;
    this.resourceChange.next({op: op, path: ref.$jb_path, ref: ref, srcCtx: srcCtx, val: jb.val(ref),
        oldRef: oldRef, oldResources: oldResources, timeStamp: new Date().getTime()});
    return ref;
  }
  asRef(obj) {
    if (!obj) return;
    if (obj && (obj.$jb_path || obj.$jb_val))
        return obj;

    var path = this.pathOfObject(obj,this.resources());
    if (path)
      return {
        $jb_path: path,
        $jb_resourceV: this.resourceVersions[path[0]],
        $jb_cache: path.reduce((o,p)=>o[p],this.resources()),
        handler: this,
      }
    return obj;
  }
  isRef(ref) {
    return ref && (ref.$jb_path || ref.$jb_val);
  }
  objectProperty(obj,prop) {
    if (!obj) 
      return jb.logError('objectProperty: null obj');
    var objRef = this.asRef(obj);
    if (objRef && objRef.$jb_path) {
      return {
        $jb_path: objRef.$jb_path.concat([prop]),
        $jb_resourceV: objRef.$jb_resourceV,
        $jb_cache: objRef.$jb_cache[prop],
        $jb_parentOfPrim: objRef.$jb_cache, 
        handler: this,
      }
    } else {
      return obj[prop]; // not reffable
    }
  }
  refresh(ref) {
    try {
      var path = ref.$jb_path, new_ref = {};
      if (!path)
        return jb.logError('refresh: empty path');
      if (path.length == 1) return true;
      if (this.resourceVersions[path[0]] == ref.$jb_resourceV) return true;
      if (ref.$jb_parentOfPrim) {
        var parent = this.asRef(ref.$jb_parentOfPrim);
        if (!parent || !this.isRef(parent)) {
          ref.$jb_invalid = true;
          return jb.logError('refresh: parent not found');
        }
        var prop = path.slice(-1)[0];
        new_ref = {
          $jb_path: parent.$jb_path.concat([prop]),
          $jb_resourceV: this.resourceVersions[path[0]],
          $jb_cache: parent.$jb_cache && parent.$jb_cache[prop],
          $jb_parentOfPrim: parent.$jb_path.reduce((o,p)=>o[p],this.resources()),
          handler: this,
        }
      } else {
        var found_path = ref.$jb_cache && this.pathOfObject(ref.$jb_cache,this.resources()[path[0]]);
        if (!found_path) {
          this.pathOfObject(ref.$jb_cache,this.resources()[path[0]]);
          ref.$jb_invalid = true;
          return jb.logError('refresh: object not found');
        }
        var new_path = [path[0]].concat(found_path);
        if (new_path) new_ref = {
          $jb_path: new_path,
          $jb_resourceV: this.resourceVersions[new_path[0]],
          $jb_cache: new_path.reduce((o,p)=>o[p],this.resources()),
          handler: this,
        }
      }
      Object.assign(ref,new_ref);
    } catch (e) {
       ref.$jb_invalid = true;
       return jb.logException(e,'ref refresh ',ref);
    }
    return true;
  }
  refOfPath(path,silent) {
      try {
        var val = path.reduce((o,p)=>o[p],this.resources()),parent = null;
        if (typeof val != 'object') 
          parent = path.slice(0,-1).reduce((o,p)=>o[p],this.resources());
          return {
            $jb_path: path,
            $jb_resourceV: this.resourceVersions[path[0]],
            $jb_cache: val,
            $jb_parentOfPrim: parent,
            handler: this,
          }
      } catch (e) {
        if (!silent)
          jb.logException(e,'ref from path ' + path);
      }
  }
  markPath(path) {
    var leaf = path.reduce((o,p)=>{ 
      o.$jb_id = o.$jb_id || (++this.pathId);
      return o[p] 
    }, this.resources());
    if (leaf && typeof leaf == 'object')
      leaf.$jb_id = leaf.$jb_id || (++this.pathId);
  }
  pathOfObject(obj,lookIn,depth) {
    if (!lookIn || typeof lookIn != 'object' || lookIn.$jb_path || lookIn.$jb_val || depth > 50) 
      return;
    if (this.allowedTypes.indexOf(Object.getPrototypeOf(lookIn)) == -1) 
      return;

    if (lookIn === obj || (lookIn.$jb_id && lookIn.$jb_id == obj.$jb_id)) 
      return [];
    for(var p in lookIn) {
      var res = this.pathOfObject(obj,lookIn[p],(depth||0)+1);
      if (res) 
        return [p].concat(res);
    }
  }
  // valid(ref) {
  //   return ref.$jb_path && ref.$jb_path.filter(x=>!x).length == 0;
  // }
  refObservable(ref,cmp,includeChildren) {
    if (ref && ref.$jb_observable)
      return ref.$jb_observable(cmp);
    if (!ref || !this.isRef(ref)) 
      return jb.rx.Observable.of();
    if (ref.$jb_path) {
      return this.resourceChange
        .takeUntil(cmp.destroyed)
        .filter(e=>
            e.ref.$jb_path[0] == ref.$jb_path[0])
        .filter(e=> { 
          var path = e.ref.$jb_path;
          var changeInParent = (ref.$jb_path||[]).join('~').indexOf(path.join('~')) == 0;
          if (changeInParent) // change in self or parent - refind itself
            jb.refreshRef(ref);
          if (includeChildren)
            return changeInParent || path.join('~').indexOf((ref.$jb_path||[]).join('~')) == 0;
          return changeInParent;
        })
        .distinctUntilChanged((e1,e2)=> 
          e1.val == e2.val)
    }
    return jb.rx.Observable.of(jb.val(ref));
  }
}

function resourcesRef(val) {
  if (typeof val == 'undefined') 
    return jb.resources;
  else
    jb.resources = val;
}

jb.valueByRefHandler = new ImmutableWithPath(resourcesRef);

jb.ui.refObservable = (ref,cmp,includeChildren) =>
  jb.refHandler(ref).refObservable(ref,cmp,includeChildren);

jb.ui.ImmutableWithPath = ImmutableWithPath;
jb.ui.resourceChange = jb.valueByRefHandler.resourceChange;

})()