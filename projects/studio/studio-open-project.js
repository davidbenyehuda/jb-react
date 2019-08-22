jb.component('studio.goto-project', {
  type: 'action', 
  impl :{$: 'runActions', 
    actions: [
      {$: 'goto-url', 
        url: '/project/studio/%%', 
        target: 'new tab'
      }, 
      {$: 'dialog.close-containing-popup' }
    ]
  }
})

jb.component('studio.choose-project', {
  type: 'control', 
  impl :{$: 'group', 
    title: 'itemlist-with-find', 
    controls: [
      {$: 'itemlist-container.search', 
        features :{$: 'css.width', width: '250' }
      }, 
      {$: 'itemlist', 
        items :{
          $pipeline: [
            '%projects%', 
            {$: 'itemlist-container.filter' }
          ]
        }, 
        controls :{$: 'button', 
          title :{$: 'highlight', base: '%%', highlight: '%$itemlistCntrData/search_pattern%' }, 
          action :{$: 'studio.goto-project' }, 
          style :{$: 'button.mdl-flat-ripple' }, 
          features :{$: 'css', css: '{ text-align: left; width: 250px }' }
        }, 
        features: [
          {$: 'itemlist.selection' }, 
          {$: 'itemlist.keyboard-selection', 
            onEnter :{$: 'studio.goto-project' }, 
            autoFocus: true
          }, 
          {$: 'watch-ref', ref: '%$itemlistCntrData/search_pattern%' }, 
          {$: 'css.height', height: '400', overflow: 'scroll' }
        ]
      }
    ], 
    features: [
      {$: 'group.wait', 
        for :{$: 'http.get', url: '/?op=projects', json: 'true' }
      }, 
      {$: 'css.padding', top: '15', left: '15' }, 
      {$: 'group.itemlist-container' }
    ]
  }
})

jb.component('studio.open-project', {
  type: 'action', 
  impl :{$: 'open-dialog', 
    title: 'Open project', 
    style :{$: 'dialog.dialog-ok-cancel', okLabel: 'OK', cancelLabel: 'Cancel' }, 
    content :{$: 'studio.choose-project' }
  }
})