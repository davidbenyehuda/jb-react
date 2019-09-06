(function() {
var st = jb.studio;

jb.component('studio.val', { /* studio.val */
  params: [
    {id: 'path', as: 'string', mandatory: true}
  ],
  impl: (ctx,path) =>
		st.valOfPath(path)
})

jb.component('studio.is-primitive-value', { /* studio.isPrimitiveValue */
  params: [
    {id: 'path', as: 'string', mandatory: true}
  ],
  impl: (ctx,path) =>
		st.isPrimitiveValue(st.valOfPath(path))
})

jb.component('studio.is-of-type', { /* studio.isOfType */
  params: [
    {id: 'path', as: 'string', mandatory: true},
    {id: 'type', as: 'string', mandatory: true}
  ],
  impl: (ctx,path,_type) =>	st.isOfType(path,_type)
})

jb.component('studio.is-array-type', { /* studio.isArrayType */
  params: [
    {id: 'path', as: 'string', mandatory: true}
  ],
  impl: (ctx,path) =>	st.isArrayType(path)
})

jb.component('studio.parent-path', { /* studio.parentPath */
  params: [
    {id: 'path', as: 'string', mandatory: true}
  ],
  impl: (ctx,path) => st.parentPath(path)
})

jb.component('studio.param-type', { /* studio.paramType */
  params: [
    {id: 'path', as: 'string', mandatory: true}
  ],
  impl: (ctx,path) =>	st.paramTypeOfPath(path)
})

jb.component('studio.PTs-of-type', { /* studio.PTsOfType */
  params: [
    {id: 'type', as: 'string', mandatory: true}
  ],
  impl: (ctx,_type) => st.PTsOfType(_type)
})

jb.component('studio.profiles-of-PT', { /* studio.profilesOfPT */
  params: [
    {id: 'PT', as: 'string', mandatory: true}
  ],
  impl: (ctx, pt) => st.profilesOfPT(pt)
})

jb.component('studio.categories-of-type', { /* studio.categoriesOfType */
  params: [
    {id: 'type', as: 'string', mandatory: true},
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,_type,path) => {
		var val = st.valOfPath(path);
		var comps = st.previewjb.comps;
		var pts = st.PTsOfType(_type);
		var categories = jb.unique([].concat.apply([],pts.map(pt=>
			(comps[pt].category||'').split(',').map(c=>c.split(':')[0])
				.concat(pt.indexOf('.') != -1 ? pt.split('.')[0] : [])
				.filter(x=>x).filter(c=>c!='all')
			))).map(c=>({
					code: c,
					pts: ptsOfCategory(c)
				}));
		var res = categories.concat({code: 'all', pts: ptsOfCategory('all') });
		return res;

		function ptsOfCategory(category) {
			var pts_with_marks = pts.filter(pt=>
					category == 'all' || pt.split('.')[0] == category ||
					(comps[pt].category||'').split(',').map(x=>x.split(':')[0]).indexOf(category) != -1)
				.map(pt=>({
					pt: pt,
					mark: (comps[pt].category||'').split(',')
						.filter(c=>c.indexOf(category) == 0)
						.map(c=>Number(c.split(':')[1] || 50))[0]
				}))
				.map(x=> {
					if (x.mark == null)
						x.mark = 50;
					return x;
				})
				.filter(x=>x.mark != 0);
			pts_with_marks.sort((c1,c2)=>c2.mark-c1.mark);
			var out = pts_with_marks.map(pt=>pt.pt);
			return out;
		}
	}
})

jb.component('studio.short-title', { /* studio.shortTitle */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.shortTitle(path)
})

jb.component('studio.summary', { /* studio.summary */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.summary(path)
})

jb.component('studio.has-param', { /* studio.hasParam */
  params: [
    {id: 'path', as: 'string'},
    {id: 'param', as: 'string'}
  ],
  impl: (ctx,path,param) =>
		st.paramDef(path+'~'+param)
})

jb.component('studio.non-control-children', { /* studio.nonControlChildren */
  params: [
    {id: 'path', as: 'string'},
    {id: 'includeFeatures', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx,path,includeFeatures) =>
		st.nonControlChildren(path,includeFeatures)
})

jb.component('studio.as-array-children', { /* studio.asArrayChildren */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.asArrayChildren(path)
})

jb.component('studio.comp-name', { /* studio.compName */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => st.compNameOfPath(path) || ''
})

jb.component('studio.param-def', { /* studio.paramDef */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => st.paramDef(path)
})

jb.component('studio.enum-options', { /* studio.enumOptions */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		((st.paramDef(path) || {}).options ||'').split(',').map(x=>({code:x,text:x}))
})

jb.component('studio.prop-name', { /* studio.propName */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.propName(path)
})

jb.component('studio.more-params', { /* studio.moreParams */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
				st.jbEditorMoreParams(path)
})


jb.component('studio.comp-name-ref', { /* studio.compNameRef */
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => ({
			$jb_path: () => path.split('~'),
			$jb_val: function(value) {
				if (typeof value == 'undefined')
					return st.compNameOfPath(path);
				else
					st.setComp(path,value,ctx)
			},
			$jb_observable: cmp =>
				jb.ui.refObservable(st.refOfPath(path),cmp,{includeChildren: 'yes'})
	})
})

jb.component('studio.profile-as-text', { /* studio.profileAsText */
  type: 'data',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: watchableAsText(
    studio.ref('%$path%')
  )
})

jb.component('studio.profile-as-string-byref', { /* studio.profileAsStringByref */
  type: 'data',
  params: [
    {id: 'path', as: 'string', dynamic: true}
  ],
  impl: ctx => ({
		$jb_path: () => path.split('~'),
		$jb_val: function(value) {
			var path = ctx.params.path();
			if (!path) return '';
			if (typeof value == 'undefined') {
				return st.valOfPath(path) || '';
			} else {
				st.writeValueOfPath(path, value,ctx);
			}
		},
		$jb_observable: cmp =>
			jb.ui.refObservable(st.refOfPath(ctx.params.path()),cmp)
	})
})

jb.component('studio.profile-value-as-text', { /* studio.profileValueAsText */
  type: 'data',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => ({
		$jb_path: () => path.split('~'),
			$jb_val: function(value) {
				if (typeof value == 'undefined') {
					var val = st.valOfPath(path);
					if (val == null)
						return '';
					if (st.isPrimitiveValue(val))
						return ''+val;
					if (st.compNameOfPath(path))
						return '=' + st.compNameOfPath(path);
				}
				else if (value.indexOf('=') != 0)
					st.writeValueOfPath(path, value,ctx);
			}
		})
})

jb.component('studio.insert-control', { /* studio.insertControl */
  type: 'action',
  params: [
    {id: 'path', as: 'string', defaultValue: studio.currentProfilePath()},
    {id: 'comp', as: 'string'}
  ],
  impl: (ctx,path,comp,type) =>
		st.insertControl(path, comp,ctx)
})

jb.component('studio.wrap', { /* studio.wrap */
  type: 'action',
  params: [
    {id: 'path', as: 'string'},
    {id: 'comp', as: 'string'}
  ],
  impl: (ctx,path,comp) =>
		st.wrap(path,comp,ctx)
})

jb.component('studio.wrap-with-group', { /* studio.wrapWithGroup */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.wrapWithGroup(path,ctx)
})

jb.component('studio.add-property', { /* studio.addProperty */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.addProperty(path,ctx)
})

jb.component('studio.duplicate-control', { /* studio.duplicateControl */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.duplicateControl(path,ctx)
})

jb.component('studio.duplicate-array-item', { /* studio.duplicateArrayItem */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.duplicateArrayItem(path,ctx)
})

// jb.component('studio.move-in-array',{
// 	type: 'action',
// 	params: [
// 		{ id: 'path', as: 'string' },
// 		{ id: 'moveUp', type: 'boolean', as: 'boolean'}
// 	],
// 	impl: (ctx,path,moveUp) =>
// 		st.moveInArray(path,moveUp)
// })

jb.component('studio.new-array-item', { /* studio.newArrayItem */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
		st.addArrayItem(path,{srcCtx: ctx})
})

jb.component('studio.add-array-item', { /* studio.addArrayItem */
  type: 'action',
  params: [
    {id: 'path', as: 'string'},
    {id: 'toAdd', as: 'single'},
    {id: 'index', as: 'number', defaultValue: -1}
  ],
  impl: (ctx,path,toAdd,index) =>
    index == -1 ? st.addArrayItem(path, {srcCtx: ctx, toAdd})
      : st.addArrayItem(path, {srcCtx: ctx, toAdd, index})
})

jb.component('studio.wrap-with-array', { /* studio.wrapWithArray */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path,toAdd) =>
		st.wrapWithArray(path,ctx)
})

jb.component('studio.can-wrap-with-array', { /* studio.canWrapWithArray */
  type: 'boolean',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
			st.paramDef(path) && (st.paramDef(path).type || '').indexOf('[') != -1 && !Array.isArray(st.valOfPath(path))
})

jb.component('studio.is-array-item', { /* studio.isArrayItem */
  type: 'boolean',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
			Array.isArray(st.valOfPath(st.parentPath(path)))
})


jb.component('studio.set-comp', { /* studio.setComp */
  type: 'action',
  params: [
    {id: 'path', as: 'string'},
    {id: 'comp', as: 'single'}
  ],
  impl: (ctx,path,comp) =>
		st.setComp(path, comp,ctx)
})

jb.component('studio.delete', { /* studio.delete */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => st._delete(path,ctx)
})

jb.component('studio.disabled', { /* studio.disabled */
  type: 'boolean',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => st.disabled(path,ctx)
})

jb.component('studio.toggle-disabled', { /* studio.toggleDisabled */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => st.toggleDisabled(path,ctx)
})

jb.component('studio.make-local', { /* studio.makeLocal */
  type: 'action',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) => st.makeLocal(path,ctx)
})

jb.component('studio.jbEditorNodes', { /* studio.jbEditorNodes */
  type: 'tree.nodeModel',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
			new st.jbEditorTree(path,true)
})

jb.component('studio.icon-of-type', { /* studio.iconOfType */
  type: 'data',
  params: [
    {id: 'type', as: 'string'}
  ],
  impl: (ctx,type) => {
		if (type.match(/.style$/))
			type = 'style';
		return ({
			action: 'play_arrow',
			data: 'data_usage',
			aggregator: 'data_usage',
			control: 'airplay',
			style: 'format_paint',
			feature: 'brush'
		}[type] || 'extension')
	}
})

jb.component('studio.is-disabled', { /* studio.isDisabled */
  type: 'boolean',
  params: [
    {id: 'path', as: 'string'}
  ],
  impl: (ctx,path) =>
			st.disabled(path)
})

jb.component('studio.disabled-support', { /* studio.disabledSupport */ 
  params: [
    {id: 'path', as: 'string', mandatory: true}
  ],
  type: 'feature',
  impl: conditionalClass(
    'jb-disabled',
    studio.isDisabled('%$path%')
  )
})


})();
