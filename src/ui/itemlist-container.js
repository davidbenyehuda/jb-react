(function() {

createItemlistCntr = (params) => ({
  id: params.id, 
  defaultItem: params.defaultItem, 
  selected: null, 
  filter_data: {},
  filters: [],
  init: function(items) {
      return this.items = items
  },
  add: function(item) {
    this.selected = item || JSON.parse(JSON.stringify(defaultItem || {}));
    this.items && jb.splice(this.items,[[this.items.length,0,this.selected]]);
  },
  delete: function(item) {
    if (this.items && this.items.indexOf(item) != -1) {
      this.changeSelectionBeforeDelete();
      jb.splice(this.items,[[this.items.indexOf(item),1]]);
    }
  },
  changeSelectionBeforeDelete: function() {
    if (this.items && this.selected) {
      var curIndex = this.items.indexOf(this.selected);
      if (curIndex == -1)
        this.selected = null;
      else if (curIndex == 0 && this.items.length > 0)
        this.selected = this.items[1];
      else if (this.items.length > 0)
        this.selected = this.items[curIndex -1];
      else
        this.selected = null;
    }
  }
})

jb.component('group.itemlist-container', {
  description: 'itemlist writable container to support addition, deletion and selection',
  type: 'feature', category: 'itemlist:20,group:0',
  params: [
    { id: 'id', as: 'string' },
    { id: 'defaultItem', as: 'single' },
  ],
  impl :{$list : [
    {$: 'var', name: 'itemlistCntrData', value: {$: 'object', search_pattern: '', selected: '' } , mutable: true},
    {$: 'var', name: 'itemlistCntr', value: ctx => createItemlistCntr(ctx.componentContext.params) }
  ]}
})

jb.component('group.itemlist-selected', {
  type: 'feature',   category: 'itemlist:20,group:0',
  impl :{ $list : [ 	
  			{$: 'group.data', data : '%itemlistCntrData/selected%'},
  			{$: 'hidden', showCondition: {$notEmpty: '%itemlistCntrData/selected%' } }
  		]}
})

jb.component('itemlist-container.add', {
  type: 'action',
  impl: ctx => 
  		ctx.vars.itemlistCntr && ctx.vars.itemlistCntr.add()
})

jb.component('itemlist-container.filter', {
  type: 'aggregator',
  requires: ctx => ctx.vars.itemlistCntr,
  impl: ctx => {
      if (ctx.vars.itemlistCntr) 
        return ctx.vars.itemlistCntr.filters.reduce((items,filter) => 
                  filter(items), ctx.data || [])
      return [];
   }
})


jb.component('itemlist-container.search', {
  type: 'control',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    { id: 'title', as: 'string' , dynamic: true, defaultValue: 'Search' },
    { id: 'searchIn', as: 'string' , dynamic: true, defaultValue: {$: 'itemlist-container.search-in-all-properties'} },
    { id: 'databind', as: 'ref', defaultValue: '%$itemlistCntrData/search_pattern%'},
    { id: 'style', type: 'editable-text.style', defaultValue: { $: 'editable-text.mdl-search' }, dynamic: true },
    { id: 'features', type: 'feature[]', dynamic: true },
  ],
  impl: (ctx,title,searchIn,databind) => 
    jb.ui.ctrl(ctx,{
      afterViewInit: cmp => {
        if (ctx.vars.itemlistCntr) {
          ctx.vars.itemlistCntr.filters.push( items => {
            var toSearch = jb.val(databind) || '';
            if (typeof searchIn.profile == 'function') { // improved performance
              return items.filter(item=>toSearch == '' || searchIn.profile(item).toLowerCase().indexOf(toSearch.toLowerCase()) != -1)
            }

            return items.filter(item=>toSearch == '' || searchIn(ctx.setData(item)).toLowerCase().indexOf(toSearch.toLowerCase()) != -1)
          });
        // allow itemlist selection use up/down arrows
        ctx.vars.itemlistCntr.keydown = jb.rx.Observable.fromEvent(cmp.base, 'keydown')
            .takeUntil( cmp.destroyed )
            .filter(e=>  [13,27,37,38,39,40].indexOf(e.keyCode) != -1);
        }
      }
    })
});

jb.component('itemlist-container.search-in-all-properties', {
  type: 'data',
  impl: ctx => {
    if (typeof ctx.data == 'string') return ctx.data;
    if (typeof ctx.data != 'object') return '';
    return jb.entries(ctx.data).map(e=>e[1]).filter(v=>typeof v == 'string').join('#');
   }
})


})()