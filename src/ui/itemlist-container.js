(function() {

const createItemlistCntr = (ctx,params) => ({
	id: params.id,
	defaultItem: params.defaultItem,
	filter_data: {},
	filters: [],
	selectedRef: ctx.exp('%$itemlistCntrData/selected%','ref'),
	selected: function(selected) {
		if (!jb.isValid(this.selectedRef)) return;
		return (typeof selected != 'undefined') ?
			jb.writeValue(this.selectedRef,selected,ctx) : jb.val(this.selectedRef)
	},
	reSelectAfterFilter: function(filteredItems) {
		if (filteredItems.indexOf(this.selected()) == -1)
			this.selected(filteredItems[0])
	},
	changeSelectionBeforeDelete: function() {
		if (this.items && this.selected) {
			const curIndex = this.items.indexOf(this.selected);
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

jb.component('group.itemlistContainer', {
  description: 'itemlist writable container to support addition, deletion and selection',
  type: 'feature',
  category: 'itemlist:80,group:70',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'defaultItem', as: 'single'},
    {id: 'initialSelection', as: 'single'}
  ],
  impl: features(
    variable({
        name: 'itemlistCntrData',
        value: {'$': 'object', search_pattern: '', selected: '%$initialSelection%'},
        watchable: true
      }),
    variable({
        name: 'itemlistCntr',
        value: ctx => createItemlistCntr(ctx,ctx.componentContext.params)
      })
  )
})

jb.component('itemlist.itemlistSelected', {
  type: 'feature',
  category: 'itemlist:20,group:0',
  impl: list(
    group.data('%$itemlistCntrData/selected%'),
    hidden(notEmpty('%$itemlistCntrData/selected%'))
  )
})

jb.component('itemlistContainer.filter', {
  type: 'aggregator',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'updateCounters', as: 'boolean'},
  ],
  impl: (ctx,updateCounters) => {
			if (!ctx.vars.itemlistCntr) return;
			const res = ctx.vars.itemlistCntr.filters.reduce((items,filter) => filter(items), ctx.data || []);
			if (ctx.vars.itemlistCntrData.countAfterFilter != res.length)
				jb.delay(1).then(_=>ctx.vars.itemlistCntr.reSelectAfterFilter(res));
			if (updateCounters) { // use merge
					jb.delay(1).then(_=>{
					jb.writeValue(ctx.exp('%$itemlistCntrData/countBeforeFilter%','ref'),(ctx.data || []).length, ctx);
					jb.writeValue(ctx.exp('%$itemlistCntrData/countBeforeMaxFilter%','ref'),resBeforeMaxFilter.length, ctx);
					jb.writeValue(ctx.exp('%$itemlistCntrData/countAfterFilter%','ref'),res.length, ctx);
			}) } else {
				ctx.vars.itemlistCntrData.countAfterFilter = res.length
			}
			return res;
	}
})

jb.component('itemlistContainer.conditionFilter', {
  type: 'boolean',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  impl: ctx => ctx.vars.itemlistCntr &&
		ctx.vars.itemlistCntr.filters.reduce((res,filter) => res && filter([ctx.data]).length, true)
})

jb.component('itemlistContainer.search', {
  type: 'control',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'title', as: 'string', dynamic: true, defaultValue: 'Search'},
    {id: 'searchIn', as: 'string', dynamic: true, defaultValue: itemlistContainer.searchInAllProperties()},
    {id: 'databind', as: 'ref', dynamic: true, defaultValue: '%$itemlistCntrData/search_pattern%'},
    {id: 'style', type: 'editable-text.style', defaultValue: editableText.mdcSearch(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: (ctx,title,searchIn,databind) =>
		jb.ui.ctrl(ctx,{
			afterViewInit: cmp => {
				if (!ctx.vars.itemlistCntr) return;
				const databindRef = databind()

				ctx.vars.itemlistCntr.filters.push( items => {
					const toSearch = jb.val(databindRef) || '';
					if (jb.frame.Fuse)
						return new jb.frame.Fuse(items,{}).search(toSearch).map(x=>x.item)
					if (typeof searchIn.profile == 'function') { // improved performance
						return items.filter(item=>toSearch == '' || searchIn.profile(item).toLowerCase().indexOf(toSearch.toLowerCase()) != -1)
					}

					return items.filter(item=>toSearch == '' || searchIn(ctx.setData(item)).toLowerCase().indexOf(toSearch.toLowerCase()) != -1)
				});
				ctx.vars.itemlistCntr.keydown = jb.ui.upDownEnterEscObs(cmp)
			}
		})
})

jb.component('itemlistContainer.moreItemsButton', {
  type: 'control',
  category: 'itemlist-filter:100',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'title', as: 'string', dynamic: true, defaultValue: 'show %$delta% more ... (%$itemlistCntrData/countAfterFilter%/%$itemlistCntrData/countBeforeMaxFilter%)'},
    {id: 'delta', as: 'number', defaultValue: 200},
    {id: 'style', type: 'button.style', defaultValue: button.href(), dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ],
  impl: controlWithFeatures(
    ctx=>jb.ui.ctrl(ctx),
    [
      watchRef('%$itemlistCntrData/maxItems%'),
      defHandler(
        'onclickHandler',
        writeValue(
          '%$itemlistCntrData/maxItems%',
          (ctx,{itemlistCntrData},{delta}) => delta + itemlistCntrData.maxItems
        )
      ),
      calcProp({
        id: 'title',
        value: (ctx,{},{title,delta}) => title(ctx.setVar('delta',delta))
      }),
      ctx => ({
		templateModifier: (vdom,cmp,state) => { // hide the button when not needed
			if (cmp.ctx.exp('%$itemlistCntrData/countBeforeMaxFilter%','number') == cmp.ctx.exp('%$itemlistCntrData/countAfterFilter%','number'))
				return '';
			return vdom;
		}
	  })
    ]
  )
})

jb.ui.extractPropFromExpression = exp => { // performance for simple cases such as %prop1%
	if (exp.match(/^%.*%$/) && !exp.match(/[./[]/))
		return exp.match(/^%(.*)%$/)[1]
}

// match fields in pattern itemlistCntrData/FLDNAME_filter to data
jb.component('itemlistContainer.filterField', {
  type: 'feature',
  category: 'itemlist:80',
  requires: ctx => ctx.vars.itemlistCntr,
  params: [
    {id: 'fieldData', dynamic: true, mandatory: true},
    {id: 'filterType', type: 'filter-type'}
  ],
  impl: (ctx,fieldData,filterType) => ({
			afterViewInit: cmp => {
				const propToFilter = jb.ui.extractPropFromExpression(ctx.params.fieldData.profile);
				if (propToFilter)
					cmp.itemToFilterData = item => item[propToFilter];
				else
					cmp.itemToFilterData = item => fieldData(ctx.setData(item));

				ctx.vars.itemlistCntr && ctx.vars.itemlistCntr.filters.push(items=>{
						const filterValue = jb.val(ctx.vars.$model.databind());
						if (!filterValue) return items;
						const res = items.filter(item=>filterType.filter(filterValue,cmp.itemToFilterData(item)) );
						if (filterType.sort && (!cmp.state.sortOptions || cmp.state.sortOptions.length == 0) )
							filterType.sort(res,cmp.itemToFilterData,filterValue);
						return res;
				})
		}
	})
})

jb.component('filterType.text', {
  type: 'filter-type',
  params: [
    {id: 'ignoreCase', as: 'boolean', defaultValue: true, type: 'boolean'}
  ],
  impl: (ctx,ignoreCase) => ignoreCase ? ({
		filter: (filter,data) => (data||'').toLowerCase().indexOf((filter||'').toLowerCase()) != -1,
		sort: (items,itemToData,filter) =>  {
			const asWord = new RegExp('\\b' + filter + '\\b','i');
			const score = txt => (asWord.test(txt) ? 5 : 0) + (txt.toLowerCase().indexOf(filter.toLowerCase()) == 0 ? 3 : 0); // higher score for wholeWord or beginsWith
			items.sort((item1,item2)=> score(itemToData(item1) || '') - score(itemToData(item2) || ''))
		}
	}) : ({
		filter: (filter,data) => (data||'').indexOf(filter||'') != -1,
		sort: (items,itemToData,filter) =>  {
			const asWord = new RegExp('\\b' + filter + '\\b');
			const score = txt => (asWord.test(txt) ? 5 : 0) + (txt.indexOf(filter) == 0 ? 3 : 0);
			items.sort((item1,item2)=> score(itemToData(item1) || '') - score(itemToData(item2) || ''))
		}
	})
})

jb.component('filterType.exactMatch', {
  type: 'filter-type',
  impl: ctx => ({
		filter: (filter,data) =>  {
			const _filter = (filter||'').trim(), _data = (data||'').trim();
			return _data.indexOf(_filter) == 0 && _data.length == _filter.length;
		}
	})
})

jb.component('filterType.numeric', {
  type: 'filter-type',
  impl: ctx => ({
		filter: (filter,data) => Number(data) >= Number(filter),
		sort: (items,itemToData) => items.sort((item1,item2)=> Number(itemToData(item1)) - Number(itemToData(item2)))
	})
})

jb.component('itemlistContainer.searchInAllProperties', {
  type: 'data',
  category: 'itemlist:40',
  impl: ctx => {
		if (typeof ctx.data == 'string') return ctx.data;
		if (typeof ctx.data != 'object') return '';
		return jb.entries(ctx.data).map(e=>e[1]).filter(v=>typeof v == 'string').join('#');
	}
})


})()
