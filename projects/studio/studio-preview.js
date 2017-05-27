jb.component('studio.preview-widget', {
  type: 'control',
  params: [
    { id: 'style', type: 'preview-style', dynamic: true, defaultValue :{$: 'studio.preview-widget-impl'}  },
    { id: 'width', as: 'number'},
    { id: 'height', as: 'number'},
  ],
  impl: ctx => 
    jb.ui.ctrl(ctx,{
      init: cmp => {
        cmp.state.project = ctx.exp('%$studio/project%');
        cmp.state.cacheKiller = 'cacheKiller='+(''+Math.random()).slice(10);
        document.title = cmp.state.project + ' with jBart';
      },
    })
})

jb.studio.initPreview = function(preview_window,allowedTypes) {
      var st = jb.studio;
      st.previewWindow = preview_window;
      st.previewjb = preview_window.jb;
      st.serverComps = st.previewjb.comps;
      st.compsRefHandler.allowedTypes = jb.studio.compsRefHandler.allowedTypes.concat(allowedTypes);

      preview_window.jb.studio.studioWindow = window;
      preview_window.jb.studio.previewjb = preview_window.jb;
      st.initEventTracker();
      if (preview_window.location.href.match(/\/studio-helper/))
        st.previewjb.studio.initEventTracker();
}

jb.component('studio.preview-widget-impl', {
  type: 'preview-style',
  impl :{$: 'custom-style',
      template: (cmp,state,h) => h('iframe', { 
          id:'jb-preview', 
          sandbox: 'allow-same-origin allow-forms allow-scripts', 
          frameborder: 0, 
          src: '/project/'+ state.project + '?' + state.cacheKiller
      }),
      css: `{box-shadow:  2px 2px 6px 1px gray; margin-left: 2px; margin-top: 2px; width: %$$model/width%px; height: %$$model/height%px; }`
  }
})

jb.component('studio.refresh-preview', {
  type: 'action',
  impl: _ => {}
//    previewRefreshCounter++
})

jb.component('studio.wait-for-preview-iframe', {
  impl: _ => 
    jb.ui.waitFor(()=> 
      jb.studio.previewWindow)
//    previewRefreshCounter++
})

jb.studio.pageChange = jb.ui.resourceChange.filter(e=>e.path.join('/') == 'studio/page')
      .startWith(1)
      .map(e=>jb.resources.studio.project + '.' + jb.resources.studio.page);