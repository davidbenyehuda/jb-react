jb.ns('image,css')

jb.component('image', { /* image */
  type: 'control,image',
  category: 'control:50,common:70',
  params: [
    {id: 'url', as: 'string', mandatory: true, templateValue: 'https://freesvg.org/img/UN-CONSTRUCTION-2.png'},
    {id: 'resize', type: 'image.resize', defaultValue: image.fullyVisible()},
    {id: 'position', type: 'image.position', description: 'move/shift image' },
    {id: 'style', type: 'image.style', dynamic: true, defaultValue: image.defaultStyle()},
    {id: 'features', type: 'feature[]', dynamic: true, templateValue: css.height('100')}
  ],
  impl: ctx => jb.ui.ctrl(ctx, {
    studioFeatures: feature.editableContent(),
  })
})

jb.component('image.width-height', {
  type: 'image.resize',
  description: 'fixed size or precentage of the original',
  params: [
    {id: 'width', as: 'string', description: 'e.g: 100, 20%'},
    {id: 'height', as: 'string', description: 'e.g: 100, 20%'},
  ],
  impl: (ctx,width,height) => [ jb.ui.withUnits(width) ||'auto',jb.ui.withUnits(height)||'auto'].join(' ')
})

jb.component('image.cover', {
  description: 'auto resize or crop to cover all area',
  type: 'image.resize',
  impl: 'cover'
})

jb.component('image.fully-visible', {
  description: 'contain, auto resize to ensure the image is fully visible',
  type: 'image.resize',
  impl: 'contain'
})

jb.component('image.position', {
  description: 'offset move shift original image',
  type: 'image.position',
  params: [
    {id: 'x', as: 'string', description: 'e.g. 7, 50%, right'},
    {id: 'y', as: 'string', description: 'e.g. 10, 50%, bottom'},
  ],
  impl: (ctx,x,y) => [x && `x: ${jb.ui.withUnits(x)}`,y && `y: ${jb.ui.withUnits(y)}`]
    .filter(x=>x).map(x=>`background-position-${x}`).join(';')
})

jb.component('image.default-style', { 
  type: 'image.style',
  impl: customStyle({
    template: (cmp,state,h) => h('div'),
    css: (ctx,{$model}) => `
      { 
          background-image: url('${$model.url}');
          background-size: ${$model.resize};
          ${$model.position};
          background-repeat: no-repeat
      }`
  })
})