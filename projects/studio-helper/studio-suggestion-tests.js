jb.resource('people-array', { "people": [
  { "name": "Homer Simpson" ,"age": 42 , "male": true},
  { "name": "Marge Simpson" ,"age": 38 , "male": false},
  { "name": "Bart Simpson"  ,"age": 12 , "male": true}
  ]
})

jb.component('suggestions-test.default-probe', {
	type: 'control',
	impl :{$: 'label', title: ''}
})

jb.component('suggestions-test.simple-vars', {
	 impl :{$: 'suggestions-test', 
	 	expression: '%',
		expectedResult :{$: 'contains', text: '$people' }
	},
})

jb.component('suggestions-test.vars-filter', {
	 impl :{$: 'suggestions-test', 
	 	expression: '%$p',
		expectedResult :{ $and: [{$: 'contains', text: '$people' }, { $not: { $contains: '$win'}}]}
	},
})

jb.component('suggestions-test.component', {
	 impl :{$: 'suggestions-test', 
	 	expression: '=pi',
		expectedResult :{$: 'contains', text: 'pipeline' }
	},
})

jb.component('suggestions-test.inside-array', {
	 impl :{$: 'suggestions-test', 
	 	expression: '%$people-array/',
		expectedResult :{ $and: [{$: 'contains', text: 'people' }, { $not: { $contains: '$people'}}]}
	},
})

jb.component('suggestions-test.1', {
	 impl :{$: 'suggestions-test', 
	 	expression: '%',
		expectedResult :{$: 'contains', text: 'people' }
	},
})