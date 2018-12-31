global.navigator = {
	userAgent: '',
	platform: ''
}

global.document = {
	createRange: () => [],
	createElement: () => ({ setAttribute() {}, })
}
global.window = {
	addEventListener: () => {},
	navigator: global.navigator
}

const jb = require('../../dist/jb-react-all')
const fs = require('fs')

jb.ts = {
	types: {}
}

// jb.component('aa', {
//     type: 'data',
//     params: [
//         { id: 'mm', as: 'string' }
//     ],
//     impl: ctx => ctx.run({$:'button', action: {$:'goto-url', url: ''}})
// })

function buildTS() {
	function parseType(type) {
		const single = /([^\[]*)([])?/
		return [].concat.apply([],(type||'').split(',')
		.map(x=>
			x.match(single)[1])
		.map(x=>
			x=='data' ? ['data','aggregator','boolean'] : [x]));
	}

	function fixId(id) {
		return id.replace(/-|\s|\./g,'_')
	}

	function calcTypes() {
		jb.entries(jb.comps).forEach(c=>
			parseType(c[1].type).forEach(t=>jb.ts.types[t] = {}))
	}

	function TSforSingleType(type) {
		const pts = jb.entries(jb.comps).filter(c=>
				(c[1].type||'data').split(',').indexOf(type) != -1
				|| (c[1].typePattern && type.match(c[1].typePattern)))
		
		// type ctrlType = buttonPT | labelPT | ((ctx: ctx) => any)
		const typeLine = `type ${fixId(type)}Type = ${pts.map(pt=>fixId(pt[0]) + 'PT').join(' | ')} | ((ctx: ctx) => any)`
		const TSForPts = pts.map(pt=>TSforPT(pt[0], pt[1]))
		return [
			'',
			'// type ' + type,
			typeLine,
			...TSForPts
		].join('\n')
	}

	function TSforPT(id, pt) {
		// buttonPT = {$: 'button', action: actionType}
		return `type ${fixId(id)}PT = {$: '${id}', ` + (pt.params || []).map(param=>TSforParam(param)) + '}'
	}

	function TSforParam(param) {
		// action: actionType
		const splitArray = /([^\[]*)([])?/
		const typesTS = [].concat.apply([],(param.type||'').split(',')
			.map(x=> {
				var match = x.match(splitArray);
				return fixId(match[1] || 'data') + 'Type' + (match[2] || '')
			})
			.map(x=>
				x=='data' ? ['data','aggregator','boolean'] : [x]));
		
		return `${param.id}: ${typesTS.join(' | ')}`
	}

	calcTypes();
	const content = Object.keys(jb.ts.types).map(type=>TSforSingleType(type)).join('\n')
	fs.writeFileSync('./dist/jb-ts-all.d.ts', content)
}

buildTS()