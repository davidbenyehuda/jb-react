jb.resource('globals',{ });

jb.resource('people',[
  { "name": "Homer Simpson" ,age: 42 , male: true},
  { "name": "Marge Simpson" ,age: 38 , male: false},
  { "name": "Bart Simpson"  ,age: 12 , male: true}
]);

jb.resource('person',{ 
  name: "Homer Simpson", 
  male: true,
  isMale: 'yes', 
  age: 42 
});

jb.resource('personWithAddress',{ 
  "name": "Homer Simpson",
  "address": {
    "city": "Springfield",
    "street": "742 Evergreen Terrace"
  }
})

jb.resource('personWithChildren',{ 
  name: "Homer Simpson", 
  children: [{ name: 'Bart' }, { name: 'Lisa' }, { name: 'Maggie' } ],
  friends: [{ name: 'Barnie' } ],
})

jb.component('ui-test.label', {
   impl :{$: 'ui-test', 
    control:{$:'label', title: 'hello world'},
    expectedResult :{$: 'contains', text: 'hello world' }
  },
})

jb.component('ui-test.group', {
   impl :{$: 'ui-test', 
    control: { $: 'group', controls: [
      {$:'label', title: 'hello world'},
      {$:'label', title: '2'},
    ] },
    expectedResult :{$: 'contains', text: ['jb-group','hello world','2'] }
  },
})

jb.component('ui-test.wait-for', {
   impl :{$: 'ui-test', 
    control :{$: 'group', 
      features :{$: 'group.wait', 
        for: ctx => new Promise(res => setTimeout(()=>{res('hello')}, 100))
      },
      controls: [
        {$:'label', title: '%%'},
      ] 
    },
    expectedResult :{$: 'contains', text: 'hello' }
  },
})

jb.component('ui-test.button', {
  impl :{$: 'ui-test',  
  control :{$: 'button', title: 'btn1', action: ctx => alert(1) },
  expectedResult: { $: 'contains', text: 'btn1' }
},
})

jb.component('ui-test.button.mdl-icon', {
  impl :{$: 'ui-test',  
  control :{$: 'button', 
    title: 'btn1', 
    style :{ $: 'button.mdl-icon', icon: 'build' },
    action: ctx => alert(1) 
  },
  expectedResult: { $: 'contains', text: 'build' }
},
})


jb.component('ui-test.group2', {
  impl :{$: 'ui-test',  
  control :{$: 'group', controls: 
    [ 
      { $: 'button', title: 'button1' } ,
      { $: 'label' , title: 'label1' } ,
    ]
  },
  expectedResult: { $: 'contains', text: ['button1','label1'] }
},
})

jb.component('ui-test.editable-text', {
  impl :{$: 'ui-test',  
    control :{$: 'editable-text', 
    style :{$: 'editable-text.input'},
      title: 'name', 
      databind: '%$person/name%' 
    },
    expectedResult :{$: 'contains', text: ['input','Homer Simpson'] },
},
})

jb.component('ui-test.editable-text-mdl', {
  impl :{$: 'ui-test',  
    control :{$: 'editable-text', 
    style :{$: 'editable-text.mdl-input'},
      title: 'name', 
      databind: '%$person/name%' 
    },
    expectedResult :{$: 'contains', text: ['input','Homer Simpson'] },
},
})

jb.component('ui-test.editable-text.x-button', {
  impl :{$: 'ui-test',  
    control :{$: 'editable-text', 
      title: 'name', 
      databind: '%$person/name%',
      features: [{ $: 'editable-text.x-button'}],
    },
    expectedResult :{$: 'contains', text: ['×','input','Homer Simpson'], inOrder: false },
},
})

jb.component('ui-test.two-way-binding', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
    controls: [ 
        {$: 'editable-text', 
          title: 'name', 
          databind: '%$person/name%',
          features :{$:'id', id:'inp'}
        },
        { $: 'label' , title: '%$person/name%' } ,
      ]
  },
  action :{$: 'ui-action.set-text', selector: '#inp', value: 'hello'},
  cleanUp :{$: 'write-value', to: '%$person/name%', value: 'Homer Simpson'},
  expectedResult :{$: 'contains', text: ['hello','hello'] },
},
})

jb.component('ui-test.group-horizontal', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
    style: {$: 'layout.horizontal' },
    controls: 
      [ 
        { $: 'button', title: 'button1' } ,
        { $: 'label' , title: 'label1' } ,
      ]
  },
  expectedResult: { $: 'contains', text: ['button1','label1'] }
},
})

jb.component('ui-test.tree', {
  impl :{$: 'ui-test',  
  control: {$: 'tree',
    nodeModel :{$: 'tree.json-read-only', 
      object: '%$personWithAddress%', rootPath: 'personWithAddress' 
    },
    features: [
        { $: 'tree.selection' },
        { $: 'tree.keyboard-selection'},
    ] 
  },
  expectedResult :{$: 'contains', text: ['address'] } ,
},
})

jb.component('ui-test.tree-DD', {
  impl :{$: 'ui-test',  
  control :{$: 'tree',
    nodeModel :{$: 'tree.json', 
      object: '%$personWithChildren%', rootPath: 'Homer' 
    },
    features: [
        { $: 'tree.selection' },
        { $: 'tree.drag-and-drop'},
        { $: 'tree.keyboard-selection'} 
    ] 
  },
  expectedResult: { $: 'contains', text: ['Homer'] } ,
},
})

jb.component('ui-test.open-dialog', {
  impl :{$: 'ui-test',  
  control :{$: 'button', title: 'click me',
    action :{$: 'open-dialog', title: 'hello', id:'hello', 
      content :{$: 'group', controls: [ {$: 'label', title: 'jbart'} ] },
      features:{$: 'dialog-feature.near-launcher-position', offsetTop: ctx=> Math.floor(Math.random()*20+2)*10 }
    }
  },
  action :{$: 'ui-action.click', selector: 'button' },
  cleanUp :{$: 'dialog.close-all' },
  expectedResult :{$: 'contains', allText :{$: 'test.dialog-content', id: 'hello'}, text: ['hello', 'jbart' ] } ,
},
})

var ui_test_dialog_isAttached = false;

jb.component('ui-test.dialog-cleanup', {
  impl :{$: 'ui-test',  
  control :{$: 'button', title: 'click me',
    action :{$: 'open-dialog', title: 'hello', id:'hello', 
      content :{$: 'label', title: 'world'},
      features: ctx => ({
           destroy: cmp =>
            ui_test_dialog_isAttached = cmp.base.parentNode.parentNode
      })
    }
  },
  action :[
    {$: 'ui-action.click', selector: 'button' },
    {$: 'dialog.close-all' }
  ],
  expectedResult : ctx => 
    ui_test_dialog_isAttached
},
})

jb.component('ui-test.dialog-cleanup-bug', {
  impl :{$: 'ui-test',  
  control :{$: 'button', title: 'click me',
    action :{$: 'open-dialog', title: 'hello', id:'hello', 
      content :{$: 'label', title: 'world'},
    }
  },
  action :[
    {$: 'ui-action.click', selector: 'button' },
    {$: 'dialog.close-all' }
  ],
  expectedResult : ctx => 
    ! jb.resources['jb_dialog_hello']
},
})

jb.component('ui-test.group-flex', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
    style: {$: 'layout.flex', direction: 'row' },
    controls: 
      [ 
        { $: 'button', title: 'button1' } ,
        { $: 'label' , title: 'label1' } ,
      ]
  },
  expectedResult: { $: 'contains', text: ['button1','label1'] }
},
})

jb.component('ui-test.button-click', {
  impl :{$: 'ui-test',  
  control :{$: 'button', 
    //style :{$: 'button.x'}, 
    title: 'Click Me', 
    action: () => alert(1) 
  },
  expectedResult: true
},
})

jb.component('ui-test.button-x', {
  impl :{$: 'ui-test',  
  control :{$: 'button', 
    style :{$: 'button.x'}, 
    title: 'Click Me', 
    action: () => alert(1) 
  },
  expectedResult: true
},
})

jb.component('ui-test.resource', {
  impl :{$: 'ui-test',  
  control :{$: 'button', title: '%$person.name%' } ,
  expectedResult: { $: 'contains', text: ['Homer'] },
},
})

jb.component('ui-test.features-css', {
  impl :{$: 'ui-test',  
  control :{$: 'label', 
    title: 'Hello World2', 
    features :{ $css: '{color: cyan; font-weight: bold}' },
  },
  expectedResult: { $: 'contains', text: ['Hello'] }
},
})

jb.component('ui-test.itemlist', {
  impl :{$: 'ui-test',  
  control :{$: 'itemlist', items: '%$people%', 
      controls :{ $: 'label', title: '%$item.name% - %name%' }, 
  },
  expectedResult: { $: 'contains', text: ['Homer Simpson - Homer Simpson', 'Bart Simpson - Bart Simpson'] },
},
})

jb.component('ui-test.itemlist-with-select', {
  impl :{$: 'ui-test',  
  control :{$: 'itemlist', items: '%$people%', 
      controls :{$: 'label', title: '%$item.name% - %name%' }, 
      features :{$: 'itemlist.selection' }, 
  },
  expectedResult: { $: 'contains', text: ['Homer Simpson - Homer Simpson', 'Bart Simpson - Bart Simpson'] },
},
})

jb.component('ui-test.itemlist-DD', {
  impl :{$: 'ui-test', control :{$: 'group', 
  controls: [
      { $: 'itemlist', items: '%$people%', watchItems: true,
          controls :{$: 'label', title: '%name%', features:{$: 'css.class', class: 'drag-handle'} }, 
          features: [
              { $: 'itemlist.selection', databind: '%$globals/selectedPerson%', autoSelectFirst: true }, 
              { $: 'itemlist.keyboard-selection', autoFocus: true },
              { $: 'itemlist.drag-and-drop' },
              { $: 'id', id: 'itemlist' },
          ],
      },
      { $: 'itemlist', items: '%$people%', watchItems: true,
        controls :{$: 'label', title: '%name%' } 
      },
    ],
  },
  action :{$: 'ui-action.keyboard-event', selector: '#itemlist', type: 'keydown', ctrl: 'ctrl', keyCode: 40 }, // ctrl keyDown
  expectedResult: { $: 'contains', text: ['Marge', 'Homer','Marge', 'Homer'] },
},
})

jb.component('ui-test.itemlist-basic', {
  impl :{$: 'ui-test', control :
    { $: 'itemlist', items: '%$people%',
      controls :{$: 'label', title: '%name%' } 
    },
  expectedResult: { $: 'contains', text: ['Homer Simpson', 'Bart Simpson'] },
},
})

jb.component('ui-test.itemlist-heading', {
  impl :{$: 'ui-test', control :{$: 'group', controls: 
  [
    { $: 'itemlist-with-groups', items: '%$people%', 
        controls :{$: 'label', title: '%name%' }, 
        groupBy :{$: 'itemlist-heading.group-by', 
          itemToGroupID :{$if: '%male%', then: 'male', else: 'female'}
        },
//        headingCtrl :{$: 'label', title: '%title%' }, 
        features: [
            { $: 'itemlist.selection', databind: '%$globals/selectedPerson%', autoSelectFirst: true }, 
            { $: 'itemlist.keyboard-selection', autoFocus: true },
            {$: 'css', css: '.jb-item:not(.heading) { margin-left: 30px }' }
        ],
    },
  ]},
  expectedResult: { $: 'contains', text: ['female', 'Marge', 'male', 'Homer Simpson', 'Bart Simpson'] },
}
})


jb.component('ui-test.itemlist-add-button', {
  impl :{$: 'ui-test',  
  control: { $: 'group', controls: 
    [
      { $: 'itemlist', 
        items: '%$people%', 
        controls :{$: 'label', title: '%$item.name% - %name%' }, 
      }, 
      { $: 'button', title: 'add', 
        action: (ctx) => ctx.exp('%$people%').push({ name: "Magi"})
      }
    ]
  } ,
  expectedResult: { $: 'contains', text: ['Homer Simpson - Homer Simpson', 'Bart Simpson - Bart Simpson'] },
},
})

jb.component('ui-test.itemlist-selection', {
  impl :{$: 'ui-test',
  control :{$: 'itemlist', items: '%$people%', 
        controls :{$: 'label', title: '%$item.name%' }, 
        features: [
            { $: 'itemlist.selection', databind: '%$globals/selectedPerson%', autoSelectFirst: true }, 
        ],
  },
  expectedResult: { $: 'contains', text: ['Homer Simpson'] },
},
})

jb.component('ui-test.itemlist-MD', {
  impl :{$: 'ui-test',
control :{$: 'group', 
  controls: 
    [
      { $: 'itemlist', items: '%$people%', 
        controls :{$: 'label', title: '%$item.name%' }, 
        features: [
            { $: 'itemlist.selection', databind: '%$globals/selectedPerson%', autoSelectFirst: true }, 
            { $: 'itemlist.keyboard-selection', autoFocus: true },
        ],
      },
      { $: 'group', 
        features :{$: 'group.data', data: '%$globals/selectedPerson%', watch: true } , 
         controls: [
            {$: 'label' , title: '%name% selected' },
          ]
        }
    ]
  } ,
  action: ctx=> jb.delay(1),
  expectedResult: { $: 'contains', text: ['Homer Simpson', 'Homer Simpson selected'] },
},
})

jb.component('ui-test.itemlist-container-search', {
  impl :{$: 'ui-test',
      control :{$: 'group', 
        controls: [
          {$: 'itemlist-container.search' },
          {$: 'itemlist', 
            items :{
              $pipeline: [
                '%$people%', 
                {$: 'itemlist-container.filter' }, 
              ]
            }, 
            controls :{$: 'label', title1: '%name%',
                title :{$: 'highlight', 
                  base: '%name%', 
                  highlight: '%$itemlistCntrData/search_pattern%', 
                }, 
            }, 
            features: [
                { $: 'itemlist.selection', autoSelectFirst: true }, 
                { $: 'itemlist.keyboard-selection', autoFocus: true },
                { $: 'watch-ref', ref: '%$itemlistCntrData/search_pattern%', strongRefresh: true}
            ],
          },
        ], 
        features: [
          {$: 'group.itemlist-container' }, 
        ]
      },
      action :{$: 'ui-action.set-text', value: 'ho', selector: '.mdl-textfield'},
      expectedResult :{$and: [ 
        {$: 'contains', text: ['Ho','mer'] },
        {$: 'not-contains', text: 'Marge' },
        {$: 'not-contains', text: 'Homer' }, // highlight selection - 'Homer' should be separated to Ho-Mer
      ]},
  }
})

jb.component('ui-test.table', {
  impl :{$: 'ui-test',
  control :{$: 'table', items: '%$people%', 
        fields : [
          {$: 'field', field: 'name', title: 'name' },
          {$: 'field.calculated', formula: '%age%', title: 'age' },
        ], 
        features: [
            { $: 'itemlist.selection', databind: '%$globals/selectedPerson%', autoSelectFirst: true }, 
        ],
  },
  expectedResult: { $: 'contains', text: ['age','Homer Simpson','12'] },
},
})

jb.component('ui-test.table-DD', {
  impl :{$: 'ui-test',  control :{$: 'group', 
  controls: [
    {$: 'table', items: '%$people%', watchItems: true,
        fields : [
          {$: 'field', field: 'name', title: 'name', class: 'drag-handle'},
          {$: 'field.calculated', formula: '%age%', title: 'age' },
          {$: 'field.control', control: {$: 'button', 
            title: 'delete', 
            style:{$: 'button.x'},
            action :{ $:'remove-from-array', array: '%$people%', item: '%%'} 
          } },
        ], 
          features: [
              { $: 'itemlist.selection', databind: '%$globals/selectedPerson%', autoSelectFirst: true }, 
              { $: 'itemlist.keyboard-selection', autoFocus: true },
              { $: 'itemlist.drag-and-drop' },
//              { $: 'id', id: 'itemlist' },
          ],
    },
    {$: 'label', 
      title :{ $pipeline: ['%$people/name%', {$:'join' , separated: ', '}] },
      features: {$: 'watch-ref', ref: '%$people%'}
    },
  ]
  },
  expectedResult: { $: 'contains', text: ['age','Homer Simpson','12'] },
},
})

// jb.component('ui-test.ngShow-label', {
// //   impl :{$: 'ui-test',  
//   control :{$: 'label', 
//         title: 'Dan',
//         features :{$ngAtts: {'[hidden]': '12==12'} }
//    }, 
//     expectedResult: { $contains: ['hidden' , 'Dan'] }
// },
// })

// jb.component('ui-test.ngShow-list', {
// //   impl :{$: 'ui-test',  
//   control :{$: 'itemlist', 
//       items: '%$people%', 
//       controls :{$: 'label', 
//         title: '%$item.name% - %age%',
//         features :{ $ngAtts: {'[hidden]': '%age%==12'} }
//       }, 
//     },
//     expectedResult: { $contains: ['Homer','Marge', 'hidden' , 'Bart'] }
// },
// })

// jb.component('ui-test.ngIf', {
// type: 'test',
//   impl :{$: 'ui-test', 
//   control :{$: 'itemlist', 
//       items: '%$people%', 
//       controls :{$: 'label', 
//         title: '%$item.name% - %age%', 
//         atts: {'*ngIf': '%age%>12'}
//       }, 
//     },
//     expectedResult :{$and: 
//       [
//         { $contains: ['Homer','Marge'] },
// //        { $not: { $contains: 'Bart'}}
//       ]
//     }
// },
// })

jb.component('ui-test.editable-text-in-group', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
        controls: [
          { $: 'editable-text', title: 'name', databind: '%$person/name%' },
          { $: 'editable-text', title: 'name', databind: '%$person/name%' },
          { $: 'label', title: '%$person/name%' }
        ],
  },
  expectedResult: { $: 'contains', text: ['Homer'] },
},
})

jb.component('ui-test.editable-text-with-jb-val', {
  impl :{$: 'ui-test2',  
  control :{$: 'group',
      $vars: {
        a1 : ctx => { return {
          $jb_val: value => {
            if (value === undefined)
              return jbart.__test_jb_val || 'Marge';
            else
              jbart.__test_jb_val = value;
          }
        }}
      },
      controls: [
          { $: 'editable-text', title: 'name', databind: '%$a1%' },
          { $: 'editable-text', title: 'name', databind: '%$a1%' },
          { $: 'picklist', title: 'name', databind: '%$a1%', 
            options :{$: 'picklist.optionsByComma', 
              options: 'Homer,Marge' 
            } 
          },
          { $: 'label', title: '%$a1%' }
        ]
  },
  expectedResult: { $: 'contains', text: ['Homer'] },
},
})

jb.component('ui-test.property-sheet.titles-above', {
  impl :{$: 'ui-test',  
  control :{$: 'group',
    controls : [
      {$: 'group',
            style :{$: 'property-sheet.titles-above-float-left' },
            controls: [
              { $: 'editable-text', title: 'name', databind: '%$person/name%' },
              { $: 'editable-text', title: 'address', databind: '%$person/address%' },
            ]
      },
      { $: 'label', title: '%$person/name%' }
    ]
  },
  expectedResult: { $: 'contains', text: ['Homer'] },
},
})

jb.component('ui-test.property-sheet.titles-left', {
  impl :{$: 'ui-test',  
  control :{$: 'group',
    controls : [
      {$: 'group',
            style :{$: 'property-sheet.titles-left' },
            controls: [
              { $: 'editable-text', title: 'name', databind: '%$person/name%', style :{$: 'editable-text.input'} },
              { $: 'editable-text', title: 'address', databind: '%$person/address%', style :{$: 'editable-text.input'} },
            ]
      },
    ]
  },
  expectedResult: { $: 'contains', text: ['Homer'] },
},
})

jb.component('ui-test.editable-number', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
  style: {$: 'layout.vertical'},
  controls: 
    [
      {$: 'editable-number', title: 'age',
          databind: '%$person/age%',
          style :{$: 'editable-number.slider-no-text'},
      },
      {$: 'editable-number', title: 'age',
          databind: '%$person/age%',
          style :{$: 'editable-number.slider'},
      },
      {$: 'editable-number', title: 'age',
          databind: '%$person/age%',
      },
      { $: 'label', title: '%$person/age%' }
    ]
  },
  expectedResult: { $: 'contains', text: ['42','42'] },
},

})

jb.component('ui-test.editable-number-slider', {
  impl :{$: 'ui-test',  
    control :{$: 'editable-number', title: 'age',
        databind: '%$person/age%',
        style :{$: 'editable-number.slider'},
    },
    expectedResult: { $: 'contains', text: '42' },
  },
})

jb.component('ui-test.editable-number-slider-empty', {
  impl :{$: 'ui-test',  
    control :{$: 'editable-number', title: 'age',
        databind: '%$person/age1%',
        style :{$: 'editable-number.slider'},
    },
    expectedResult: true,
  },
})

jb.component('ui-test.editable-boolean.all-styles', {
  impl :{$: 'ui-test',  
  control :{$: 'group', controls: 
    [
      {$: 'editable-boolean',
          title: 'male',
          databind: '%$person/male%',
          style :{$: 'editable-boolean.checkbox'},
      },
      {$: 'editable-boolean',
          title: 'gender',
          databind: '%$person/male%',
          textForTrue: 'male',
          textForFalse: 'female',
          style :{$: 'editable-boolean.checkbox-with-title'},
      },
      { $: 'label', title: '%$person/male%' }
    ]
  },
  expectedResult: { $: 'contains', text: ['male'] },
},
})

jb.component('ui-test.editable-boolean-settings', {
  impl :{$: 'ui-test',  
  control :{$: 'group', controls: 
    [
      {$: 'editable-boolean',
          title: 'male',
          style :{$: 'editable-boolean.checkbox-with-title'},
          databind: '%$person/male%',
          textForTrue: 'male',
          textForFalse: 'female',
      },
    ]
  },
  expectedResult: { $: 'contains', text: 'male' },
},
})

jb.component('ui-test.editable-boolean.expand-collapse', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
  $vars: {
      MyWidget :{$:'object', expanded: true}
  },
  controls: 
    [
      {$: 'editable-boolean',
          style :{$: 'editable-boolean.expand-collapse'},
          databind: '%$MyWidget/expanded%',
      },
      { $: 'label', title: 'inner text', 
        features :{ $: 'hidden', showCondition: '%$MyWidget.expanded%' }
      }
    ]
  },
  expectedResult: { $: 'contains', text: ['inner text'] },
},
})

jb.component('ui-test.code-mirror', {
  impl :{$: 'ui-test',  
  control :{$: 'group', 
    $vars: {
      js: { $: 'object', text: 'function f1() { return 15 }'},
      css: { $: 'object', text: '{ width: 15px; }' },
      html: { $: 'object', text: '<div><span>hello</span></div>' },
    },
    controls: 
    [
      { $: 'editable-text', 
          databind: '%$js/text%',
          style :{$: 'editable-text.codemirror', mode: 'javascript'}
      },
      { $: 'editable-text', 
          databind: '%$css/text%',
          style :{$: 'editable-text.codemirror', mode: 'css'}
      },
      { $: 'editable-text', 
          databind: '%$html/text%',
          style :{$: 'editable-text.codemirror', mode: 'htmlmixed'}
      },
    ]
 },
  expectedResult: { $: 'contains', text: ['function','f1','15'] },
},
})

jb.component('ui-test.prettyPrintComp', {
  impl :{$: 'ui-test2',  waitForPromise: {$delay: 50},
  control :{$: 'group', controls: [
      {$: 'text', 
          text: ctx => jb_prettyPrintComp('inner-label1-tst',jbart.comps['inner-label1-tst']),
          style :{$: 'text.multi-line'}
      },
      {$: 'text', 
          text: ctx => jb_prettyPrintComp('editable-text.codemirror',jbart.comps['editable-text.codemirror']),
          style :{$: 'text.codemirror'}
      },
    ]
  },
  expectedResult: { $: 'contains', text: ["dynamic: true"] },
},
})

jb.component('ui-test.picklist', {
  impl :{$: 'ui-test',  
  control :{$: 'group', controls: 
      [
        { $: 'group', 
            style :{$: 'property-sheet.titles-left' },
            controls :{$: 'picklist', 
                    title: 'city', 
                    databind: '%$personWithAddress/address/city%', 
                    options :{$: 'picklist.optionsByComma', 
                      options: 'Springfield,New York,Tel Aviv,London' 
                    } 
            }
        },
        { $: 'label',  title: '%$personWithAddress/address/city%' }
      ]
  },
  expectedResult: { $: 'contains', text: ['Springfield', 'New York'] },
},
})

jb.component('ui-test.picklist-sort', {
   impl :{$: 'data-test', 
    calculate: {$pipeline: [ 
        { $: 'picklist.sorted-options' , 
          options: {$: 'picklist.optionsByComma', options: 'a,b,c,d' },
          marks: {$pipeline : [ 
            'c:100,d:50,b:0,a:20',
            {$: 'split', separator: ',' },
            {$: 'object', 
              code: {$: 'split', separator: ':', part: 'first'  },  
              mark: {$: 'split', separator: ':', part: 'second'  },  
            }
          ] }
        }, 
        '%text%', 
        {$: 'join'} 
      ]},
    expectedResult :{$: 'contains', text: 'c,d,a' }
  },
})

jb.component('ui-test.picklist-groups', {
  impl :{$: 'ui-test',  
  control :{$: 'group', controls: 
      [
        { $: 'group', 
            style :{$: 'property-sheet.titles-left' },
            controls :{$: 'picklist',
                    style :{$: 'picklist.groups'}, 
                    title: 'city', 
                    databind: '%$personWithAddress/address/city%', 
                    options :{$: 'picklist.optionsByComma', 
                      options: 'US.Springfield,US.New York,Israel.Tel Aviv,UK.London,mooncity' 
                    } 
            }
        },
        { $: 'label',  title: '%$personWithAddress/address/city%' }
      ]
  },
  expectedResult: { $: 'contains', text: ['Springfield', 'New York'] },
},
})

jb.component('ui-test.dynamic-controls', {
  impl :{$: 'ui-test', 
  control :{$: 'group',
      style :{$: 'property-sheet.titles-left' },
      controls :{$: 'dynamic-controls', 
          controlItems: {$list: ['name','age']},
          genericControl: { $: 'editable-text', databind: '%$person/{%$controlItem%}%', title: '%$controlItem%' }
      }
  },
  expectedResult :{$: 'contains', text: ['name','age'] },
},
})

jb.component('ui-test.tabs', {
  impl :{$: 'ui-test', 
  control :{$: 'group',
      style:{$: 'group.tabs'},
      controls:[
        {$: 'group', title: 'tab1', controls :{$: 'label', title: 'in tab1' }},
        {$: 'group', title: 'tab2', controls :{$: 'label', title: 'in tab2' }},
    ]
  },
  expectedResult :{$and: [ 
    {$: 'contains', text: ['tab1','in tab1'] },
    {$: 'contains', text: 'tab2' },
    {$not: {$: 'contains', text: 'in tab2' } }
  ]},
},
})

jb.component('ui-test.group.accordion', {
  impl :{$: 'ui-test', disableChangeDetection: false,
  control :{$: 'group',
      style :{$: 'group.accordion'},
      controls:[
        {$: 'group', title: 'tab1', controls :{$: 'label', title: 'in tab1' }},
        {$: 'group', title: 'tab2', controls :{$: 'label', title: 'in tab2' }},
    ]
  },
  action: ctx=> jb.delay(1),
  expectedResult :{$: 'contains', text: ['tab1','in tab1','tab2'] },
},
})

jb.component('ui-test.inner-label', {
  impl :{$: 'ui-test',  
    control :{$: 'inner-label3-tst', title: 'Hello World2' },
    expectedResult: { $: 'contains', text: 'Hello World2' }
},
})

jb.component('ui-test.markdown', {
  impl :{$: 'ui-test2',  
    control :{$: 'markdown', markdown: `| Day     | Meal    | Price |
| --------|---------|-------|
| Monday  | pasta   | $6    |
| Tuesday | chicken | $8    |    ` },
    expectedResult: { $: 'contains', text: 'table' }
  },
})

jb.component('ui-test.style-by-control', {
  impl :{$: 'ui-test',  
    control :{$: 'label', 
        title: 'Hello World',
        style :{$: 'style-by-control', 
          modelVar: 'labelModel',
          control :{$: 'button', 
            title: '%$labelModel/title%2',
          }
        }
    },
    expectedResult: { $: 'contains', text: 'Hello World2' }
  },
})

jb.component('ui-test.picklist-as-itemlist', {
  impl :{$: 'ui-test',  
    control :{$: 'group', 
      controls: [
          {$: 'picklist', 
            style :{$: 'picklist.selection-list', width: '300' } ,
            databind: '%$personWithAddress/address/city%', 
            options :{$: 'picklist.optionsByComma', 
                   options: 'Springfield,New York,Tel Aviv,London' 
            },
          },
          { $: 'label',  title: '%$personWithAddress/address/city%' }
    ]},
    expectedResult: { $: 'contains', text: ['Springfield', 'New York'] },
  },
})

jb.component('menu-test.menu1', {
  impl :{$: 'menu.menu',
      title: 'main',
      options: [
        {$: 'menu.menu', title: 'File',
          options: [
            {$: 'menu.action', title: 'New' },
            {$: 'menu.action', title: 'Open' },
            {$: 'menu.menu', title: 'Bookmarks',
              options: [
                  {$: 'menu.action', title: 'Google' },
                  {$: 'menu.action', title: 'Facebook' }
              ]
            },
            {$: 'menu.menu', title: 'Friends',
              options: [
                  {$: 'menu.action', title: 'Dave' },
                  {$: 'menu.action', title: 'Dan' }
              ]
            },
          ]
        },
        {$: 'menu.menu', title: 'Edit',
          options: [
            {$: 'menu.action', title: 'Copy' },
            {$: 'menu.action', title: 'Paste' }
          ]
        },
        {$:'menu.dynamic-options', 
          items: {$list: [1,2,3]} ,
          genericOption :{$: 'menu.action', title: 'dynamic-%%' },
        }
      ]
   }
})

jb.component('menu-test.pulldown', {
  impl :{$: 'ui-test',  
    control :{$: 'menu.control',
      style :{$: 'menu-style.pulldown'},
      menu :{$: 'menu-test.menu1'},
    },
    action: ctx=> jb.delay(1),
    expectedResult :{$: 'contains', text: ['File', 'Edit','dynamic-1','dynamic-3'] },
  },
})

jb.component('menu-test.context-menu', {
  impl :{$: 'ui-test',  
    control: {$: 'menu.control',
      menu :{$: 'menu-test.menu1'}
    },
    action: ctx=> jb.delay(1),
    expectedResult :{$: 'contains', text: ['File', 'Edit'] },
  },
})

jb.component('menu-test.open-context-menu', {
  impl :{$: 'ui-test',  
  control :{$: 'button', 
    title: 'open', 
    action :{$: 'menu.open-context-menu', 
      menu :{$: 'menu-test.menu1'},
    }
  },
  expectedResult :{$: 'contains', text: 'open' },
  },
})

jb.component('ui-test.immutable-var', {
  impl :{$: 'ui-test',  
    control: {$: 'label', title: '%$var1%',
      features: [ 
        {$:'var', name: 'var1', value: 'hello' },
//        {$: 'feature.after-load', action: {$: 'write-value', to: '%$var1%', value: 'foo'}}
        ]
    },
    action: ctx=> jb.delay(1),
    expectedResult :{$: 'contains', text: 'hello' },
  },
})

// jb.component('ui-test.raw-vdom', {
//   impl :{$: 'ui-test',  
//     control: ctx => 
//       jb.ui.h('div',{},'hello world'),
//     expectedResult :{$: 'contains', text: 'hello world' },
//   },
// })

// jb.component('ui-test.raw-vdom-in-group', {
//   impl :{$: 'ui-test',  
//     control: { $: 'group', 
//       controls: ctx => 
//           jb.ui.h('div',{},'hello world')
//     },
//     expectedResult :{$: 'contains', text: 'hello world' },
//   },
// })

jb.component('ui-test.mutable-var', {
  impl :{$: 'ui-test',  
    control: {$: 'label', title: '%$var1%',
      features: [ 
        {$:'var', name: 'var1', value: 'hello', mutable: true },
        {$: 'feature.after-load', action: {$: 'write-value', to: '%$var1%', value: 'foo'}}
        ]
    },
    action: ctx=> jb.delay(1).then(_=>jb.delay(1)),
    expectedResult :{$: 'contains', text: 'foo' },
  },
})

jb.component('ui-test.mutable-var-as-object', {
  impl :{$: 'ui-test',  
    control: {$: 'label', title: '%$obj1/txt%',
      features: [ 
        {$:'var', name: 'obj1', value: {$: 'object', txt: 'hello' }, mutable: true },
        {$: 'feature.after-load', action: {$: 'write-value', to: '%$obj1/txt%', value: 'foo'}}
        ]
    },
    action: ctx=> jb.delay(1).then(_=>jb.delay(1)),
    expectedResult :{$: 'contains', text: 'foo' },
  },
})

jb.component('ui-test.mutable-var-as-object-not-initialized', {
  impl :{$: 'ui-test',  
    control: {$: 'label', title: '%$obj1/txt%',
      features: [ 
        {$:'var', name: 'obj1', value: {$: 'object' }, mutable: true },
        {$: 'feature.after-load', action: {$: 'write-value', to: '%$obj1/txt%', value: 'foo'}}
        ]
    },
    action: ctx=> jb.delay(1).then(_=>jb.delay(1)),
    expectedResult :{$: 'contains', text: 'foo' },
  },
})


jb.component('inner-label1-tst', {
  params: [
     { id: 'title', essential: true, dynamic: true },
  ],
  impl :{$: 'label', title: {$call: 'title' }}
})

jb.component('inner-label2-tst', {
  params: [
     { id: 'title', essential: true, dynamic: true },
  ],
  impl :{$: 'inner-label1-tst', title: {$call: 'title' }}
})

jb.component('inner-label3-tst', {
  params: [
     { id: 'title', essential: true, dynamic: true },
  ],
  impl :{$: 'inner-label2-tst', title: {$call: 'title' }}
})

