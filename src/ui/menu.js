jb.ns('menuStyle')
jb.ns('menuSeparator')
jb.ns('mdl')

jb.component('menu.menu', { /* menu.menu */
  type: 'menu.option',
  params: [
    {id: 'title', as: 'string', dynamic: true, mandatory: true},
    {
      id: 'options',
      type: 'menu.option[]',
      dynamic: true,
      flattenArray: true,
      mandatory: true,
      defaultValue: []
    },
    {id: 'optionsFilter', type: 'data', dynamic: true, defaultValue: '%%'}
  ],
  impl: ctx => ({
		options: ctx2 => ctx.params.optionsFilter(ctx.setData(ctx.params.options(ctx2))),
		title: ctx.params.title(),
		applyShortcut: function(e) {
			return this.options().reduce((res,o)=> res || (o.applyShortcut && o.applyShortcut(e)),false)
		},
		ctx: ctx
	})
})

jb.component('menu.options-group', { /* menu.optionsGroup */
  type: 'menu.option',
  params: [
    {
      id: 'options',
      type: 'menu.option[]',
      dynamic: true,
      flattenArray: true,
      mandatory: true
    }
  ],
  impl: (ctx,options) =>
			options()
})

jb.component('menu.dynamic-options', { /* menu.dynamicOptions */
  type: 'menu.option',
  params: [
    {id: 'items', type: 'data', as: 'array', mandatory: true, dynamic: true},
    {id: 'genericOption', type: 'menu.option', mandatory: true, dynamic: true}
  ],
  impl: (ctx,items,generic) =>
		items().map(item =>
				generic(ctx.setVars({menuData: item}).setData(item)))
})

jb.component('menu.end-with-separator', { /* menu.endWithSeparator */
  type: 'menu.option',
  params: [
    {
      id: 'options',
      type: 'menu.option[]',
      dynamic: true,
      flattenArray: true,
      mandatory: true
    },
    {id: 'separator', type: 'menu.option', as: 'array', defaultValue: menu.separator()},
    {id: 'title', as: 'string'}
  ],
  impl: (ctx) => {
		const options = ctx.params.options();
		if (options.length > 0)
			return options.concat(ctx.params.separator)
		return []
	}
})


jb.component('menu.separator', { /* menu.separator */
  type: 'menu.option',
  impl: ctx => ({ separator: true })
})

jb.component('menu.action', { /* menu.action */
  type: 'menu.option',
  params: [
    {id: 'title', as: 'string', dynamic: true, mandatory: true},
    {id: 'action', type: 'action', dynamic: true, mandatory: true},
    {id: 'icon', as: 'string'},
    {id: 'shortcut', as: 'string'},
    {id: 'showCondition', type: 'boolean', as: 'boolean', defaultValue: true}
  ],
  impl: ctx =>
		ctx.params.showCondition ? ({
			leaf : ctx.params,
			action: _ => ctx.params.action(ctx.setVars({topMenu:null})), // clean topMenu from context after the action
			title: ctx.params.title(ctx),
			applyShortcut: e=> {
				if (jb.ui.checkKey(e,ctx.params.shortcut)) {
					e.stopPropagation();
					ctx.params.action();
					return true;
				}
			},
			ctx: ctx
		}) : null
})

// ********* actions / controls ************

jb.component('menu.control', { /* menu.control */
  type: 'control,clickable,menu',
  params: [
    {id: 'menu', type: 'menu.option', dynamic: true, mandatory: true},
    {
      id: 'style',
      type: 'menu.style',
      defaultValue: menuStyle.contextMenu(),
      dynamic: true
    },
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: ctx => {
		const menuModel = ctx.params.menu() || { options: [], ctx: ctx, title: ''};
		return jb.ui.ctrl(ctx.setVars({
			topMenu: ctx.vars.topMenu || { popups: []},
			menuModel: menuModel,
		}),{ctxForPick: menuModel.ctx })
	}
})

jb.component('menu.open-context-menu', { /* menu.openContextMenu */
  type: 'action',
  params: [
    {id: 'menu', type: 'menu.option', dynamic: true, mandatory: true},
    {
      id: 'popupStyle',
      type: 'dialog.style',
      dynamic: true,
      defaultValue: dialog.contextMenuPopup()
    },
    {id: 'features', type: 'dialog-feature[]', dynamic: true}
  ],
  impl: openDialog({
    style: call('popupStyle'),
    content: menu.control({menu: call('menu'), style: menuStyle.contextMenu()}),
    features: call('features')
  })
})

// ********* styles ************

jb.component('menu-style.pulldown', { /* menuStyle.pulldown */
  type: 'menu.style',
  params: [
    {
      id: 'innerMenuStyle',
      type: 'menu.style',
      dynamic: true,
      defaultValue: menuStyle.popupAsOption()
    },
    {
      id: 'leafOptionStyle',
      type: 'menu-option.style',
      dynamic: true,
      defaultValue: menuStyle.optionLine()
    },
    {
      id: 'layout',
      type: 'group.style',
      dynamic: true,
      defaultValue: itemlist.horizontal()
    }
  ],
  impl: styleByControl(
    itemlist({
      vars: [
        Var('optionsParentId', ctx => ctx.id),
        Var('innerMenuStyle', ctx => ctx.componentContext.params.innerMenuStyle),
        Var('leafOptionStyle', ctx => ctx.componentContext.params.leafOptionStyle)
      ],
      items: '%$menuModel/options%',
      controls: menu.control({menu: '%$item%', style: menuStyle.popupThumb()}),
      style: call('layout'),
      features: menu.selection()
    })
  )
})

jb.component('menu-style.context-menu', { /* menuStyle.contextMenu */
  type: 'menu.style',
  params: [
    {
      id: 'leafOptionStyle',
      type: 'menu-option.style',
      dynamic: true,
      defaultValue: menuStyle.optionLine()
    }
  ],
  impl: styleByControl(
    itemlist({
      vars: [
        Var('optionsParentId', ctx => ctx.id),
        Var('leafOptionStyle', ctx => ctx.componentContext.params.leafOptionStyle)
      ],
      items: '%$menuModel/options%',
      controls: menu.control({menu: '%$item%', style: menuStyle.applyMultiLevel({})}),
      features: menu.selection(true)
    })
  )
})


jb.component('menu.init-popup-menu', { /* menu.initPopupMenu */
  type: 'feature',
  params: [
    {
      id: 'popupStyle',
      type: 'dialog.style',
      dynamic: true,
      defaultValue: dialog.contextMenuPopup()
    }
  ],
  impl: ctx =>
		({
			destroy: cmp =>
				cmp.closePopup(),
			afterViewInit: cmp => {
				cmp.setState({title: ctx.vars.menuModel.title});

				cmp.mouseEnter = _ => {
					if (jb.ui.find('.context-menu-popup')[0]) // first open with click...
  					cmp.openPopup()
				};
				cmp.openPopup = jb.ui.wrapWithLauchingElement( ctx2 => {
					cmp.ctx.vars.topMenu.popups.push(ctx.vars.menuModel);
							ctx2.run( {$: 'menu.open-context-menu',
								popupStyle: _ctx => ctx.params.popupStyle(_ctx),
								menu: _ctx =>
									ctx.vars.$model.menu()
							})
						} , cmp.ctx, cmp.base );

				cmp.closePopup = () => jb.ui.dialogs.closeDialogs(jb.ui.dialogs.dialogs
              .filter(d=>d.id == ctx.vars.optionsParentId))
              .then(()=> cmp.ctx.vars.topMenu.popups.pop()),

				jb.delay(1).then(_=>{ // wait for topMenu keydown initalization
					if (ctx.vars.topMenu && ctx.vars.topMenu.keydown) {
						const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );

							keydown.filter(e=>e.keyCode == 39) // right arrow
									.subscribe(_=>{
										if (ctx.vars.topMenu.selected == ctx.vars.menuModel && cmp.openPopup)
											cmp.openPopup();
									})
							keydown.filter(e=>e.keyCode == 37) // left arrow
									.subscribe(_=>{
										if (cmp.ctx.vars.topMenu.popups.slice(-1)[0] == ctx.vars.menuModel) {
											ctx.vars.topMenu.selected = ctx.vars.menuModel;
											cmp.closePopup();
										}
									})
						}
				})
			}
		})
})

jb.component('menu.init-menu-option', { /* menu.initMenuOption */
  type: 'feature',
  impl: ctx =>
		({
		afterViewInit: cmp => {
			const leafParams = ctx.vars.menuModel.leaf;
					cmp.setState({title:  leafParams.title() ,icon : leafParams.icon ,shortcut: leafParams.shortcut});
					cmp.action = jb.ui.wrapWithLauchingElement( () =>
            jb.ui.dialogs.closePopups()
//              .then(()=>jb.delay(50))
              .then(() =>	ctx.vars.menuModel.action())
					, ctx, cmp.base);

				jb.delay(1).then(_=>{ // wait for topMenu keydown initalization
				if (ctx.vars.topMenu && ctx.vars.topMenu.keydown) {
					const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );
						keydown.filter(e=>e.keyCode == 13 && ctx.vars.topMenu.selected == ctx.vars.menuModel) // Enter
								.subscribe(_=>
									cmp.action())
					}
			})
		}
		})
})

jb.component('menu-style.apply-multi-level', { /* menuStyle.applyMultiLevel */
  type: 'menu.style',
  params: [
    {
      id: 'menuStyle',
      type: 'menu.style',
      dynamic: true,
      defaultValue: menuStyle.popupAsOption()
    },
    {
      id: 'leafStyle',
      type: 'menu.style',
      dynamic: true,
      defaultValue: menuStyle.optionLine()
    },
    {
      id: 'separatorStyle',
      type: 'menu.style',
      dynamic: true,
      defaultValue: menuSeparator.line()
    }
  ],
  impl: ctx => {
			if (ctx.vars.menuModel.leaf)
				return ctx.vars.leafOptionStyle ? ctx.vars.leafOptionStyle(ctx) : ctx.params.leafStyle();
			else if (ctx.vars.menuModel.separator)
				return ctx.params.separatorStyle()
			else if (ctx.vars.innerMenuStyle)
				return ctx.vars.innerMenuStyle(ctx)
			else
				return ctx.params.menuStyle();
		}
})

// jb.component('menu.apply-context-menu-shortcuts', {
//   type: 'feature',
//   impl: ctx => ({
//   	 onkeydown: true,
//      afterViewInit: cmp => {
//         cmp.base.setAttribute('tabIndex','0');
//         if (!ctx.vars.topMenu.keydown) {
//   	        ctx.vars.topMenu.keydown = cmp.onkeydown;
//             jb.ui.focus(cmp.base,'menu.keyboard init autoFocus',ctx);
//       	};
//         const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );
//         keydown.subscribe(e=>cmp.ctx.vars.topMenu.applyShortcut(e))
//       }
//     })
// })

jb.component('menu.selection', { /* menu.selection */
  type: 'feature',
  params: [
    {id: 'autoSelectFirst', type: 'boolean'}
  ],
  impl: ctx => ({
      onkeydown: true,
      onmousemove: true,
			afterViewInit: cmp => {
				cmp.base.setAttribute('tabIndex','0');
				// putting the emitter at the top-menu only and listen at all sub menus
				if (!ctx.vars.topMenu.keydown) {
					ctx.vars.topMenu.keydown = cmp.onkeydown;
						jb.ui.focus(cmp.base,'menu.keyboard init autoFocus',ctx);
			}

			const keydown = ctx.vars.topMenu.keydown.takeUntil( cmp.destroyed );
      cmp.onmousemove.map(e=> dataOfElems(e.target.ownerDocument.elementsFromPoint(e.pageX, e.pageY)))
        .filter(x=>x).filter(data => data != ctx.vars.topMenu.selected)
        .subscribe(data => cmp.select(data))
			keydown.filter(e=>
						e.keyCode == 38 || e.keyCode == 40 )
					.map(event => {
						event.stopPropagation();
						const diff = event.keyCode == 40 ? 1 : -1;
						const items = cmp.items.filter(item=>!item.separator);
						const selectedIndex = items.indexOf(ctx.vars.topMenu.selected);
						if (selectedIndex != -1)
							return items[(selectedIndex + diff + items.length) % items.length];
				}).filter(x=>x).subscribe(data => cmp.select(data))
			
			keydown.filter(e=>e.keyCode == 27) // close all popups
					.subscribe(_=> jb.ui.dialogs.closePopups().then(()=> {
              cmp.ctx.vars.topMenu.popups = [];
              cmp.ctx.run({$:'tree.regain-focus'}) // very ugly
          }))

      cmp.select = selected => {
				ctx.vars.topMenu.selected = selected
        if (!cmp.base) return
        Array.from(cmp.base.querySelectorAll('.jb-item.selected, *>.jb-item.selected'))
          .forEach(elem=>elem.classList.remove('selected'))
        Array.from(cmp.base.querySelectorAll('.jb-item, *>.jb-item'))
          .filter(elem=> (jb.ctxDictionary[elem.getAttribute('jb-ctx')] || {}).data === selected)
          .forEach(elem=> elem.classList.add('selected'))
      }
			cmp.selected = _ =>	ctx.vars.topMenu.selected;
			if (ctx.params.autoSelectFirst && cmp.items[0])
            cmp.select(cmp.items[0])

      function dataOfElems(elems) {
        const itemElem = elems.find(el=>el.classList && el.classList.contains('jb-item'))
        const ctxId = itemElem && itemElem.getAttribute('jb-ctx')
        return ((ctxId && jb.ctxDictionary[ctxId]) || {}).data
      }
		},
		extendItem: (cmp,vdom,data) => {
				jb.ui.toggleClassInVdom(vdom,'selected', ctx.vars.topMenu.selected == data);
		},
		css: '>.selected { background: #bbb !important; color: #fff !important }',
		})
})

jb.component('menu-style.option-line', { /* menuStyle.optionLine */
  type: 'menu-option.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'line noselect', onmousedown: 'action'
			},[
				h('i',{class:'material-icons'},state.icon),
				h('span',{class:'title'},state.title),
				h('span',{class:'shortcut'},state.shortcut),
		]),
    css: `{ display: flex; cursor: pointer; font: 13px Arial; height: 24px}
				.selected { background: #d8d8d8 }
				>i { width: 24px; padding-left: 3px; padding-top: 3px; font-size:16px; }
				>span { padding-top: 3px }
						>.title { display: block; text-align: left; white-space: nowrap; }
				>.shortcut { margin-left: auto; text-align: right; padding-right: 15px }`,
    features: [mdl.rippleEffect(), menu.initMenuOption()]
  })
})

jb.component('menu.option-as-icon24', { /* menu.optionAsIcon24 */
  type: 'menu-option.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'line noselect', onclick: _ => cmp.clicked(), title: state.title
			},[
				h('i',{class:'material-icons'},state.icon),
		]),
    css: `{ display: flex; cursor: pointer; height: 24px}
				>i { width: 24px; padding-left: 3px; padding-top: 3px; font-size:16px; }`
  })
})

jb.component('menu-style.popup-as-option', { /* menuStyle.popupAsOption */
  type: 'menu.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'line noselect', onmousedown: 'action'
			},[
				h('span',{class:'title'},state.title),
				h('i',{class:'material-icons', onmouseenter: 'openPopup' },'play_arrow'),
		]),
    css: `{ display: flex; cursor: pointer; font: 13px Arial; height: 24px}
				>i { width: 100%; text-align: right; font-size:16px; padding-right: 3px; padding-top: 3px; }
						>.title { display: block; text-align: left; padding-top: 3px; padding-left: 26px; white-space: nowrap; }
			`,
    features: menu.initPopupMenu(dialog.contextMenuPopup(-24, true))
  })
})

jb.component('menu-style.popup-thumb', { /* menuStyle.popupThumb */
  type: 'menu.style',
  description: 'used for pulldown',
  impl: customStyle({
    template: (cmp,state,h) => h('div',{
				class: 'pulldown-top-menu-item',
				onmouseenter: 'mouseEnter',
				onclick: 'openPopup'
		},state.title),
    features: [menu.initPopupMenu(), mdl.rippleEffect()]
  })
})

jb.component('dialog.context-menu-popup', { /* dialog.contextMenuPopup */
  type: 'dialog.style',
  params: [
    {id: 'offsetTop', as: 'number'},
    {id: 'rightSide', as: 'boolean', type: 'boolean'}
  ],
  impl: customStyle({
    template: (cmp,state,h) => h('div',{ class: 'jb-dialog jb-popup context-menu-popup pulldown-mainmenu-popup'},
				h(state.contentComp)),
    features: [
      dialogFeature.uniqueDialog('%$optionsParentId%', false),
      dialogFeature.maxZIndexOnClick(),
      dialogFeature.closeWhenClickingOutside(),
      dialogFeature.cssClassOnLaunchingElement(),
      dialogFeature.nearLauncherPosition({
        offsetTop: '%$offsetTop%',
        rightSide: '%$rightSide%'
      })
    ]
  })
})

jb.component('menu-separator.line', { /* menuSeparator.line */
  type: 'menu-separator.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div'),
    css: '{ margin: 6px 0; border-bottom: 1px solid #EBEBEB;}'
  })
})
