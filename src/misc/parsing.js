
//used mostley for deubgging
jb.stringWithSourceRef = function(ctx,pathToConstStr,offset,to) {
  this.ctx = ctx;this.pathToConstStr = pathToConstStr; 
  this.offset = offset;this.to = to;
  this.val = ctx.exp(`%$${pathToConstStr}%`,'string').substring(offset,to);
  jb.debugInfo = jb.debugInfo || { in: [], out: []};
  jb.debugInfo.in.push(this);
}
jb.stringWithSourceRef.prototype.$jb_val = function() { 
  return this.val;
}
jb.stringWithSourceRef.prototype.substring = function(from,new_to) { 
  const to = typeof new_to == 'undefined' ? this.to : this.offset + new_to;
  return new jb.stringWithSourceRef(this.ctx,this.pathToConstStr,this.offset+from,to) 
}
jb.stringWithSourceRef.prototype.trim = function() { 
  if (this.val == this.val.trim()) return this;
  const left = (this.val.match(/^\s+/)||[''])[0].length;
  const right = (this.val.match(/\s+$/)||[''])[0].length;

  return new jb.stringWithSourceRef(this.ctx,this.pathToConstStr,this.offset+left,this.to-right) 
}

jb.jstypes['string-with-source-ref'] = v => v;

jb.component('extract-text', {
  description: 'text breaking according to begin/end markers',
  params: [
    {id: 'text', as: 'string-with-source-ref', defaultValue: '%%'},
    {id: 'startMarkers', as: 'array', mandatory: true},
    {id: 'endMarker', as: 'string'},
    {id: 'includingStartMarker', as: 'boolean', type: 'boolean', description: 'include the marker at part of the result' },
    {id: 'includingEndMarker', as: 'boolean', type: 'boolean', description: 'include the marker at part of the result'},
    {id: 'repeating', as: 'boolean', type: 'boolean', description: 'apply the markers repeatingly' },
    {id: 'noTrim', as: 'boolean', type: 'boolean'},
    {id: 'useRegex', as: 'boolean', type: 'boolean', description: 'use regular expression in markers' },
    {id: 'exclude', as: 'boolean', type: 'boolean', description: 'return the inverse result. E.g. exclude remarks' },
  ],
  impl: (ctx,textRef,startMarkers,endMarker,includingStartMarker,includingEndMarker,repeating,noTrim,regex,exclude) => {
    const text = jb.tostring(textRef);
	  let findMarker = (marker, startpos) => {
      const pos = text.indexOf(marker,startpos);
      if (pos != -1)
        return { pos: pos, end: pos + marker.length}
    }
	  if (regex)
		  findMarker = (marker, startpos) => {
	  		let len = 0, pos = -1;
	  		try {
		  		startpos = startpos || 0;
		  		const str = text.substring(startpos);
		  		const marker_regex = new RegExp(marker,'m');
          pos = str.search(marker_regex);
		    	if (pos > -1) {
		    		const match = str.match(marker_regex)[0];
            len = match ? match.length : 0;
            if (len)
              return { pos: pos+startpos, end: pos+ startpos+len };
		    	}
	  		} catch(e) {} // probably regex exception
	  }

    function findStartMarkers(startpos) {
      let firstMarkerPos,markerPos;
      for(let i=0; i<startMarkers.length; i++) {
        const marker = startMarkers[i];
        markerPos = findMarker(marker,markerPos ? markerPos.end : startpos);
        if (!markerPos) return;
        if (i==0)
          firstMarkerPos = markerPos;
      }
      return firstMarkerPos && { pos: firstMarkerPos.pos, end: markerPos.end }
    }

    let out = { match: [], unmatch: []},pos =0,start=null; 
    while(start = findStartMarkers(pos)) {
        const end = endMarker ? findMarker(endMarker,start.end) : findStartMarkers(start.end)
        if (!end) // if end not found use end of text
          end = { pos : text.length, end: text.length }
        const start_match = includingStartMarker ? start.pos : start.end;
        const end_match = includingEndMarker ? end.end : end.pos;
        if (pos != start_match) out.unmatch.push(textRef.substring(pos,start_match));
        out.match.push(textRef.substring(start_match,end_match));
        if (end_match != end.end) out.unmatch.push(textRef.substring(end_match,end.end));
        pos = endMarker ? end.end : end.pos;
    }
    out.unmatch.push(textRef.substring(pos));
    if (!noTrim) {
      out.match = out.match.map(x=>x.trim());
      out.unmatch = out.unmatch.map(x=>x.trim());
    }
    const res = exclude ? out.unmatch : out.match;
    return repeating ? res : res[0];
  }
})

jb.component('break-text', {
  description: 'recursive text breaking according to multi level separators',
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'separators', as: 'array', mandatory: true, defaultValue: [], description: 'multi level separators'},
    {id: 'useRegex', as: 'boolean', type: 'boolean', description: 'use regular expression in separators' },
  ],
  impl: (ctx,text,separators,regex) => {
	  let findMarker = (text,marker, startpos) => {
      const pos = text.indexOf(marker,startpos);
      if (pos != -1)
        return { pos: pos, end: pos + marker.length}
    }
	  if (regex)
		  findMarker = (text,marker, startpos) => {
	  		let len = 0, pos = -1;
	  		try {
		  		startpos = startpos || 0;
		  		const str = text.substring(startpos);
		  		const marker_regex = new RegExp(marker,'m');
          pos = str.search(marker_regex);
		    	if (pos > -1) {
		    		const match = str.match(marker_regex)[0];
            len = match ? match.length : 0;
            if (len)
              return { pos: pos+startpos, end: pos+ startpos+len };
		    	}
	  		} catch(e) {} // probably regex exception
    }

    var result = [text];
    separators.forEach(sep=> result = recursiveSplit(result,sep));
    return result[0];

    function recursiveSplit(input,separator) {
      if (Array.isArray(input))
        return input.map(item=>recursiveSplit(item,separator))
      if (typeof input == 'string')
        return doSplit(input,separator)
    }

    function doSplit(text,separator) {
      let out = [],pos =0,found=null; 
      while(found = findMarker(text,separator,pos)) {
        out.push(text.substring(pos,found.pos));
        pos = found.end;
      }
      out.push(text.substring(pos));
      return out;
    }
  }
})


jb.component('zip-arrays', {
  description: '[[1,2],[10,20],[100,200]] => [[1,10,100],[2,20,200]]',
  params: [
    { id: 'value', description: 'array of arrays', as: 'array', mandatory: true },
  ],
  impl: (ctx,value) =>
    value[0].map((x,i)=>
      value.map(line=>line[i]))
})

jb.component('remove-sections', {
  description: 'remove sections between markers',
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'},
    {id: 'startMarker', as: 'string', mandatory: true },
    {id: 'endMarker', as: 'string', mandatory: true},
    {id: 'keepEndMarker', as: 'boolean', type: 'boolean'},
  ],
  impl: (ctx,text,startMarker,endMarker,keepEndMarker) => {
    let out = text,range = null;
    if (!startMarker || !endMarker) return out;
    do {
      range = findRange(out);
      if (range)
        out = out.substring(0,range.from) + out.substring(range.to || out.length)
    } while (range && out);
    return out;

    function findRange(txt) {
      const start = txt.indexOf(startMarker);
      if (start == -1) return;
      const end = txt.indexOf(endMarker,start) + (keepEndMarker ? 0 : endMarker.length);
      if (end == -1) return;
      return { from: start, to: end}
    }
  }
})

jb.component('merge', {
	type: 'data',
  description: 'assign, merge object properties',
	params: [
    { id: 'objects', as: 'array', mandatory: true },
	],
	impl: (ctx,objects) =>
		Object.assign.apply({},objects)
})

jb.component('dynamic-object', {
	type: 'data',
  description: 'process items into object properties',
	params: [
    { id: 'items', mandatory: true, as: 'array' },
		{ id: 'propertyName', mandatory: true, as: 'string', dynamic: true },
		{ id: 'value', mandatory: true, dynamic: true },
	],
	impl: (ctx,items,name,value) =>
    items.reduce((obj,item)=>Object.assign(obj,jb.obj(name(ctx.setData(item)),value(ctx.setData(item)))),{})
})

jb.component('filter-empty-properties', {
	type: 'data',
  description: 'remove null or empty string properties',
	params: [
    { id: 'obj', defaultValue: '%%' },
	],
  impl: (ctx,obj) => {
    if (typeof obj != 'object') return obj;
    const propsToKeep = Object.getOwnPropertyNames(obj)
      .filter(p=>obj[p] != null && obj[p] != '' && (!Array.isArray(obj[p]) || obj[p].length > 0));
    let res = {};
    propsToKeep.forEach(p=>res[p]=obj[p]);
    return res;
  }
})

jb.component('trim', {
  params: [
    {id: 'text', as: 'string', defaultValue: '%%'},
  ],
  impl: (ctx,text) => text.trim()
})

jb.component('remove-prefix-regex', {
  params: [
    {id: 'prefix', as: 'string', mandatory: true },
    {id: 'text', as: 'string', defaultValue: '%%'},
  ],
  impl: (ctx,prefix,text) =>
    text.replace(new RegExp('^'+prefix) ,'')
})

jb.component('wrap-as-object-with-array', {
  type: 'aggregator',
  description: 'put all items in an array, wrapped by an object',
  params: [
      {id: 'arrayProperty', as: 'string', defaultValue: 'items'},
      {id: 'items', as: 'array', defaultValue: '%%' },
  ],
  impl: (ctx,prop,items) =>
      jb.obj(prop,items)
})

jb.component('wrap-as-object', {
  description: 'put each item in a property',
  type: 'aggregator',
  params: [
    {id: 'itemToPropName', as: 'string', dynamic: true, mandatory: true },
    {id: 'items', as: 'array', defaultValue: '%%' },
  ],
  impl: (ctx,key,items) => {
    let out = {}
    items.forEach(item=>out[jb.tostring(key(ctx.setData(item)))] = item)
    return out;
  }
})