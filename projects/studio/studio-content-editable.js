jb.ns('content-editable')

jb.component('content-editable.open-toolbar', {
    type: 'action',
    params: [
        {id: 'path', as: 'string'},
    ],
    impl: runActions(
        writeValue('%$studio/profile_path%','%$path%'),
        openDialog({
            style: contentEditable.popupStyle(),
            content: contentEditable.toolbar()
    }))
})

jb.component('content-editable.open-layout', {
  type: 'action',
  params: [
      {id: 'path', as: 'string'},
  ],
  impl: runActions(
      writeValue('%$studio/profile_path%','%$path%'),
      openDialog({
//          style: contentEditable.popupStyle(),
          content: contentEditable.toolbar()
  }))
})

jb.component('content-editable.popup-style', {
    type: 'dialog.style',
    impl: customStyle({
      template: (cmp,state,h) => h('div',{ class: 'jb-dialog jb-popup'},h(state.contentComp)),
      css: '{ position: absolute; background: white; box-shadow: 2px 2px 3px #d5d5d5; padding: 3px 0; border: 1px solid rgb(213, 213, 213) }',
      features: [
        dialogFeature.uniqueDialog('content-editable-toolbar'),
        dialogFeature.maxZIndexOnClick(),
        dialogFeature.closeWhenClickingOutside(),
        dialogFeature.nearLauncherPosition({offsetLeft: 100, offsetTop: () => document.querySelector('#jb-preview').getBoundingClientRect().top})
      ]
   })
})

jb.component('studio.open-toolbar-of-last-edit', { /* studio.openToolbarOfLastEdit */
  type: 'action',
  impl: ctx => {
      const path = ctx.run(studio.lastEdit())
      jb.delay(500).then(()=>{
        const _window = jb.studio.previewWindow;
        const el = Array.from(_window.document.querySelectorAll('[jb-ctx]'))
          .filter(e=> jb.path(_window.jb.ctxDictionary[e.getAttribute('jb-ctx')],'path') == path)[0]
        if (el)
          new jb.jbCtx().setVar('$launchingElement',{ el }).run({$: 'content-editable.open-toolbar', path })
      })
    }
})

jb.component('content-editable.toolbar', { /* contentEditable.toolbar */
  type: 'control',
  impl: group({
    layout: layout.horizontal(),
    controls: [
      button({
        title: 'Edit Style',
        action: action.if(equals(studio.compName(studio.currentProfilePath()), 'image'),
          studio.openProperties(),
          studio.openPickProfile(
            join({separator: '~', items: list(studio.currentProfilePath(), 'style')})
          )
        ),
        style: button.mdcIcon('border_color')
      }),
      button({
        title: 'Insert Control',
        action: studio.openNewProfileDialog({
          type: 'control',
          mode: 'insert-control',
          onClose: studio.openToolbarOfLastEdit()
        }),
        style: button.mdcIcon('add')
      }),
      button({
        vars: Var('parentLayout', ctx =>
          jb.studio.parents(ctx.run(studio.currentProfilePath())).find(path=> jb.studio.compNameOfPath(path) == 'group') + '~layout'),
        title: 'Layout',
        action: studio.openPickProfile('%$parentLayout%'),
        style: button.mdcIcon('view_quilt')
      }),
      button({
        title: 'Delete',
        action: studio.delete(studio.currentProfilePath()),
        style: button.mdcIcon('delete')
      })
     ],
    features: variable({name:'showTree', value: false, watchable: true})
  })
})

jb.ui.contentEditable = {
    setScriptData(ev,cmp,prop,isHtml) {
        const resourceRef = cmp.toObserve.filter(e=>e.id == prop).map(e=>e.ref)[0]
        const scriptRef = this.scriptRef(cmp,prop)
        const val = isHtml ? ev.target.innerHTML : ev.target.innerText
        if (resourceRef)
            jb.studio.previewjb.writeValue(resourceRef,val,cmp.ctx)
        else if (scriptRef)
            jb.writeValue(scriptRef,val,cmp.ctx)
    },
    openToolbar(ev,path) { 
        new jb.jbCtx().setVar('$launchingElement',{ el : ev.target})
            .run({$: 'content-editable.open-toolbar', path })
    },
    handleKeyEvent(ev,cmp,prop) {
        if (ev.keyCode == 13) {
            this.setScriptData(ev,cmp,prop)
            if (!cmp._destroyed)
                cmp.strongRefresh()
            return false
        }
    },
    scriptRef(cmp,prop) {
        const ref = jb.studio.refOfPath(cmp.ctx.path + '~' + prop)
        const val = jb.val(ref)
        return typeof val === 'string' && ref
    },
    refOfProp(cmp,prop) {
        return cmp.toObserve.filter(e=>e.id == prop).map(e=>e.ref)[0] || this.scriptRef(cmp,prop)
    }
}