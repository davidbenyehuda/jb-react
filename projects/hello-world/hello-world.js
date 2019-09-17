jb.component('people', { /* people */
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

jb.component('hello-world.main', { /* helloWorld.main */
  type: 'control',
  impl: group({
    controls: label('hey')
  })
})

jb.component('data-resource.a', { /* dataResource.a */
  watchableData: {
    aa: 33
  }
})
