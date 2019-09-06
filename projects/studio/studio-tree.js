jb.component('studio.tree-menu', { /* studio.treeMenu */
  type: 'menu.option',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: menu.menu({
    options: [
      menu.action({
        title: 'Insert Field',
        action: studio.openNewProfileDialog({
          path: '%$path%',
          type: 'table-field',
          mode: 'insert-control',
          onClose: studio.gotoLastEdit()
        }),
        showCondition: equals(pipeline(studio.val('%$path%'), '%$%'), 'table')
      }),
      menu.action({
        title: 'Insert',
        action: studio.openNewProfileDialog({
          path: '%$path%',
          type: 'control',
          mode: 'insert-control',
          onClose: studio.gotoLastEdit()
        })
      }),
      menu.action({
        title: 'Wrap with group',
        action: [
          studio.wrapWithGroup('%$path%'),
          onNextTimer(
            [writeValue('%$studio/profile_path%', '%$path%~controls~0'), tree.regainFocus()]
          )
        ]
      }),
      menu.action({
        title: 'Duplicate',
        action: studio.duplicateControl('%$path%'),
        shortcut: 'Ctrl+D'
      }),
      menu.separator(),
      menu.action({
        title: 'Inteliscript editor',
        action: studio.openJbEditor('%$path%'),
        shortcut: 'Ctrl+I'
      }),
      menu.action({
        title: 'Context viewer',
        action: {'$': 'studio.open-context-viewer', path: '%$path%'}
      }),
      menu.action({
        title: 'Javascript editor',
        action: studio.editSource('%$path%'),
        icon: 'code',
        shortcut: 'Ctrl+J'
      }),
      menu.action({
        vars: [Var('compName', studio.compName('%$path%'))],
        title: 'Goto %$compName%',
        action: studio.gotoPath('%$compName%'),
        showCondition: '%$compName%'
      }),
      studio.gotoEditorOptions('%$path%'),
      menu.separator(),
      menu.endWithSeparator({options: studio.gotoReferencesOptions('%$path%')}),
      menu.action({
        title: 'Delete',
        action: studio.delete('%$path%'),
        icon: 'delete',
        shortcut: 'Delete'
      }),
      menu.action({
        title: {'$if': studio.disabled('%$path%'), then: 'Enable', else: 'Disable'},
        action: studio.toggleDisabled('%$path%'),
        icon: 'do_not_disturb',
        shortcut: 'Ctrl+X'
      }),
      menu.action({
        title: 'Copy',
        action: studio.copy('%$path%'),
        icon: 'copy',
        shortcut: 'Ctrl+C'
      }),
      menu.action({
        title: 'Paste',
        action: studio.paste('%$path%'),
        icon: 'paste',
        shortcut: 'Ctrl+V'
      }),
      menu.action({
        title: 'Undo',
        action: studio.undo(),
        icon: 'undo',
        shortcut: 'Ctrl+Z'
      }),
      menu.action({
        title: 'Redo',
        action: studio.redo(),
        icon: 'redo',
        shortcut: 'Ctrl+Y'
      })
    ]
  })
})

jb.component('studio.open-tree-menu', { /* studio.openTreeMenu */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: menu.openContextMenu({
    menu: studio.treeMenu('%$path%')
  })
})

jb.component('studio.control-tree-nodes', { /* studio.controlTreeNodes */
  type: 'tree.nodeModel',
  impl: function(context) {
		var currentPath = context.run({ $: 'studio.currentProfilePath' });
		var compPath = currentPath.split('~')[0] || '';
		return new jb.studio.ControlTree(compPath + '~impl');
	}
})

jb.component('studio.control-tree', { /* studio.controlTree */
  type: 'control',
  impl: group({
    controls: [
      tree({
        nodeModel: studio.controlTreeNodes(),
        features: [
          css.class('jb-control-tree'),
          tree.selection({
            databind: '%$studio/profile_path%',
            autoSelectFirst: true,
            onSelection: [studio.openProperties(), studio.highlightInPreview(studio.currentProfilePath())],
            onRightClick: studio.openTreeMenu('%%')
          }),
          tree.keyboardSelection({
            onEnter: studio.openProperties(true),
            onRightClickOfExpanded: studio.openTreeMenu('%%'),
            applyMenuShortcuts: studio.treeMenu('%%')
          }),
          tree.dragAndDrop(),
          studio.watchScriptChanges()
        ]
      })
    ],
    features: [css.padding('10')]
  })
})

// after model modifications the paths of the selected and expanded nodes may change and the tree should fix it.
// jb.component('studio.control-tree.refresh-path-changes', {
//   type: 'feature',
//   impl: ctx => ({
//     init : cmp => {
//       var tree = cmp.ctx.vars.$tree;
//       if (!tree) return;
//       jb.studio.scriptChange.takeUntil( cmp.destroyed )
//         .subscribe(opEvent => {
//           var new_expanded = {};
//           jb.entries(tree.expanded)
//             .filter(e=>e[1]).map(e=>e[0])
//             .map(path=> fixPath(path,opEvent))
//             .filter(x=>x)
//             .forEach(path => new_expanded[path] = true)
//           tree.expanded = new_expanded;
//           tree.selectionEmitter.next(fixPath(tree.selected,opEvent));
//         })
//
//         function fixPath(path,opEvent) {
//           var oldPath = opEvent.oldRef.$jb_path.join('~');
//           if (path.indexOf(oldPath) == 0)
//             return opEvent.ref.$jb_invalid ? null : path.replace(oldPath,opEvent.ref.$jb_path.join('~'));
//           return path;
//         }
//     }
//   })
// })

jb.component('studio.open-control-tree', { /* studio.openControlTree */ 
  type: 'action',
  impl: openDialog({
    style: dialog.studioFloating({id: 'studio-outline', width: '350'}),
    content: studio.controlTree(),
    menu: button({
      title: ' ',
      action: studio.openTreeMenu('%$studio/profile_path%'),
      style: button.mdlIcon('menu'),
      features: css('{ background: none }')
    }),
    title: 'Outline'
  })
})

