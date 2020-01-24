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
            content: contentEditable.toolbar(),
            features: dialogFeature.onClose(ctx=>ctx.vars.deactivateContentEditable(ctx))
    }))
})

jb.component('content-editable.activation-icon', {
  type: 'action',
  impl: openDialog({
          style: contentEditable.popupStyle(),
          content: button({
            title: 'Edit',
            action: ctx => ctx.vars.activateContentEditable(ctx),
            style: button.mdcIcon('edit'),
            features: dialogFeature.onClose(ctx=>ctx.vars.cleanActivationIcon(ctx))
          })
  })
})

jb.component('content-editable.popup-style', {
    type: 'dialog.style',
    impl: customStyle({
      template: (cmp,state,h) => h('div',{ class: 'jb-dialog jb-popup'},h(state.contentComp)),
      css: `{ position: absolute; background: white; padding: 6px;
              box-shadow: 2px 2px 3px #d5d5d5; border: 1px solid rgb(213, 213, 213); }
      `,
      features: [
        dialogFeature.uniqueDialog('content-editable-toolbar'),
        dialogFeature.maxZIndexOnClick(),
        dialogFeature.closeWhenClickingOutside(),
        dialogFeature.nearLauncherPosition({offsetLeft: 100, offsetTop: ctx => 
          document.querySelector('#jb-preview').getBoundingClientRect().top
          - jb.ui.computeStyle(ctx.vars.inspectedElem,'marginBottom')
        })
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
        title: 'Change Style',
        action: action.if(equals(studio.compName(studio.currentProfilePath()), 'image'),
          studio.openProperties(),
          studio.openPickProfile(
            join({separator: '~', items: list(studio.currentProfilePath(), 'style')})
          )
        ),
        style: button.mdcIcon('style')
      }),
      button({
        title: 'positions',
        action: [
          contentEditable.openPositionThumbs(),
        ],
        style: button.mdcIcon('vertical_align_center')
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
        title: 'Duplicate data item',
        action: ctx => jb.ui.contentEditable.duplicateDataItem(ctx),
        style: button.mdcIcon('control_point'),
        features: feature.if('%$sourceItem%')
      }),
      button({
        vars: Var('parentLayout', ctx =>
          jb.studio.parents(ctx.run(studio.currentProfilePath())).find(path=> jb.studio.compNameOfPath(path) == 'group') + '~layout'),
        title: 'Layout',
        action: studio.openPickProfile('%$parentLayout%'),
        style: button.mdcIcon('view_quilt')
      }),
      button({
        title: 'Properties',
        action: studio.openProperties(true),
        style: button.mdcIcon('storage')
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
  setPositionScript(el,cssProp,side,value,ctx) {
      const prop = cssProp == 'height' ? cssProp : side 
      const featureComp = {$: `css.${cssProp}`, [prop] : value }
      const originatingCtx = jb.studio.previewjb.ctxDictionary[el.getAttribute('jb-ctx')]
      let featuresRef = jb.studio.refOfPath(originatingCtx.path + '~features')
      let featuresVal = jb.val(featuresRef)
      if (!featuresVal) {
        jb.writeValue(scriptRef,featureComp,ctx)
      } else if (!Array.isArray(featuresVal) && featuresVal[0].$ == featureComp.$) {
        jb.writeValue(jb.studio.refOfPath(originatingCtx.path + `~features~${prop}`),value,ctx)
      } else {
        if (!Array.isArray(featuresVal)) { // wrap with array
          jb.writeValue(featuresVal,[featuresVal],ctx)
          featuresVal = jb.val(featuresRef)
        }
        const existingFeature = featuresVal.findIndex(f=>f.$ == featureComp.$)
        if (existingFeature != -1)
          jb.writeValue(jb.studio.refOfPath(originatingCtx.path + `~features~${existingFeature}~${prop}`),value,ctx)
        else
          jb.push(featuresVal,featureComp)
      }
  },
  setScriptData(ev,cmp,prop,isHtml) {
      const vdomCmp = jb.studio.previewjb.ctxDictionary[cmp.base.getAttribute('jb-ctx')].runItself()
      vdomCmp.renderVdom()
      const resourceRef = vdomCmp.toObserve.filter(e=>e.id == prop).map(e=>e.ref)[0]
      const scriptRef = this.scriptRef(vdomCmp,prop)
      const val = isHtml ? ev.target.innerHTML : ev.target.innerText
      if (resourceRef)
          jb.studio.previewjb.writeValue(resourceRef,val,vdomCmp.ctx)
      else if (scriptRef)
          jb.writeValue(scriptRef,val,vdomCmp.ctx)
    },
  showActivationIcon(ev,cmp) {
      cmp.base.style.background = 'linear-gradient(90deg, rgba(2,0,36,0.4598214285714286) 0%, rgba(255,255,255,1) 100%)'
      cmp.base.style.borderRadius = '3px'
      const ctx = new jb.jbCtx()
        .setVar('inspectedElem', cmp.base)
        .setVar('activateContentEditable', () => {
            cmp.refresh({contentEditableActive: true})
            jb.delay(100).then(() => { // wait for new position because of zoom
              ctx.setVar('sourceItem',cmp.ctx.vars.item)
                .setVar('$launchingElement',{ el : cmp.base})
                .run({$: 'content-editable.open-toolbar', path: cmp.ctx.path})
              cmp.base.focus()
            })
          }).setVar('deactivateContentEditable', () => {
            cmp.refresh({contentEditableActive: false})
          })
          .setVar('cleanActivationIcon', () => {
            cmp.base.style = ''
          })
      ctx.setVar('$launchingElement',{ el : ev.target}).run({$: 'content-editable.activation-icon'})
    },
    handleKeyEvent(ev,cmp,prop) {
        if (ev.keyCode == 13) {
            this.setScriptData(ev,cmp,prop)
            jb.delay(1).then(() => cmp.refresh({contentEditableActive: false})) // can not wait for script change delay
            jb.ui.dialogs.closePopups()
            return false // does not work..
        }
    },
    scriptRef(cmp,prop) {
        const ref = jb.studio.refOfPath(cmp.originatingCtx().path + '~' + prop)
        const val = jb.val(ref)
        return typeof val === 'string' && cmp.ctx.exp(val) === val && ref
    },
    refOfProp(cmp,prop) {
        return cmp.toObserve.filter(e=>e.id == prop).map(e=>e.ref)[0] || this.scriptRef(cmp,prop)
    },
    duplicateDataItem(ctx) {
      const st = jb.studio
      const item = ctx.vars.sourceItem
      const _jb = st.previewjb
      const ref = _jb.asRef(item)
      const handler = _jb.refHandler(ref)
      const path = handler.pathOfRef(ref)
      const parent_ref = handler.refOfPath(path.slice(0,-1))
      if (parent_ref && Array.isArray(_jb.val(parent_ref))) {
        const clone = st.previewWindow.JSON.parse(JSON.stringify(item));
        const index = Number(path.slice(-1));
        _jb.splice(parent_ref,[[index, 0,clone]],ctx);
        ctx.run(runActions(dialog.closeAll(), studio.refreshPreview()))
      }
    },
}

jb.component('feature.content-editable', {
  type: 'feature',
  description: 'studio editing behavior',
  params: [
    {id: 'param', as: 'string', description: 'name of param mapped to the content editable element' },
  ],
  impl: (ctx,param) => ({
    afterViewInit1: cmp => {
      const isHtml = param == 'html'
      const contentEditable = jb.ui.contentEditable
      if (contentEditable) {
        cmp.onblurHandler = ev => contentEditable.setScriptData(ev,cmp,param,isHtml)
        if (!isHtml)
          cmp.onkeydownHandler = cmp.onkeypressHandler = ev => contentEditable.handleKeyEvent(ev,cmp,param)
        cmp.onmousedownHandler = ev => contentEditable.showActivationIcon(ev,cmp)
      }
    },
    templateModifier: (vdom,cmp) => {
      const contentEditable = jb.ui.contentEditable
      if (!contentEditable || param && !contentEditable.refOfProp(cmp,param)) return vdom
      const attsToInject = cmp.state.contentEditableActive ? {contenteditable: 'true', onblur: true, onmousedown: true, onkeypress: true, onkeydown: true} : {onmousedown: true};
      // fix spacebar bug in button
      if (vdom.tag && vdom.tag.toLowerCase() == 'button' && vdom.children && vdom.children.length == 1 && typeof vdom.children[0] == 'string') {
        vdom.children[0] = jb.ui.h('span',attsToInject,vdom.children[0])
        return vdom
      } else if (vdom.tag && vdom.tag.toLowerCase() == 'button' && jb.ui.findInVdom(vdom,'mdc-button__label')) {
        const atts = jb.ui.findInVdom(vdom,'mdc-button__label').attributes
        Object.assign(atts,attsToInject,{style: [(atts.style || ''),'z-index: 100'].filter(x=>x).join(';') })
        return vdom
      }
      vdom.attributes = vdom.attributes || {};
      Object.assign(vdom.attributes,attsToInject)
      return vdom;
    },
    dynamicCss: ctx => ctx.vars.cmp.state.contentEditableActive &&
      `{background-image: linear-gradient(17deg,rgba(243,248,255,.03) 63.45%,rgba(207,214,229,.27) 98%); border-radius: 3px;}`
  })
})
