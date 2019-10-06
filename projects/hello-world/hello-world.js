jb.component('hello-world.main', { /* helloWorld.main */
  type: 'control',
  impl: group({
    controls: [
      label('hello world12213')
    ]
  })
})

jb.component('data-resource.people', { /* dataResource.people */
  watchableData: [
    {
      name: 'Homer Simpson',
      age: 42,
      male: false,
      children: [{name: 'Bart'}, {name: 'Lisa'}, {name: 'Maggie'}]
    },
    {
      name: 'Marge Simpson',
      age: 38,
      male: true,
      children: [{name: 'Bart'}, {name: 'Lisa'}, {name: 'Maggie'}]
    },
    {name: 'Bart Simpson', age: 12, male: false, children: []}
  ]
})

jb.component('hello-world.check', { /* helloWorld.check */
  type: 'control',
  impl: group({
    controls: [
      button('click me')
    ]
  })
})

jb.component('hello-world.checker', { /* helloWorld.checker */
  type: 'control',
  impl: group({
    controls: [
      button('click me')
    ]
  })
})
