(function(){

var ui = jb.ui;

ui.ctrl = function(context,options) {
	var ctx = context.setVars({ $model: context.params });
	var styleOptions = defaultStyle(ctx) || {};
	if (styleOptions.jbExtend)  {// style by control
		styleOptions.ctxForPick = ctx;
		return styleOptions.jbExtend(options).applyFeatures(ctx);
	}
	return new JbComponent(ctx).jbExtend(options).jbExtend(styleOptions).applyFeatures(ctx); 

	function defaultStyle(ctx) {
		var profile = context.profile;
		var defaultVar = '$theme.' + (profile.$ || '');
		if (!profile.style && context.vars[defaultVar])
			return ctx.run({$:context.vars[defaultVar]})
		return context.params.style(ctx);
	}
}

var cssId = 0;
var cssSelectors_hash = {};

class JbComponent {
	constructor(ctx) {
		this.ctx = ctx;
		Object.assign(this, {jbInitFuncs: [], jbBeforeInitFuncs: [], jbRegisterEventsFuncs:[], jbAfterViewInitFuncs: [],
			jbCheckFuncs: [],jbDestroyFuncs: [], extendCtxFuncs: [], extendCtxOnceFuncs: [], modifierFuncs: [], extendItemFuncs: [] });
		this.cssSelectors = [];

		this.jb_profile = ctx.profile;
		var title = jb.tosingle(jb.val(this.ctx.params.title)) || (() => ''); 
		this.jb_title = (typeof title == 'function') ? title : () => ''+title;
		this.jb$title = (typeof title == 'function') ? title() : title; // for debug
	}

	reactComp() {
		var jbComp = this;
		class ReactComp extends ui.Component {
			constructor(props) {
				super();
				this.jbComp = jbComp;
				this.ctx = jbComp.ctx;
				this.ctxForPick = jbComp.ctxForPick; // for debug
				this.destroyed = new Promise(resolve=>this.resolveDestroyed = resolve);
				try {
					if (jbComp.createjbEmitter)
						this.jbEmitter = this.jbEmitter || new jb.rx.Subject();
		    		this.refreshCtx = _ => {
						jbComp.extendCtxFuncs.forEach(extendCtx => {
			    			this.ctx = extendCtx(this.ctx,this) || this.ctx;
			    		})
			    		return this.ctx;
			    	}
					jbComp.extendCtxOnceFuncs.forEach(extendCtx =>
		    			this.ctx = extendCtx(this.ctx,this) || this.ctx);
			    	this.refreshCtx();
					Object.assign(this,(jbComp.styleCtx || {}).params); // assign style params to cmp
					jbComp.jbBeforeInitFuncs.forEach(init=> init(this,props));
					jbComp.jbInitFuncs.forEach(init=> init(this,props));
			    } catch(e) { jb.logException(e,'') }
			}
			render(props,state) {
				if (!jbComp.template) return '';
				var vdom = jbComp.template(this,state,ui.h);
				jbComp.modifierFuncs.forEach(modifier=> vdom = modifier(vdom,this,state) || vdom);
				return vdom;
			}
    		componentDidMount() {
				jbComp.injectCss(this);
				jbComp.jbRegisterEventsFuncs.forEach(init=> init(this));
				jbComp.jbAfterViewInitFuncs.forEach(init=> init(this));
				if (this.jbEmitter)
					this.jbEmitter.next('after-init');
			}
	  		componentWillUnmount() {
				jbComp.jbDestroyFuncs.forEach(f=> 
					f(this));
				if (this.jbEmitter) {
					 this.jbEmitter.next('destroy');
					 this.jbEmitter.complete();
				}
				this.resolveDestroyed();
			}
		}; 
		injectLifeCycleMethods(ReactComp,this);
		ReactComp.ctx = this.ctx;
		ReactComp.title = this.jb_title();
		ReactComp.jbComp = jbComp;
		return ReactComp;
	}

	compileJsx() {
		// todo: compile template if string - cache result
	}

	injectCss(cmp) {
		var elem = cmp.base;
		if (!elem.setAttribute)
			return;
		var ctx = this.ctx;
	  	while (ctx.profile.__innerImplementation)
	  		ctx = ctx.componentContext._parent;
	  	var attachedCtx = this.ctxForPick || ctx;
	  	elem.setAttribute('jb-ctx',attachedCtx.id);
		garbageCollectCtxDictionary();
		jb.ctxDictionary[attachedCtx.id] = attachedCtx;

		if (this.cssSelectors && this.cssSelectors.length > 0) {
			var cssKey = this.cssSelectors.join('\n');
			if (!cssSelectors_hash[cssKey]) {
				cssId++;
				cssSelectors_hash[cssKey] = cssId;
				var cssStyle = this.cssSelectors.map(selectorPlusExp=>{
					var selector = selectorPlusExp.split('{')[0];
					var fixed_selector = selector.split(',').map(x=>x.trim()).map(x=>`.jb-${cssId}${x}`);
					return fixed_selector + ' { ' + selectorPlusExp.split('{')[1];
				}).join('\n');
				var remark = `/*style: ${ctx.profile.style && ctx.profile.style.$}, path: ${ctx.path}*/\n`;
				$(`<style type="text/css">${remark}${cssStyle}</style>`).appendTo($('head'));
			}
			elem.classList.add(`jb-${cssSelectors_hash[cssKey]}`);
		}
	}

	applyFeatures(context) {
		var features = (context.params.features && context.params.features(context) || []);
		features.forEach(f => this.jbExtend(f,context));
		if (context.params.style && context.params.style.profile && context.params.style.profile.features) {
			jb.toarray(context.params.style.profile.features)
				.forEach((f,i)=>
					this.jbExtend(context.runInner(f,{type:'feature'},context.path+'~features~'+i),context))
		}
		return this;
	}

	jbExtend(options,context) {
    	if (!options) return this;
    	context = context || this.ctx;
    	if (!context)
    		console.log('no context provided for jbExtend');
    	if (typeof options != 'object')
    		debugger;

    	this.template = this.template || options.template;

		if (options.beforeInit) this.jbBeforeInitFuncs.push(options.beforeInit);
		if (options.init) this.jbInitFuncs.push(options.init);
		if (options.afterViewInit) this.jbAfterViewInitFuncs.push(options.afterViewInit);
		if (options.doCheck) this.jbCheckFuncs.push(options.doCheck);
		if (options.destroy) this.jbDestroyFuncs.push(options.destroy);
		if (options.templateModifier) this.modifierFuncs.push(options.templateModifier);
		if (typeof options.class == 'string') 
			this.modifierFuncs.push(vdom=> ui.addClassToVdom(vdom,options.class));
		if (typeof options.class == 'function') 
			this.modifierFuncs.push(vdom=> ui.addClassToVdom(vdom,options.class()));
		// events
		var events = Object.getOwnPropertyNames(options).filter(op=>op.indexOf('on') == 0);
		events.forEach(op=>
			this.jbRegisterEventsFuncs.push(cmp=>
		       	  cmp[op] = cmp[op] || jb.rx.Observable.fromEvent(cmp.base, op.slice(2))
		       	  	.takeUntil( cmp.destroyed )));

		if (options.jbEmitter || events.length > 0) this.createjbEmitter = true;
		if (options.ctxForPick) this.ctxForPick=options.ctxForPick;
		if (options.extendCtx) this.extendCtxFuncs.push(options.extendCtx);
		if (options.extendCtxOnce) this.extendCtxOnceFuncs.push(options.extendCtxOnce);
		if (options.extendItem) 
			this.extendItemFuncs.push(options.extendItem);
		this.styleCtx = this.styleCtx || options.styleCtx;
		this.toolbar = this.toolbar || options.toolbar;
		this.noUpdates = this.noUpdates || options.noUpdates;

	   	if (options.css)
    		this.cssSelectors = (this.cssSelectors || [])
    			.concat(options.css.split(/}\s*/m)
    				.map(x=>x.trim())
    				.filter(x=>x)
    				.map(x=>x+'}')
    				.map(x=>x.replace(/^!/,' '))
    			);

		(options.featuresOptions || []).forEach(f => 
			this.jbExtend(f, context))
		return this;
	}
}

function injectLifeCycleMethods(Comp,jbComp) {
	if (jbComp.jbCheckFuncs.length)
	  Comp.prototype.componentWillUpdate = function() {
		jbComp.jbCheckFuncs.forEach(f=> 
			f(this));
//		this.refreshModel && this.refreshModel();
//		this.jbEmitter && this.jbEmitter.next('check');
	}
	if (jbComp.createjbEmitter)
	  Comp.prototype.componentDidUpdate = function() {
		this.jbEmitter.next('after-update');
	}
	if (jbComp.noUpdates)
		Comp.prototype.shouldComponentUpdate = _ => false;
}

function garbageCollectCtxDictionary() {
	var now = new Date().getTime();
	ui.ctxDictionaryLastCleanUp = ui.ctxDictionaryLastCleanUp || now;
	var timeSinceLastCleanUp = now - ui.ctxDictionaryLastCleanUp;
	if (timeSinceLastCleanUp < 10000) 
		return;
	ui.ctxDictionaryLastCleanUp = now;

	var used = Array.from(document.querySelectorAll('[jb-ctx]')).map(e=>Number(e.getAttribute('jb-ctx'))).sort((x,y)=>x-y);
	var dict = Object.getOwnPropertyNames(jb.ctxDictionary).map(x=>Number(x)).sort((x,y)=>x-y);
	var lastUsedIndex = 0;
	for(var i=0;i<dict.length;i++) {
		while (used[lastUsedIndex] < dict[i])
			lastUsedIndex++;
		if (used[lastUsedIndex] > dict[i])
			delete jb.ctxDictionary[''+dict[i]];
	}
}

ui.focus = function(elem,logTxt) {
	if (!elem) debugger;
    if (jb.studio.lastStudioActivity && new Date().getTime() - jb.studio.lastStudioActivity < 1000)
    	return;
    jb.logPerformance('focus',logTxt);
    jb.delay(1).then(_=>
    	elem.focus())
}

ui.wrapWithLauchingElement = (f,context,elem) => 
	_ => {
		if (!elem) debugger;
		return f(context.setVars({ $launchingElement: { $el : $(elem) }}));
	}


// ****************** generic utils ***************

if (typeof $ != 'undefined' && $.fn)
    $.fn.findIncludeSelf = function(selector) { 
    	return this.find(selector).addBack(selector); }  

ui.renderable = ctrl => 
	ctrl.reactComp();

// prevent garbadge collection and preserve the ctx as long as it is in the dom 
ui.preserveCtx = ctx => { 
  jb.ctxDictionary[ctx.id] = ctx;
  return ctx.id;
}

ui.renderWidget = function(profile,elem) {
	if (window.parent != window && window.parent.jb)
		window.parent.jb.studio.initPreview(window,[Object.getPrototypeOf({}),Object.getPrototypeOf([])]);
	class R extends jb.ui.Component {
		constructor(props) {
			super();
			this.state.profile = profile;
			if (jb.studio.studioWindow) {
				var st = jb.studio.studioWindow.jb.studio;
				st.pageChange.subscribe(page=>
					this.setState({profile: {$: page}}));
				st.scriptChange.subscribe(_=>
					this.forceUpdate());
			}
		}
		render(pros,state) {
			if (!jb.comps[state.profile.$]) return '';
			return ui.h(new jb.jbCtx().run(state.profile).reactComp())
		}
	}
	ui.render(ui.h(R),elem);
}

ui.applyAfter = function(promise,ctx) {
	// should refresh all after promise
}

ui.waitFor = function(check,times,interval) {
  if (check())
    return Promise.resolve(1);

  times = times || 300;
  interval = interval || 50;

  return new Promise((resolve,fail)=>{
    function wait_and_check(counter) {
      if (counter < 1)
        return fail();
      setTimeout(() => {
      	var v = check();
        if (v)
          resolve(v);
        else
          wait_and_check(counter-1)
      }, interval);  
    }
    return wait_and_check(times);
  })
}

// ****************** vdom utils ***************

ui.stateChangeEm = new jb.rx.Subject();

ui.setState = function(cmp,state,opEvent) {
	jb.logPerformance('setState',cmp.ctx,state);
	if (state == null && cmp.refresh)	
		return cmp.refresh();
	cmp.setState(state || {});
	ui.stateChangeEm.next({cmp: cmp, opEvent: opEvent});
}

ui.addClassToVdom = function(vdom,clz) {
	vdom.attributes = vdom.attributes || {};
	vdom.attributes.class = [vdom.attributes.class,clz].filter(x=>x).join(' ');
	return vdom;
}

ui.toggleClassInVdom = function(vdom,clz,add) {
  vdom.attributes = vdom.attributes || {};
  var classes = (vdom.attributes.class || '').split(' ').map(x=>x.trim()).filter(x=>x);
  if (add && classes.indexOf(clz) == -1)
    vdom.attributes.class = classes.concat([clz]).join(' ');
  if (!add)
    vdom.attributes.class = classes.filter(x=>x==clz).join(' ');
  return vdom;
}

ui.item = function(cmp,vdom,data) {
	cmp.jbComp.extendItemFuncs.forEach(f=>f(cmp,vdom,data));
	return vdom;
}

// ****************** components ****************

jb.component('custom-style', {
	typePattern: /.*-style/,
	params: [
		{ id: 'template', as: 'single', essential: true, dynamic: true, ignore: true },
		{ id: 'css', as: 'string' },
    	{ id: 'features', type: 'feature[]', dynamic: true },
	],
	impl: (context,css,features) => ({
		template: context.profile.template,
		css: css,
		featuresOptions: features(),
		styleCtx: context._parent
	})
})

jb.component('style-by-control', {
	typePattern: /.*-style/,
	params: [
		{ id: 'control', type: 'control', essential: true, dynamic: true },
		{ id: 'modelVar', as: 'string', essential: true }
	],
	impl: (ctx,control,modelVar) =>
		control(ctx.setVars( jb.obj(modelVar,ctx.vars.$model)))
})

})()