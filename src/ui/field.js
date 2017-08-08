jb.ui.field_id_counter = jb.ui.field_id_counter || 0;

jb.component('field.databind', {
  type: 'feature',
  impl: ctx => ({
      beforeInit: cmp => {
        if (!ctx.vars.$model || !ctx.vars.$model.databind)
          return jb.logError('bind-field: No databind in model', ctx.vars.$model, ctx);
        cmp.state.title = ctx.vars.$model.title();
        cmp.state.fieldId = jb.ui.field_id_counter++;
        cmp.state.model = jb.val(ctx.vars.$model.databind);

        cmp.refresh = _ => {
          cmp.setState({model: cmp.jbModel()});
          cmp.refreshMdl && cmp.refreshMdl();
          cmp.extendRefresh && cmp.extendRefresh();
        }

        cmp.jbModel = (val,source) => {
          if (val === undefined)
            return jb.val(ctx.vars.$model.databind);
          else { // write
              jb.writeValue(ctx.vars.$model.databind,val,ctx);
          }
        }

        jb.ui.refObservable(ctx.vars.$model.databind,cmp,{throw: true})
            .catch(e=>cmp.refresh() || [])
            .subscribe(e=>jb.ui.setState(cmp,null,e,ctx))
      }
  })
})

jb.component('field.databind-text', {
  type: 'feature',
  params: [
    { id: 'debounceTime', as: 'number', defaultValue: 0 },
    { id: 'oneWay', type: 'boolean', as: 'boolean'}
  ],
  impl: (ctx,debounceTime,oneWay) => ({
      beforeInit: cmp => {
        if (debounceTime) {
          cmp.debouncer = new jb.rx.Subject();
          cmp.debouncer.takeUntil( cmp.destroyed )
          .distinctUntilChanged()
          .debounceTime(debounceTime)
          .subscribe(val=>cmp.jbModel(val))
        }

        if (!ctx.vars.$model || !ctx.vars.$model.databind)
          return jb.logError('bind-field: No databind in model', ctx.vars.$model, ctx);
        cmp.state.title = ctx.vars.$model.title();
        cmp.state.fieldId = jb.ui.field_id_counter++;
        cmp.state.model = jb.val(ctx.vars.$model.databind);

        cmp.jbModel = (val,source) => {
          if (source == 'keyup') {
            if (cmp.debouncer)
              return cmp.debouncer.next(val);
            return jb.delay(1).then(_=>cmp.jbModel(val)); // make sure the input is inside the value
          }

          if (val === undefined)
            return jb.val(ctx.vars.$model.databind);
          else { // write
              cmp.setState({model: val});
              jb.writeValue(ctx.vars.$model.databind,val,ctx);
          }
        }

        var srcCtx = cmp.ctxForPick || cmp.ctx;
        if (!oneWay) jb.ui.refObservable(ctx.vars.$model.databind,cmp,{ throw: true})
            .filter(e=>!e || !e.srcCtx || e.srcCtx.path != srcCtx.path) // block self refresh
            .catch(e=>cmp.setState({model: null}) || [])
            .subscribe(e=>jb.ui.setState(cmp,{model: cmp.jbModel()},e,ctx))
      }
  })
})

jb.component('field.databind-range', {
  type: 'feature',
  impl: ctx => ({
      beforeInit: cmp => {
        if (!ctx.vars.$model || !ctx.vars.$model.databind)
          return jb.logError('bind-field: No databind in model', ctx.vars.$model, ctx);
        cmp.state.title = ctx.vars.$model.title();
        cmp.state.fieldId = jb.ui.field_id_counter++;
        cmp.state.model = jb.val(ctx.vars.$model.databind);

        cmp.jbModel = (val,source) => {
          if (val === undefined)
            return jb.val(ctx.vars.$model.databind);
          else { // write
              jb.writeValue(ctx.vars.$model.databind,val,ctx);
          }
        }

        var srcCtx = cmp.ctxForPick || cmp.ctx;
        jb.ui.refObservable(ctx.vars.$model.databind,cmp)
            .filter(e=>!e || !e.srcCtx || e.srcCtx.path != srcCtx.path) // block self refresh
            .subscribe(e=>jb.ui.setState(cmp,{model: cmp.jbModel()},e,ctx))
      }
  })
})

// jb.component('field.databind', {
//   type: 'feature',
//   params: [
//     { id: 'noUpdates', as: 'boolean' },
//   ],
//   impl: (ctx,noUpdates) => {
//     if (!ctx.vars.$model || !ctx.vars.$model.databind)
//       jb.logError('bind-field: No databind in model', ctx.vars.$model, ctx);
//     return {
//       noUpdates: noUpdates,
//       beforeInit: function(cmp) {
//         cmp.state.title = ctx.vars.$model.title();
//         cmp.state.fieldId = jb.ui.field_id_counter++;
//         cmp.state.model = jb.val(ctx.vars.$model.databind);

//         var srcCtx = cmp.ctxForPick || cmp.ctx;
//         cmp.jbModel = (val,source) => {
//           if (val === undefined)
//             return jb.val(ctx.vars.$model.databind);
//           else { // write
//             if (cmp.inputEvents && source == 'keyup')
//               cmp.inputEvents.next(val); // used for debounce
//             else if (!ctx.vars.$model.updateOnBlur || source != 'keyup') {
//               jb.writeValue(ctx.vars.$model.databind,val,srcCtx);
//               cmp.setState({model,val});
//             }
//           }
//         }
//         if (!noUpdates) {
//           jb.ui.refObservable(ctx.vars.$model.databind,cmp)
//             .filter(e=>!e || cmp.allowSelfRefresh || !e.srcCtx || e.srcCtx.path != srcCtx.path) // block self refresh
//             .subscribe(e=>jb.ui.setState(cmp,{model:jb.val(ctx.vars.$model.databind)},e,ctx))
//         }
//       }
//   }}
// })

// jb.component('field.debounce-databind', {
//   type: 'feature',
//   description: 'debounce input content writing to databind via keyup',
//   params: [
//     { id: 'debounceTime', as: 'number', defaultValue: 500 },
//   ],
//   impl: (ctx,debounceTime) =>
//     ({
//       init: cmp => {
//           cmp.inputEvents = cmp.inputEvents || new jb.rx.Subject();
//           cmp.inputEvents.takeUntil( cmp.destroyed )
//             .distinctUntilChanged()
//             .debounceTime(debounceTime)
//             .subscribe(val=>
//               jb.writeValue(ctx.vars.$model.databind,val)
//           )
//       },
//     })
// })

jb.component('field.data', {
  type: 'data',
  impl: ctx =>
    ctx.vars.$model.databind
})

jb.component('field.default', {
  type: 'feature',
  params: [
    { id: 'value', type: 'data'},
  ],
  impl: function(context,defaultValue) {
    var data_ref = context.vars.$model.databind;
    if (data_ref && jb.val(data_ref) == null)
      jb.writeValue(data_ref,defaultValue)
  }
})

jb.component('field.subscribe', {
  type: 'feature',
  params: [
    { id: 'action', type: 'action', essential: true, dynamic: true },
    { id: 'includeFirst', type: 'boolean', as: 'boolean'},
  ],
  impl: (context,action,includeFirst) => ({
    init: cmp => {
      var data_ref = context.vars.$model && context.vars.$model.databind;
      if (!data_ref) return;
      var includeFirstEm = includeFirst ? jb.rx.Observable.of(jb.val(data_ref)) : jb.rx.Observable.of();
      jb.ui.refObservable(data_ref,cmp)
            .map(e=>jb.val(e.ref))
            .merge(includeFirstEm)
            .filter(x=>x)
            .subscribe(x=>
              action(context.setData(x)));
    }
  })
})

jb.component('field.toolbar', {
  type: 'feature',
  params: [
    { id: 'toolbar', type: 'control', essential: true, dynamic: true },
  ],
  impl: (context,toolbar) =>
  ({
    toolbar: toolbar().reactComp()
  })
})
