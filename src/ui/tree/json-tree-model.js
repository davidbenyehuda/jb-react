jb.component('tree.json-read-only',{
	type: 'tree.nodeModel',
	params: [
		{ id: 'object' },
		{ id: 'rootPath', as: 'string'}
	],
	impl: function(context, json, rootPath) {
		return new ROjson(json,rootPath)
	}
})

class ROjson {
	constructor(json,rootPath) {
		this.json = json;
		this.rootPath = rootPath;
	}
	children(path) {
		var val = this.val(path);
		var out = [];
		if (typeof val == 'object')
			out = Object.getOwnPropertyNames(val || {});
		if (Array.isArray(val))
			out = out.slice(0,-1);
		return out.map(x=>path+'~'+x);
	}
	val(path) {
		if (path.indexOf('~') == -1)
			return jb.val(this.json);
		return jb.val(path.split('~').slice(1).reduce((o,p) =>o[p], this.json))
	}
	isArray(path) {
		var val = this.val(path);
		return typeof val == 'object' && val !== null;
	}
	icon() { 
		return '' 
	}
	title(path,collapsed) {
		var val = this.val(path);
		var prop = path.split('~').pop();
		var h = jb.ui.h;
		if (val == null) 
			return h('div',{},prop + ': null');
		if (!collapsed && typeof val == 'object')
			return h('div',{},prop);

		if (typeof val != 'object')
			return h('div',{},[prop + ': ',h('span',{class:'treenode-val', title: val},val)]);

		return h('div',{},[h('span',{},prop + ': ')].concat(
			Object.getOwnPropertyNames(val).filter(p=> typeof val[p] == 'string' || typeof val[p] == 'number' || typeof val[p] == 'boolean')
			.map(p=> [h('span',{class:'treenode-val', title: val[p]},val[p]) ])))
	}
}

jb.component('tree.json',{
	type: 'tree.nodeModel',
	params: [
		{ id: 'object'},
		{ id: 'rootPath', as: 'string'}
	],
	impl: function(context, json, rootPath) {
		return new Json(json,rootPath)
	}
})

class Json {
	constructor(json,rootPath) {
		this.json = json;
		this.rootPath = rootPath;
	}
	children(path) {
		var val = this.val(path);
		var out = [];
		if (typeof val == 'object')
			out = Object.getOwnPropertyNames(val || {});
		if (Array.isArray(val))
			out = out.slice(0,-1);
		return out.map(x=>path+'~'+x);
	}
	val(path) {
		if (path.indexOf('~') == -1)
			return jb.val(this.json);
		return jb.val(path.split('~').slice(1).reduce((o,p) =>o[p], this.json))
	}
	isArray(path) {
		var val = this.val(path);
		return typeof val == 'object' && val !== null;
	}
	icon() { 
		return '' 
	}
	title(path,collapsed) {
		var val = this.val(path);
		var prop = path.split('~').pop();
		var h = jb.ui.h;
		if (val == null) 
			return h(prop + ': null');
		if (!collapsed && typeof val == 'object')
			return h('div',{},prop);

		if (typeof val != 'object')
			return h('div',{},[prop + ': ',h('span',{class:'treenode-val', title: val},val)]);

		return h('div',{},[h('span',{},prop + ': ')].concat(
			Object.getOwnPropertyNames(val).filter(p=> typeof val[p] == 'string' || typeof val[p] == 'number' || typeof val[p] == 'boolean')
			.map(p=> [h('span',{class:'treenode-val', title: val[p]},val[p]) ])))
	}
	modify(op,path,args,ctx) {
		op.call(this,path,args);
	}
	move(path,args) { // drag & drop
		var pathElems = args.dragged.split('~');
		pathElems.shift();
		var dragged = pathElems.reduce((o,p)=>o[p],this.json);
		var arr = this.val(path);
		if (Array.isArray(arr)) {
			var draggedIndex = Number(args.dragged.split('~').pop());
			arr.splice(draggedIndex,1);
			var index = (args.index == -1) ? arr.length : args.index;
			arr.splice(index,0,dragged);
		}
	}
}