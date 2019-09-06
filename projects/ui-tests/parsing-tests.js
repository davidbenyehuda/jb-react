jb.const('textToParse',`
before
#start
first
#end
outside1
#start
second
#end
outside2
`
)

jb.const('textToBreak','l1-a1-b1-c1;l2-a2-b2-c2;l3-a3-b3-c3');
jb.const('textToBreak2','l1-a1-b1-c1;l2|a2|b2|c2;l3-a3-b3-c3')

jb.component('data-test.stringWithSourceRef', { /* dataTest.stringWithSourceRef */
  impl: dataTest({
    calculate: ctx => new jb.stringWithSourceRef(ctx,'textToBreak',6,8),
    expectedResult: '%% == b1'
  })
})

jb.component('data-test.extract-text-repeating', { /* dataTest.extractTextRepeating */
  impl: dataTest({
    calculate: pipeline(
      extractText({
          text: '%$textToParse%',
          startMarkers: '#start',
          endMarker: '#end',
          repeating: true
        }),
      join({})
    ),
    expectedResult: '%% == first,second'
  })
})

jb.component('data-test.extract-text-includingStartMarker', { /* dataTest.extractTextIncludingStartMarker */
  impl: dataTest({
    calculate: pipeline(
      extractText({
          text: '%$textToParse%',
          startMarkers: '#start',
          endMarker: '#end',
          includingStartMarker: true,
          repeating: true
        }),
      join({})
    ),
    expectedResult: ctx => ctx.data == '#start\nfirst,#start\nsecond'
  })
})

jb.component('data-test.extract-text-includingEndMarker', { /* dataTest.extractTextIncludingEndMarker */
  impl: dataTest({
    calculate: pipeline(
      extractText({
          text: '%$textToParse%',
          startMarkers: '#start',
          endMarker: '#end',
          includingEndMarker: true,
          repeating: true
        }),
      join({})
    ),
    expectedResult: ctx => ctx.data == 'first\n#end,second\n#end'
  })
})

jb.component('data-test.extract-text-exclude', { /* dataTest.extractTextExclude */
  impl: dataTest({
    calculate: pipeline(
      extractText({
          text: '%$textToParse%',
          startMarkers: '#start',
          endMarker: '#end',
          includingStartMarker: true,
          includingEndMarker: true,
          repeating: true,
          exclude: true
        }),
      join({})
    ),
    expectedResult: '%% == before,outside1,outside2'
  })
})

jb.component('data-test.extract-text-regex', { /* dataTest.extractTextRegex */
  impl: dataTest({
    calculate: extractText({
      text: '%$textToParse%',
      startMarkers: '#s.*',
      endMarker: '#e.*',
      useRegex: true
    }),
    expectedResult: '%% == first'
  })
})

jb.component('data-test.break-text', { /* dataTest.breakText */
  impl: dataTest({
    calculate: json.stringify(breakText({text: '%$textToBreak%', separators: [';', '-']})),
    expectedResult: '%% == [[\"l1\",\"a1\",\"b1\",\"c1\"],[\"l2\",\"a2\",\"b2\",\"c2\"],[\"l3\",\"a3\",\"b3\",\"c3\"]]'
  })
})

jb.component('data-test.break-text-regex', { /* dataTest.breakTextRegex */
  impl: dataTest({
    calculate: json.stringify(
      breakText({text: '%$textToBreak2%', separators: [';', '-|\\|'], useRegex: true})
    ),
    expectedResult: '%% == [[\"l1\",\"a1\",\"b1\",\"c1\"],[\"l2\",\"a2\",\"b2\",\"c2\"],[\"l3\",\"a3\",\"b3\",\"c3\"]]'
  })
})

jb.component('data-test.zip-arrays', { /* dataTest.zipArrays */
  impl: dataTest({
    calculate: json.stringify(zipArrays(ctx => [[1,2],[10,20],[100,200]])),
    expectedResult: '%% == [[1,10,100],[2,20,200]]'
  })
})
