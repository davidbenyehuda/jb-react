(function() {
jb.ui.field_id_counter = jb.ui.field_id_counter || 0;

function databindField(cmp,ctx,debounceTime,oneWay) {
  if (debounceTime) {
    cmp.debouncer = new jb.rx.Subject();
    cmp.debouncer.takeUntil( cmp.destroyed )
      .distinctUntilChanged()
      .debounceTime(debounceTime)
      .subscribe(val=>cmp.jbModel(val))
  }

  if (!ctx.vars.$model || !ctx.vars.$model.databind)
    return jb.logError('bind-field: No databind in model', ctx, ctx.vars.$model);

  cmp.jbModel = (val,source) => {
    if (source == 'keyup') {
      if (cmp.debouncer)
        return cmp.debouncer.next(val);
      return jb.delay(1).then(_=>cmp.jbModel(val)); // make sure the input is inside the value
    }

    if (val === undefined)
      return jb.val(cmp.state.databindRef);
    else { // write
        if (!oneWay)
          cmp.setState({model: val});
        jb.ui.checkValidationError(cmp);
        jb.writeValue(cmp.state.databindRef,val,ctx);
    }
  }

  cmp.refresh = _ => {
    const newRef = ctx.vars.$model.databind();
    if (jb.val(newRef) != jb.val(cmp.state.databindRef))
      cmp.databindRefChanged.next(newRef)
    cmp.setState({model: cmp.jbModel()});
    cmp.refreshMdl && cmp.refreshMdl();
    cmp.extendRefresh && cmp.extendRefresh();
  }

  cmp.state.title = ctx.vars.$model.title();
  cmp.state.fieldId = jb.ui.field_id_counter++;
  cmp.databindRefChangedSub = new jb.rx.Subject();
  cmp.databindRefChanged = cmp.databindRefChangedSub.do(ref=> {
    cmp.state.databindRef = ref
    cmp.state.model = cmp.jbModel()
  })
  cmp.databindRefChanged.subscribe(()=>{}) // first activation
  cmp.databindRefChangedSub.next(ctx.vars.$model.databind());
  

  const srcCtx = cmp.ctxForPick || cmp.ctx;
  if (!oneWay) 
      jb.ui.databindObservable(cmp, {
            watchScript: ctx, onError: _ => cmp.setState({model: null}) })
      .filter(e=>!e || !e.srcCtx || e.srcCtx.path != srcCtx.path) // block self refresh
      .subscribe(e=> !cmp.watchRefOn && jb.ui.setState(cmp,null,e,ctx))
}

jb.component('field.databind', {
  type: 'feature',
  impl: ctx => ({
      beforeInit: cmp => databindField(cmp,ctx)
  })
})

jb.component('field.databind-text', {
  type: 'feature',
  params: [
    { id: 'debounceTime', as: 'number', defaultValue: 0 },
    { id: 'oneWay', type: 'boolean', as: 'boolean'}
  ],
  impl: (ctx,debounceTime,oneWay) => ({
      beforeInit: cmp => databindField(cmp,ctx,debounceTime,oneWay)
  })
})

jb.component('field.data', {
  type: 'data',
  impl: ctx =>
    ctx.vars.$model.databind()
})

jb.component('field.default', {
  type: 'feature',
  params: [
    { id: 'value', type: 'data'},
  ],
  impl: (ctx,defaultValue) => {
    var data_ref = ctx.vars.$model.databind();
    if (data_ref && jb.val(data_ref) == null)
      jb.writeValue(data_ref, jb.val(defaultValue))
  }
})

jb.component('field.init-value', {
  type: 'feature',
  params: [
    { id: 'value', type: 'data'},
  ],
  impl: (ctx,value) =>
    ctx.vars.$model.databind && jb.writeValue(ctx.vars.$model.databind(), jb.val(value))
})

jb.component('field.keyboard-shortcut', {
  type: 'feature', category: 'events',
	description: 'listen to events at the document level even when the component is not active',
  params: [
    { id: 'key', as: 'string', description: 'e.g. Alt+C' },
    { id: 'action', type: 'action', dynamic: true },
  ],
  impl: (context,key,action) => ({
      afterViewInit: cmp =>
      jb.rx.Observable.fromEvent(cmp.base.querySelector('input'), 'keydown')
            .takeUntil( cmp.destroyed )
            .subscribe(event=>{
              var keyStr = key.split('+').slice(1).join('+');
              var keyCode = keyStr.charCodeAt(0);
              if (key == 'Delete') keyCode = 46;

              var helper = (key.match('([A-Za-z]*)+') || ['',''])[1];
              if (helper == 'Ctrl' && !event.ctrlKey) return
              if (helper == 'Alt' && !event.altKey) return
              if (event.keyCode == keyCode || (event.key && event.key == keyStr))
                action();
            })
      })
})

jb.component('field.subscribe', {
  type: 'feature',
  params: [
    { id: 'action', type: 'action', mandatory: true, dynamic: true },
    { id: 'includeFirst', type: 'boolean', as: 'boolean'},
  ],
  impl: (context,action,includeFirst) => ({
    init: cmp => {
      const includeFirstEm = includeFirst ? jb.rx.Observable.of({ref: cmp.state.databindRef}) : jb.rx.Observable.of();
      jb.ui.databindObservable(cmp,{watchScript: context})
            .merge(includeFirstEm)
            .map(e=>jb.val(e.ref))
            .filter(x=>x)
            .subscribe(x=>
              action(context.setData(x)));
    }
  })
})

jb.component('field.on-change', jb.comps['field.subscribe'])

jb.component('field.toolbar', {
  type: 'feature',
  params: [
    { id: 'toolbar', type: 'control', mandatory: true, dynamic: true },
  ],
  impl: (context,toolbar) => ({
    toolbar: toolbar().reactComp()
  })
})

// ***** validation 

jb.component('validation', {
  type: 'feature', category: 'validation:100',
  params: [
    { id: 'validCondition', mandatory: true, type: 'boolean', as: 'boolean', dynamic: true },
    { id: 'errorMessage', mandatory: true, as: 'string', dynamic: true },
  ],
  impl: (ctx,validCondition,errorMessage) => ({
      init: cmp =>
        cmp.validations = (cmp.validations || []).concat([ctx.params]),
      afterViewInit: cmp =>  { // for preview
          var _ctx = ctx.setData(cmp.state.model);
          validCondition(_ctx); errorMessage(_ctx);
      }
  })
})

jb.ui.checkValidationError = cmp => {
  var err = validationError(cmp);
  if (cmp.state.error != err) {
    jb.log('field',['setErrState',ctx,err])
    cmp.setState({valid: !err, error:err});
  }

  function validationError() {
    if (!cmp.validations) return;
    var ctx = cmp.ctx.setData(cmp.state.model);
    var err = (cmp.validations || [])
      .filter(validator=>!validator.validCondition(ctx))
      .map(validator=>validator.errorMessage(ctx))[0];
    if (ctx.vars.formContainer)
      ctx.vars.formContainer.err = err;
    return err;
  }  
}

})()