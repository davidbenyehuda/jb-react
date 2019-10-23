jb.ns('html-parsing')

jb.component('html-parsing.main', { /* htmlParsing.main */
  type: 'control',
  impl: group({
    title: '',
    controls: [
      itemlist({
        items: pipeline('%$phone%', keys()),
        controls: [
          text({title: 'property', text: '%%', features: field.columnWidth('200')}),
          text({title: 'value', text: pipeline('%$phone/{%%}%')})
        ],
        style: table.withHeaders(),
        features: [css.width('446')]
      }),
      itemlist({
        items: '%$phone/spec-list%',
        controls: [
          text({title: 'feature', text: '%feature%'}),
          text({title: 'value', text: '%val%'})
        ],
        style: table.withHeaders(),
        features: [css.width('400')]
      })
    ],
    features: variable({
      name: 'phone',
      value: pipeline('%$samsung_galaxy_m30s-9818%', htmlParsing.deviceParser())
    })
  })
})

jb.component('html-parsing.device-parser', { /* htmlParsing.deviceParser */
  impl: pipeline(
    Var('input', '%%'),
    dynamicObject({
        items: pipeline(
          extractText({
              startMarkers: ['id=\"specs-list'],
              endMarker: 'class=\"note\"',
              repeating: 'true'
            }),
          extractText({
              startMarkers: 'class=\"ttl\">',
              endMarker: '</tr>',
              repeating: 'true'
            })
        ),
        propertyName: extractText({startMarkers: '\">', endMarker: '<'}),
        value: extractText({startMarkers: ['<td', '>'], endMarker: '<'})
      }),
    assign(
        prop(
            'name',
            extractText({
              text: '%$input%',
              startMarkers: '<h1 class=\"specs-phone-name-title\" data-spec=\"modelname\">',
              endMarker: '</h1>'
            })
          ),
        prop(
            'image',
            extractText({
              text: '%$input%',
              startMarkers: ['<div class=\"specs-photo-main\">', '<a href=\"', 'src=\"'],
              endMarker: '\"'
            })
          )
      ),
    first()
  ),
  testData: '%$samsung_galaxy_m30s-9818%'
})



jb.component('html-parsing.makeToDevices', { /* htmlParsing.makeToDevices */
  type: 'control',
  impl: group({
    controls: [
      button({
        title: 'parse make',
        action: writeValue(
          '%$deviceUrls%',
          pipeline(
            '%$sampleMakePage%',
            extractText({startMarkers: 'class=\"makers\"', endMarker: '</ul>'}),
            extractText({startMarkers: '<a href=\"', endMarker: '.php', repeating: 'true'})
          )
        )
      }),
      button({
        title: 'crawl - devices url - parse device - store in results',
        action: runActionOnItems(
          pipeline('%$deviceUrls%', slice('0', '5')),
          runActions(
            writeValueAsynch(
                '%$devices/{%%}%',
                pipe(
                  http.get('https://www.gsmarena.com/%%.php'),
                  htmlParsing.deviceParser(),
                  first()
                )
              ),
            writeValue('%$progress/{%%}%', 'done')
          )
        )
      }),
      itemlist({
        items: '%$deviceUrls%',
        controls: [
          text({title: 'url', text: '%%'}),
          text({
            title: 'status',
            text: pipeline('%$progress/{%%}%'),
            features: field.columnWidth('100')
          })
        ],
        style: table.mdl(),
        visualSizeLimit: '4',
        features: [css.width('600'), watchRef({ref: '%$progress%', includeChildren: 'yes'})]
      })
    ]
  })
})


jb.component('html-parsing.parseDevice', { /* htmlParsing.parseDevice */
  type: 'control',
  impl: group({
    controls: [
      group({
        style: layout.horizontal(),
        controls: [
          text({
            title: 'fix values',
            text: pipeline(
              '%$devices%',
              properties(),
              wrapAsObject({
                  propertyName: '%id%',
                  value: pipeline(
                    '%val%',
                    assign(prop('Size', split({separator: 'inch', text: '%Size%', part: 'first'})))
                  )
                })
            )
          }),
          itemlist({
            items: pipeline('%$devices%', properties(), '%val%'),
            controls: [
              text({title: 'name', text: '%name%', features: field.columnWidth('300')}),
              text({title: 'price', text: pipeline('%Price%', matchRegex('[0-9]+'))})
            ],
            style: table.withHeaders(),
            visualSizeLimit: '12',
            features: [
              itemlist.selection('%$sel%', undefined),
              itemlist.keyboardSelection({}),
              css.width('600')
            ]
          }),
          group({
            style: propertySheet.titlesLeft({}),
            controls: [
              text({
                title: 'size',
                text: split({separator: 'inches', text: '%Size%', part: 'first'})
              }),
              text({
                title: 'weight',
                text: split({separator: ' ', text: '%Weight%', part: 'first'})
              }),
              text({title: 'battery', text: matchRegex('[0-9]+', '%battery%')}),
              text({
                title: 'price',
                text: split({separator: 'out', text: '%Price%', part: 'second'})
              }),
              text({
                title: 'year',
                text: split({separator: 'sed', text: '%Status%', part: 'second'})
              }),
              image({
                url: '%image%',
                width: '100',
                height: '100',
                features: field.title('image')
              })
            ],
            features: [group.data('%$selected2%'), watchRef('%$selected%')]
          })
        ],
        features: variable({name: 'selected2', watchable: true})
      })
    ]
  })
})

jb.component('data-resource.progress', { /* dataResource.progress */
  watchableData: {

  }
})

jb.component('data-resource.sel', { /* dataResource.sel */
  watchableData: {
    Technology: 'GSM / HSPA / LTE',
    '2G bands': 'GSM 850 / 900 / 1800 / 1900 - SIM 1 & SIM 2 (dual-SIM model only)',
    '3G bands': 'HSDPA',
    '4G bands': 'LTE (unspecified)',
    Speed: 'HSPA 42.2/5.76 Mbps, LTE Cat4 150/50 Mbps',
    GPRS: 'Yes',
    EDGE: 'Yes',
    Announced: '2016, August',
    Status: 'Available. Released 2016, December',
    Dimensions: '153.8 x 75.6 x 8.5 mm (6.06 x 2.98 x 0.33 in)',
    Weight: '169 g (5.96 oz)',
    SIM: 'Single SIM (Micro-SIM) or Hybrid Dual SIM (Micro-SIM, dual stand-by)',
    Type: 'IPS LCD capacitive touchscreen, 16M colors',
    Size: '5.5 inches, 83.4 cm',
    Resolution: '1080 x 1920 pixels, 16:9 ratio (~401 ppi density)',
    OS: 'Android 6.0 (Marshmallow)',
    Chipset: 'Mediatek MT6753 (28 nm)',
    CPU: 'Octa-core 1.3 GHz Cortex-A53',
    GPU: 'Mali-T720MP3',
    'Card slot': 'microSD, up to 256 GB (uses shared SIM slot)',
    Internal: '32GB 3GB RAM',
    Single: '5 MP',
    Features: 'LED flash, HDR, panorama',
    Video: '',
    Loudspeaker: undefined,
    '3.5mm jack': undefined,
    WLAN: 'Wi-Fi 802.11 b/g/n, Wi-Fi Direct, hotspot',
    Bluetooth: '4.0, A2DP',
    GPS: 'Yes, with A-GPS',
    Radio: 'FM radio',
    USB: 'microUSB 2.0',
    Sensors: 'Fingerprint (front-mounted), accelerometer, proximity',
    'Non-removable Li-Po 4080 mAh battery': 'Non-removable Li-Po 4080 mAh battery',
    Colors: 'Black, White',
    Price: 'About 250 EUR',
    name: 'Acer Liquid Z6 Plus',
    image: 'https://www.gravatar.com/avatar/2900b88d10e585a546c9ff5140591320?r=g&s=50'
  }
})
