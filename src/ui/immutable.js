(function() {
  var ui = jb.ui;


class ImmutableWithPath {
  constructor(resources) {
    this.resources = resources;
    this.resourceVersions = {};
    this.pathId = 0;
    this.resourceChange = new jb.rx.Subject();
  }
  val(ref) {
    if (ref.$jb_val) return ref.$jb_val();
    if (!ref.$jb_path) return ref;

    var resource = ref.$jb_path[0];
    if (ref.$jb_resourceV == this.resourceVersions[resource]) 
      return ref.$jb_cache;
    this.refresh(ref);
    if (!ref.$jb_path)
      return ref;
    return ref.$jb_cache = ref.$jb_path.reduce((o,p)=>o[p],this.resources());
  }
  writeValue(ref,value) {
    if (!ref) 
      return jb.logError('writeValue: null ref');

    if (ref.$jb_val) 
      return ref.$jb_val(value);
    if (!ref.$jb_path) return;

    this.refresh(ref);
    if (ref.$jb_path.length == 0)
      return jb.logError('writeValue: ref not found');

    var op = {}, resource = ref.$jb_path[0];
    jb.path(op,ref.$jb_path,{$set: value});
    this.markPath(ref.$jb_path);
    this.resources(ui.update(this.resources(),op));
    this.resourceVersions[resource] = this.resourceVersions[resource] ? this.resourceVersions[resource]+1 : 1;
    this.resourceChange.next({op: op, path: ref.$jb_path});
  }
  splice(ref,args) {
    if (!this.isRef(ref))
      ref = this.asRef(ref);
    if (!ref) return;

    this.refresh(ref);
    if (ref.$jb_path.length == 0)
      return jb.logError('writeValue: ref not found');

    var op = {}, resource = ref.$jb_path[0];
    jb.path(op,ref.$jb_path,{$splice: args });
    this.markPath(ref.$jb_path);
    this.resources(ui.update(this.resources(),op));
    this.resourceVersions[resource] = this.resourceVersions[resource] ? this.resourceVersions[resource]+1 : 1;
    this.resourceChange.next({op: op, path: ref.$jb_path});
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
        $jb_cache: path.reduce((o,p)=>o[p],this.resources())
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
        $jb_parentOfPrim: objRef.$jb_cache 
      }
    } else {
      return obj[prop]; // not reffable
    }
  }
  refresh(ref) {
    var path = ref.$jb_path, new_ref = {};
    if (this.resourceVersions[path[0]] == ref.$jb_resourceV) return;
    if (ref.$jb_parentOfPrim) {
      var parent = this.asRef(ref.$jb_parentOfPrim);
      if (!parent)
        return jb.logError('refresh: parent not found');
      var prop = path.slice(-1)[0];
      new_ref = {
        $jb_path: parent.$jb_path.concat([prop]),
        $jb_resourceV: this.resourceVersions[path[0]],
        $jb_cache: parent.$jb_cache && parent.$jb_cache[prop],
        $jb_parentOfPrim: parent.$jb_path.reduce((o,p)=>o[p],this.resources()),
      }
    } else {
      var path = this.pathOfObject(ref.$jb_cache,this.resources()[path[0]]);
      if (path) new_ref = {
        $jb_path: path,
        $jb_resourceV: this.resourceVersions[path[0]],
        $jb_cache: path.reduce((o,p)=>o[p],this.resources()),
      }
    }
    Object.assign(ref,new_ref);
  }
  markPath(path) {
    path.reduce((o,p)=>{ 
      o.$jb_id = o.$jb_id || (++this.pathId);
      return o[p] 
    }, this.resources())
  }
  pathOfObject(obj,lookIn,depth) {
    if (!lookIn || typeof lookIn != 'object' || depth > 50) 
      return;
    var proto = Object.getPrototypeOf(lookIn);
    if (proto != Object.prototype && proto != Array.prototype) return; // just simple data objects

    if (lookIn === obj || (lookIn.$jb_id && lookIn.$jb_id == obj.$jb_id)) 
      return [];
    for(var p in lookIn) {
      var res = this.pathOfObject(obj,lookIn[p],(depth||0)+1);
      if (res) 
        return [p].concat(res);
    }
  }
  refObservable (ref,cmp) {
    if (!ref) 
      return jb.rx.Observable.of();
    if (ref.$jb_path) {
      return this.resourceChange
        .takeUntil(cmp.destroyed)
        .filter(e=>e.path[0] == ref.$jb_path[0])
        .filter(e=> { // same resource - refind itself
          jb.refreshRef(ref);
          return e.path.join('~').indexOf((ref.$jb_path||[]).join('~')) == 0
        })
        .map(_=>
          jb.val(ref))
        .distinctUntilChanged()
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

jb.ui.refObservable = (ref,cmp) => 
  jb.valueByRefHandler.refObservable(ref,cmp);

jb.ui.ImmutableWithPath = ImmutableWithPath;
jb.ui.resourceChange = jb.valueByRefHandler.resourceChange;

})()