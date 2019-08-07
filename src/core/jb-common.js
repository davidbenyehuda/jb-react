jb.component('call', {
 	type: '*',
 	params: [
 		{ id: 'param', as: 'string' }
 	],
 	impl: function(context,param) {
 	  const paramObj = context.componentContext && context.componentContext.params[param];
      if (typeof(paramObj) == 'function')
 		return paramObj(new jb.jbCtx(context, {
 			data: context.data,
 			vars: context.vars,
 			componentContext: context.componentContext.componentContext,
 			forcePath: paramObj.srcPath // overrides path - use the former path
 		}));
      else
        return paramObj;
 	}
});

jb.pipe = function(context,items,ptName) {
	const start = [jb.toarray(context.data)[0]]; // use only one data item, the first or null
	if (typeof context.profile.items == 'string')
		return context.runInner(context.profile.items,null,'items');
	const profiles = jb.toarray(context.profile.items || context.profile[ptName]);
	const innerPath = (context.profile.items && context.profile.items.sugar) ? '' 
		: (context.profile[ptName] ? (ptName + '~') : 'items~');

	if (ptName == '$pipe') // promise pipe
		return profiles.reduce((deferred,prof,index) => {
			return deferred.then(data=>
				jb.synchArray(data))
			.then(data=>
				step(prof,index,data))
		}, Promise.resolve(start))

	return profiles.reduce((data,prof,index) =>
		step(prof,index,data), start)


	function step(profile,i,data) {
    	if (!profile || profile.$disabled) return data;
		const parentParam = (i < profiles.length - 1) ? { as: 'array'} : (context.parentParam || {}) ;
		if (jb.profileType(profile) == 'aggregator')
			return jb.run( new jb.jbCtx(context, { data: data, profile: profile, path: innerPath+i }), parentParam);
		return [].concat.apply([],data.map(item =>
				jb.run(new jb.jbCtx(context,{data: item, profile: profile, path: innerPath+i}), parentParam))
			.filter(x=>x!=null)
			.map(x=> Array.isArray(jb.val(x)) ? jb.val(x) : x ));
	}
}

jb.component('pipeline',{
	type: 'data',
	description: 'map data arrays one after the other',
	params: [
		{ id: 'items', type: "data,aggregator[]", ignore: true, mandatory: true, composite: true },
	],
	impl: (ctx,items) => jb.pipe(ctx,items,'$pipeline')
})

jb.component('pipe', { // synched pipeline
	type: 'data',
	description: 'map asynch data arrays',
	params: [
		{ id: 'items', type: "data,aggregator[]", ignore: true, mandatory: true, composite: true },
	],
	impl: (ctx,items) => jb.pipe(ctx,items,'$pipe')
})

jb.component('data.if', {
	type: 'data',
	usageByValue: true,
 	params: [
 		{ id: 'condition', type: 'boolean', as: 'boolean', mandatory: true},
 		{ id: 'then', mandatory: true, dynamic: true },
 		{ id: 'else', dynamic: true },
 	],
 	impl: (ctx,cond,_then,_else) =>
 		cond ? _then() : _else()
});

jb.component('action.if', {
 	type: 'action',
 	description: 'if then else',
	usageByValue: true,
 	params: [
 		{ id: 'condition', type: 'boolean', as: 'boolean', mandatory: true},
 		{ id: 'then', type: 'action', mandatory: true, dynamic: true },
 		{ id: 'else', type: 'action', dynamic: true },
 	],
 	impl: (ctx,cond,_then,_else) =>
 		cond ? _then() : _else()
});

jb.component('jb-run', {
 	type: 'action',
 	params: [
 		{ id: 'profile', as: 'string', mandatory: true, description: 'profile name'},
 		{ id: 'params', as: 'single' },
 	],
 	impl: (ctx,profile,params) =>
 		ctx.run(Object.assign({$:profile},params || {}))
});


jb.component('list', {
	type: 'data',
	description: 'also flatten arrays',
	params: [
		{ id: 'items', type: "data[]", as: 'array', composite: true }
	],
	impl: function(context,items) {
		let out = [];
		items.forEach(item => {
			if (Array.isArray(item))
				out = out.concat(item);
			else
				out.push(item);
		});
		return out;
	}
});

jb.component('firstSucceeding', {
	type: 'data',
	params: [
		{ id: 'items', type: "data[]", as: 'array', composite: true }
	],
	impl: function(context,items) {
		for(let i=0;i<items.length;i++)
			if (jb.val(items[i]))
				return items[i];
		// return last one if zero or empty string
		const last = items.slice(-1)[0];
		return (last != null) && jb.val(last);
	}
});

jb.component('property-names', {
	type: 'data',
  description: 'Object.getOwnPropertyNames',
	params: [
		{ id: 'obj', defaultValue: '%%', as: 'single' }
	],
	impl: (ctx,obj) =>
		jb.ownPropertyNames(obj).filter(p=>p.indexOf('$jb_') != 0)
})

jb.component('properties',{
	type: 'data',
	params: [
		{ id: 'obj', defaultValue: '%%', as: 'single' }
	],
	impl: (context,obj) =>
		jb.ownPropertyNames(obj).filter(p=>p.indexOf('$jb_') != 0).map((id,index) =>
			({id: id, val: obj[id], index: index}))
});

jb.component('prefix', {
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', mandatory: true },
		{ id: 'text', as: 'string', defaultValue: '%%' },
	],
	impl: (context,separator,text) =>
		(text||'').substring(0,text.indexOf(separator))
});

jb.component('suffix', {
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', mandatory: true },
		{ id: 'text', as: 'string', defaultValue: '%%' },
	],
	impl: (context,separator,text) =>
		(text||'').substring(text.lastIndexOf(separator)+separator.length)
});

jb.component('remove-prefix', {
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', mandatory: true },
		{ id: 'text', as: 'string', defaultValue: '%%' },
	],
	impl: (context,separator,text) =>
		text.indexOf(separator) == -1 ? text : text.substring(text.indexOf(separator)+separator.length)
});

jb.component('remove-suffix',{
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', mandatory: true },
		{ id: 'text', as: 'string', defaultValue: '%%' },
	],
	impl: (context,separator,text) =>
		text.lastIndexOf(separator) == -1 ? text : text.substring(0,text.lastIndexOf(separator))
});

jb.component('remove-suffix-regex',{
	type: 'data',
	params: [
		{ id: 'suffix', as: 'string', mandatory: true, description: 'regular expression. e.g [0-9]*' },
		{ id: 'text', as: 'string', defaultValue: '%%' },
	],
	impl: function(context,suffix,text) {
		context.profile.prefixRegexp = context.profile.prefixRegexp || new RegExp(suffix+'$');
		const m = (text||'').match(context.profile.prefixRegexp);
		return (m && (text||'').substring(m.index+1)) || text;
	}
});

jb.component('write-value',{
	type: 'action',
	params: [
		{ id: 'to', as: 'ref', mandatory: true },
		{ id: 'value', mandatory: true}
	],
	impl: (ctx,to,value) =>
		jb.writeValue(to,jb.val(value),ctx)
});

jb.component('remove-from-array', {
	type: 'action',
	params: [
		{ id: 'array', as: 'ref', mandatory: true },
		{ id: 'itemToRemove', as: 'single', description: 'choose item or index' },
		{ id: 'index', as: 'number', description: 'choose item or index' },
	],
	impl: (ctx,array,itemToRemove,_index) => {
		const ar = jb.toarray(array);
		const index = itemToRemove ? ar.indexOf(item) : _index;
		if (index != -1 && ar.length > index)
			jb.splice(array,[[index,1]],ctx)
	}
});

jb.component('toggle-boolean-value',{
	type: 'action',
	params: [
		{ id: 'of', as: 'ref' },
	],
	impl: (ctx,_of) =>
		jb.writeValue(_of,jb.val(_of) ? false : true)
});


jb.component('slice', {
	type: 'aggregator',
	params: [
		{ id: 'start', as: 'number', defaultValue: 0, description: '0-based index', mandatory: true },
		{ id: 'end', as: 'number', mandatory: true, description: '0-based index of where to end the selection (not including itself)' }
	],
	impl: function({data},start,end) {
		if (!data || !data.slice) return null;
		return end ? data.slice(start,end) : data.slice(start);
	}
});

jb.component('sort', { 
	type: 'aggregator',
	params: [
		{ id: 'propertyName', as: 'string', description: 'sort by property inside object' },
		{ id: 'lexical', as: 'boolean', type: 'boolean' },
		{ id: 'ascending', as: 'boolean', type: 'boolean' }, 
	],
	impl: ({data},prop,lexical,ascending) => {
		if (!data || ! Array.isArray(data)) return null;
		let sortFunc;
		if (lexical)
			sortFunc = prop ? (x,y) => (x[prop] == y[prop] ? 0 : x[prop] < y[prop] ? -1 : 1) : (x,y) => (x == y ? 0 : x < y ? -1 : 1);
		else 
			sortFunc = prop ? (x,y) => (x[prop]-y[prop]) : (x,y) => (x-y);
		if (ascending)
			return data.slice(0).sort((x,y)=>sortFunc(y,x));
		return data.slice(0).sort((x,y)=>sortFunc(x,y));
	}
});

jb.component('first', {
	type: 'aggregator',
	impl: ({data}) => data[0]
});

jb.component('last', {
	type: 'aggregator',
	impl: ctx => ctx.data.slice(-1)[0]
});

jb.component('count', {
	type: 'aggregator',
	description: 'length, size of array',
	params: [{ id: 'items', as:'array', defaultValue: '%%'}],
	impl: (ctx,items) =>
		items.length
});

jb.component('reverse', {
	type: 'aggregator',
	params: [{ id: 'items', as:'array', defaultValue: '%%'}],
	impl: (ctx,items) =>
		items.reverse()
});

jb.component('sample', {
	type: 'aggregator',
	params: [
		{ id: 'size', as:'number', defaultValue: 300},
		{ id: 'items', as:'array', defaultValue: '%%'}
	],
	impl: (ctx,size,items) =>
		items.filter((x,i)=>i % (Math.floor(items.length/300) ||1) == 0)
});

jb.component('assign', { 
	description: 'extend with calculated properties',
	params: [
		{ id: 'property', type: 'prop[]', mandatory: true, defaultValue: [] },
	],
	impl: (ctx,properties,items) =>
		Object.assign({}, ctx.data, jb.objFromEntries(properties.map(p=>[p.title, jb.tojstype(p.val(ctx),p.type)])))
});

jb.component('obj', { 
	description: 'build object (dictionary) from props',
	params: [
		{ id: 'property', type: 'prop[]', mandatory: true, defaultValue: [] },
	],
	impl: (ctx,properties,items) =>
		Object.assign({}, jb.objFromEntries(properties.map(p=>[p.title, jb.tojstype(p.val(ctx),p.type)])))
});

jb.component('assign-with-index', { 
	type: 'aggregator',
	description: 'extend with calculated properties. %$index% is available ',
	params: [
		{ id: 'property', type: 'prop[]', mandatory: true, defaultValue: [] },
	],
	impl: (ctx,properties,items) =>
		jb.toarray(ctx.data).slice(0).map((item,i)=>
			properties.forEach(p=>item[p.title] = jb.tojstype(p.val(ctx.setData(item).setVars({index:i})),p.type) ) || item)
});

jb.component('prop', { 
	type: 'prop',
	usageByValue: true,
	params: [
		{ id: 'title', as: 'string', mandatory: true },
		{ id: 'val', dynamic: 'true', type: 'data', mandatory: true },
		{ id: 'type', as: 'string', options: 'string,number,boolean', defaultValue: 'string' },
	],
	impl: ctx => ctx.params
})

jb.component('if', { 
	usageByValue: true,
	reservedWord: true,
	params: [
		{ id: 'condition', as: 'boolean', type: 'boolean', mandatory: true },
		{ id: 'then' },
		{ id: 'else' },
	],
	impl: (ctx,cond,_then,_else) =>
		cond ? _then : _else
});

jb.component('not', {
	type: 'boolean',
	params: [
		{ id: 'of', type: 'boolean', as: 'boolean', mandatory: true, composite: true}
	],
	impl: (context, of) => !of
});

jb.component('and', {
	type: 'boolean',
	params: [
		{ id: 'items', type: 'boolean[]', ignore: true, mandatory: true, composite: true }
	],
	impl: function(context) {
		const items = context.profile.$and || context.profile.items || [];
		const innerPath =  context.profile.$and ? '$and~' : 'items~';
		for(let i=0;i<items.length;i++) {
			if (!context.runInner(items[i], { type: 'boolean' }, innerPath + i))
				return false;
		}
		return true;
	}
});

jb.component('or', {
	type: 'boolean',
	params: [
		{ id: 'items', type: 'boolean[]', ignore: true, mandatory: true, composite: true }
	],
	impl: function(context) {
		const items = context.profile.$or || context.profile.items || [];
		const innerPath =  context.profile.$or ? '$or~' : 'items~';
		for(let i=0;i<items.length;i++) {
			if (context.runInner(items[i],{ type: 'boolean' },innerPath+i))
				return true;
		}
		return false;
	}
});

jb.component('between', {
	type: 'boolean',
	params: [
		{ id: 'from', as: 'number', mandatory: true },
		{ id: 'to', as: 'number', mandatory: true },
		{ id: 'val', as: 'number', defaultValue: '%%' },
	],
	impl: (ctx,from,to,val) => 
		val >= from && val <= to
});

jb.component('contains',{
	type: 'boolean',
	params: [
		{ id: 'text', type: 'data[]', as: 'array', mandatory: true },
		{ id: 'allText', defaultValue: '%%', as:'string'},
		{ id: 'inOrder', defaultValue: true, as:'boolean'},
	],
	impl: function(context,text,allText,inOrder) {
      let prevIndex = -1;
      for(let i=0;i<text.length;i++) {
      	const newIndex = allText.indexOf(jb.tostring(text[i]),prevIndex+1);
      	if (newIndex == -1) return false;
      	prevIndex = inOrder ? newIndex : -1;
      }
      return true;
	}
})

jb.component('not-contains', {
	type: 'boolean',
	params: [
		{ id: 'text', type: 'data[]', as: 'array', mandatory: true },
		{ id: 'allText', defaultValue: '%%', as:'array'}
	],
	impl :{$not: {$: 'contains', text: '%$text%', allText :'%$allText%'}}
})

jb.component('starts-with', {
	type: 'boolean',
	params: [
		{ id: 'startsWith', as: 'string', mandatory: true },
		{ id: 'text', defaultValue: '%%', as:'string'}
	],
	impl: (context,startsWith,text) =>
		text.lastIndexOf(startsWith,0) == 0
})

jb.component('ends-with',{
	type: 'boolean',
	params: [
		{ id: 'endsWith', as: 'string', mandatory: true },
		{ id: 'text', defaultValue: '%%', as:'string'}
	],
	impl: (context,endsWith,text) =>
		text.indexOf(endsWith,text.length-endsWith.length) !== -1
})


jb.component('filter',{
	type: 'aggregator',
	params: [
		{ id: 'filter', type: 'boolean', as: 'boolean', dynamic: true, mandatory: true }
	],
	impl: (context,filter) =>
		jb.toarray(context.data).filter(item =>
			filter(context,item))
});

jb.component('match-regex', {
  type: 'boolean',
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'regex', as: 'string', mandatory: true, description: 'e.g: [a-zA-Z]*' },
    {id: 'fillText', as: 'boolean', mandatory: true, description: 'regex must match all text' },
  ],
  impl: (ctx,text,regex,fillText) =>
    text.match(new RegExp(fillText ? `^${regex}$` : regex))
})

jb.component('to-string', {
	params: [
		{ id: 'text', as: 'string', defaultValue: '%%', composite: true}
	],
	impl: (ctx,text) =>	text
});

jb.component('to-uppercase', {
	params: [
		{ id: 'text', as: 'string', defaultValue: '%%'}
	],
	impl: (ctx,text) =>
		text.toUpperCase()
});

jb.component('to-lowercase', {
	params: [
		{ id: 'text', as: 'string', defaultValue: '%%'}
	],
	impl: (ctx,text) =>
		text.toLowerCase()
});

jb.component('capitalize', {
	params: [
		{ id: 'text', as: 'string', defaultValue: '%%'}
	],
	impl: (ctx,text) =>
		text.charAt(0).toUpperCase() + text.slice(1)
});

jb.component('join', {
	params: [
		{ id: 'separator', as: 'string', defaultValue:',', mandatory: true },
		{ id: 'prefix', as: 'string' },
		{ id: 'suffix', as: 'string' },
		{ id: 'items', as: 'array', defaultValue: '%%'},
		{ id: 'itemName', as: 'string', defaultValue: 'item'},
		{ id: 'itemText', as: 'string', dynamic:true, defaultValue: '%%'}
	],
	type: 'aggregator',
	impl: function(context,separator,prefix,suffix,items,itemName,itemText) {
		const itemToText = (context.profile.itemText) ?
			item => itemText(new jb.jbCtx(context, {data: item, vars: jb.obj(itemName,item) })) :
			item => jb.tostring(item);	// performance

		return prefix + items.map(itemToText).join(separator) + suffix;
	}
});

jb.component('unique', {
	params: [
		{ id: 'id', as: 'string', dynamic: true, defaultValue: '%%' },
		{ id: 'items', as: 'array', defaultValue: '%%'}
	],
	type: 'aggregator',
	impl: (ctx,idFunc,items) => {
		const _idFunc = idFunc.profile == '%%' ? x=>x : x => idFunc(ctx.setData(x));
		return jb.unique(items,_idFunc);
	}
});

jb.component('log', {
	params: [
		{ id: 'obj', as: 'single', defaultValue: '%%'}
	],
	impl: function(context,obj) {
		let out = obj;
		if (typeof GLOBAL != 'undefined' && typeof(obj) == 'object')
			out = JSON.stringify(obj,null," ");
		if (typeof window != 'undefined')
			(window.parent || window).console.log(out);
		else
			console.log(out);
		return out;
	}
});

jb.component('asIs',{ params: [{id: '$asIs'}], impl: ctx => context.profile.$asIs });

jb.component('object',{
	impl: function(context) {
		let result = {};
		const obj = context.profile.$object || context.profile;
		if (Array.isArray(obj)) return obj;
		for(let prop in obj) {
			if ((prop == '$' && obj[prop] == 'object') || obj[prop] == null)
				continue;
			result[prop] = context.runInner(obj[prop],null,prop);
		}
		return result;
	}
});

jb.component('json.stringify', {
	params: [
		{ id: 'value', defaultValue: '%%' },
		{ id: 'space', as: 'string', description: 'use space or tab to make pretty output' }
	],
	impl: (context,value,space) =>
			JSON.stringify(value,null,space)
});

jb.component('json.parse', {
	params: [
		{ id: 'text', as: 'string' }
	],
	impl: (ctx,text) =>	{
		try {
			return JSON.parse(text)
		} catch (e) {
			jb.logException(e,'json parse',ctx);
		}
	}
});

jb.component('split', {
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', defaultValue: ',' },
		{ id: 'text', as: 'string', defaultValue: '%%'},
		{ id: 'part', options: ',first,second,last,but first,but last' }
	],
	impl: function(context,separator,text,part) {
		const out = text.split(separator.replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n'));
		switch (part) {
			case 'first': return out[0];
			case 'second': return out[1];
			case 'last': return out.pop();
			case 'but first': return out.slice(1);
			case 'but last': return out.slice(0,-1);
			default: return out;
		}
	}
});

jb.component('replace', {
	type: 'data',
	params: [
		{ id: 'find', as: 'string', mandatory: true },
		{ id: 'replace', as: 'string', mandatory: true  },
		{ id: 'text', as: 'string', defaultValue: '%%' },
		{ id: 'useRegex', type: 'boolean', as: 'boolean', defaultValue: true},
		{ id: 'regexFlags', as: 'string', defaultValue: 'g', description: 'g,i,m' }
	],
	impl: function(context,find,replace,text,useRegex,regexFlags) {
		if (useRegex) {
			return text.replace(new RegExp(find,regexFlags) ,replace);
		} else
			return text.replace(find,replace);
	}
});

jb.component('touch', {
	type: 'action',
	params: [
		{ id: 'data', as: 'ref'},
	],
	impl: function(context,data_ref) {
		const val = Number(jb.val(data_ref));
		jb.writeValue(data_ref,val ? val + 1 : 1);
	}
});

jb.component('isNull', {
	type: 'boolean',
	params: [
		{ id: 'obj', defaultValue: '%%'}
	],
	impl: (ctx, obj) => jb.val(obj) == null
});

jb.component('isEmpty', {
	type: 'boolean',
	params: [
		{ id: 'item', as: 'single', defaultValue: '%%'}
	],
	impl: (ctx, item) =>
		!item || (Array.isArray(item) && item.length == 0)
});

jb.component('notEmpty', {
	type: 'boolean',
	params: [
		{ id: 'item', as: 'single', defaultValue: '%%'}
	],
	impl: (ctx, item) =>
		item && !(Array.isArray(item) && item.length == 0)
});

jb.component('equals', {
	type: 'boolean',
	params: [
		{ id: 'item1', as: 'single', mandatory: true },
		{ id: 'item2', defaultValue: '%%', as: 'single' }
	],
	impl: (ctx, item1, item2) => item1 == item2
});

jb.component('not-equals', {
	type: 'boolean',
	params: [
		{ id: 'item1', as: 'single', mandatory: true },
		{ id: 'item2', defaultValue: '%%', as: 'single' }
	],
	impl: (ctx, item1, item2) => item1 != item2
});

jb.component('parent', {
	type: 'data',
	params: [
		{ id: 'item', as: 'ref', defaultValue: '%%'}
	],
	impl: (ctx,item) =>
		item && item.$jb_parent
});

jb.component('runActions', {
	type: 'action',
	params: [
		{ id: 'actions', type:'action[]', ignore: true, composite: true, mandatory: true }
	],
	impl: function(context) {
		if (!context.profile) debugger;
		const actions = jb.toarray(context.profile.actions || context.profile['$runActions']);
		const innerPath =  (context.profile.actions && context.profile.actions.sugar) ? ''
			: (context.profile['$runActions'] ? '$runActions~' : 'items~');
		return actions.reduce((def,action,index) =>
				def.then(_ => context.runInner(action, { as: 'single'}, innerPath + index ))
			,Promise.resolve())
	}
});

// jb.component('delay', {
// 	params: [
// 		{ id: 'mSec', type: 'number', defaultValue: 1}
// 	],
// 	impl: ctx => jb.delay(ctx.params.mSec)
// })

jb.component('on-next-timer', {
	description: 'run action after delay',
	type: 'action',
	params: [
		{ id: 'action', type: 'action', dynamic: true, mandatory: true },
		{ id: 'delay', type: 'number', defaultValue: 1}
	],
	impl: (ctx,action,delay) =>
		jb.delay(delay,ctx).then(()=>
			action())
})

jb.component('extract-prefix',{
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', description: '/w- alphnumberic, /s- whitespace, ^- beginline, $-endline'},
		{ id: 'text', as: 'string', defaultValue: '%%'},
		{ id: 'regex', type: 'boolean', as: 'boolean', description: 'separator is regex' },
		{ id: 'keepSeparator', type: 'boolean', as: 'boolean' }
	],
	impl: function(context,separator,text,regex,keepSeparator) {
		if (!regex) {
			return text.substring(0,text.indexOf(separator)) + (keepSeparator ? separator : '');
		} else { // regex
			const match = text.match(separator);
			if (match)
				return text.substring(0,match.index) + (keepSeparator ? match[0] : '');
		}
	}
});

jb.component('extract-suffix',{
	type: 'data',
	params: [
		{ id: 'separator', as: 'string', description: '/w- alphnumberic, /s- whitespace, ^- beginline, $-endline'},
		{ id: 'text', as: 'string', defaultValue: '%%'},
		{ id: 'regex', type: 'boolean', as: 'boolean', description: 'separator is regex' },
		{ id: 'keepSeparator', type: 'boolean', as: 'boolean' }
	],
	impl: function(context,separator,text,regex,keepSeparator) {
		if (!regex) {
			return text.substring(text.lastIndexOf(separator) + (keepSeparator ? 0 : separator.length));
		} else { // regex
			const match = text.match(separator+'(?![\\s\\S]*' + separator +')'); // (?!) means not after, [\\s\\S]* means any char including new lines
			if (match)
				return text.substring(match.index + (keepSeparator ? 0 : match[0].length));
		}
	}
});

jb.component('range', {
	type: 'data',
	params: [
		{ id: 'from', as: 'number', defaultValue: 1 },
		{ id: 'to', as: 'number', defaultValue: 10 },
	],
	impl: (ctx,from,to) =>
    Array.from(Array(to-from+1).keys()).map(x=>x+from)
})

jb.component('type-of', {
	type: 'data',
	params: [
		{ id: 'obj', defaultValue: '%%' },
	],
	impl: (ctx,_obj) => {
	  	const obj = jb.val(_obj);
		return Array.isArray(obj) ? 'array' : typeof obj
	}
})

jb.component('class-name', {
	type: 'data',
	params: [
		{ id: 'obj', defaultValue: '%%' },
	],
	impl: (ctx,_obj) => {
	  	const obj = jb.val(_obj);
		return obj && obj.constructor && obj.constructor.name
	}
})

jb.component('is-of-type', {
  type: 'boolean',
  params: [
  	{ id: 'type', as: 'string', mandatory: true, description: 'string,boolean' },
  	{ id: 'obj', defaultValue: '%%' },
  ],
  impl: (ctx,_type,_obj) => {
  	const obj = jb.val(_obj);
  	const objType = Array.isArray(obj) ? 'array' : typeof obj;
  	return _type.split(',').indexOf(objType) != -1;
  }
})

jb.component('in-group', {
  type: 'boolean',
  params: [
  	{ id: 'group', as: 'array', mandatory: true },
  	{ id: 'item', as: 'single', defaultValue: '%%' },
  ],
  impl: (ctx,group,item) =>
  	group.indexOf(item) != -1
})

jb.component('http.get', {
	params: [
		{ id: 'url', as: 'string' },
		{ id: 'json', as: 'boolean', description: 'convert result to json' }
	],
	impl: (ctx,url,_json) => {
		if (ctx.probe)
			return jb.http_get_cache[url];
		const json = _json || url.match(/json$/);
		return fetch(url)
			  .then(r =>
			  		json ? r.json() : r.text())
				.then(res=> jb.http_get_cache ? (jb.http_get_cache[url] = res) : res)
			  .catch(e => jb.logException(e,'',ctx) || [])
	}
});

jb.component('http.post', {
  type: 'action',
	params: [
		{ id: 'url', as: 'string' },
    { id: 'postData', as: 'single' },
		{ id: 'jsonResult', as: 'boolean', description: 'convert result to json' }
	],
	impl: (ctx,url,postData,json) => {
    const headers = new Headers();
    headers.append("Content-Type", "application/json; charset=UTF-8");
		return fetch(url,{method: 'POST', headers: headers, body: JSON.stringify(postData) })
			  .then(r =>
			  		json ? r.json() : r.text())
			  .catch(e => jb.logException(e,'',ctx) || [])
	}
});

jb.component('isRef', {
	params: [
		{ id: 'obj', mandatory: true }
	],
	impl: (ctx,obj) => jb.isRef(obj)
})

jb.component('asRef', {
	params: [
		{ id: 'obj', mandatory: true }
	],
	impl: (ctx,obj) => jb.asRef(obj)
})

jb.component('data.switch', {
	reservedWord: true,
	params: [
  	{ id: 'cases', type: 'data.switch-case[]', as: 'array', mandatory: true, defaultValue: [] },
  	{ id: 'default', dynamic: true },
	],
	impl: (ctx,cases,defaultValue) => {
		for(let i=0;i<cases.length;i++)
			if (cases[i].condition(ctx))
				return cases[i].value(ctx)
		return defaultValue(ctx);
	}
})

jb.component('data.case', {
  type: 'data.switch-case',
  singleInType: true,
  reservedWord: true,
  params: [
  	{ id: 'condition', type: 'boolean', mandatory: true, dynamic: true },
  	{ id: 'value', mandatory: true, dynamic: true },
  ],
  impl: ctx => ctx.params
})

jb.component('action.switch', {
  type: 'action',
  params: [
  	{ id: 'cases', type: 'action.switch-case[]', as: 'array', mandatory: true, defaultValue: [] },
  	{ id: 'defaultAction', type: 'action', dynamic: true },
  ],
  impl: (ctx,cases,defaultAction) => {
  	for(let i=0;i<cases.length;i++)
  		if (cases[i].condition(ctx))
  			return cases[i].action(ctx)
  	return defaultAction(ctx);
  }
})

jb.component('action.switch-case', {
  type: 'action.switch-case',
  singleInType: true,
  params: [
  	{ id: 'condition', type: 'boolean', as: 'boolean', mandatory: true, dynamic: true },
  	{ id: 'action', type: 'action' ,mandatory: true, dynamic: true },
  ],
  impl: ctx => ctx.params
})

jb.component('newline', {
  impl: ctx => '\n'
})

jb.const('global', typeof window != 'undefined' ? window : typeof global != 'undefined' ? global : null)