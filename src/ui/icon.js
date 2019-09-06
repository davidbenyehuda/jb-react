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
  impl: ctx =>
		jb.ui.ctrl(ctx,{init: cmp=> cmp.state.icon = ctx.params.icon})
})

jb.component('icon.icon-in-button', { /* icon.iconInButton */
  type: 'icon-with-action.style',
  impl: customStyle(
    (cmp,state,h) => h('button',{ class: 'mdl-button mdl-button--icon mdl-js-button mdl-js-ripple-effect', onclick: ev => cmp.clicked(ev) },
		      h('i',{ class: 'material-icons' }, state.icon))
  )
})

jb.component('icon.material', { /* icon.material */
  type: 'icon-with-action.style',
  impl: customStyle(
    (cmp,state,h) => h('i',{ class: 'material-icons' }, state.icon)
  )
})
