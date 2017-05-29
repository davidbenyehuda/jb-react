jb.component('table', {
  type: 'control', category: 'group:80,common:70',
  params: [
    { id: 'title', as: 'string' },
    { id: 'items', as: 'array' , dynamic: true, essential: true, ref: true },
    { id: 'fields', type: 'table-field[]', essential: true, dynamic: true },
    { id: 'style', type: 'table.style', dynamic: true , defaultValue: { $: 'table.with-headers' } },
    { id: 'watchItems', as: 'boolean' },
    { id: 'features', type: 'feature[]', dynamic: true, flattenArray: true },
  ],
  impl: ctx => 
    jb.ui.ctrl(ctx)
})

jb.component('field', {
  type: 'table-field',
  params: [
    { id: 'title', as: 'string', essential: true },
    { id: 'data', as: 'string', essential: true, dynamic: true },
    { id: 'width', as: 'number' },
    { id: 'class', as: 'string' },
  ],
  impl: (ctx,title,data,width,_class) => ({
    title: title,
    fieldData: row => data(ctx.setData(row)),
    class: _class,
    width: width,
    ctxId: jb.ui.preserveCtx(ctx)
  })
})

jb.component('field.control', {
  type: 'table-field',
  params: [
    { id: 'title', as: 'string', essential: true },
    { id: 'control', type: 'control' , dynamic: true, essential: true },
    { id: 'width', as: 'number' },
  ],
  impl: (ctx,title,control,width) => ({
    title: title,
    control: row => control(ctx.setData(row)).reactComp(),
    width: width,
    ctxId: jb.ui.preserveCtx(ctx)
  })
})

jb.component('table.init', {
  type: 'feature',
  impl: ctx => ({
      beforeInit: cmp => {
        cmp.items = cmp.state.items = jb.toarray(jb.val(ctx.vars.$model.items(cmp.ctx)));
        cmp.fields = ctx.vars.$model.fields();

        cmp.initWatchByRef = refToWatch =>
            jb.ui.refObservable(refToWatch,cmp)
              .subscribe(e=>
                jb.ui.setState(cmp,{items: cmp.items = jb.toarray(jb.val(ctx.vars.$model.items(cmp.ctx)))},e));
        if (ctx.vars.$model.watchItems)
          cmp.initWatchByRef(ctx.vars.$model.items(cmp.ctx))
      },
  })
})

jb.component('table.with-headers', {
  type: 'table.style',
  impl :{$: 'custom-style',
    template: (cmp,state,h) => h('table',{},[
        h('thead',{},h('tr',{},cmp.fields.map(f=>h('th',{'jb-ctx': f.ctxId, width: f.width ? f.width + 'px' : '' },f.title)) )),
        h('tbody',{class: 'jb-drag-parent'},
            state.items.map(item=> jb.ui.item(cmp,h('tr',{ 'jb-ctx': jb.ui.preserveCtx(cmp.ctx.setData(item))},cmp.fields.map(f=>
              h('td', { 'jb-ctx': f.ctxId, class: f.class, width: f.width ? f.width + 'px' : '' }, f.control ? h(f.control(item)) : f.fieldData(item))))
              ,item))
        )]),
    features:{$: 'table.init'},
    css: '{border-spacing: 0; text-align: left}'
  }
})

