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
  resourceReferred(resName) {
    const resource = this.resources()[resName]
    if (!this.objToPath.has(resource))
    this.addObjToMap(resource,[resName])
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

      for(let i=0;i<path.length;i++) { // hash ancestors with jbId because the objects will be re-generated by redux
        const innerPath = path.slice(0,i+1)
        const val = this.valOfPath(innerPath,true)
        if (val && typeof val === 'object' && !val[jbId]) {
            val[jbId] = this.idCounter++
            this.addObjToMap(val,innerPath)
        }
      }

      jb.path(op,path,opOnRef) // create op as nested object
      const opEvent = {op: opOnRef, path, ref, srcCtx, oldVal, opVal, timeStamp: new Date().getTime()}
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
    Array.from(this.objToPath.keys()).filter(k=>startsWithPath(this.objToPath.get(k)))
      .forEach(k=>{
        const newPath = this.objToPath.get(k)
        newPath[propDepth] = fixIndexProp(+newPath[propDepth])
        this.objToPath.set(k,newPath)
      })

    function startsWithPath(toCompare) {
      if (toCompare.length <= propDepth) return
      for(let i=0;i<propDepth;i++)
        if (toCompare[i] != path[i]) return
      return true
    }
    function fixIndexProp(oldIndex) {
      return oldIndex + spliceOp.reduce((delta,ar) => (oldIndex < ar[0]) ? 0 : (ar[2] || []).length - ar[1],0)
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
    {
      id: 'actions',
      type: 'action[]',
      dynamic: true,
      composite: true,
      mandatory: true,
      defaultValue: []
    },
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
