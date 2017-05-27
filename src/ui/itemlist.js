jb.component('itemlist', {
  type: 'control', category: 'group:80,common:80',
  params: [
    { id: 'title', as: 'string' },
    { id: 'items', as: 'array' , dynamic: true, essential: true, ref: true },
    { id: 'controls', type: 'control[]', essential: true, dynamic: true },
    { id: 'style', type: 'itemlist.style', dynamic: true , defaultValue: { $: 'itemlist.ul-li' } },
    { id: 'watchItems', as: 'boolean' },
    { id: 'itemVariable', as: 'string', defaultValue: 'item' },
    { id: 'features', type: 'feature[]', dynamic: true, flattenArray: true },
  ],
  impl: ctx => 
    jb.ui.ctrl(ctx)
})

jb.component('itemlist.init', {
  type: 'feature',
  params: [
    { id: 'items', as: 'array', essential: true, dynamic: true, ref: true },
    { id: 'itemVariableName', as: 'string' },
  ],
  impl: (context, items, itemVariableName,watch) => ({
      beforeInit: cmp => {
        cmp.items2ctrls = function(items) {
            if (context.vars.itemlistCntr)
              context.vars.itemlistCntr.items = items;
            var ctx2 = (cmp.refreshCtx ? cmp.refreshCtx() : cmp.ctx).setData(items);
            var ctx3 = itemVariableName ? ctx2.setVars(jb.obj(itemVariableName,items)) : ctx2;
            var ctrls = context.vars.$model.controls(ctx3);
            return ctrls;
        }

        cmp.itemsRef = items(cmp.ctx);
        cmp.items = jb.toarray(jb.val(cmp.itemsRef));
        cmp.state.ctrls = cmp.items2ctrls(cmp.items).map(c=>c.reactComp());

        cmp.initWatchByRef = refToWatch =>
            jb.ui.refObservable(refToWatch,cmp)
              .subscribe(e=> {
                var _items = jb.toarray(jb.val(items(cmp.ctx)));
                if (_items.length != 0 && jb.compareArrays(_items,cmp.items))
                  return;
                cmp.items = _items;
                var ctrls = cmp.items2ctrls(cmp.items); 
                jb.ui.setState(cmp,{ctrls:ctrls.map(c=>c.reactComp())},e)
              });
      },
  })
})

jb.component('itemlist.watch-items', {
  type: 'feature', category: 'itemlist:70',
  impl: (ctx,ref) => ({
      init: cmp => {
        if (cmp.initWatchByRef && jb.isRef(cmp.itemsRef)) 
          cmp.initWatchByRef(cmp.itemsRef);
      }
  })
})

jb.component('itemlist.divider', {
  type: 'feature',
  params: [
    { id: 'space', as: 'number', defaultValue: 5}
  ],
  impl : (ctx,space) =>
    ({css: `>.jb-item:not(:first-of-type) { border-top: 1px solid rgba(0,0,0,0.12); padding-top: ${space}px }`})
})

// ****************** Selection ******************

jb.component('itemlist.selection', {
  type: 'feature',
  params: [
    { id: 'databind', as: 'ref', defaultValue: '%itemlistCntrData/selected%' },
    { id: 'onSelection', type: 'action', dynamic: true },
    { id: 'onDoubleClick', type: 'action', dynamic: true },
    { id: 'autoSelectFirst', type: 'boolean'},
    { id: 'cssForSelected', as: 'string', defaultValue: 'background: #bbb !important; color: #fff !important' },
  ],
  impl: ctx => ({
    onclick: true,
    afterViewInit: cmp => {
        cmp.selectionEmitter = new jb.rx.Subject();
        cmp.clickEmitter = new jb.rx.Subject();

        cmp.selectionEmitter
          .merge(cmp.clickEmitter)
          .distinctUntilChanged()
          .filter(x=>x)
          .subscribe( selected => {
              ctx.params.databind && jb.writeValue(ctx.params.databind,selected);
              cmp.setState({selected: selected});
              ctx.params.onSelection(cmp.ctx.setData(selected));
          });

        jb.ui.refObservable(ctx.params.databind,cmp).subscribe(e=>
          jb.ui.setState(cmp,{selected: jb.val(e.ref)},e))

        // double click
        var clickEm = cmp.clickEmitter.takeUntil( cmp.destroyed );
        clickEm.buffer(clickEm.debounceTime(250))
          .filter(buff => buff.length === 2)
          .subscribe(buff=>
            ctx.params.onDoubleClick(cmp.ctx.setData(buff[1])));

        cmp.jbEmitter.filter(x=> x =='after-update').subscribe(x=>{
          if (cmp.state.selected && cmp.items.indexOf(cmp.state.selected) == -1)
              cmp.setState({selected: null});
          if (!cmp.state.selected)
            autoSelectFirst()
        })
        
        function autoSelectFirst() {
          if (ctx.params.autoSelectFirst && cmp.items[0] && !jb.val(ctx.params.databind))
              cmp.selectionEmitter.next(cmp.items[0])
        };
        autoSelectFirst();
    },
    extendItem: (cmp,vdom,data) => {
      jb.ui.toggleClassInVdom(vdom,'selected',cmp.state.selected == data);
      vdom.attributes.onclick = _ => 
        cmp.clickEmitter.next(data)
    },
    css: '>.selected , >*>.selected { ' + ctx.params.cssForSelected + ' }',
  })
})

jb.component('itemlist.keyboard-selection', {
  type: 'feature',
  params: [
    { id: 'onEnter', type: 'action', dynamic: true },
    { id: 'autoFocus', type: 'boolean' }
  ],
  impl: ctx => ({
      afterViewInit: function(cmp) {
        var onkeydown = (ctx.vars.itemlistCntr && ctx.vars.itemlistCntr.keydown) || (ctx.vars.selectionKeySource && ctx.vars.selectionKeySource.keydown);
        if (!onkeydown) {
          cmp.base.setAttribute('tabIndex','0');
          onkeydown = jb.rx.Observable.fromEvent(cmp.base, 'keydown')

          if (ctx.params.autoFocus)
            jb.ui.focus(cmp.base,'itemlist.keyboard-selection init autoFocus')
        }
        cmp.onkeydown = onkeydown.takeUntil( cmp.destroyed );          

        cmp.onkeydown.filter(e=> e.keyCode == 13 && cmp.state.selected)
          .subscribe(x=>
            ctx.params.onEnter(cmp.ctx.setData(cmp.state.selected)));
    
        cmp.onkeydown.filter(e=> !e.ctrlKey &&
              (e.keyCode == 38 || e.keyCode == 40))
            .map(event => {
              event.stopPropagation();
              var diff = event.keyCode == 40 ? 1 : -1;
              var items = cmp.items;
              return items[(items.indexOf(cmp.state.selected) + diff + items.length) % items.length] || cmp.state.selected;
        }).subscribe(x=>
          cmp.selectionEmitter && cmp.selectionEmitter.next(x)
        )
      },
    })
})

jb.component('itemlist.drag-and-drop', {
  type: 'feature',
  params: [
  ],
  impl: ctx => ({
      afterViewInit: function(cmp) {
        var drake = dragula([cmp.base.querySelector('.jb-drag-parent') || cmp.base] , {
          moves: (el,source,handle) => 
            $(handle).hasClass('drag-handle')
        });

        drake.on('drag', function(el, source) { 
          var item = el.getAttribute('jb-ctx') && jb.ctxDictionary[el.getAttribute('jb-ctx')].data;
          if (!item) {
            var item_comp = el._component || (el.firstElementChild && el.firstElementChild._component);
            item = item_comp && item_comp.ctx.data;
          }
          el.dragged = { 
            item: item,
            remove: item => cmp.items.splice(cmp.items.indexOf(item), 1)
          }
          cmp.selectionEmitter && cmp.selectionEmitter.next(el.dragged.item);
        });
        drake.on('drop', (dropElm, target, source,sibling) => {
            var draggedIndex = cmp.items.indexOf(dropElm.dragged.item);
            var targetIndex = sibling ? $(sibling).index() : cmp.items.length;
            jb.splice(cmp.items,[[draggedIndex,1],[targetIndex-1,0,dropElm.dragged.item]],ctx);

            dropElm.dragged = null;
        });

        // ctrl + Up/Down
//        jb.delay(1).then(_=>{ // wait for the keyboard selection to register keydown
          if (!cmp.onkeydown) return;
          cmp.onkeydown.filter(e=> 
            e.ctrlKey && (e.keyCode == 38 || e.keyCode == 40))
            .subscribe(e=> {
              var diff = e.keyCode == 40 ? 1 : -1;
              var selectedIndex = cmp.items.indexOf(cmp.state.selected);
              if (selectedIndex == -1) return;
              var index = (selectedIndex + diff+ cmp.items.length) % cmp.items.length;
              jb.splice(cmp.items,[[selectedIndex,1],[index,0,cmp.state.selected]],ctx);
          })
//        })
      }
    })
})

jb.component('itemlist.ul-li', {
  type: 'itemlist.style',
  impl :{$:'itemlist.use-group-style', groupStyle :{$: 'group.ul-li' }}
})

jb.component('itemlist.horizontal', {
  type: 'itemlist.style',
  impl :{$:'itemlist.use-group-style', groupStyle :{$: 'layout.horizontal-wrapped' }}
})


jb.component('itemlist.use-group-style', {
  type: 'itemlist.style',
  params: [
    { id: 'groupStyle', type: 'group.style', dynamic: true },
  ],
  impl :{$: 'style-by-control', __innerImplementation: true,
    modelVar: 'itemlistModel',
    control: {$: 'group', 
      features : [
        {$: 'group.init-group'},
        {$: 'itemlist.init', items: '%$itemlistModel/items%', itemVariableName: 'items_array' },
        {$if: '%$itemlistModel/watchItems%', then :{$: 'itemlist.watch-items'} }
      ], 
      style :{$call :'groupStyle'},
      controls :{$: 'dynamic-controls', 
        controlItems : '%$items_array%',
        genericControl: '%$itemlistModel/controls%',
        itemVariable: '%$itemlistModel/itemVariable%',
      },
    }
  }
})