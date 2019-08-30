type param = {
	id: string,
	type?: tgpTypeStr,
	as?: 'string' | 'boolean' | 'number',
	defaultValue?: any,
	essential?: boolean,
	dynamic?: boolean,
}
type jbObj = {
	component(id: string, componentDef: cmpDef) : void,
	comps: [cmpDef],
	macros: macros
}
type ctx = {
	setVars({any}) : ctx,
	setData(any) : ctx,
	run(profile: profile): any,
	exp(exp: string) : any,
}
declare var jb: jbObj;



// type any
type anyType = callPT | ((ctx: ctx) => any)
type cmp_def_anyType = {
	type: 'any',
	params?: [param],
	impl: anyType,
}
type callPT = {$: 'call', param: dataType}

// type data
type dataType = pipelinePT | pipePT | data_ifPT | listPT | firstSucceedingPT | keysPT | propertiesPT | prefixPT | suffixPT | remove_prefixPT | remove_suffixPT | remove_suffix_regexPT | index_ofPT | objPT | assignPT | IfPT | to_uppercasePT | to_lowercasePT | capitalizePT | logPT | asIsPT | objectPT | json_stringifyPT | json_parsePT | splitPT | replacePT | delayPT | extract_prefixPT | extract_suffixPT | rangePT | type_ofPT | class_namePT | http_getPT | isRefPT | asRefPT | data_switchPT | jison_parsePT | extract_textPT | break_textPT | zip_arraysPT | remove_sectionsPT | mergePT | dynamic_objectPT | filter_empty_propertiesPT | trimPT | remove_prefix_regexPT | pretty_printPT | fs_readFilePT | fs_statPT | fs_readdirPT | fs_directory_contentPT | test_dialog_contentPT | field_dataPT | itemlist_container_search_in_all_propertiesPT | highlightPT | style_by_controlPT | group_divPT | group_sectionPT | ((ctx: ctx) => any)
type cmp_def_dataType = {
	type: 'data',
	params?: [param],
	impl: dataType,
}
type pipelinePT = {$: 'pipeline', items: dataType | [aggregatorType]}
type pipePT = {$: 'pipe', items: dataType | [aggregatorType]}
type data_ifPT = {$: 'data.if', condition: booleanType, then: dataType, else: dataType}
type listPT = {$: 'list', items: [dataType]}
type firstSucceedingPT = {$: 'firstSucceeding', items: [dataType]}
type keysPT = {$: 'keys', obj: dataType}
type propertiesPT = {$: 'properties', obj: dataType}
type prefixPT = {$: 'prefix', separator: dataType, text: dataType}
type suffixPT = {$: 'suffix', separator: dataType, text: dataType}
type remove_prefixPT = {$: 'remove-prefix', separator: dataType, text: dataType}
type remove_suffixPT = {$: 'remove-suffix', separator: dataType, text: dataType}
type remove_suffix_regexPT = {$: 'remove-suffix-regex', 
/** regular expression. e.g [0-9]* */suffix: dataType, text: dataType}
type index_ofPT = {$: 'index-of', array: dataType, item: dataType}
type objPT = {$: 'obj', props: [propType]}
type assignPT = {$: 'assign', props: [propType]}
type IfPT = {$: 'If', condition: booleanType, then: dataType, $else: dataType}
type to_uppercasePT = {$: 'to-uppercase', text: dataType}
type to_lowercasePT = {$: 'to-lowercase', text: dataType}
type capitalizePT = {$: 'capitalize', text: dataType}
type logPT = {$: 'log', obj: dataType}
type asIsPT = {$: 'asIs', $asIs: dataType}
type objectPT = {$: 'object', }
type json_stringifyPT = {$: 'json.stringify', value: dataType, 
/** use space or tab to make pretty output */space: dataType}
type json_parsePT = {$: 'json.parse', text: dataType}
type splitPT = {$: 'split', separator: dataType, text: dataType, part: dataType}
type replacePT = {$: 'replace', find: dataType, replace: dataType, text: dataType, useRegex: booleanType, 
/** g,i,m */regexFlags: dataType}
type delayPT = {$: 'delay', mSec: numberType}
type extract_prefixPT = {$: 'extract-prefix', 
/** /w- alphnumberic, /s- whitespace, ^- beginline, $-endline */separator: dataType, text: dataType, 
/** separator is regex */regex: booleanType, keepSeparator: booleanType}
type extract_suffixPT = {$: 'extract-suffix', 
/** /w- alphnumberic, /s- whitespace, ^- beginline, $-endline */separator: dataType, text: dataType, 
/** separator is regex */regex: booleanType, keepSeparator: booleanType}
type rangePT = {$: 'range', from: dataType, to: dataType}
type type_ofPT = {$: 'type-of', obj: dataType}
type class_namePT = {$: 'class-name', obj: dataType}
type http_getPT = {$: 'http.get', url: dataType, 
/** convert result to json */json: booleanType}
type isRefPT = {$: 'isRef', obj: dataType}
type asRefPT = {$: 'asRef', obj: dataType}
type data_switchPT = {$: 'data.switch', cases: [data_switch_caseType], default: dataType}
type jison_parsePT = {$: 'jison.parse', parser: jison_parserType, goal: dataType, text: dataType, debug: booleanType}
type extract_textPT = {$: 'extract-text', text: dataType, startMarkers: dataType, endMarker: dataType, 
/** include the marker at part of the result */includingStartMarker: booleanType, 
/** include the marker at part of the result */includingEndMarker: booleanType, 
/** apply the markers repeatingly */repeating: booleanType, noTrim: booleanType, 
/** use regular expression in markers */useRegex: booleanType, 
/** return the inverse result. E.g. exclude remarks */exclude: booleanType}
type break_textPT = {$: 'break-text', text: dataType, 
/** multi level separators */separators: dataType, 
/** use regular expression in separators */useRegex: booleanType}
type zip_arraysPT = {$: 'zip-arrays', 
/** array of arrays */value: dataType}
type remove_sectionsPT = {$: 'remove-sections', text: dataType, startMarker: dataType, endMarker: dataType, keepEndMarker: booleanType}
type mergePT = {$: 'merge', objects: dataType}
type dynamic_objectPT = {$: 'dynamic-object', items: dataType, propertyName: dataType, value: dataType}
type filter_empty_propertiesPT = {$: 'filter-empty-properties', obj: dataType}
type trimPT = {$: 'trim', text: dataType}
type remove_prefix_regexPT = {$: 'remove-prefix-regex', prefix: dataType, text: dataType}
type pretty_printPT = {$: 'pretty-print', profile: dataType, colWidth: dataType, macro: booleanType}
type fs_readFilePT = {$: 'fs.readFile', fileName: dataType, directory: dataType}
type fs_statPT = {$: 'fs.stat', fileName: dataType, directory: dataType}
type fs_readdirPT = {$: 'fs.readdir', directory: dataType}
type fs_directory_contentPT = {$: 'fs.directory-content', directory: dataType, filter: booleanType}
type test_dialog_contentPT = {$: 'test.dialog-content', id: dataType}
type field_dataPT = {$: 'field.data', }
type itemlist_container_search_in_all_propertiesPT = {$: 'itemlist-container.search-in-all-properties', }
type highlightPT = {$: 'highlight', base: dataType, highlight: dataType, cssClass: dataType}
type style_by_controlPT = {$: 'style-by-control', control: controlType, modelVar: dataType}
type group_divPT = {$: 'group.div', }
type group_sectionPT = {$: 'group.section', }

// type aggregator
type aggregatorType = slicePT | sortPT | firstPT | lastPT | countPT | reversePT | samplePT | assign_with_indexPT | filterPT | joinPT | uniquePT | wrap_as_object_with_arrayPT | wrap_as_objectPT | d3_histogramPT | itemlist_container_filterPT | ((ctx: ctx) => any)
type cmp_def_aggregatorType = {
	type: 'aggregator',
	params?: [param],
	impl: aggregatorType,
}
type slicePT = {$: 'slice', 
/** 0-based index */start: dataType, 
/** 0-based index of where to end the selection (not including itself) */end: dataType}
type sortPT = {$: 'sort', 
/** sort by property inside object */propertyName: dataType, lexical: booleanType, ascending: booleanType}
type firstPT = {$: 'first', }
type lastPT = {$: 'last', }
type countPT = {$: 'count', items: dataType}
type reversePT = {$: 'reverse', items: dataType}
type samplePT = {$: 'sample', size: dataType, items: dataType}
type assign_with_indexPT = {$: 'assign-with-index', props: [propType]}
type filterPT = {$: 'filter', filter: booleanType}
type joinPT = {$: 'join', separator: dataType, prefix: dataType, suffix: dataType, items: dataType, itemName: dataType, itemText: dataType}
type uniquePT = {$: 'unique', id: dataType, items: dataType}
type wrap_as_object_with_arrayPT = {$: 'wrap-as-object-with-array', arrayProperty: dataType, items: dataType}
type wrap_as_objectPT = {$: 'wrap-as-object', itemToPropName: dataType, items: dataType}
type d3_histogramPT = {$: 'd3.histogram', bins: dataType, values: dataType}
type itemlist_container_filterPT = {$: 'itemlist-container.filter', updateCounters: booleanType}

// type boolean
type booleanType = notPT | andPT | orPT | betweenPT | containsPT | not_containsPT | starts_withPT | ends_withPT | match_regexPT | isNullPT | isEmptyPT | notEmptyPT | equalsPT | not_equalsPT | is_of_typePT | in_groupPT | ((ctx: ctx) => any)
type cmp_def_booleanType = {
	type: 'boolean',
	params?: [param],
	impl: booleanType,
}
type notPT = {$: 'not', of: booleanType}
type andPT = {$: 'and', items: [booleanType]}
type orPT = {$: 'or', items: [booleanType]}
type betweenPT = {$: 'between', from: dataType, to: dataType, val: dataType}
type containsPT = {$: 'contains', text: [dataType], allText: dataType, inOrder: booleanType}
type not_containsPT = {$: 'not-contains', text: [dataType], allText: dataType}
type starts_withPT = {$: 'starts-with', startsWith: dataType, text: dataType}
type ends_withPT = {$: 'ends-with', endsWith: dataType, text: dataType}
type match_regexPT = {$: 'match-regex', text: dataType, 
/** e.g: [a-zA-Z]* */regex: dataType, 
/** regex must match all text */fillText: booleanType}
type isNullPT = {$: 'isNull', obj: dataType}
type isEmptyPT = {$: 'isEmpty', item: dataType}
type notEmptyPT = {$: 'notEmpty', item: dataType}
type equalsPT = {$: 'equals', item1: dataType, item2: dataType}
type not_equalsPT = {$: 'not-equals', item1: dataType, item2: dataType}
type is_of_typePT = {$: 'is-of-type', 
/** string,boolean */type: dataType, obj: dataType}
type in_groupPT = {$: 'in-group', group: dataType, item: dataType}

// type action
type actionType = action_ifPT | jb_runPT | write_valuePT | add_to_arrayPT | splicePT | remove_from_arrayPT | toggle_boolean_valuePT | touchPT | runActionsPT | run_action_on_itemsPT | on_next_timerPT | http_postPT | action_switchPT | refresh_control_by_idPT | focus_on_first_elementPT | focus_on_siblingPT | dialog_close_containing_popupPT | dialog_close_dialogPT | dialog_close_all_popupsPT | dialog_close_allPT | itemlist_container_addPT | itemlist_container_deletePT | menu_open_context_menuPT | tree_regain_focusPT | tree_redrawPT | url_history_map_url_to_resourcePT | run_transactionPT | goto_urlPT | reset_wspyPT | ((ctx: ctx) => any)
type cmp_def_actionType = {
	type: 'action',
	params?: [param],
	impl: actionType,
}
type action_ifPT = {$: 'action.if', condition: booleanType, then: actionType, else: actionType}
type jb_runPT = {$: 'jb-run', 
/** profile name */profile: dataType, params: dataType}
type write_valuePT = {$: 'write-value', to: dataType, value: dataType}
type add_to_arrayPT = {$: 'add-to-array', array: dataType, itemsToAdd: dataType}
type splicePT = {$: 'splice', array: dataType, fromIndex: dataType, noOfItemsToRemove: dataType, itemsToAdd: dataType}
type remove_from_arrayPT = {$: 'remove-from-array', array: dataType, 
/** choose item or index */itemToRemove: dataType, 
/** choose item or index */index: dataType}
type toggle_boolean_valuePT = {$: 'toggle-boolean-value', of: dataType}
type touchPT = {$: 'touch', data: dataType}
type runActionsPT = {$: 'runActions', actions: [actionType]}
type run_action_on_itemsPT = {$: 'run-action-on-items', items: dataType, action: actionType, 
/** notification for watch-ref, defualt behavior is after each action */notifications: dataType}
type on_next_timerPT = {$: 'on-next-timer', action: actionType, delay: numberType}
type http_postPT = {$: 'http.post', url: dataType, postData: dataType, 
/** convert result to json */jsonResult: booleanType}
type action_switchPT = {$: 'action.switch', cases: [action_switch_caseType], defaultAction: actionType}
type refresh_control_by_idPT = {$: 'refresh-control-by-id', id: dataType}
type focus_on_first_elementPT = {$: 'focus-on-first-element', selector: dataType}
type focus_on_siblingPT = {$: 'focus-on-sibling', siblingSelector: dataType, delay: dataType}
type dialog_close_containing_popupPT = {$: 'dialog.close-containing-popup', OK: booleanType}
type dialog_close_dialogPT = {$: 'dialog.close-dialog', id: dataType, delay: dataType}
type dialog_close_all_popupsPT = {$: 'dialog.close-all-popups', }
type dialog_close_allPT = {$: 'dialog.close-all', }
type itemlist_container_addPT = {$: 'itemlist-container.add', toAdd: dataType}
type itemlist_container_deletePT = {$: 'itemlist-container.delete', item: dataType}
type menu_open_context_menuPT = {$: 'menu.open-context-menu', menu: menu_optionType, popupStyle: dialog_styleType, features: [dialog_featureType]}
type tree_regain_focusPT = {$: 'tree.regain-focus', }
type tree_redrawPT = {$: 'tree.redraw', strong: booleanType}
type url_history_map_url_to_resourcePT = {$: 'url-history.map-url-to-resource', params: [dataType], resource: dataType, 
/** base string to add/ingnore in url */base: dataType, onUrlChange: actionType}
type run_transactionPT = {$: 'run-transaction', actions: [actionType], disableNotifications: booleanType}
type goto_urlPT = {$: 'goto-url', url: dataType, target: enumType}
type reset_wspyPT = {$: 'reset-wspy', param: dataType}

// type prop
type propType = propPT | ((ctx: ctx) => any)
type cmp_def_propType = {
	type: 'prop',
	params?: [param],
	impl: propType,
}
type propPT = {$: 'prop', title: dataType, val: dataType, type: dataType}

// type var
type varType = VarPT | ((ctx: ctx) => any)
type cmp_def_varType = {
	type: 'var',
	params?: [param],
	impl: varType,
}
type VarPT = {$: 'Var', name: dataType, val: dataType}

// type system
type systemType = VarPT | remarkPT | ((ctx: ctx) => any)
type cmp_def_systemType = {
	type: 'system',
	params?: [param],
	impl: systemType,
}
type VarPT = {$: 'Var', name: dataType, val: dataType}
type remarkPT = {$: 'remark', remark: dataType}

// type data.switch-case
type data_switch_caseType = data_casePT | ((ctx: ctx) => any)
type cmp_def_data_switch_caseType = {
	type: 'data_switch_case',
	params?: [param],
	impl: data_switch_caseType,
}
type data_casePT = {$: 'data.case', condition: booleanType, value: dataType}

// type action.switch-case
type action_switch_caseType = action_switch_casePT | ((ctx: ctx) => any)
type cmp_def_action_switch_caseType = {
	type: 'action_switch_case',
	params?: [param],
	impl: action_switch_caseType,
}
type action_switch_casePT = {$: 'action.switch-case', condition: booleanType, action: actionType}

// type jison.parser
type jison_parserType = jison_parserPT | ((ctx: ctx) => any)
type cmp_def_jison_parserType = {
	type: 'jison_parser',
	params?: [param],
	impl: jison_parserType,
}
type jison_parserPT = {$: 'jison.parser', lex: [lexer_ruleType], bnf: [bnf_expressionType], 
/** [["left", "+", "-"]] */operators: [dataType]}

// type lexer-rule
type lexer_ruleType = lexer_tokensPT | lexer_ignore_white_spacePT | lexer_numberPT | lexer_identifierPT | lexer_EOFPT | lexer_rulePT | ((ctx: ctx) => any)
type cmp_def_lexer_ruleType = {
	type: 'lexer_rule',
	params?: [param],
	impl: lexer_ruleType,
}
type lexer_tokensPT = {$: 'lexer.tokens', 
/** e.g. -,+,*,%,for,== */tokens: dataType}
type lexer_ignore_white_spacePT = {$: 'lexer.ignore-white-space', }
type lexer_numberPT = {$: 'lexer.number', }
type lexer_identifierPT = {$: 'lexer.identifier', regex: dataType}
type lexer_EOFPT = {$: 'lexer.EOF', }
type lexer_rulePT = {$: 'lexer-rule', 
/** [a-f0-9]+ */regex: dataType, 
/** return 'Hex'; */result: dataType}

// type bnf-expression
type bnf_expressionType = bnf_expressionPT | ((ctx: ctx) => any)
type cmp_def_bnf_expressionType = {
	type: 'bnf_expression',
	params?: [param],
	impl: bnf_expressionType,
}
type bnf_expressionPT = {$: 'bnf-expression', id: dataType, options: [expression_optionType]}

// type expression-option
type expression_optionType = expression_optionPT | ((ctx: ctx) => any)
type cmp_def_expression_optionType = {
	type: 'expression_option',
	params?: [param],
	impl: expression_optionType,
}
type expression_optionPT = {$: 'expression-option', 
/** e + e */syntax: dataType, 
/** $$ = $1 + $2; */calculate: dataType}

// type test
type testType = data_testPT | ui_testPT | ((ctx: ctx) => any)
type cmp_def_testType = {
	type: 'test',
	params?: [param],
	impl: testType,
}
type data_testPT = {$: 'data-test', calculate: dataType, runBefore: actionType, expectedResult: booleanType, cleanUp: actionType, expectedCounters: dataType}
type ui_testPT = {$: 'ui-test', control: controlType, runBefore: actionType, action: actionType, expectedResult: booleanType, cleanUp: actionType, expectedCounters: dataType}

// type ui-action
type ui_actionType = ui_action_clickPT | ui_action_keyboard_eventPT | ui_action_set_textPT | ((ctx: ctx) => any)
type cmp_def_ui_actionType = {
	type: 'ui_action',
	params?: [param],
	impl: ui_actionType,
}
type ui_action_clickPT = {$: 'ui-action.click', selector: dataType, methodToActivate: dataType}
type ui_action_keyboard_eventPT = {$: 'ui-action.keyboard-event', selector: dataType, type: dataType, keyCode: dataType, ctrl: dataType}
type ui_action_set_textPT = {$: 'ui-action.set-text', value: dataType, selector: dataType, delay: dataType}

// type control
type controlType = buttonPT | icon_with_actionPT | cardPT | d3_chart_scatterPT | dividerPT | editable_booleanPT | editable_numberPT | editable_textPT | groupPT | inline_controlsPT | dynamic_controlsPT | control_first_succeedingPT | control_with_conditionPT | material_iconPT | imagePT | inner_htmlPT | itemlist_container_searchPT | itemlist_container_more_items_buttonPT | itemlist_with_groupsPT | itemlist_default_headingPT | itemlistPT | itemlogPT | labelPT | markdownPT | menu_controlPT | picklistPT | sidenavPT | tablePT | tabsPT | textPT | rich_textPT | treePT | ((ctx: ctx) => any)
type cmp_def_controlType = {
	type: 'control',
	params?: [param],
	impl: controlType,
}
type buttonPT = {$: 'button', title: dataType, action: actionType, style: button_styleType, features: [featureType]}
type icon_with_actionPT = {$: 'icon-with-action', icon: dataType, title: dataType, action: actionType, style: icon_with_action_styleType, features: [featureType]}
type cardPT = {$: 'card', title: dataType, subTitle: dataType, text: dataType, image: dataType, topButton: clickableType, menu: menuType, style: card_styleType, features: [featureType]}
type d3_chart_scatterPT = {$: 'd3.chart-scatter', title: dataType, items: dataType, frame: d3_frameType, pivots: [d3_pivotType], itemTitle: dataType, visualSizeLimit: dataType, style: d3_scatter_styleType, features: [featureType]}
type dividerPT = {$: 'divider', style: divider_styleType, title: dataType, features: [featureType]}
type editable_booleanPT = {$: 'editable-boolean', databind: booleanType, style: editable_boolean_styleType, title: dataType, textForTrue: dataType, textForFalse: dataType, features: [featureType]}
type editable_numberPT = {$: 'editable-number', databind: dataType, title: dataType, style: editable_number_styleType, 
/** leave empty to parse symbol from value */symbol: dataType, min: dataType, max: dataType, displayString: dataType, dataString: dataType, 
/** adjust its scale if at edges */autoScale: booleanType, 
/** used by slider */step: dataType, 
/** used by slider */initialPixelsPerUnit: dataType, features: [featureType]}
type editable_textPT = {$: 'editable-text', title: dataType, databind: dataType, updateOnBlur: booleanType, style: editable_text_styleType, features: [featureType]}
type groupPT = {$: 'group', title: dataType, style: group_styleType, controls: [controlType], features: [featureType]}
type inline_controlsPT = {$: 'inline-controls', controls: [controlType]}
type dynamic_controlsPT = {$: 'dynamic-controls', controlItems: dataType, genericControl: controlType, itemVariable: dataType}
type control_first_succeedingPT = {$: 'control.first-succeeding', controls: [controlType], title: dataType, style: first_succeeding_styleType, features: [featureType]}
type control_with_conditionPT = {$: 'control-with-condition', condition: booleanType, control: controlType, title: dataType}
type material_iconPT = {$: 'material-icon', icon: dataType, title: dataType, style: icon_styleType, features: [featureType]}
type imagePT = {$: 'image', url: dataType, imageWidth: dataType, imageHeight: dataType, width: dataType, height: dataType, units: dataType, style: image_styleType, features: [featureType]}
type inner_htmlPT = {$: 'inner-html', title: dataType, html: dataType, style: inner_html_styleType, features: [featureType]}
type itemlist_container_searchPT = {$: 'itemlist-container.search', title: dataType, searchIn: dataType, databind: dataType, style: editable_text_styleType, features: [featureType]}
type itemlist_container_more_items_buttonPT = {$: 'itemlist-container.more-items-button', title: dataType, delta: dataType, style: button_styleType, features: [featureType]}
type itemlist_with_groupsPT = {$: 'itemlist-with-groups', title: dataType, items: dataType, controls: [controlType], style: itemlist_styleType, groupBy: itemlist_group_byType, headingCtrl: controlType, 
/** resources to watch */watch: dataType, itemVariable: dataType, features: [featureType]}
type itemlist_default_headingPT = {$: 'itemlist-default-heading', }
type itemlistPT = {$: 'itemlist', title: dataType, items: dataType, controls: [controlType], style: itemlist_styleType, watchItems: booleanType, itemVariable: dataType, features: [featureType]}
type itemlogPT = {$: 'itemlog', title: dataType, items: dataType, controls: [controlType], style: itemlog_styleType, itemVariable: dataType, counter: dataType, features: [featureType]}
type labelPT = {$: 'label', title: dataType, style: label_styleType, features: [featureType]}
type markdownPT = {$: 'markdown', markdown: dataType, style: markdown_styleType, title: dataType, features: [featureType]}
type menu_controlPT = {$: 'menu.control', menu: menu_optionType, style: menu_styleType, features: [featureType]}
type picklistPT = {$: 'picklist', title: dataType, databind: dataType, options: picklist_optionsType, promote: picklist_promoteType, style: picklist_styleType, features: [featureType]}
type sidenavPT = {$: 'sidenav', controls: [controlType], title: dataType, style: sidenav_styleType, features: [featureType]}
type tablePT = {$: 'table', title: dataType, items: dataType, fields: [table_fieldType], style: table_styleType, watchItems: booleanType, 
/** by default table is limmited to 100 shown items */visualSizeLimit: dataType, features: [featureType]}
type tabsPT = {$: 'tabs', tabs: [controlType], style: tabs_styleType, features: [featureType]}
type textPT = {$: 'text', text: dataType, style: text_styleType, title: dataType, features: [featureType]}
type rich_textPT = {$: 'rich-text', text: dataType, title: dataType, style: rich_text_styleType, features: [featureType]}
type treePT = {$: 'tree', nodeModel: tree_nodeModelType, style: tree_styleType, features: [featureType]}

// type clickable
type clickableType = buttonPT | icon_with_actionPT | menu_controlPT | ((ctx: ctx) => any)
type cmp_def_clickableType = {
	type: 'clickable',
	params?: [param],
	impl: clickableType,
}
type buttonPT = {$: 'button', title: dataType, action: actionType, style: button_styleType, features: [featureType]}
type icon_with_actionPT = {$: 'icon-with-action', icon: dataType, title: dataType, action: actionType, style: icon_with_action_styleType, features: [featureType]}
type menu_controlPT = {$: 'menu.control', menu: menu_optionType, style: menu_styleType, features: [featureType]}

// type feature
type featureType = ctrl_actionPT | alt_actionPT | button_disabledPT | card_initPT | group_waitPT | watch_refPT | watch_observablePT | group_dataPT | html_attributePT | idPT | feature_hover_titlePT | variablePT | varPT | bind_refsPT | calculated_varPT | featuresPT | feature_initPT | feature_after_loadPT | feature_ifPT | hiddenPT | conditional_classPT | feature_keyboard_shortcutPT | feature_onEventPT | feature_onHoverPT | feature_onKeyPT | feature_onEnterPT | feature_onEscPT | group_auto_focus_on_first_inputPT | cssPT | css_classPT | css_widthPT | css_heightPT | css_opacityPT | css_paddingPT | css_marginPT | css_transform_rotatePT | css_colorPT | css_transform_scalePT | css_box_shadowPT | css_borderPT | d3_scatter_initPT | editable_boolean_keyboard_supportPT | editable_text_x_buttonPT | editable_text_helper_popupPT | field_databindPT | field_databind_textPT | field_defaultPT | field_init_valuePT | field_keyboard_shortcutPT | field_subscribePT | field_on_changePT | field_toolbarPT | validationPT | group_init_groupPT | group_dynamic_titlesPT | first_succeeding_watch_refresh_on_ctrl_changePT | group_itemlist_containerPT | itemlist_itemlist_selectedPT | itemlist_container_filter_fieldPT | itemlist_watch_items_with_headingPT | itemlist_no_containerPT | itemlist_initPT | itemlist_selectionPT | itemlist_keyboard_selectionPT | itemlist_drag_and_dropPT | itemlist_drag_handlePT | itemlist_shown_only_on_item_hoverPT | itemlist_dividerPT | label_bind_titlePT | menu_init_popup_menuPT | menu_init_menu_optionPT | picklist_dynamic_optionsPT | picklist_onChangePT | slider_initPT | slider_text_handleArrowKeysPT | slider_edit_as_text_popupPT | group_init_expandablePT | group_init_accordionPT | flex_layout_container_align_main_axisPT | flex_item_growPT | flex_item_basisPT | flex_item_align_selfPT | responsive_not_for_phonePT | mdl_style_init_dynamicPT | mdl_ripple_effectPT | table_initPT | table_init_sortPT | group_init_tabsPT | text_bind_textPT | group_themePT | tree_selectionPT | tree_keyboard_selectionPT | tree_drag_and_dropPT | ((ctx: ctx) => any)
type cmp_def_featureType = {
	type: 'feature',
	params?: [param],
	impl: featureType,
}
type ctrl_actionPT = {$: 'ctrl-action', action: actionType}
type alt_actionPT = {$: 'alt-action', action: actionType}
type button_disabledPT = {$: 'button-disabled', enabledCondition: booleanType}
type card_initPT = {$: 'card.init', }
type group_waitPT = {$: 'group.wait', for: dataType, loadingControl: controlType, error: controlType, varName: dataType}
type watch_refPT = {$: 'watch-ref', 
/** reference to data */ref: dataType, 
/** watch childern change as well */includeChildren: dataType, 
/** delay in activation, can be used to set priority */delay: dataType, 
/** allow refresh originated from the components or its children */allowSelfRefresh: booleanType}
type watch_observablePT = {$: 'watch-observable', toWatch: dataType}
type group_dataPT = {$: 'group.data', data: dataType, 
/** optional. define data as a local variable */itemVariable: dataType, watch: booleanType, 
/** watch childern change as well */includeChildren: dataType}
type html_attributePT = {$: 'html-attribute', attribute: dataType, value: dataType}
type idPT = {$: 'id', id: dataType}
type feature_hover_titlePT = {$: 'feature.hover-title', title: dataType}
type variablePT = {$: 'variable', name: dataType, value: dataType, 
/** E.g., selected item variable */watchable: booleanType, 
/** If specified, the var will be defined as global with this id */globalId: dataType}
type varPT = {$: 'var', name: dataType, value: dataType, 
/** E.g., selected item variable */watchable: booleanType, 
/** If specified, the var will be defined as global with this id */globalId: dataType}
type bind_refsPT = {$: 'bind-refs', watchRef: dataType, 
/** watch childern change as well */includeChildren: dataType, updateRef: dataType, value: dataType}
type calculated_varPT = {$: 'calculated-var', name: dataType, value: dataType, 
/** If specified, the var will be defined as global with this id */globalId: dataType, 
/** variable to watch. needs to be in array */watchRefs: dataType}
type featuresPT = {$: 'features', features: [featureType]}
type feature_initPT = {$: 'feature.init', action: [actionType]}
type feature_after_loadPT = {$: 'feature.after-load', action: [actionType]}
type feature_ifPT = {$: 'feature.if', showCondition: dataType}
type hiddenPT = {$: 'hidden', showCondition: booleanType}
type conditional_classPT = {$: 'conditional-class', cssClass: dataType, condition: booleanType}
type feature_keyboard_shortcutPT = {$: 'feature.keyboard-shortcut', 
/** e.g. Alt+C */key: dataType, action: actionType}
type feature_onEventPT = {$: 'feature.onEvent', event: dataType, action: [actionType], 
/** used for mouse events such as mousemove */debounceTime: dataType}
type feature_onHoverPT = {$: 'feature.onHover', action: [actionType]}
type feature_onKeyPT = {$: 'feature.onKey', 
/** E.g., a,27,Enter,Esc,Ctrl+C or Alt+V */key: dataType, action: [actionType]}
type feature_onEnterPT = {$: 'feature.onEnter', action: [actionType]}
type feature_onEscPT = {$: 'feature.onEsc', action: [actionType]}
type group_auto_focus_on_first_inputPT = {$: 'group.auto-focus-on-first-input', }
type cssPT = {$: 'css', css: dataType}
type css_classPT = {$: 'css.class', class: dataType}
type css_widthPT = {$: 'css.width', width: dataType, overflow: dataType, minMax: dataType, selector: dataType}
type css_heightPT = {$: 'css.height', height: dataType, overflow: dataType, minMax: dataType, selector: dataType}
type css_opacityPT = {$: 'css.opacity', opacity: dataType, selector: dataType}
type css_paddingPT = {$: 'css.padding', top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}
type css_marginPT = {$: 'css.margin', top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}
type css_transform_rotatePT = {$: 'css.transform-rotate', angle: dataType, selector: dataType}
type css_colorPT = {$: 'css.color', color: dataType, background: dataType, selector: dataType}
type css_transform_scalePT = {$: 'css.transform-scale', x: dataType, y: dataType, selector: dataType}
type css_box_shadowPT = {$: 'css.box-shadow', blurRadius: dataType, spreadRadius: dataType, shadowColor: dataType, opacity: dataType, horizontal: dataType, vertical: dataType, selector: dataType}
type css_borderPT = {$: 'css.border', width: dataType, side: dataType, style: dataType, color: dataType, selector: dataType}
type d3_scatter_initPT = {$: 'd3-scatter.init', }
type editable_boolean_keyboard_supportPT = {$: 'editable-boolean.keyboard-support', }
type editable_text_x_buttonPT = {$: 'editable-text.x-button', }
type editable_text_helper_popupPT = {$: 'editable-text.helper-popup', control: controlType, popupId: dataType, popupStyle: dialog_styleType, 
/** show/hide helper according to input content */showHelper: booleanType, onEnter: actionType, onEsc: actionType}
type field_databindPT = {$: 'field.databind', }
type field_databind_textPT = {$: 'field.databind-text', debounceTime: dataType, oneWay: booleanType}
type field_defaultPT = {$: 'field.default', value: dataType}
type field_init_valuePT = {$: 'field.init-value', value: dataType}
type field_keyboard_shortcutPT = {$: 'field.keyboard-shortcut', 
/** e.g. Alt+C */key: dataType, action: actionType}
type field_subscribePT = {$: 'field.subscribe', action: actionType, includeFirst: booleanType}
type field_on_changePT = {$: 'field.on-change', action: actionType, includeFirst: booleanType}
type field_toolbarPT = {$: 'field.toolbar', toolbar: controlType}
type validationPT = {$: 'validation', validCondition: booleanType, errorMessage: dataType}
type group_init_groupPT = {$: 'group.init-group', }
type group_dynamic_titlesPT = {$: 'group.dynamic-titles', }
type first_succeeding_watch_refresh_on_ctrl_changePT = {$: 'first-succeeding.watch-refresh-on-ctrl-change', 
/** reference to data */ref: dataType, 
/** watch childern change as well */includeChildren: booleanType}
type group_itemlist_containerPT = {$: 'group.itemlist-container', id: dataType, defaultItem: dataType, maxItems: dataType, initialSelection: dataType}
type itemlist_itemlist_selectedPT = {$: 'itemlist.itemlist-selected', }
type itemlist_container_filter_fieldPT = {$: 'itemlist-container.filter-field', fieldData: dataType, filterType: filter_typeType}
type itemlist_watch_items_with_headingPT = {$: 'itemlist.watch-items-with-heading', items: dataType, itemVariableName: dataType, groupBy: itemlist_group_byType}
type itemlist_no_containerPT = {$: 'itemlist.no-container', }
type itemlist_initPT = {$: 'itemlist.init', }
type itemlist_selectionPT = {$: 'itemlist.selection', databind: dataType, selectedToDatabind: dataType, databindToSelected: dataType, onSelection: actionType, onDoubleClick: actionType, autoSelectFirst: booleanType, cssForSelected: dataType}
type itemlist_keyboard_selectionPT = {$: 'itemlist.keyboard-selection', autoFocus: booleanType, onEnter: actionType}
type itemlist_drag_and_dropPT = {$: 'itemlist.drag-and-drop', }
type itemlist_drag_handlePT = {$: 'itemlist.drag-handle', }
type itemlist_shown_only_on_item_hoverPT = {$: 'itemlist.shown-only-on-item-hover', }
type itemlist_dividerPT = {$: 'itemlist.divider', space: dataType}
type label_bind_titlePT = {$: 'label.bind-title', }
type menu_init_popup_menuPT = {$: 'menu.init-popup-menu', popupStyle: dialog_styleType}
type menu_init_menu_optionPT = {$: 'menu.init-menu-option', }
type picklist_dynamic_optionsPT = {$: 'picklist.dynamic-options', recalcEm: dataType}
type picklist_onChangePT = {$: 'picklist.onChange', action: actionType}
type slider_initPT = {$: 'slider.init', }
type slider_text_handleArrowKeysPT = {$: 'slider-text.handleArrowKeys', }
type slider_edit_as_text_popupPT = {$: 'slider.edit-as-text-popup', }
type group_init_expandablePT = {$: 'group.init-expandable', }
type group_init_accordionPT = {$: 'group.init-accordion', keyboardSupport: booleanType, autoFocus: booleanType}
type flex_layout_container_align_main_axisPT = {$: 'flex-layout-container.align-main-axis', align: dataType}
type flex_item_growPT = {$: 'flex-item.grow', factor: dataType}
type flex_item_basisPT = {$: 'flex-item.basis', factor: dataType}
type flex_item_align_selfPT = {$: 'flex-item.align-self', align: dataType}
type responsive_not_for_phonePT = {$: 'responsive.not-for-phone', }
type mdl_style_init_dynamicPT = {$: 'mdl-style.init-dynamic', query: dataType}
type mdl_ripple_effectPT = {$: 'mdl.ripple-effect', }
type table_initPT = {$: 'table.init', }
type table_init_sortPT = {$: 'table.init-sort', }
type group_init_tabsPT = {$: 'group.init-tabs', keyboardSupport: booleanType, autoFocus: booleanType}
type text_bind_textPT = {$: 'text.bind-text', }
type group_themePT = {$: 'group.theme', theme: themeType}
type tree_selectionPT = {$: 'tree.selection', databind: dataType, autoSelectFirst: booleanType, onSelection: actionType, onRightClick: actionType}
type tree_keyboard_selectionPT = {$: 'tree.keyboard-selection', onKeyboardSelection: actionType, onEnter: actionType, onRightClickOfExpanded: actionType, autoFocus: booleanType, applyMenuShortcuts: menu_optionType}
type tree_drag_and_dropPT = {$: 'tree.drag-and-drop', }

// type dialog-feature
type dialog_featureType = cssPT | css_classPT | css_widthPT | css_heightPT | css_paddingPT | css_marginPT | css_box_shadowPT | css_borderPT | dialog_feature_drag_titlePT | dialog_feature_unique_dialogPT | dialog_feature_keyboard_shortcutPT | dialog_feature_near_launcher_positionPT | dialog_feature_onClosePT | dialog_feature_close_when_clicking_outsidePT | dialog_feature_auto_focus_on_first_inputPT | dialog_feature_css_class_on_launching_elementPT | dialog_feature_max_zIndex_on_clickPT | dialog_feature_resizerPT | ((ctx: ctx) => any)
type cmp_def_dialog_featureType = {
	type: 'dialog_feature',
	params?: [param],
	impl: dialog_featureType,
}
type cssPT = {$: 'css', css: dataType}
type css_classPT = {$: 'css.class', class: dataType}
type css_widthPT = {$: 'css.width', width: dataType, overflow: dataType, minMax: dataType, selector: dataType}
type css_heightPT = {$: 'css.height', height: dataType, overflow: dataType, minMax: dataType, selector: dataType}
type css_paddingPT = {$: 'css.padding', top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}
type css_marginPT = {$: 'css.margin', top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}
type css_box_shadowPT = {$: 'css.box-shadow', blurRadius: dataType, spreadRadius: dataType, shadowColor: dataType, opacity: dataType, horizontal: dataType, vertical: dataType, selector: dataType}
type css_borderPT = {$: 'css.border', width: dataType, side: dataType, style: dataType, color: dataType, selector: dataType}
type dialog_feature_drag_titlePT = {$: 'dialog-feature.drag-title', id: dataType}
type dialog_feature_unique_dialogPT = {$: 'dialog-feature.unique-dialog', id: dataType, remeberLastLocation: booleanType}
type dialog_feature_keyboard_shortcutPT = {$: 'dialog-feature.keyboard-shortcut', 
/** Ctrl+C or Alt+V */shortcut: dataType, action: actionType}
type dialog_feature_near_launcher_positionPT = {$: 'dialog-feature.near-launcher-position', offsetLeft: dataType, offsetTop: dataType, rightSide: booleanType}
type dialog_feature_onClosePT = {$: 'dialog-feature.onClose', action: actionType}
type dialog_feature_close_when_clicking_outsidePT = {$: 'dialog-feature.close-when-clicking-outside', delay: dataType}
type dialog_feature_auto_focus_on_first_inputPT = {$: 'dialog-feature.auto-focus-on-first-input', selectText: booleanType}
type dialog_feature_css_class_on_launching_elementPT = {$: 'dialog-feature.css-class-on-launching-element', }
type dialog_feature_max_zIndex_on_clickPT = {$: 'dialog-feature.max-zIndex-on-click', minZIndex: dataType}
type dialog_feature_resizerPT = {$: 'dialog-feature.resizer', 
/** effective only for dialog with a single codemirror element */resizeInnerCodemirror: booleanType}

// type d3.scatter-style
type d3_scatter_styleType = d3_scatter_plainPT | style_by_controlPT | ((ctx: ctx) => any)
type cmp_def_d3_scatter_styleType = {
	type: 'd3_scatter_style',
	params?: [param],
	impl: d3_scatter_styleType,
}
type d3_scatter_plainPT = {$: 'd3-scatter.plain', }
type style_by_controlPT = {$: 'style-by-control', control: controlType, modelVar: dataType}

// type d3.frame
type d3_frameType = d3_framePT | ((ctx: ctx) => any)
type cmp_def_d3_frameType = {
	type: 'd3_frame',
	params?: [param],
	impl: d3_frameType,
}
type d3_framePT = {$: 'd3.frame', width: dataType, height: dataType, top: dataType, right: dataType, bottom: dataType, left: dataType}

// type d3.histogram-style
type d3_histogram_styleType = d3_histogram_plainPT | style_by_controlPT | ((ctx: ctx) => any)
type cmp_def_d3_histogram_styleType = {
	type: 'd3_histogram_style',
	params?: [param],
	impl: d3_histogram_styleType,
}
type d3_histogram_plainPT = {$: 'd3-histogram.plain', }
type style_by_controlPT = {$: 'style-by-control', control: controlType, modelVar: dataType}

// type d3-feature
type d3_featureType = d3_histogram_initPT | d3_item_indicatorPT | ((ctx: ctx) => any)
type cmp_def_d3_featureType = {
	type: 'd3_feature',
	params?: [param],
	impl: d3_featureType,
}
type d3_histogram_initPT = {$: 'd3-histogram.init', }
type d3_item_indicatorPT = {$: 'd3.item-indicator', item: dataType}

// type d3.axes
type d3_axesType = d3_buttom_and_left_axesPT | ((ctx: ctx) => any)
type cmp_def_d3_axesType = {
	type: 'd3_axes',
	params?: [param],
	impl: d3_axesType,
}
type d3_buttom_and_left_axesPT = {$: 'd3.buttom-and-left-axes', }

// type d3.pivot
type d3_pivotType = d3_pivotPT | ((ctx: ctx) => any)
type cmp_def_d3_pivotType = {
	type: 'd3_pivot',
	params?: [param],
	impl: d3_pivotType,
}
type d3_pivotPT = {$: 'd3.pivot', title: dataType, value: dataType, scale: d3_scaleType, range: d3_rangeType, domain: d3_domainType}

// type d3.scale
type d3_scaleType = d3_linear_scalePT | d3_sqrt_scalePT | d3_ordinal_scalePT | d3_colorsPT | ((ctx: ctx) => any)
type cmp_def_d3_scaleType = {
	type: 'd3_scale',
	params?: [param],
	impl: d3_scaleType,
}
type d3_linear_scalePT = {$: 'd3.linear-scale', }
type d3_sqrt_scalePT = {$: 'd3.sqrt-scale', }
type d3_ordinal_scalePT = {$: 'd3.ordinal-scale', list: dataType}
type d3_colorsPT = {$: 'd3.colors', }

// type d3.range
type d3_rangeType = d3_auto_rangePT | d3_from_toPT | ((ctx: ctx) => any)
type cmp_def_d3_rangeType = {
	type: 'd3_range',
	params?: [param],
	impl: d3_rangeType,
}
type d3_auto_rangePT = {$: 'd3.auto-range', }
type d3_from_toPT = {$: 'd3.from-to', from: dataType, to: dataType}

// type d3.domain
type d3_domainType = d3_domain_by_valuesPT | ((ctx: ctx) => any)
type cmp_def_d3_domainType = {
	type: 'd3_domain',
	params?: [param],
	impl: d3_domainType,
}
type d3_domain_by_valuesPT = {$: 'd3.domain-by-values', }

// type divider.style
type divider_styleType = divider_brPT | divider_flex_auto_growPT | ((ctx: ctx) => any)
type cmp_def_divider_styleType = {
	type: 'divider_style',
	params?: [param],
	impl: divider_styleType,
}
type divider_brPT = {$: 'divider.br', }
type divider_flex_auto_growPT = {$: 'divider.flex-auto-grow', }

// type editable-number.style
type editable_number_styleType = editable_number_inputPT | editable_number_slider_no_textPT | editable_number_sliderPT | editable_number_mdl_sliderPT | ((ctx: ctx) => any)
type cmp_def_editable_number_styleType = {
	type: 'editable_number_style',
	params?: [param],
	impl: editable_number_styleType,
}
type editable_number_inputPT = {$: 'editable-number.input', }
type editable_number_slider_no_textPT = {$: 'editable-number.slider-no-text', }
type editable_number_sliderPT = {$: 'editable-number.slider', }
type editable_number_mdl_sliderPT = {$: 'editable-number.mdl-slider', }

// type icon-with-action.style
type icon_with_action_styleType = icon_icon_in_buttonPT | icon_materialPT | button_mdl_iconPT | button_mdl_round_iconPT | button_mdl_icon12_with_ripplePT | button_mdl_icon12PT | ((ctx: ctx) => any)
type cmp_def_icon_with_action_styleType = {
	type: 'icon_with_action_style',
	params?: [param],
	impl: icon_with_action_styleType,
}
type icon_icon_in_buttonPT = {$: 'icon.icon-in-button', }
type icon_materialPT = {$: 'icon.material', }
type button_mdl_iconPT = {$: 'button.mdl-icon', icon: dataType}
type button_mdl_round_iconPT = {$: 'button.mdl-round-icon', icon: dataType}
type button_mdl_icon12_with_ripplePT = {$: 'button.mdl-icon12-with-ripple', icon: dataType}
type button_mdl_icon12PT = {$: 'button.mdl-icon12', icon: dataType}

// type image
type imageType = imagePT | ((ctx: ctx) => any)
type cmp_def_imageType = {
	type: 'image',
	params?: [param],
	impl: imageType,
}
type imagePT = {$: 'image', url: dataType, imageWidth: dataType, imageHeight: dataType, width: dataType, height: dataType, units: dataType, style: image_styleType, features: [featureType]}

// type image.style
type image_styleType = image_defaultPT | ((ctx: ctx) => any)
type cmp_def_image_styleType = {
	type: 'image_style',
	params?: [param],
	impl: image_styleType,
}
type image_defaultPT = {$: 'image.default', }

// type inner-html.style
type inner_html_styleType = inner_html_unsafePT | ((ctx: ctx) => any)
type cmp_def_inner_html_styleType = {
	type: 'inner_html_style',
	params?: [param],
	impl: inner_html_styleType,
}
type inner_html_unsafePT = {$: 'inner-html.unsafe', }

// type filter-type
type filter_typeType = filter_type_textPT | filter_type_exact_matchPT | filter_type_numericPT | ((ctx: ctx) => any)
type cmp_def_filter_typeType = {
	type: 'filter_type',
	params?: [param],
	impl: filter_typeType,
}
type filter_type_textPT = {$: 'filter-type.text', ignoreCase: booleanType}
type filter_type_exact_matchPT = {$: 'filter-type.exact-match', }
type filter_type_numericPT = {$: 'filter-type.numeric', }

// type itemlist.group-by
type itemlist_group_byType = itemlist_heading_group_byPT | ((ctx: ctx) => any)
type cmp_def_itemlist_group_byType = {
	type: 'itemlist_group_by',
	params?: [param],
	impl: itemlist_group_byType,
}
type itemlist_heading_group_byPT = {$: 'itemlist-heading.group-by', itemToGroupID: dataType, promoteGroups: [dataType]}

// type itemlist.style
type itemlist_styleType = itemlist_ul_liPT | itemlist_horizontalPT | ((ctx: ctx) => any)
type cmp_def_itemlist_styleType = {
	type: 'itemlist_style',
	params?: [param],
	impl: itemlist_styleType,
}
type itemlist_ul_liPT = {$: 'itemlist.ul-li', }
type itemlist_horizontalPT = {$: 'itemlist.horizontal', , spacing: dataType}

// type group.style
type group_styleType = itemlog_divPT | card_cardPT | card_media_groupPT | card_actions_groupPT | card_menuPT | group_htmlTagPT | group_ul_liPT | group_expandablePT | group_accordionPT | group_tabsPT | layout_verticalPT | layout_horizontalPT | layout_horizontal_fixed_splitPT | layout_horizontal_wrappedPT | layout_flexPT | property_sheet_titles_abovePT | property_sheet_titles_above_float_leftPT | property_sheet_titles_leftPT | tabs_simplePT | ((ctx: ctx) => any)
type cmp_def_group_styleType = {
	type: 'group_style',
	params?: [param],
	impl: group_styleType,
}
type itemlog_divPT = {$: 'itemlog.div', }
type card_cardPT = {$: 'card.card', width: dataType, shadow: dataType}
type card_media_groupPT = {$: 'card.media-group', }
type card_actions_groupPT = {$: 'card.actions-group', }
type card_menuPT = {$: 'card.menu', }
type group_htmlTagPT = {$: 'group.htmlTag', htmlTag: dataType, groupClass: dataType, itemClass: dataType}
type group_ul_liPT = {$: 'group.ul-li', }
type group_expandablePT = {$: 'group.expandable', }
type group_accordionPT = {$: 'group.accordion', }
type group_tabsPT = {$: 'group.tabs', width: dataType}
type layout_verticalPT = {$: 'layout.vertical', spacing: dataType}
type layout_horizontalPT = {$: 'layout.horizontal', spacing: dataType}
type layout_horizontal_fixed_splitPT = {$: 'layout.horizontal-fixed-split', , leftWidth: dataType, rightWidth: dataType, spacing: dataType}
type layout_horizontal_wrappedPT = {$: 'layout.horizontal-wrapped', , spacing: dataType}
type layout_flexPT = {$: 'layout.flex', align: dataType, direction: dataType, wrap: dataType}
type property_sheet_titles_abovePT = {$: 'property-sheet.titles-above', spacing: dataType}
type property_sheet_titles_above_float_leftPT = {$: 'property-sheet.titles-above-float-left', spacing: dataType, fieldWidth: dataType}
type property_sheet_titles_leftPT = {$: 'property-sheet.titles-left', vSpacing: dataType, hSpacing: dataType, titleWidth: dataType}
type tabs_simplePT = {$: 'tabs.simple', }

// type label.style
type label_styleType = label_htmlTagPT | label_spanPT | label_card_titlePT | label_card_supporting_textPT | label_mdl_ripple_effectPT | label_mdl_buttonPT | ((ctx: ctx) => any)
type cmp_def_label_styleType = {
	type: 'label_style',
	params?: [param],
	impl: label_styleType,
}
type label_htmlTagPT = {$: 'label.htmlTag', htmlTag: dataType, cssClass: dataType}
type label_spanPT = {$: 'label.span', }
type label_card_titlePT = {$: 'label.card-title', }
type label_card_supporting_textPT = {$: 'label.card-supporting-text', }
type label_mdl_ripple_effectPT = {$: 'label.mdl-ripple-effect', }
type label_mdl_buttonPT = {$: 'label.mdl-button', width: dataType}

// type markdown.style
type markdown_styleType = markdown_showdownPT | ((ctx: ctx) => any)
type cmp_def_markdown_styleType = {
	type: 'markdown_style',
	params?: [param],
	impl: markdown_styleType,
}
type markdown_showdownPT = {$: 'markdown.showdown', }

// type menu.option
type menu_optionType = menu_menuPT | menu_options_groupPT | menu_dynamic_optionsPT | menu_end_with_separatorPT | menu_separatorPT | menu_actionPT | ((ctx: ctx) => any)
type cmp_def_menu_optionType = {
	type: 'menu_option',
	params?: [param],
	impl: menu_optionType,
}
type menu_menuPT = {$: 'menu.menu', title: dataType, options: [menu_optionType], optionsFilter: dataType}
type menu_options_groupPT = {$: 'menu.options-group', options: [menu_optionType]}
type menu_dynamic_optionsPT = {$: 'menu.dynamic-options', items: dataType, genericOption: menu_optionType}
type menu_end_with_separatorPT = {$: 'menu.end-with-separator', options: [menu_optionType], separator: menu_optionType, title: dataType}
type menu_separatorPT = {$: 'menu.separator', }
type menu_actionPT = {$: 'menu.action', title: dataType, action: actionType, icon: dataType, shortcut: dataType, showCondition: booleanType}

// type menu
type menuType = menu_controlPT | ((ctx: ctx) => any)
type cmp_def_menuType = {
	type: 'menu',
	params?: [param],
	impl: menuType,
}
type menu_controlPT = {$: 'menu.control', menu: menu_optionType, style: menu_styleType, features: [featureType]}

// type menu.style
type menu_styleType = menu_style_pulldownPT | menu_style_context_menuPT | menu_style_apply_multi_levelPT | menu_style_popup_as_optionPT | menu_style_popup_thumbPT | menu_style_toolbarPT | ((ctx: ctx) => any)
type cmp_def_menu_styleType = {
	type: 'menu_style',
	params?: [param],
	impl: menu_styleType,
}
type menu_style_pulldownPT = {$: 'menu-style.pulldown', innerMenuStyle: menu_styleType, leafOptionStyle: menu_option_styleType, layout: group_styleType}
type menu_style_context_menuPT = {$: 'menu-style.context-menu', leafOptionStyle: menu_option_styleType}
type menu_style_apply_multi_levelPT = {$: 'menu-style.apply-multi-level', menuStyle: menu_styleType, leafStyle: menu_styleType, separatorStyle: menu_styleType}
type menu_style_popup_as_optionPT = {$: 'menu-style.popup-as-option', }
type menu_style_popup_thumbPT = {$: 'menu-style.popup-thumb', }
type menu_style_toolbarPT = {$: 'menu-style.toolbar', }

// type menu-option.style
type menu_option_styleType = menu_style_option_linePT | menu_option_as_icon24PT | ((ctx: ctx) => any)
type cmp_def_menu_option_styleType = {
	type: 'menu_option_style',
	params?: [param],
	impl: menu_option_styleType,
}
type menu_style_option_linePT = {$: 'menu-style.option-line', }
type menu_option_as_icon24PT = {$: 'menu.option-as-icon24', }

// type dialog.style
type dialog_styleType = dialog_context_menu_popupPT | ((ctx: ctx) => any)
type cmp_def_dialog_styleType = {
	type: 'dialog_style',
	params?: [param],
	impl: dialog_styleType,
}
type dialog_context_menu_popupPT = {$: 'dialog.context-menu-popup', offsetTop: dataType, rightSide: booleanType}

// type menu-separator.style
type menu_separator_styleType = menu_separator_linePT | ((ctx: ctx) => any)
type cmp_def_menu_separator_styleType = {
	type: 'menu_separator_style',
	params?: [param],
	impl: menu_separator_styleType,
}
type menu_separator_linePT = {$: 'menu-separator.line', }

// type picklist.options
type picklist_optionsType = picklist_optionsByCommaPT | picklist_optionsPT | picklist_coded_optionsPT | picklist_sorted_optionsPT | ((ctx: ctx) => any)
type cmp_def_picklist_optionsType = {
	type: 'picklist_options',
	params?: [param],
	impl: picklist_optionsType,
}
type picklist_optionsByCommaPT = {$: 'picklist.optionsByComma', options: dataType, allowEmptyValue: booleanType}
type picklist_optionsPT = {$: 'picklist.options', options: dataType, allowEmptyValue: booleanType}
type picklist_coded_optionsPT = {$: 'picklist.coded-options', options: dataType, code: dataType, text: dataType, allowEmptyValue: booleanType}
type picklist_sorted_optionsPT = {$: 'picklist.sorted-options', options: picklist_optionsType, 
/** e.g input:80,group:90. 0 mark means hidden. no mark means 50 */marks: dataType}

// type picklist.promote
type picklist_promoteType = picklist_promotePT | ((ctx: ctx) => any)
type cmp_def_picklist_promoteType = {
	type: 'picklist_promote',
	params?: [param],
	impl: picklist_promoteType,
}
type picklist_promotePT = {$: 'picklist.promote', groups: dataType, options: dataType}

// type button.style
type button_styleType = button_hrefPT | button_xPT | button_mdl_raisedPT | button_mdl_flat_ripplePT | button_mdl_iconPT | button_mdl_round_iconPT | button_mdl_icon12_with_ripplePT | button_mdl_icon12PT | button_mdl_card_flatPT | table_button_hrefPT | ((ctx: ctx) => any)
type cmp_def_button_styleType = {
	type: 'button_style',
	params?: [param],
	impl: button_styleType,
}
type button_hrefPT = {$: 'button.href', }
type button_xPT = {$: 'button.x', size: dataType}
type button_mdl_raisedPT = {$: 'button.mdl-raised', }
type button_mdl_flat_ripplePT = {$: 'button.mdl-flat-ripple', }
type button_mdl_iconPT = {$: 'button.mdl-icon', icon: dataType}
type button_mdl_round_iconPT = {$: 'button.mdl-round-icon', icon: dataType}
type button_mdl_icon12_with_ripplePT = {$: 'button.mdl-icon12-with-ripple', icon: dataType}
type button_mdl_icon12PT = {$: 'button.mdl-icon12', icon: dataType}
type button_mdl_card_flatPT = {$: 'button.mdl-card-flat', }
type table_button_hrefPT = {$: 'table-button.href', }

// type editable-text.style
type editable_text_styleType = editable_text_codemirrorPT | editable_text_inputPT | editable_text_textareaPT | editable_text_mdl_inputPT | editable_text_mdl_input_no_floating_labelPT | editable_text_mdl_searchPT | ((ctx: ctx) => any)
type cmp_def_editable_text_styleType = {
	type: 'editable_text_style',
	params?: [param],
	impl: editable_text_styleType,
}
type editable_text_codemirrorPT = {$: 'editable-text.codemirror', cm_settings: dataType, enableFullScreen: booleanType, 
/** resizer id or true (id is used to keep size in session storage) */resizer: booleanType, height: dataType, mode: dataType, debounceTime: dataType, lineWrapping: booleanType, lineNumbers: booleanType, readOnly: dataType, onCtrlEnter: actionType, hint: booleanType}
type editable_text_inputPT = {$: 'editable-text.input', }
type editable_text_textareaPT = {$: 'editable-text.textarea', rows: dataType, cols: dataType}
type editable_text_mdl_inputPT = {$: 'editable-text.mdl-input', width: dataType}
type editable_text_mdl_input_no_floating_labelPT = {$: 'editable-text.mdl-input-no-floating-label', width: dataType}
type editable_text_mdl_searchPT = {$: 'editable-text.mdl-search', }

// type text.style
type text_styleType = text_codemirrorPT | text_multi_linePT | text_paragraphPT | ((ctx: ctx) => any)
type cmp_def_text_styleType = {
	type: 'text_style',
	params?: [param],
	impl: text_styleType,
}
type text_codemirrorPT = {$: 'text.codemirror', cm_settings: dataType, enableFullScreen: booleanType, 
/** resizer id or true (id is used to keep size in session storage) */resizer: booleanType, height: dataType, mode: dataType, lineWrapping: booleanType}
type text_multi_linePT = {$: 'text.multi-line', rows: dataType, cols: dataType}
type text_paragraphPT = {$: 'text.paragraph', }

// type editable-boolean.style
type editable_boolean_styleType = editable_boolean_checkboxPT | editable_boolean_checkbox_with_titlePT | editable_boolean_expand_collapsePT | editable_boolean_mdl_slide_togglePT | ((ctx: ctx) => any)
type cmp_def_editable_boolean_styleType = {
	type: 'editable_boolean_style',
	params?: [param],
	impl: editable_boolean_styleType,
}
type editable_boolean_checkboxPT = {$: 'editable-boolean.checkbox', }
type editable_boolean_checkbox_with_titlePT = {$: 'editable-boolean.checkbox-with-title', }
type editable_boolean_expand_collapsePT = {$: 'editable-boolean.expand-collapse', }
type editable_boolean_mdl_slide_togglePT = {$: 'editable-boolean.mdl-slide-toggle', }

// type first-succeeding.style
type first_succeeding_styleType = first_succeeding_stylePT | ((ctx: ctx) => any)
type cmp_def_first_succeeding_styleType = {
	type: 'first_succeeding_style',
	params?: [param],
	impl: first_succeeding_styleType,
}
type first_succeeding_stylePT = {$: 'first-succeeding.style', }

// type picklist.style
type picklist_styleType = picklist_nativePT | picklist_native_md_lookPT | picklist_mdlPT | picklist_selection_listPT | picklist_groupsPT | ((ctx: ctx) => any)
type cmp_def_picklist_styleType = {
	type: 'picklist_style',
	params?: [param],
	impl: picklist_styleType,
}
type picklist_nativePT = {$: 'picklist.native', }
type picklist_native_md_lookPT = {$: 'picklist.native-md-look', }
type picklist_mdlPT = {$: 'picklist.mdl', noLabel: booleanType}
type picklist_selection_listPT = {$: 'picklist.selection-list', width: dataType}
type picklist_groupsPT = {$: 'picklist.groups', }

// type table.style
type table_styleType = table_with_headersPT | table_mdlPT | ((ctx: ctx) => any)
type cmp_def_table_styleType = {
	type: 'table_style',
	params?: [param],
	impl: table_styleType,
}
type table_with_headersPT = {$: 'table.with-headers', }
type table_mdlPT = {$: 'table.mdl', classForTable: dataType, classForTd: dataType}

// type table
type tableType = tablePT | ((ctx: ctx) => any)
type cmp_def_tableType = {
	type: 'table',
	params?: [param],
	impl: tableType,
}
type tablePT = {$: 'table', title: dataType, items: dataType, fields: [table_fieldType], style: table_styleType, watchItems: booleanType, 
/** by default table is limmited to 100 shown items */visualSizeLimit: dataType, features: [featureType]}

// type table-field
type table_fieldType = fieldPT | field_indexPT | field_controlPT | field_buttonPT | ((ctx: ctx) => any)
type cmp_def_table_fieldType = {
	type: 'table_field',
	params?: [param],
	impl: table_fieldType,
}
type fieldPT = {$: 'field', title: dataType, data: dataType, width: dataType, numeric: booleanType, 
/** extend the items with the calculated field using the title as field name */extendItems: booleanType, class: dataType}
type field_indexPT = {$: 'field.index', title: dataType, width: dataType, class: dataType}
type field_controlPT = {$: 'field.control', title: dataType, control: controlType, width: dataType, dataForSort: dataType, numeric: booleanType}
type field_buttonPT = {$: 'field.button', title: dataType, buttonText: dataType, action: actionType, width: dataType, dataForSort: dataType, numeric: booleanType, style: table_button_styleType, features: [featureType]}

// type rich-text.style
type rich_text_styleType = rich_text_htmlPT | rich_text_html_in_sectionPT | ((ctx: ctx) => any)
type cmp_def_rich_text_styleType = {
	type: 'rich_text_style',
	params?: [param],
	impl: rich_text_styleType,
}
type rich_text_htmlPT = {$: 'rich-text.html', }
type rich_text_html_in_sectionPT = {$: 'rich-text.html-in-section', }

// type theme
type themeType = theme_material_designPT | ((ctx: ctx) => any)
type cmp_def_themeType = {
	type: 'theme',
	params?: [param],
	impl: themeType,
}
type theme_material_designPT = {$: 'theme.material-design', }

// type tree.nodeModel
type tree_nodeModelType = tree_json_read_onlyPT | tree_jsonPT | ((ctx: ctx) => any)
type cmp_def_tree_nodeModelType = {
	type: 'tree_nodeModel',
	params?: [param],
	impl: tree_nodeModelType,
}
type tree_json_read_onlyPT = {$: 'tree.json-read-only', object: dataType, rootPath: dataType}
type tree_jsonPT = {$: 'tree.json', object: dataType, rootPath: dataType}

// type tree.style
type tree_styleType = tree_ul_liPT | tree_no_headPT | ((ctx: ctx) => any)
type cmp_def_tree_styleType = {
	type: 'tree_style',
	params?: [param],
	impl: tree_styleType,
}
type tree_ul_liPT = {$: 'tree.ul-li', }
type tree_no_headPT = {$: 'tree.no-head', }
type cmpDef = cmp_def_anyType | cmp_def_dataType | cmp_def_aggregatorType | cmp_def_booleanType | cmp_def_actionType | cmp_def_propType | cmp_def_varType | cmp_def_systemType | cmp_def_data_switch_caseType | cmp_def_action_switch_caseType | cmp_def_jison_parserType | cmp_def_lexer_ruleType | cmp_def_bnf_expressionType | cmp_def_expression_optionType | cmp_def_testType | cmp_def_ui_actionType | cmp_def_controlType | cmp_def_clickableType | cmp_def_featureType | cmp_def_dialog_featureType | cmp_def_d3_scatter_styleType | cmp_def_d3_frameType | cmp_def_d3_histogram_styleType | cmp_def_d3_featureType | cmp_def_d3_axesType | cmp_def_d3_pivotType | cmp_def_d3_scaleType | cmp_def_d3_rangeType | cmp_def_d3_domainType | cmp_def_divider_styleType | cmp_def_editable_number_styleType | cmp_def_icon_with_action_styleType | cmp_def_imageType | cmp_def_image_styleType | cmp_def_inner_html_styleType | cmp_def_filter_typeType | cmp_def_itemlist_group_byType | cmp_def_itemlist_styleType | cmp_def_group_styleType | cmp_def_label_styleType | cmp_def_markdown_styleType | cmp_def_menu_optionType | cmp_def_menuType | cmp_def_menu_styleType | cmp_def_menu_option_styleType | cmp_def_dialog_styleType | cmp_def_menu_separator_styleType | cmp_def_picklist_optionsType | cmp_def_picklist_promoteType | cmp_def_button_styleType | cmp_def_editable_text_styleType | cmp_def_text_styleType | cmp_def_editable_boolean_styleType | cmp_def_first_succeeding_styleType | cmp_def_picklist_styleType | cmp_def_table_styleType | cmp_def_tableType | cmp_def_table_fieldType | cmp_def_rich_text_styleType | cmp_def_themeType | cmp_def_tree_nodeModelType | cmp_def_tree_styleType
function call : anyType;
function call(param: dataType) : anyType;
function pipeline : dataType;
function pipeline(...items: dataType | [aggregatorType][]) : dataType;
function pipe : dataType;
function pipe(...items: dataType | [aggregatorType][]) : dataType;
function data_if : dataType;
function data_if(condition: booleanType, then: dataType, else: dataType) : dataType;
function data_if(condition: booleanType) : dataType;
function action_if : actionType;
function action_if(condition: booleanType, then: actionType, else: actionType) : actionType;
function action_if(condition: booleanType) : actionType;
function jbRun : actionType;
function jbRun(
/** profile name */profile: dataType, params: dataType) : actionType;
function jbRun(
/** profile name */profile: dataType) : actionType;
function list : dataType;
function list(...items: [dataType][]) : dataType;
function firstSucceeding : dataType;
function firstSucceeding(...items: [dataType][]) : dataType;
function keys : dataType;
function keys(obj: dataType) : dataType;
function properties : dataType;
function properties(obj: dataType) : dataType;
function prefix : dataType;
function prefix(separator: dataType, text: dataType) : dataType;
function prefix(separator: dataType) : dataType;
function suffix : dataType;
function suffix(separator: dataType, text: dataType) : dataType;
function suffix(separator: dataType) : dataType;
function removePrefix : dataType;
function removePrefix(separator: dataType, text: dataType) : dataType;
function removePrefix(separator: dataType) : dataType;
function removeSuffix : dataType;
function removeSuffix(separator: dataType, text: dataType) : dataType;
function removeSuffix(separator: dataType) : dataType;
function removeSuffixRegex : dataType;
function removeSuffixRegex(
/** regular expression. e.g [0-9]* */suffix: dataType, text: dataType) : dataType;
function removeSuffixRegex(
/** regular expression. e.g [0-9]* */suffix: dataType) : dataType;
function writeValue : actionType;
function writeValue(to: dataType, value: dataType) : actionType;
function writeValue(to: dataType) : actionType;
function indexOf : dataType;
function indexOf(array: dataType, item: dataType) : dataType;
function indexOf(array: dataType) : dataType;
function addToArray : actionType;
function addToArray(array: dataType, itemsToAdd: dataType) : actionType;
function addToArray(array: dataType) : actionType;
function splice : actionType;
function splice(profile: { array: dataType, fromIndex: dataType, noOfItemsToRemove: dataType, itemsToAdd: dataType}) : actionType;
function splice(array: dataType) : actionType;
function removeFromArray : actionType;
function removeFromArray(profile: { array: dataType, 
/** choose item or index */itemToRemove: dataType, 
/** choose item or index */index: dataType}) : actionType;
function removeFromArray(array: dataType) : actionType;
function toggleBooleanValue : actionType;
function toggleBooleanValue(of: dataType) : actionType;
function slice : aggregatorType;
function slice(
/** 0-based index */start: dataType, 
/** 0-based index of where to end the selection (not including itself) */end: dataType) : aggregatorType;
function slice(
/** 0-based index */start: dataType) : aggregatorType;
function sort : aggregatorType;
function sort(profile: { 
/** sort by property inside object */propertyName: dataType, lexical: booleanType, ascending: booleanType}) : aggregatorType;
function sort(
/** sort by property inside object */propertyName: dataType) : aggregatorType;
function first : aggregatorType;
function first() : aggregatorType;
function last : aggregatorType;
function last() : aggregatorType;
function count : aggregatorType;
function count(items: dataType) : aggregatorType;
function reverse : aggregatorType;
function reverse(items: dataType) : aggregatorType;
function sample : aggregatorType;
function sample(size: dataType, items: dataType) : aggregatorType;
function sample(size: dataType) : aggregatorType;
function obj : dataType;
function obj(...props: [propType][]) : dataType;
function assign : dataType;
function assign(...props: [propType][]) : dataType;
function assignWithIndex : aggregatorType;
function assignWithIndex(...props: [propType][]) : aggregatorType;
function prop : propType;
function prop(title: dataType, val: dataType, type: dataType) : propType;
function prop(title: dataType) : propType;
function Var : varType | systemType;
function Var(name: dataType, val: dataType) : varType | systemType;
function Var(name: dataType) : varType | systemType;
function remark : systemType;
function remark(remark: dataType) : systemType;
function If : dataType;
function If(condition: booleanType, then: dataType, $else: dataType) : dataType;
function If(condition: booleanType) : dataType;
function not : booleanType;
function not(of: booleanType) : booleanType;
function and : booleanType;
function and(...items: [booleanType][]) : booleanType;
function or : booleanType;
function or(...items: [booleanType][]) : booleanType;
function between : booleanType;
function between(profile: { from: dataType, to: dataType, val: dataType}) : booleanType;
function between(from: dataType) : booleanType;
function contains : booleanType;
function contains(profile: { text: [dataType], allText: dataType, inOrder: booleanType}) : booleanType;
function notContains : booleanType;
function notContains(text: [dataType], allText: dataType) : booleanType;
function startsWith : booleanType;
function startsWith(startsWith: dataType, text: dataType) : booleanType;
function startsWith(startsWith: dataType) : booleanType;
function endsWith : booleanType;
function endsWith(endsWith: dataType, text: dataType) : booleanType;
function endsWith(endsWith: dataType) : booleanType;
function filter : aggregatorType;
function filter(filter: booleanType) : aggregatorType;
function matchRegex : booleanType;
function matchRegex(profile: { text: dataType, 
/** e.g: [a-zA-Z]* */regex: dataType, 
/** regex must match all text */fillText: booleanType}) : booleanType;
function matchRegex(text: dataType) : booleanType;
function toUppercase : dataType;
function toUppercase(text: dataType) : dataType;
function toLowercase : dataType;
function toLowercase(text: dataType) : dataType;
function capitalize : dataType;
function capitalize(text: dataType) : dataType;
function join : aggregatorType;
function join(profile: { separator: dataType, prefix: dataType, suffix: dataType, items: dataType, itemName: dataType, itemText: dataType}) : aggregatorType;
function join(separator: dataType) : aggregatorType;
function unique : aggregatorType;
function unique(id: dataType, items: dataType) : aggregatorType;
function unique(id: dataType) : aggregatorType;
function log : dataType;
function log(obj: dataType) : dataType;
function asIs : dataType;
function asIs($asIs: dataType) : dataType;
function object : dataType;
function object() : dataType;
function json_stringify : dataType;
function json_stringify(value: dataType, 
/** use space or tab to make pretty output */space: dataType) : dataType;
function json_stringify(value: dataType) : dataType;
function json_parse : dataType;
function json_parse(text: dataType) : dataType;
function split : dataType;
function split(profile: { separator: dataType, text: dataType, part: dataType}) : dataType;
function split(separator: dataType) : dataType;
function replace : dataType;
function replace(profile: { find: dataType, replace: dataType, text: dataType, useRegex: booleanType, 
/** g,i,m */regexFlags: dataType}) : dataType;
function replace(find: dataType) : dataType;
function touch : actionType;
function touch(data: dataType) : actionType;
function isNull : booleanType;
function isNull(obj: dataType) : booleanType;
function isEmpty : booleanType;
function isEmpty(item: dataType) : booleanType;
function notEmpty : booleanType;
function notEmpty(item: dataType) : booleanType;
function equals : booleanType;
function equals(item1: dataType, item2: dataType) : booleanType;
function equals(item1: dataType) : booleanType;
function notEquals : booleanType;
function notEquals(item1: dataType, item2: dataType) : booleanType;
function notEquals(item1: dataType) : booleanType;
function runActions : actionType;
function runActions(...actions: [actionType][]) : actionType;
function runActionOnItems : actionType;
function runActionOnItems(items: dataType, action: actionType, 
/** notification for watch-ref, defualt behavior is after each action */notifications: dataType) : actionType;
function runActionOnItems(items: dataType) : actionType;
function delay : dataType;
function delay(mSec: numberType) : dataType;
function onNextTimer : actionType;
function onNextTimer(action: actionType, delay: numberType) : actionType;
function onNextTimer(action: actionType) : actionType;
function extractPrefix : dataType;
function extractPrefix(profile: { 
/** /w- alphnumberic, /s- whitespace, ^- beginline, $-endline */separator: dataType, text: dataType, 
/** separator is regex */regex: booleanType, keepSeparator: booleanType}) : dataType;
function extractPrefix(
/** /w- alphnumberic, /s- whitespace, ^- beginline, $-endline */separator: dataType) : dataType;
function extractSuffix : dataType;
function extractSuffix(profile: { 
/** /w- alphnumberic, /s- whitespace, ^- beginline, $-endline */separator: dataType, text: dataType, 
/** separator is regex */regex: booleanType, keepSeparator: booleanType}) : dataType;
function extractSuffix(
/** /w- alphnumberic, /s- whitespace, ^- beginline, $-endline */separator: dataType) : dataType;
function range : dataType;
function range(from: dataType, to: dataType) : dataType;
function range(from: dataType) : dataType;
function typeOf : dataType;
function typeOf(obj: dataType) : dataType;
function className : dataType;
function className(obj: dataType) : dataType;
function isOfType : booleanType;
function isOfType(
/** string,boolean */type: dataType, obj: dataType) : booleanType;
function isOfType(
/** string,boolean */type: dataType) : booleanType;
function inGroup : booleanType;
function inGroup(group: dataType, item: dataType) : booleanType;
function inGroup(group: dataType) : booleanType;
function http_get : dataType;
function http_get(url: dataType, 
/** convert result to json */json: booleanType) : dataType;
function http_get(url: dataType) : dataType;
function http_post : actionType;
function http_post(profile: { url: dataType, postData: dataType, 
/** convert result to json */jsonResult: booleanType}) : actionType;
function http_post(url: dataType) : actionType;
function isRef : dataType;
function isRef(obj: dataType) : dataType;
function asRef : dataType;
function asRef(obj: dataType) : dataType;
function data_switch : dataType;
function data_switch(cases: [data_switch_caseType], default: dataType) : dataType;
function data_case : data_switch_caseType;
function data_case(condition: booleanType, value: dataType) : data_switch_caseType;
function data_case(condition: booleanType) : data_switch_caseType;
function action_switch : actionType;
function action_switch(cases: [action_switch_caseType], defaultAction: actionType) : actionType;
function action_switchCase : action_switch_caseType;
function action_switchCase(condition: booleanType, action: actionType) : action_switch_caseType;
function action_switchCase(condition: booleanType) : action_switch_caseType;
function jison_parse : dataType;
function jison_parse(profile: { parser: jison_parserType, goal: dataType, text: dataType, debug: booleanType}) : dataType;
function jison_parse(parser: jison_parserType) : dataType;
function jison_parser : jison_parserType;
function jison_parser(profile: { lex: [lexer_ruleType], bnf: [bnf_expressionType], 
/** [["left", "+", "-"]] */operators: [dataType]}) : jison_parserType;
function lexer_tokens : lexer_ruleType;
function lexer_tokens(
/** e.g. -,+,*,%,for,== */tokens: dataType) : lexer_ruleType;
function lexer_ignoreWhiteSpace : lexer_ruleType;
function lexer_ignoreWhiteSpace() : lexer_ruleType;
function lexer_number : lexer_ruleType;
function lexer_number() : lexer_ruleType;
function lexer_identifier : lexer_ruleType;
function lexer_identifier(regex: dataType) : lexer_ruleType;
function lexer_EOF : lexer_ruleType;
function lexer_EOF() : lexer_ruleType;
function lexerRule : lexer_ruleType;
function lexerRule(
/** [a-f0-9]+ */regex: dataType, 
/** return 'Hex'; */result: dataType) : lexer_ruleType;
function lexerRule(
/** [a-f0-9]+ */regex: dataType) : lexer_ruleType;
function bnfExpression : bnf_expressionType;
function bnfExpression(id: dataType, options: [expression_optionType]) : bnf_expressionType;
function bnfExpression(id: dataType) : bnf_expressionType;
function expressionOption : expression_optionType;
function expressionOption(
/** e + e */syntax: dataType, 
/** $$ = $1 + $2; */calculate: dataType) : expression_optionType;
function expressionOption(
/** e + e */syntax: dataType) : expression_optionType;
function extractText : dataType;
function extractText(profile: { text: dataType, startMarkers: dataType, endMarker: dataType, 
/** include the marker at part of the result */includingStartMarker: booleanType, 
/** include the marker at part of the result */includingEndMarker: booleanType, 
/** apply the markers repeatingly */repeating: booleanType, noTrim: booleanType, 
/** use regular expression in markers */useRegex: booleanType, 
/** return the inverse result. E.g. exclude remarks */exclude: booleanType}) : dataType;
function extractText(text: dataType) : dataType;
function breakText : dataType;
function breakText(profile: { text: dataType, 
/** multi level separators */separators: dataType, 
/** use regular expression in separators */useRegex: booleanType}) : dataType;
function breakText(text: dataType) : dataType;
function zipArrays : dataType;
function zipArrays(
/** array of arrays */value: dataType) : dataType;
function removeSections : dataType;
function removeSections(profile: { text: dataType, startMarker: dataType, endMarker: dataType, keepEndMarker: booleanType}) : dataType;
function removeSections(text: dataType) : dataType;
function merge : dataType;
function merge(objects: dataType) : dataType;
function dynamicObject : dataType;
function dynamicObject(profile: { items: dataType, propertyName: dataType, value: dataType}) : dataType;
function dynamicObject(items: dataType) : dataType;
function filterEmptyProperties : dataType;
function filterEmptyProperties(obj: dataType) : dataType;
function trim : dataType;
function trim(text: dataType) : dataType;
function removePrefixRegex : dataType;
function removePrefixRegex(prefix: dataType, text: dataType) : dataType;
function removePrefixRegex(prefix: dataType) : dataType;
function wrapAsObjectWithArray : aggregatorType;
function wrapAsObjectWithArray(arrayProperty: dataType, items: dataType) : aggregatorType;
function wrapAsObjectWithArray(arrayProperty: dataType) : aggregatorType;
function wrapAsObject : aggregatorType;
function wrapAsObject(itemToPropName: dataType, items: dataType) : aggregatorType;
function wrapAsObject(itemToPropName: dataType) : aggregatorType;
function prettyPrint : dataType;
function prettyPrint(profile: { profile: dataType, colWidth: dataType, macro: booleanType}) : dataType;
function prettyPrint(profile: dataType) : dataType;
function fs_readFile : dataType;
function fs_readFile(fileName: dataType, directory: dataType) : dataType;
function fs_readFile(fileName: dataType) : dataType;
function fs_stat : dataType;
function fs_stat(fileName: dataType, directory: dataType) : dataType;
function fs_stat(fileName: dataType) : dataType;
function fs_readdir : dataType;
function fs_readdir(directory: dataType) : dataType;
function fs_directoryContent : dataType;
function fs_directoryContent(directory: dataType, filter: booleanType) : dataType;
function fs_directoryContent(directory: dataType) : dataType;
function dataTest : testType;
function dataTest(profile: { calculate: dataType, runBefore: actionType, expectedResult: booleanType, cleanUp: actionType, expectedCounters: dataType}) : testType;
function dataTest(calculate: dataType) : testType;
function uiTest : testType;
function uiTest(profile: { control: controlType, runBefore: actionType, action: actionType, expectedResult: booleanType, cleanUp: actionType, expectedCounters: dataType}) : testType;
function uiTest(control: controlType) : testType;
function uiAction_click : ui_actionType;
function uiAction_click(selector: dataType, methodToActivate: dataType) : ui_actionType;
function uiAction_click(selector: dataType) : ui_actionType;
function uiAction_keyboardEvent : ui_actionType;
function uiAction_keyboardEvent(profile: { selector: dataType, type: dataType, keyCode: dataType, ctrl: dataType}) : ui_actionType;
function uiAction_keyboardEvent(selector: dataType) : ui_actionType;
function uiAction_setText : ui_actionType;
function uiAction_setText(value: dataType, selector: dataType, delay: dataType) : ui_actionType;
function uiAction_setText(value: dataType) : ui_actionType;
function test_dialogContent : dataType;
function test_dialogContent(id: dataType) : dataType;
function button : controlType | clickableType;
function button(profile: { title: dataType, action: actionType, style: button_styleType, features: [featureType]}) : controlType | clickableType;
function button(title: dataType) : controlType | clickableType;
function ctrlAction : featureType;
function ctrlAction(action: actionType) : featureType;
function altAction : featureType;
function altAction(action: actionType) : featureType;
function buttonDisabled : featureType;
function buttonDisabled(enabledCondition: booleanType) : featureType;
function iconWithAction : controlType | clickableType;
function iconWithAction(profile: { icon: dataType, title: dataType, action: actionType, style: icon_with_action_styleType, features: [featureType]}) : controlType | clickableType;
function iconWithAction(icon: dataType) : controlType | clickableType;
function card : controlType;
function card(profile: { title: dataType, subTitle: dataType, text: dataType, image: dataType, topButton: clickableType, menu: menuType, style: card_styleType, features: [featureType]}) : controlType;
function card(title: dataType) : controlType;
function card_init : featureType;
function card_init() : featureType;
function group_wait : featureType;
function group_wait(profile: { for: dataType, loadingControl: controlType, error: controlType, varName: dataType}) : featureType;
function group_wait(for: dataType) : featureType;
function watchRef : featureType;
function watchRef(profile: { 
/** reference to data */ref: dataType, 
/** watch childern change as well */includeChildren: dataType, 
/** delay in activation, can be used to set priority */delay: dataType, 
/** allow refresh originated from the components or its children */allowSelfRefresh: booleanType}) : featureType;
function watchRef(
/** reference to data */ref: dataType) : featureType;
function watchObservable : featureType;
function watchObservable(toWatch: dataType) : featureType;
function group_data : featureType;
function group_data(profile: { data: dataType, 
/** optional. define data as a local variable */itemVariable: dataType, watch: booleanType, 
/** watch childern change as well */includeChildren: dataType}) : featureType;
function group_data(data: dataType) : featureType;
function htmlAttribute : featureType;
function htmlAttribute(attribute: dataType, value: dataType) : featureType;
function htmlAttribute(attribute: dataType) : featureType;
function id : featureType;
function id(id: dataType) : featureType;
function feature_hoverTitle : featureType;
function feature_hoverTitle(title: dataType) : featureType;
function variable : featureType;
function variable(profile: { name: dataType, value: dataType, 
/** E.g., selected item variable */watchable: booleanType, 
/** If specified, the var will be defined as global with this id */globalId: dataType}) : featureType;
function variable(name: dataType) : featureType;
function var : featureType;
function var(profile: { name: dataType, value: dataType, 
/** E.g., selected item variable */watchable: booleanType, 
/** If specified, the var will be defined as global with this id */globalId: dataType}) : featureType;
function var(name: dataType) : featureType;
function bindRefs : featureType;
function bindRefs(profile: { watchRef: dataType, 
/** watch childern change as well */includeChildren: dataType, updateRef: dataType, value: dataType}) : featureType;
function bindRefs(watchRef: dataType) : featureType;
function calculatedVar : featureType;
function calculatedVar(profile: { name: dataType, value: dataType, 
/** If specified, the var will be defined as global with this id */globalId: dataType, 
/** variable to watch. needs to be in array */watchRefs: dataType}) : featureType;
function calculatedVar(name: dataType) : featureType;
function features : featureType;
function features(...features: [featureType][]) : featureType;
function feature_init : featureType;
function feature_init(...action: [actionType][]) : featureType;
function feature_afterLoad : featureType;
function feature_afterLoad(...action: [actionType][]) : featureType;
function feature_if : featureType;
function feature_if(showCondition: dataType) : featureType;
function hidden : featureType;
function hidden(showCondition: booleanType) : featureType;
function conditionalClass : featureType;
function conditionalClass(cssClass: dataType, condition: booleanType) : featureType;
function conditionalClass(cssClass: dataType) : featureType;
function feature_keyboardShortcut : featureType;
function feature_keyboardShortcut(
/** e.g. Alt+C */key: dataType, action: actionType) : featureType;
function feature_keyboardShortcut(
/** e.g. Alt+C */key: dataType) : featureType;
function feature_onEvent : featureType;
function feature_onEvent(profile: { event: dataType, action: [actionType], 
/** used for mouse events such as mousemove */debounceTime: dataType}) : featureType;
function feature_onEvent(event: dataType) : featureType;
function feature_onHover : featureType;
function feature_onHover(...action: [actionType][]) : featureType;
function feature_onKey : featureType;
function feature_onKey(
/** E.g., a,27,Enter,Esc,Ctrl+C or Alt+V */key: dataType, action: [actionType]) : featureType;
function feature_onKey(
/** E.g., a,27,Enter,Esc,Ctrl+C or Alt+V */key: dataType) : featureType;
function feature_onEnter : featureType;
function feature_onEnter(...action: [actionType][]) : featureType;
function feature_onEsc : featureType;
function feature_onEsc(...action: [actionType][]) : featureType;
function refreshControlById : actionType;
function refreshControlById(id: dataType) : actionType;
function group_autoFocusOnFirstInput : featureType;
function group_autoFocusOnFirstInput() : featureType;
function focusOnFirstElement : actionType;
function focusOnFirstElement(selector: dataType) : actionType;
function focusOnSibling : actionType;
function focusOnSibling(siblingSelector: dataType, delay: dataType) : actionType;
function focusOnSibling(siblingSelector: dataType) : actionType;
function css : featureType | dialog_featureType;
function css(css: dataType) : featureType | dialog_featureType;
function css_class : featureType | dialog_featureType;
function css_class(class: dataType) : featureType | dialog_featureType;
function css_width : featureType | dialog_featureType;
function css_width(profile: { width: dataType, overflow: dataType, minMax: dataType, selector: dataType}) : featureType | dialog_featureType;
function css_width(width: dataType) : featureType | dialog_featureType;
function css_height : featureType | dialog_featureType;
function css_height(profile: { height: dataType, overflow: dataType, minMax: dataType, selector: dataType}) : featureType | dialog_featureType;
function css_height(height: dataType) : featureType | dialog_featureType;
function css_opacity : featureType;
function css_opacity(opacity: dataType, selector: dataType) : featureType;
function css_opacity(opacity: dataType) : featureType;
function css_padding : featureType | dialog_featureType;
function css_padding(profile: { top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}) : featureType | dialog_featureType;
function css_padding(top: dataType) : featureType | dialog_featureType;
function css_margin : featureType | dialog_featureType;
function css_margin(profile: { top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}) : featureType | dialog_featureType;
function css_margin(top: dataType) : featureType | dialog_featureType;
function css_transformRotate : featureType;
function css_transformRotate(angle: dataType, selector: dataType) : featureType;
function css_transformRotate(angle: dataType) : featureType;
function css_color : featureType;
function css_color(profile: { color: dataType, background: dataType, selector: dataType}) : featureType;
function css_color(color: dataType) : featureType;
function css_transformScale : featureType;
function css_transformScale(profile: { x: dataType, y: dataType, selector: dataType}) : featureType;
function css_transformScale(x: dataType) : featureType;
function css_boxShadow : featureType | dialog_featureType;
function css_boxShadow(profile: { blurRadius: dataType, spreadRadius: dataType, shadowColor: dataType, opacity: dataType, horizontal: dataType, vertical: dataType, selector: dataType}) : featureType | dialog_featureType;
function css_boxShadow(blurRadius: dataType) : featureType | dialog_featureType;
function css_border : featureType | dialog_featureType;
function css_border(profile: { width: dataType, side: dataType, style: dataType, color: dataType, selector: dataType}) : featureType | dialog_featureType;
function css_border(width: dataType) : featureType | dialog_featureType;
function d3_chartScatter : controlType;
function d3_chartScatter(profile: { title: dataType, items: dataType, frame: d3_frameType, pivots: [d3_pivotType], itemTitle: dataType, visualSizeLimit: dataType, style: d3_scatter_styleType, features: [featureType]}) : controlType;
function d3_chartScatter(title: dataType) : controlType;
function d3Scatter_plain : d3_scatter_styleType;
function d3Scatter_plain() : d3_scatter_styleType;
function d3Scatter_init : featureType;
function d3Scatter_init() : featureType;
function d3_frame : d3_frameType;
function d3_frame(profile: { width: dataType, height: dataType, top: dataType, right: dataType, bottom: dataType, left: dataType}) : d3_frameType;
function d3_frame(width: dataType) : d3_frameType;
function d3_histogram : aggregatorType;
function d3_histogram(bins: dataType, values: dataType) : aggregatorType;
function d3_histogram(bins: dataType) : aggregatorType;
function d3Histogram_plain : d3_histogram_styleType;
function d3Histogram_plain() : d3_histogram_styleType;
function d3Histogram_init : d3_featureType;
function d3Histogram_init() : d3_featureType;
function d3_buttomAndLeftAxes : d3_axesType;
function d3_buttomAndLeftAxes() : d3_axesType;
function d3_itemIndicator : d3_featureType;
function d3_itemIndicator(item: dataType) : d3_featureType;
function d3_pivot : d3_pivotType;
function d3_pivot(profile: { title: dataType, value: dataType, scale: d3_scaleType, range: d3_rangeType, domain: d3_domainType}) : d3_pivotType;
function d3_pivot(title: dataType) : d3_pivotType;
function d3_linearScale : d3_scaleType;
function d3_linearScale() : d3_scaleType;
function d3_sqrtScale : d3_scaleType;
function d3_sqrtScale() : d3_scaleType;
function d3_ordinalScale : d3_scaleType;
function d3_ordinalScale(list: dataType) : d3_scaleType;
function d3_colors : d3_scaleType;
function d3_colors() : d3_scaleType;
function d3_autoRange : d3_rangeType;
function d3_autoRange() : d3_rangeType;
function d3_fromTo : d3_rangeType;
function d3_fromTo(from: dataType, to: dataType) : d3_rangeType;
function d3_fromTo(from: dataType) : d3_rangeType;
function d3_domainByValues : d3_domainType;
function d3_domainByValues() : d3_domainType;
function dialogFeature_dragTitle : dialog_featureType;
function dialogFeature_dragTitle(id: dataType) : dialog_featureType;
function dialog_closeContainingPopup : actionType;
function dialog_closeContainingPopup(OK: booleanType) : actionType;
function dialogFeature_uniqueDialog : dialog_featureType;
function dialogFeature_uniqueDialog(id: dataType, remeberLastLocation: booleanType) : dialog_featureType;
function dialogFeature_uniqueDialog(id: dataType) : dialog_featureType;
function dialogFeature_keyboardShortcut : dialog_featureType;
function dialogFeature_keyboardShortcut(
/** Ctrl+C or Alt+V */shortcut: dataType, action: actionType) : dialog_featureType;
function dialogFeature_keyboardShortcut(
/** Ctrl+C or Alt+V */shortcut: dataType) : dialog_featureType;
function dialogFeature_nearLauncherPosition : dialog_featureType;
function dialogFeature_nearLauncherPosition(profile: { offsetLeft: dataType, offsetTop: dataType, rightSide: booleanType}) : dialog_featureType;
function dialogFeature_nearLauncherPosition(offsetLeft: dataType) : dialog_featureType;
function dialogFeature_onClose : dialog_featureType;
function dialogFeature_onClose(action: actionType) : dialog_featureType;
function dialogFeature_closeWhenClickingOutside : dialog_featureType;
function dialogFeature_closeWhenClickingOutside(delay: dataType) : dialog_featureType;
function dialog_closeDialog : actionType;
function dialog_closeDialog(id: dataType, delay: dataType) : actionType;
function dialog_closeDialog(id: dataType) : actionType;
function dialog_closeAllPopups : actionType;
function dialog_closeAllPopups() : actionType;
function dialog_closeAll : actionType;
function dialog_closeAll() : actionType;
function dialogFeature_autoFocusOnFirstInput : dialog_featureType;
function dialogFeature_autoFocusOnFirstInput(selectText: booleanType) : dialog_featureType;
function dialogFeature_cssClassOnLaunchingElement : dialog_featureType;
function dialogFeature_cssClassOnLaunchingElement() : dialog_featureType;
function dialogFeature_maxZIndexOnClick : dialog_featureType;
function dialogFeature_maxZIndexOnClick(minZIndex: dataType) : dialog_featureType;
function dialogFeature_resizer : dialog_featureType;
function dialogFeature_resizer(
/** effective only for dialog with a single codemirror element */resizeInnerCodemirror: booleanType) : dialog_featureType;
function divider : controlType;
function divider(profile: { style: divider_styleType, title: dataType, features: [featureType]}) : controlType;
function divider(style: divider_styleType) : controlType;
function divider_br : divider_styleType;
function divider_br() : divider_styleType;
function divider_flexAutoGrow : divider_styleType;
function divider_flexAutoGrow() : divider_styleType;
function editableBoolean : controlType;
function editableBoolean(profile: { databind: booleanType, style: editable_boolean_styleType, title: dataType, textForTrue: dataType, textForFalse: dataType, features: [featureType]}) : controlType;
function editableBoolean(databind: booleanType) : controlType;
function editableBoolean_keyboardSupport : featureType;
function editableBoolean_keyboardSupport() : featureType;
function editableNumber : controlType;
function editableNumber(profile: { databind: dataType, title: dataType, style: editable_number_styleType, 
/** leave empty to parse symbol from value */symbol: dataType, min: dataType, max: dataType, displayString: dataType, dataString: dataType, 
/** adjust its scale if at edges */autoScale: booleanType, 
/** used by slider */step: dataType, 
/** used by slider */initialPixelsPerUnit: dataType, features: [featureType]}) : controlType;
function editableNumber(databind: dataType) : controlType;
function editableNumber_input : editable_number_styleType;
function editableNumber_input() : editable_number_styleType;
function editableText : controlType;
function editableText(profile: { title: dataType, databind: dataType, updateOnBlur: booleanType, style: editable_text_styleType, features: [featureType]}) : controlType;
function editableText(title: dataType) : controlType;
function editableText_xButton : featureType;
function editableText_xButton() : featureType;
function editableText_helperPopup : featureType;
function editableText_helperPopup(profile: { control: controlType, popupId: dataType, popupStyle: dialog_styleType, 
/** show/hide helper according to input content */showHelper: booleanType, onEnter: actionType, onEsc: actionType}) : featureType;
function editableText_helperPopup(control: controlType) : featureType;
function field_databind : featureType;
function field_databind() : featureType;
function field_databindText : featureType;
function field_databindText(debounceTime: dataType, oneWay: booleanType) : featureType;
function field_databindText(debounceTime: dataType) : featureType;
function field_data : dataType;
function field_data() : dataType;
function field_default : featureType;
function field_default(value: dataType) : featureType;
function field_initValue : featureType;
function field_initValue(value: dataType) : featureType;
function field_keyboardShortcut : featureType;
function field_keyboardShortcut(
/** e.g. Alt+C */key: dataType, action: actionType) : featureType;
function field_keyboardShortcut(
/** e.g. Alt+C */key: dataType) : featureType;
function field_subscribe : featureType;
function field_subscribe(action: actionType, includeFirst: booleanType) : featureType;
function field_subscribe(action: actionType) : featureType;
function field_onChange : featureType;
function field_onChange(action: actionType, includeFirst: booleanType) : featureType;
function field_onChange(action: actionType) : featureType;
function field_toolbar : featureType;
function field_toolbar(toolbar: controlType) : featureType;
function validation : featureType;
function validation(validCondition: booleanType, errorMessage: dataType) : featureType;
function validation(validCondition: booleanType) : featureType;
function group : controlType;
function group(profile: { title: dataType, style: group_styleType, controls: [controlType], features: [featureType]}) : controlType;
function group(title: dataType) : controlType;
function group_initGroup : featureType;
function group_initGroup() : featureType;
function inlineControls : controlType;
function inlineControls(...controls: [controlType][]) : controlType;
function dynamicControls : controlType;
function dynamicControls(profile: { controlItems: dataType, genericControl: controlType, itemVariable: dataType}) : controlType;
function dynamicControls(controlItems: dataType) : controlType;
function group_dynamicTitles : featureType;
function group_dynamicTitles() : featureType;
function control_firstSucceeding : controlType;
function control_firstSucceeding(profile: { controls: [controlType], title: dataType, style: first_succeeding_styleType, features: [featureType]}) : controlType;
function firstSucceeding_watchRefreshOnCtrlChange : featureType;
function firstSucceeding_watchRefreshOnCtrlChange(
/** reference to data */ref: dataType, 
/** watch childern change as well */includeChildren: booleanType) : featureType;
function firstSucceeding_watchRefreshOnCtrlChange(
/** reference to data */ref: dataType) : featureType;
function controlWithCondition : controlType;
function controlWithCondition(condition: booleanType, control: controlType, title: dataType) : controlType;
function controlWithCondition(condition: booleanType) : controlType;
function materialIcon : controlType;
function materialIcon(profile: { icon: dataType, title: dataType, style: icon_styleType, features: [featureType]}) : controlType;
function materialIcon(icon: dataType) : controlType;
function icon_iconInButton : icon_with_action_styleType;
function icon_iconInButton() : icon_with_action_styleType;
function icon_material : icon_with_action_styleType;
function icon_material() : icon_with_action_styleType;
function image : controlType | imageType;
function image(profile: { url: dataType, imageWidth: dataType, imageHeight: dataType, width: dataType, height: dataType, units: dataType, style: image_styleType, features: [featureType]}) : controlType | imageType;
function image(url: dataType) : controlType | imageType;
function image_default : image_styleType;
function image_default() : image_styleType;
function innerHtml : controlType;
function innerHtml(profile: { title: dataType, html: dataType, style: inner_html_styleType, features: [featureType]}) : controlType;
function innerHtml(title: dataType) : controlType;
function innerHtml_unsafe : inner_html_styleType;
function innerHtml_unsafe() : inner_html_styleType;
function group_itemlistContainer : featureType;
function group_itemlistContainer(profile: { id: dataType, defaultItem: dataType, maxItems: dataType, initialSelection: dataType}) : featureType;
function group_itemlistContainer(id: dataType) : featureType;
function itemlist_itemlistSelected : featureType;
function itemlist_itemlistSelected() : featureType;
function itemlistContainer_add : actionType;
function itemlistContainer_add(toAdd: dataType) : actionType;
function itemlistContainer_delete : actionType;
function itemlistContainer_delete(item: dataType) : actionType;
function itemlistContainer_filter : aggregatorType;
function itemlistContainer_filter(updateCounters: booleanType) : aggregatorType;
function itemlistContainer_search : controlType;
function itemlistContainer_search(profile: { title: dataType, searchIn: dataType, databind: dataType, style: editable_text_styleType, features: [featureType]}) : controlType;
function itemlistContainer_search(title: dataType) : controlType;
function itemlistContainer_moreItemsButton : controlType;
function itemlistContainer_moreItemsButton(profile: { title: dataType, delta: dataType, style: button_styleType, features: [featureType]}) : controlType;
function itemlistContainer_moreItemsButton(title: dataType) : controlType;
function itemlistContainer_filterField : featureType;
function itemlistContainer_filterField(fieldData: dataType, filterType: filter_typeType) : featureType;
function itemlistContainer_filterField(fieldData: dataType) : featureType;
function filterType_text : filter_typeType;
function filterType_text(ignoreCase: booleanType) : filter_typeType;
function filterType_exactMatch : filter_typeType;
function filterType_exactMatch() : filter_typeType;
function filterType_numeric : filter_typeType;
function filterType_numeric() : filter_typeType;
function itemlistContainer_searchInAllProperties : dataType;
function itemlistContainer_searchInAllProperties() : dataType;
function itemlistWithGroups : controlType;
function itemlistWithGroups(profile: { title: dataType, items: dataType, controls: [controlType], style: itemlist_styleType, groupBy: itemlist_group_byType, headingCtrl: controlType, 
/** resources to watch */watch: dataType, itemVariable: dataType, features: [featureType]}) : controlType;
function itemlistWithGroups(title: dataType) : controlType;
function itemlist_watchItemsWithHeading : featureType;
function itemlist_watchItemsWithHeading(profile: { items: dataType, itemVariableName: dataType, groupBy: itemlist_group_byType}) : featureType;
function itemlist_watchItemsWithHeading(items: dataType) : featureType;
function itemlistDefaultHeading : controlType;
function itemlistDefaultHeading() : controlType;
function itemlistHeading_groupBy : itemlist_group_byType;
function itemlistHeading_groupBy(itemToGroupID: dataType, promoteGroups: [dataType]) : itemlist_group_byType;
function itemlistHeading_groupBy(itemToGroupID: dataType) : itemlist_group_byType;
function itemlist : controlType;
function itemlist(profile: { title: dataType, items: dataType, controls: [controlType], style: itemlist_styleType, watchItems: booleanType, itemVariable: dataType, features: [featureType]}) : controlType;
function itemlist(title: dataType) : controlType;
function itemlist_noContainer : featureType;
function itemlist_noContainer() : featureType;
function itemlist_init : featureType;
function itemlist_init() : featureType;
function itemlist_ulLi : itemlist_styleType;
function itemlist_ulLi() : itemlist_styleType;
function itemlist_horizontal : itemlist_styleType;
function itemlist_horizontal(, spacing: dataType) : itemlist_styleType;
function itemlist_selection : featureType;
function itemlist_selection(profile: { databind: dataType, selectedToDatabind: dataType, databindToSelected: dataType, onSelection: actionType, onDoubleClick: actionType, autoSelectFirst: booleanType, cssForSelected: dataType}) : featureType;
function itemlist_selection(databind: dataType) : featureType;
function itemlist_keyboardSelection : featureType;
function itemlist_keyboardSelection(profile: { autoFocus: booleanType, onEnter: actionType}) : featureType;
function itemlist_keyboardSelection(autoFocus: booleanType) : featureType;
function itemlist_dragAndDrop : featureType;
function itemlist_dragAndDrop() : featureType;
function itemlist_dragHandle : featureType;
function itemlist_dragHandle() : featureType;
function itemlist_shownOnlyOnItemHover : featureType;
function itemlist_shownOnlyOnItemHover() : featureType;
function itemlist_divider : featureType;
function itemlist_divider(space: dataType) : featureType;
function itemlog : controlType;
function itemlog(profile: { title: dataType, items: dataType, controls: [controlType], style: itemlog_styleType, itemVariable: dataType, counter: dataType, features: [featureType]}) : controlType;
function itemlog(title: dataType) : controlType;
function itemlog_div : group_styleType;
function itemlog_div() : group_styleType;
function label : controlType;
function label(profile: { title: dataType, style: label_styleType, features: [featureType]}) : controlType;
function label(title: dataType) : controlType;
function label_bindTitle : featureType;
function label_bindTitle() : featureType;
function label_htmlTag : label_styleType;
function label_htmlTag(htmlTag: dataType, cssClass: dataType) : label_styleType;
function label_htmlTag(htmlTag: dataType) : label_styleType;
function label_span : label_styleType;
function label_span() : label_styleType;
function label_cardTitle : label_styleType;
function label_cardTitle() : label_styleType;
function label_cardSupportingText : label_styleType;
function label_cardSupportingText() : label_styleType;
function highlight : dataType;
function highlight(base: dataType, highlight: dataType, cssClass: dataType) : dataType;
function highlight(base: dataType) : dataType;
function markdown : controlType;
function markdown(profile: { markdown: dataType, style: markdown_styleType, title: dataType, features: [featureType]}) : controlType;
function markdown(markdown: dataType) : controlType;
function markdown_showdown : markdown_styleType;
function markdown_showdown() : markdown_styleType;
function menu_menu : menu_optionType;
function menu_menu(profile: { title: dataType, options: [menu_optionType], optionsFilter: dataType}) : menu_optionType;
function menu_menu(title: dataType) : menu_optionType;
function menu_optionsGroup : menu_optionType;
function menu_optionsGroup(...options: [menu_optionType][]) : menu_optionType;
function menu_dynamicOptions : menu_optionType;
function menu_dynamicOptions(items: dataType, genericOption: menu_optionType) : menu_optionType;
function menu_dynamicOptions(items: dataType) : menu_optionType;
function menu_endWithSeparator : menu_optionType;
function menu_endWithSeparator(profile: { options: [menu_optionType], separator: menu_optionType, title: dataType}) : menu_optionType;
function menu_separator : menu_optionType;
function menu_separator() : menu_optionType;
function menu_action : menu_optionType;
function menu_action(profile: { title: dataType, action: actionType, icon: dataType, shortcut: dataType, showCondition: booleanType}) : menu_optionType;
function menu_action(title: dataType) : menu_optionType;
function menu_control : controlType | clickableType | menuType;
function menu_control(profile: { menu: menu_optionType, style: menu_styleType, features: [featureType]}) : controlType | clickableType | menuType;
function menu_control(menu: menu_optionType) : controlType | clickableType | menuType;
function menu_openContextMenu : actionType;
function menu_openContextMenu(profile: { menu: menu_optionType, popupStyle: dialog_styleType, features: [dialog_featureType]}) : actionType;
function menu_openContextMenu(menu: menu_optionType) : actionType;
function menuStyle_pulldown : menu_styleType;
function menuStyle_pulldown(profile: { innerMenuStyle: menu_styleType, leafOptionStyle: menu_option_styleType, layout: group_styleType}) : menu_styleType;
function menuStyle_pulldown(innerMenuStyle: menu_styleType) : menu_styleType;
function menuStyle_contextMenu : menu_styleType;
function menuStyle_contextMenu(leafOptionStyle: menu_option_styleType) : menu_styleType;
function menu_initPopupMenu : featureType;
function menu_initPopupMenu(popupStyle: dialog_styleType) : featureType;
function menu_initMenuOption : featureType;
function menu_initMenuOption() : featureType;
function menuStyle_applyMultiLevel : menu_styleType;
function menuStyle_applyMultiLevel(profile: { menuStyle: menu_styleType, leafStyle: menu_styleType, separatorStyle: menu_styleType}) : menu_styleType;
function menuStyle_applyMultiLevel(menuStyle: menu_styleType) : menu_styleType;
function menuStyle_optionLine : menu_option_styleType;
function menuStyle_optionLine() : menu_option_styleType;
function menu_optionAsIcon24 : menu_option_styleType;
function menu_optionAsIcon24() : menu_option_styleType;
function menuStyle_popupAsOption : menu_styleType;
function menuStyle_popupAsOption() : menu_styleType;
function menuStyle_popupThumb : menu_styleType;
function menuStyle_popupThumb() : menu_styleType;
function menuStyle_toolbar : menu_styleType;
function menuStyle_toolbar() : menu_styleType;
function dialog_contextMenuPopup : dialog_styleType;
function dialog_contextMenuPopup(offsetTop: dataType, rightSide: booleanType) : dialog_styleType;
function dialog_contextMenuPopup(offsetTop: dataType) : dialog_styleType;
function menuSeparator_line : menu_separator_styleType;
function menuSeparator_line() : menu_separator_styleType;
function picklist : controlType;
function picklist(profile: { title: dataType, databind: dataType, options: picklist_optionsType, promote: picklist_promoteType, style: picklist_styleType, features: [featureType]}) : controlType;
function picklist(title: dataType) : controlType;
function picklist_dynamicOptions : featureType;
function picklist_dynamicOptions(recalcEm: dataType) : featureType;
function picklist_onChange : featureType;
function picklist_onChange(action: actionType) : featureType;
function picklist_optionsByComma : picklist_optionsType;
function picklist_optionsByComma(options: dataType, allowEmptyValue: booleanType) : picklist_optionsType;
function picklist_optionsByComma(options: dataType) : picklist_optionsType;
function picklist_options : picklist_optionsType;
function picklist_options(options: dataType, allowEmptyValue: booleanType) : picklist_optionsType;
function picklist_options(options: dataType) : picklist_optionsType;
function picklist_codedOptions : picklist_optionsType;
function picklist_codedOptions(profile: { options: dataType, code: dataType, text: dataType, allowEmptyValue: booleanType}) : picklist_optionsType;
function picklist_codedOptions(options: dataType) : picklist_optionsType;
function picklist_sortedOptions : picklist_optionsType;
function picklist_sortedOptions(options: picklist_optionsType, 
/** e.g input:80,group:90. 0 mark means hidden. no mark means 50 */marks: dataType) : picklist_optionsType;
function picklist_sortedOptions(options: picklist_optionsType) : picklist_optionsType;
function picklist_promote : picklist_promoteType;
function picklist_promote(groups: dataType, options: dataType) : picklist_promoteType;
function picklist_promote(groups: dataType) : picklist_promoteType;
function styleByControl : dataType;
function styleByControl(control: controlType, modelVar: dataType) : dataType;
function styleByControl(control: controlType) : dataType;
function sidenav : controlType;
function sidenav(profile: { controls: [controlType], title: dataType, style: sidenav_styleType, features: [featureType]}) : controlType;
function editableNumber_sliderNoText : editable_number_styleType;
function editableNumber_sliderNoText() : editable_number_styleType;
function editableNumber_slider : editable_number_styleType;
function editableNumber_slider() : editable_number_styleType;
function slider_init : featureType;
function slider_init() : featureType;
function sliderText_handleArrowKeys : featureType;
function sliderText_handleArrowKeys() : featureType;
function slider_editAsTextPopup : featureType;
function slider_editAsTextPopup() : featureType;
function editableNumber_mdlSlider : editable_number_styleType;
function editableNumber_mdlSlider() : editable_number_styleType;
function button_href : button_styleType;
function button_href() : button_styleType;
function button_x : button_styleType;
function button_x(size: dataType) : button_styleType;
function button_mdlRaised : button_styleType;
function button_mdlRaised() : button_styleType;
function button_mdlFlatRipple : button_styleType;
function button_mdlFlatRipple() : button_styleType;
function button_mdlIcon : button_styleType | icon_with_action_styleType;
function button_mdlIcon(icon: dataType) : button_styleType | icon_with_action_styleType;
function button_mdlRoundIcon : button_styleType | icon_with_action_styleType;
function button_mdlRoundIcon(icon: dataType) : button_styleType | icon_with_action_styleType;
function button_mdlIcon12WithRipple : button_styleType | icon_with_action_styleType;
function button_mdlIcon12WithRipple(icon: dataType) : button_styleType | icon_with_action_styleType;
function button_mdlIcon12 : button_styleType | icon_with_action_styleType;
function button_mdlIcon12(icon: dataType) : button_styleType | icon_with_action_styleType;
function button_mdlCardFlat : button_styleType;
function button_mdlCardFlat() : button_styleType;
function card_card : group_styleType;
function card_card(width: dataType, shadow: dataType) : group_styleType;
function card_card(width: dataType) : group_styleType;
function card_mediaGroup : group_styleType;
function card_mediaGroup() : group_styleType;
function card_actionsGroup : group_styleType;
function card_actionsGroup() : group_styleType;
function card_menu : group_styleType;
function card_menu() : group_styleType;
function editableText_codemirror : editable_text_styleType;
function editableText_codemirror(profile: { cm_settings: dataType, enableFullScreen: booleanType, 
/** resizer id or true (id is used to keep size in session storage) */resizer: booleanType, height: dataType, mode: dataType, debounceTime: dataType, lineWrapping: booleanType, lineNumbers: booleanType, readOnly: dataType, onCtrlEnter: actionType, hint: booleanType}) : editable_text_styleType;
function editableText_codemirror(cm_settings: dataType) : editable_text_styleType;
function text_codemirror : text_styleType;
function text_codemirror(profile: { cm_settings: dataType, enableFullScreen: booleanType, 
/** resizer id or true (id is used to keep size in session storage) */resizer: booleanType, height: dataType, mode: dataType, lineWrapping: booleanType}) : text_styleType;
function text_codemirror(cm_settings: dataType) : text_styleType;
function editableBoolean_checkbox : editable_boolean_styleType;
function editableBoolean_checkbox() : editable_boolean_styleType;
function editableBoolean_checkboxWithTitle : editable_boolean_styleType;
function editableBoolean_checkboxWithTitle() : editable_boolean_styleType;
function editableBoolean_expandCollapse : editable_boolean_styleType;
function editableBoolean_expandCollapse() : editable_boolean_styleType;
function editableBoolean_mdlSlideToggle : editable_boolean_styleType;
function editableBoolean_mdlSlideToggle() : editable_boolean_styleType;
function editableText_input : editable_text_styleType;
function editableText_input() : editable_text_styleType;
function editableText_textarea : editable_text_styleType;
function editableText_textarea(rows: dataType, cols: dataType) : editable_text_styleType;
function editableText_textarea(rows: dataType) : editable_text_styleType;
function editableText_mdlInput : editable_text_styleType;
function editableText_mdlInput(width: dataType) : editable_text_styleType;
function editableText_mdlInputNoFloatingLabel : editable_text_styleType;
function editableText_mdlInputNoFloatingLabel(width: dataType) : editable_text_styleType;
function editableText_mdlSearch : editable_text_styleType;
function editableText_mdlSearch() : editable_text_styleType;
function group_htmlTag : group_styleType;
function group_htmlTag(profile: { htmlTag: dataType, groupClass: dataType, itemClass: dataType}) : group_styleType;
function group_htmlTag(htmlTag: dataType) : group_styleType;
function group_div : dataType;
function group_div() : dataType;
function group_section : dataType;
function group_section() : dataType;
function firstSucceeding_style : first_succeeding_styleType;
function firstSucceeding_style() : first_succeeding_styleType;
function group_ulLi : group_styleType;
function group_ulLi() : group_styleType;
function group_expandable : group_styleType;
function group_expandable() : group_styleType;
function group_initExpandable : featureType;
function group_initExpandable() : featureType;
function group_accordion : group_styleType;
function group_accordion() : group_styleType;
function group_initAccordion : featureType;
function group_initAccordion(keyboardSupport: booleanType, autoFocus: booleanType) : featureType;
function group_initAccordion(keyboardSupport: booleanType) : featureType;
function group_tabs : group_styleType;
function group_tabs(width: dataType) : group_styleType;
function layout_vertical : group_styleType;
function layout_vertical(spacing: dataType) : group_styleType;
function layout_horizontal : group_styleType;
function layout_horizontal(spacing: dataType) : group_styleType;
function layout_horizontalFixedSplit : group_styleType;
function layout_horizontalFixedSplit(profile: { , leftWidth: dataType, rightWidth: dataType, spacing: dataType}) : group_styleType;
function layout_horizontalWrapped : group_styleType;
function layout_horizontalWrapped(, spacing: dataType) : group_styleType;
function layout_flex : group_styleType;
function layout_flex(profile: { align: dataType, direction: dataType, wrap: dataType}) : group_styleType;
function layout_flex(align: dataType) : group_styleType;
function flexLayoutContainer_alignMainAxis : featureType;
function flexLayoutContainer_alignMainAxis(align: dataType) : featureType;
function flexItem_grow : featureType;
function flexItem_grow(factor: dataType) : featureType;
function flexItem_basis : featureType;
function flexItem_basis(factor: dataType) : featureType;
function flexItem_alignSelf : featureType;
function flexItem_alignSelf(align: dataType) : featureType;
function responsive_notForPhone : featureType;
function responsive_notForPhone() : featureType;
function mdlStyle_initDynamic : featureType;
function mdlStyle_initDynamic(query: dataType) : featureType;
function mdl_rippleEffect : featureType;
function mdl_rippleEffect() : featureType;
function label_mdlRippleEffect : label_styleType;
function label_mdlRippleEffect() : label_styleType;
function label_mdlButton : label_styleType;
function label_mdlButton(width: dataType) : label_styleType;
function picklist_native : picklist_styleType;
function picklist_native() : picklist_styleType;
function picklist_nativeMdLook : picklist_styleType;
function picklist_nativeMdLook() : picklist_styleType;
function picklist_mdl : picklist_styleType;
function picklist_mdl(noLabel: booleanType) : picklist_styleType;
function picklist_selectionList : picklist_styleType;
function picklist_selectionList(width: dataType) : picklist_styleType;
function picklist_groups : picklist_styleType;
function picklist_groups() : picklist_styleType;
function propertySheet_titlesAbove : group_styleType;
function propertySheet_titlesAbove(spacing: dataType) : group_styleType;
function propertySheet_titlesAboveFloatLeft : group_styleType;
function propertySheet_titlesAboveFloatLeft(spacing: dataType, fieldWidth: dataType) : group_styleType;
function propertySheet_titlesAboveFloatLeft(spacing: dataType) : group_styleType;
function propertySheet_titlesLeft : group_styleType;
function propertySheet_titlesLeft(profile: { vSpacing: dataType, hSpacing: dataType, titleWidth: dataType}) : group_styleType;
function propertySheet_titlesLeft(vSpacing: dataType) : group_styleType;
function table_withHeaders : table_styleType;
function table_withHeaders() : table_styleType;
function table_mdl : table_styleType;
function table_mdl(classForTable: dataType, classForTd: dataType) : table_styleType;
function table_mdl(classForTable: dataType) : table_styleType;
function table : controlType | tableType;
function table(profile: { title: dataType, items: dataType, fields: [table_fieldType], style: table_styleType, watchItems: booleanType, 
/** by default table is limmited to 100 shown items */visualSizeLimit: dataType, features: [featureType]}) : controlType | tableType;
function table(title: dataType) : controlType | tableType;
function field : table_fieldType;
function field(profile: { title: dataType, data: dataType, width: dataType, numeric: booleanType, 
/** extend the items with the calculated field using the title as field name */extendItems: booleanType, class: dataType}) : table_fieldType;
function field(title: dataType) : table_fieldType;
function field_index : table_fieldType;
function field_index(profile: { title: dataType, width: dataType, class: dataType}) : table_fieldType;
function field_index(title: dataType) : table_fieldType;
function field_control : table_fieldType;
function field_control(profile: { title: dataType, control: controlType, width: dataType, dataForSort: dataType, numeric: booleanType}) : table_fieldType;
function field_control(title: dataType) : table_fieldType;
function field_button : table_fieldType;
function field_button(profile: { title: dataType, buttonText: dataType, action: actionType, width: dataType, dataForSort: dataType, numeric: booleanType, style: table_button_styleType, features: [featureType]}) : table_fieldType;
function field_button(title: dataType) : table_fieldType;
function tableButton_href : button_styleType;
function tableButton_href() : button_styleType;
function table_init : featureType;
function table_init() : featureType;
function table_initSort : featureType;
function table_initSort() : featureType;
function tabs : controlType;
function tabs(profile: { tabs: [controlType], style: tabs_styleType, features: [featureType]}) : controlType;
function group_initTabs : featureType;
function group_initTabs(keyboardSupport: booleanType, autoFocus: booleanType) : featureType;
function group_initTabs(keyboardSupport: booleanType) : featureType;
function tabs_simple : group_styleType;
function tabs_simple() : group_styleType;
function text : controlType;
function text(profile: { text: dataType, style: text_styleType, title: dataType, features: [featureType]}) : controlType;
function text(text: dataType) : controlType;
function text_bindText : featureType;
function text_bindText() : featureType;
function text_multiLine : text_styleType;
function text_multiLine(rows: dataType, cols: dataType) : text_styleType;
function text_multiLine(rows: dataType) : text_styleType;
function text_paragraph : text_styleType;
function text_paragraph() : text_styleType;
function richText : controlType;
function richText(profile: { text: dataType, title: dataType, style: rich_text_styleType, features: [featureType]}) : controlType;
function richText(text: dataType) : controlType;
function richText_html : rich_text_styleType;
function richText_html() : rich_text_styleType;
function richText_htmlInSection : rich_text_styleType;
function richText_htmlInSection() : rich_text_styleType;
function group_theme : featureType;
function group_theme(theme: themeType) : featureType;
function theme_materialDesign : themeType;
function theme_materialDesign() : themeType;
function tree_jsonReadOnly : tree_nodeModelType;
function tree_jsonReadOnly(object: dataType, rootPath: dataType) : tree_nodeModelType;
function tree_jsonReadOnly(object: dataType) : tree_nodeModelType;
function tree_json : tree_nodeModelType;
function tree_json(object: dataType, rootPath: dataType) : tree_nodeModelType;
function tree_json(object: dataType) : tree_nodeModelType;
function tree : controlType;
function tree(profile: { nodeModel: tree_nodeModelType, style: tree_styleType, features: [featureType]}) : controlType;
function tree(nodeModel: tree_nodeModelType) : controlType;
function tree_ulLi : tree_styleType;
function tree_ulLi() : tree_styleType;
function tree_noHead : tree_styleType;
function tree_noHead() : tree_styleType;
function tree_selection : featureType;
function tree_selection(profile: { databind: dataType, autoSelectFirst: booleanType, onSelection: actionType, onRightClick: actionType}) : featureType;
function tree_selection(databind: dataType) : featureType;
function tree_keyboardSelection : featureType;
function tree_keyboardSelection(profile: { onKeyboardSelection: actionType, onEnter: actionType, onRightClickOfExpanded: actionType, autoFocus: booleanType, applyMenuShortcuts: menu_optionType}) : featureType;
function tree_keyboardSelection(onKeyboardSelection: actionType) : featureType;
function tree_regainFocus : actionType;
function tree_regainFocus() : actionType;
function tree_redraw : actionType;
function tree_redraw(strong: booleanType) : actionType;
function tree_dragAndDrop : featureType;
function tree_dragAndDrop() : featureType;
function urlHistory_mapUrlToResource : actionType;
function urlHistory_mapUrlToResource(profile: { params: [dataType], resource: dataType, 
/** base string to add/ingnore in url */base: dataType, onUrlChange: actionType}) : actionType;
function runTransaction : actionType;
function runTransaction(actions: [actionType], disableNotifications: booleanType) : actionType;
function gotoUrl : actionType;
function gotoUrl(url: dataType, target: enumType) : actionType;
function gotoUrl(url: dataType) : actionType;
function resetWspy : actionType;
function resetWspy(param: dataType) : actionType;
type data = {
if : dataType,
if(condition: booleanType, then: dataType, else: dataType) : dataType,
if(condition: booleanType) : dataType,
switch : dataType,
switch(cases: [data_switch_caseType], default: dataType) : dataType,
case : data_switch_caseType,
case(condition: booleanType, value: dataType) : data_switch_caseType,
case(condition: booleanType) : data_switch_caseType,
}
declare var data : data;,type action = {
if : actionType,
if(condition: booleanType, then: actionType, else: actionType) : actionType,
if(condition: booleanType) : actionType,
switch : actionType,
switch(cases: [action_switch_caseType], defaultAction: actionType) : actionType,
switchCase : action_switch_caseType,
switchCase(condition: booleanType, action: actionType) : action_switch_caseType,
switchCase(condition: booleanType) : action_switch_caseType,
}
declare var action : action;,type json = {
stringify : dataType,
stringify(value: dataType, 
/** use space or tab to make pretty output */space: dataType) : dataType,
stringify(value: dataType) : dataType,
parse : dataType,
parse(text: dataType) : dataType,
}
declare var json : json;,type http = {
get : dataType,
get(url: dataType, 
/** convert result to json */json: booleanType) : dataType,
get(url: dataType) : dataType,
post : actionType,
post(profile: { url: dataType, postData: dataType, 
/** convert result to json */jsonResult: booleanType}) : actionType,
post(url: dataType) : actionType,
}
declare var http : http;,type jison = {
parse : dataType,
parse(profile: { parser: jison_parserType, goal: dataType, text: dataType, debug: booleanType}) : dataType,
parse(parser: jison_parserType) : dataType,
parser : jison_parserType,
parser(profile: { lex: [lexer_ruleType], bnf: [bnf_expressionType], 
/** [["left", "+", "-"]] */operators: [dataType]}) : jison_parserType,
}
declare var jison : jison;,type lexer = {
tokens : lexer_ruleType,
tokens(
/** e.g. -,+,*,%,for,== */tokens: dataType) : lexer_ruleType,
ignoreWhiteSpace : lexer_ruleType,
ignoreWhiteSpace() : lexer_ruleType,
number : lexer_ruleType,
number() : lexer_ruleType,
identifier : lexer_ruleType,
identifier(regex: dataType) : lexer_ruleType,
EOF : lexer_ruleType,
EOF() : lexer_ruleType,
}
declare var lexer : lexer;,type fs = {
readFile : dataType,
readFile(fileName: dataType, directory: dataType) : dataType,
readFile(fileName: dataType) : dataType,
stat : dataType,
stat(fileName: dataType, directory: dataType) : dataType,
stat(fileName: dataType) : dataType,
readdir : dataType,
readdir(directory: dataType) : dataType,
directoryContent : dataType,
directoryContent(directory: dataType, filter: booleanType) : dataType,
directoryContent(directory: dataType) : dataType,
}
declare var fs : fs;,type uiAction = {
click : ui_actionType,
click(selector: dataType, methodToActivate: dataType) : ui_actionType,
click(selector: dataType) : ui_actionType,
keyboardEvent : ui_actionType,
keyboardEvent(profile: { selector: dataType, type: dataType, keyCode: dataType, ctrl: dataType}) : ui_actionType,
keyboardEvent(selector: dataType) : ui_actionType,
setText : ui_actionType,
setText(value: dataType, selector: dataType, delay: dataType) : ui_actionType,
setText(value: dataType) : ui_actionType,
}
declare var uiAction : uiAction;,type test = {
dialogContent : dataType,
dialogContent(id: dataType) : dataType,
}
declare var test : test;,type card = {
init : featureType,
init() : featureType,
card : group_styleType,
card(width: dataType, shadow: dataType) : group_styleType,
card(width: dataType) : group_styleType,
mediaGroup : group_styleType,
mediaGroup() : group_styleType,
actionsGroup : group_styleType,
actionsGroup() : group_styleType,
menu : group_styleType,
menu() : group_styleType,
}
declare var card : card;,type group = {
wait : featureType,
wait(profile: { for: dataType, loadingControl: controlType, error: controlType, varName: dataType}) : featureType,
wait(for: dataType) : featureType,
data : featureType,
data(profile: { data: dataType, 
/** optional. define data as a local variable */itemVariable: dataType, watch: booleanType, 
/** watch childern change as well */includeChildren: dataType}) : featureType,
data(data: dataType) : featureType,
autoFocusOnFirstInput : featureType,
autoFocusOnFirstInput() : featureType,
initGroup : featureType,
initGroup() : featureType,
dynamicTitles : featureType,
dynamicTitles() : featureType,
itemlistContainer : featureType,
itemlistContainer(profile: { id: dataType, defaultItem: dataType, maxItems: dataType, initialSelection: dataType}) : featureType,
itemlistContainer(id: dataType) : featureType,
htmlTag : group_styleType,
htmlTag(profile: { htmlTag: dataType, groupClass: dataType, itemClass: dataType}) : group_styleType,
htmlTag(htmlTag: dataType) : group_styleType,
div : dataType,
div() : dataType,
section : dataType,
section() : dataType,
ulLi : group_styleType,
ulLi() : group_styleType,
expandable : group_styleType,
expandable() : group_styleType,
initExpandable : featureType,
initExpandable() : featureType,
accordion : group_styleType,
accordion() : group_styleType,
initAccordion : featureType,
initAccordion(keyboardSupport: booleanType, autoFocus: booleanType) : featureType,
initAccordion(keyboardSupport: booleanType) : featureType,
tabs : group_styleType,
tabs(width: dataType) : group_styleType,
initTabs : featureType,
initTabs(keyboardSupport: booleanType, autoFocus: booleanType) : featureType,
initTabs(keyboardSupport: booleanType) : featureType,
theme : featureType,
theme(theme: themeType) : featureType,
}
declare var group : group;,type feature = {
hoverTitle : featureType,
hoverTitle(title: dataType) : featureType,
init : featureType,
init(...action: [actionType][]) : featureType,
afterLoad : featureType,
afterLoad(...action: [actionType][]) : featureType,
if : featureType,
if(showCondition: dataType) : featureType,
keyboardShortcut : featureType,
keyboardShortcut(
/** e.g. Alt+C */key: dataType, action: actionType) : featureType,
keyboardShortcut(
/** e.g. Alt+C */key: dataType) : featureType,
onEvent : featureType,
onEvent(profile: { event: dataType, action: [actionType], 
/** used for mouse events such as mousemove */debounceTime: dataType}) : featureType,
onEvent(event: dataType) : featureType,
onHover : featureType,
onHover(...action: [actionType][]) : featureType,
onKey : featureType,
onKey(
/** E.g., a,27,Enter,Esc,Ctrl+C or Alt+V */key: dataType, action: [actionType]) : featureType,
onKey(
/** E.g., a,27,Enter,Esc,Ctrl+C or Alt+V */key: dataType) : featureType,
onEnter : featureType,
onEnter(...action: [actionType][]) : featureType,
onEsc : featureType,
onEsc(...action: [actionType][]) : featureType,
}
declare var feature : feature;,type css = {
class : featureType | dialog_featureType,
class(class: dataType) : featureType | dialog_featureType,
width : featureType | dialog_featureType,
width(profile: { width: dataType, overflow: dataType, minMax: dataType, selector: dataType}) : featureType | dialog_featureType,
width(width: dataType) : featureType | dialog_featureType,
height : featureType | dialog_featureType,
height(profile: { height: dataType, overflow: dataType, minMax: dataType, selector: dataType}) : featureType | dialog_featureType,
height(height: dataType) : featureType | dialog_featureType,
opacity : featureType,
opacity(opacity: dataType, selector: dataType) : featureType,
opacity(opacity: dataType) : featureType,
padding : featureType | dialog_featureType,
padding(profile: { top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}) : featureType | dialog_featureType,
padding(top: dataType) : featureType | dialog_featureType,
margin : featureType | dialog_featureType,
margin(profile: { top: dataType, left: dataType, right: dataType, bottom: dataType, selector: dataType}) : featureType | dialog_featureType,
margin(top: dataType) : featureType | dialog_featureType,
transformRotate : featureType,
transformRotate(angle: dataType, selector: dataType) : featureType,
transformRotate(angle: dataType) : featureType,
color : featureType,
color(profile: { color: dataType, background: dataType, selector: dataType}) : featureType,
color(color: dataType) : featureType,
transformScale : featureType,
transformScale(profile: { x: dataType, y: dataType, selector: dataType}) : featureType,
transformScale(x: dataType) : featureType,
boxShadow : featureType | dialog_featureType,
boxShadow(profile: { blurRadius: dataType, spreadRadius: dataType, shadowColor: dataType, opacity: dataType, horizontal: dataType, vertical: dataType, selector: dataType}) : featureType | dialog_featureType,
boxShadow(blurRadius: dataType) : featureType | dialog_featureType,
border : featureType | dialog_featureType,
border(profile: { width: dataType, side: dataType, style: dataType, color: dataType, selector: dataType}) : featureType | dialog_featureType,
border(width: dataType) : featureType | dialog_featureType,
}
declare var css : css;,type d3 = {
chartScatter : controlType,
chartScatter(profile: { title: dataType, items: dataType, frame: d3_frameType, pivots: [d3_pivotType], itemTitle: dataType, visualSizeLimit: dataType, style: d3_scatter_styleType, features: [featureType]}) : controlType,
chartScatter(title: dataType) : controlType,
frame : d3_frameType,
frame(profile: { width: dataType, height: dataType, top: dataType, right: dataType, bottom: dataType, left: dataType}) : d3_frameType,
frame(width: dataType) : d3_frameType,
histogram : aggregatorType,
histogram(bins: dataType, values: dataType) : aggregatorType,
histogram(bins: dataType) : aggregatorType,
buttomAndLeftAxes : d3_axesType,
buttomAndLeftAxes() : d3_axesType,
itemIndicator : d3_featureType,
itemIndicator(item: dataType) : d3_featureType,
pivot : d3_pivotType,
pivot(profile: { title: dataType, value: dataType, scale: d3_scaleType, range: d3_rangeType, domain: d3_domainType}) : d3_pivotType,
pivot(title: dataType) : d3_pivotType,
linearScale : d3_scaleType,
linearScale() : d3_scaleType,
sqrtScale : d3_scaleType,
sqrtScale() : d3_scaleType,
ordinalScale : d3_scaleType,
ordinalScale(list: dataType) : d3_scaleType,
colors : d3_scaleType,
colors() : d3_scaleType,
autoRange : d3_rangeType,
autoRange() : d3_rangeType,
fromTo : d3_rangeType,
fromTo(from: dataType, to: dataType) : d3_rangeType,
fromTo(from: dataType) : d3_rangeType,
domainByValues : d3_domainType,
domainByValues() : d3_domainType,
}
declare var d3 : d3;,type d3Scatter = {
plain : d3_scatter_styleType,
plain() : d3_scatter_styleType,
init : featureType,
init() : featureType,
}
declare var d3Scatter : d3Scatter;,type d3Histogram = {
plain : d3_histogram_styleType,
plain() : d3_histogram_styleType,
init : d3_featureType,
init() : d3_featureType,
}
declare var d3Histogram : d3Histogram;,type dialogFeature = {
dragTitle : dialog_featureType,
dragTitle(id: dataType) : dialog_featureType,
uniqueDialog : dialog_featureType,
uniqueDialog(id: dataType, remeberLastLocation: booleanType) : dialog_featureType,
uniqueDialog(id: dataType) : dialog_featureType,
keyboardShortcut : dialog_featureType,
keyboardShortcut(
/** Ctrl+C or Alt+V */shortcut: dataType, action: actionType) : dialog_featureType,
keyboardShortcut(
/** Ctrl+C or Alt+V */shortcut: dataType) : dialog_featureType,
nearLauncherPosition : dialog_featureType,
nearLauncherPosition(profile: { offsetLeft: dataType, offsetTop: dataType, rightSide: booleanType}) : dialog_featureType,
nearLauncherPosition(offsetLeft: dataType) : dialog_featureType,
onClose : dialog_featureType,
onClose(action: actionType) : dialog_featureType,
closeWhenClickingOutside : dialog_featureType,
closeWhenClickingOutside(delay: dataType) : dialog_featureType,
autoFocusOnFirstInput : dialog_featureType,
autoFocusOnFirstInput(selectText: booleanType) : dialog_featureType,
cssClassOnLaunchingElement : dialog_featureType,
cssClassOnLaunchingElement() : dialog_featureType,
maxZIndexOnClick : dialog_featureType,
maxZIndexOnClick(minZIndex: dataType) : dialog_featureType,
resizer : dialog_featureType,
resizer(
/** effective only for dialog with a single codemirror element */resizeInnerCodemirror: booleanType) : dialog_featureType,
}
declare var dialogFeature : dialogFeature;,type dialog = {
closeContainingPopup : actionType,
closeContainingPopup(OK: booleanType) : actionType,
closeDialog : actionType,
closeDialog(id: dataType, delay: dataType) : actionType,
closeDialog(id: dataType) : actionType,
closeAllPopups : actionType,
closeAllPopups() : actionType,
closeAll : actionType,
closeAll() : actionType,
contextMenuPopup : dialog_styleType,
contextMenuPopup(offsetTop: dataType, rightSide: booleanType) : dialog_styleType,
contextMenuPopup(offsetTop: dataType) : dialog_styleType,
}
declare var dialog : dialog;,type divider = {
br : divider_styleType,
br() : divider_styleType,
flexAutoGrow : divider_styleType,
flexAutoGrow() : divider_styleType,
}
declare var divider : divider;,type editableBoolean = {
keyboardSupport : featureType,
keyboardSupport() : featureType,
checkbox : editable_boolean_styleType,
checkbox() : editable_boolean_styleType,
checkboxWithTitle : editable_boolean_styleType,
checkboxWithTitle() : editable_boolean_styleType,
expandCollapse : editable_boolean_styleType,
expandCollapse() : editable_boolean_styleType,
mdlSlideToggle : editable_boolean_styleType,
mdlSlideToggle() : editable_boolean_styleType,
}
declare var editableBoolean : editableBoolean;,type editableNumber = {
input : editable_number_styleType,
input() : editable_number_styleType,
sliderNoText : editable_number_styleType,
sliderNoText() : editable_number_styleType,
slider : editable_number_styleType,
slider() : editable_number_styleType,
mdlSlider : editable_number_styleType,
mdlSlider() : editable_number_styleType,
}
declare var editableNumber : editableNumber;,type editableText = {
xButton : featureType,
xButton() : featureType,
helperPopup : featureType,
helperPopup(profile: { control: controlType, popupId: dataType, popupStyle: dialog_styleType, 
/** show/hide helper according to input content */showHelper: booleanType, onEnter: actionType, onEsc: actionType}) : featureType,
helperPopup(control: controlType) : featureType,
codemirror : editable_text_styleType,
codemirror(profile: { cm_settings: dataType, enableFullScreen: booleanType, 
/** resizer id or true (id is used to keep size in session storage) */resizer: booleanType, height: dataType, mode: dataType, debounceTime: dataType, lineWrapping: booleanType, lineNumbers: booleanType, readOnly: dataType, onCtrlEnter: actionType, hint: booleanType}) : editable_text_styleType,
codemirror(cm_settings: dataType) : editable_text_styleType,
input : editable_text_styleType,
input() : editable_text_styleType,
textarea : editable_text_styleType,
textarea(rows: dataType, cols: dataType) : editable_text_styleType,
textarea(rows: dataType) : editable_text_styleType,
mdlInput : editable_text_styleType,
mdlInput(width: dataType) : editable_text_styleType,
mdlInputNoFloatingLabel : editable_text_styleType,
mdlInputNoFloatingLabel(width: dataType) : editable_text_styleType,
mdlSearch : editable_text_styleType,
mdlSearch() : editable_text_styleType,
}
declare var editableText : editableText;,type field = {
databind : featureType,
databind() : featureType,
databindText : featureType,
databindText(debounceTime: dataType, oneWay: booleanType) : featureType,
databindText(debounceTime: dataType) : featureType,
data : dataType,
data() : dataType,
default : featureType,
default(value: dataType) : featureType,
initValue : featureType,
initValue(value: dataType) : featureType,
keyboardShortcut : featureType,
keyboardShortcut(
/** e.g. Alt+C */key: dataType, action: actionType) : featureType,
keyboardShortcut(
/** e.g. Alt+C */key: dataType) : featureType,
subscribe : featureType,
subscribe(action: actionType, includeFirst: booleanType) : featureType,
subscribe(action: actionType) : featureType,
onChange : featureType,
onChange(action: actionType, includeFirst: booleanType) : featureType,
onChange(action: actionType) : featureType,
toolbar : featureType,
toolbar(toolbar: controlType) : featureType,
index : table_fieldType,
index(profile: { title: dataType, width: dataType, class: dataType}) : table_fieldType,
index(title: dataType) : table_fieldType,
control : table_fieldType,
control(profile: { title: dataType, control: controlType, width: dataType, dataForSort: dataType, numeric: booleanType}) : table_fieldType,
control(title: dataType) : table_fieldType,
button : table_fieldType,
button(profile: { title: dataType, buttonText: dataType, action: actionType, width: dataType, dataForSort: dataType, numeric: booleanType, style: table_button_styleType, features: [featureType]}) : table_fieldType,
button(title: dataType) : table_fieldType,
}
declare var field : field;,type control = {
firstSucceeding : controlType,
firstSucceeding(profile: { controls: [controlType], title: dataType, style: first_succeeding_styleType, features: [featureType]}) : controlType,
}
declare var control : control;,type firstSucceeding = {
watchRefreshOnCtrlChange : featureType,
watchRefreshOnCtrlChange(
/** reference to data */ref: dataType, 
/** watch childern change as well */includeChildren: booleanType) : featureType,
watchRefreshOnCtrlChange(
/** reference to data */ref: dataType) : featureType,
style : first_succeeding_styleType,
style() : first_succeeding_styleType,
}
declare var firstSucceeding : firstSucceeding;,type icon = {
iconInButton : icon_with_action_styleType,
iconInButton() : icon_with_action_styleType,
material : icon_with_action_styleType,
material() : icon_with_action_styleType,
}
declare var icon : icon;,type image = {
default : image_styleType,
default() : image_styleType,
}
declare var image : image;,type innerHtml = {
unsafe : inner_html_styleType,
unsafe() : inner_html_styleType,
}
declare var innerHtml : innerHtml;,type itemlist = {
itemlistSelected : featureType,
itemlistSelected() : featureType,
watchItemsWithHeading : featureType,
watchItemsWithHeading(profile: { items: dataType, itemVariableName: dataType, groupBy: itemlist_group_byType}) : featureType,
watchItemsWithHeading(items: dataType) : featureType,
noContainer : featureType,
noContainer() : featureType,
init : featureType,
init() : featureType,
ulLi : itemlist_styleType,
ulLi() : itemlist_styleType,
horizontal : itemlist_styleType,
horizontal(, spacing: dataType) : itemlist_styleType,
selection : featureType,
selection(profile: { databind: dataType, selectedToDatabind: dataType, databindToSelected: dataType, onSelection: actionType, onDoubleClick: actionType, autoSelectFirst: booleanType, cssForSelected: dataType}) : featureType,
selection(databind: dataType) : featureType,
keyboardSelection : featureType,
keyboardSelection(profile: { autoFocus: booleanType, onEnter: actionType}) : featureType,
keyboardSelection(autoFocus: booleanType) : featureType,
dragAndDrop : featureType,
dragAndDrop() : featureType,
dragHandle : featureType,
dragHandle() : featureType,
shownOnlyOnItemHover : featureType,
shownOnlyOnItemHover() : featureType,
divider : featureType,
divider(space: dataType) : featureType,
}
declare var itemlist : itemlist;,type itemlistContainer = {
add : actionType,
add(toAdd: dataType) : actionType,
delete : actionType,
delete(item: dataType) : actionType,
filter : aggregatorType,
filter(updateCounters: booleanType) : aggregatorType,
search : controlType,
search(profile: { title: dataType, searchIn: dataType, databind: dataType, style: editable_text_styleType, features: [featureType]}) : controlType,
search(title: dataType) : controlType,
moreItemsButton : controlType,
moreItemsButton(profile: { title: dataType, delta: dataType, style: button_styleType, features: [featureType]}) : controlType,
moreItemsButton(title: dataType) : controlType,
filterField : featureType,
filterField(fieldData: dataType, filterType: filter_typeType) : featureType,
filterField(fieldData: dataType) : featureType,
searchInAllProperties : dataType,
searchInAllProperties() : dataType,
}
declare var itemlistContainer : itemlistContainer;,type filterType = {
text : filter_typeType,
text(ignoreCase: booleanType) : filter_typeType,
exactMatch : filter_typeType,
exactMatch() : filter_typeType,
numeric : filter_typeType,
numeric() : filter_typeType,
}
declare var filterType : filterType;,type itemlistHeading = {
groupBy : itemlist_group_byType,
groupBy(itemToGroupID: dataType, promoteGroups: [dataType]) : itemlist_group_byType,
groupBy(itemToGroupID: dataType) : itemlist_group_byType,
}
declare var itemlistHeading : itemlistHeading;,type itemlog = {
div : group_styleType,
div() : group_styleType,
}
declare var itemlog : itemlog;,type label = {
bindTitle : featureType,
bindTitle() : featureType,
htmlTag : label_styleType,
htmlTag(htmlTag: dataType, cssClass: dataType) : label_styleType,
htmlTag(htmlTag: dataType) : label_styleType,
span : label_styleType,
span() : label_styleType,
cardTitle : label_styleType,
cardTitle() : label_styleType,
cardSupportingText : label_styleType,
cardSupportingText() : label_styleType,
mdlRippleEffect : label_styleType,
mdlRippleEffect() : label_styleType,
mdlButton : label_styleType,
mdlButton(width: dataType) : label_styleType,
}
declare var label : label;,type markdown = {
showdown : markdown_styleType,
showdown() : markdown_styleType,
}
declare var markdown : markdown;,type menu = {
menu : menu_optionType,
menu(profile: { title: dataType, options: [menu_optionType], optionsFilter: dataType}) : menu_optionType,
menu(title: dataType) : menu_optionType,
optionsGroup : menu_optionType,
optionsGroup(...options: [menu_optionType][]) : menu_optionType,
dynamicOptions : menu_optionType,
dynamicOptions(items: dataType, genericOption: menu_optionType) : menu_optionType,
dynamicOptions(items: dataType) : menu_optionType,
endWithSeparator : menu_optionType,
endWithSeparator(profile: { options: [menu_optionType], separator: menu_optionType, title: dataType}) : menu_optionType,
separator : menu_optionType,
separator() : menu_optionType,
action : menu_optionType,
action(profile: { title: dataType, action: actionType, icon: dataType, shortcut: dataType, showCondition: booleanType}) : menu_optionType,
action(title: dataType) : menu_optionType,
control : controlType | clickableType | menuType,
control(profile: { menu: menu_optionType, style: menu_styleType, features: [featureType]}) : controlType | clickableType | menuType,
control(menu: menu_optionType) : controlType | clickableType | menuType,
openContextMenu : actionType,
openContextMenu(profile: { menu: menu_optionType, popupStyle: dialog_styleType, features: [dialog_featureType]}) : actionType,
openContextMenu(menu: menu_optionType) : actionType,
initPopupMenu : featureType,
initPopupMenu(popupStyle: dialog_styleType) : featureType,
initMenuOption : featureType,
initMenuOption() : featureType,
optionAsIcon24 : menu_option_styleType,
optionAsIcon24() : menu_option_styleType,
}
declare var menu : menu;,type menuStyle = {
pulldown : menu_styleType,
pulldown(profile: { innerMenuStyle: menu_styleType, leafOptionStyle: menu_option_styleType, layout: group_styleType}) : menu_styleType,
pulldown(innerMenuStyle: menu_styleType) : menu_styleType,
contextMenu : menu_styleType,
contextMenu(leafOptionStyle: menu_option_styleType) : menu_styleType,
applyMultiLevel : menu_styleType,
applyMultiLevel(profile: { menuStyle: menu_styleType, leafStyle: menu_styleType, separatorStyle: menu_styleType}) : menu_styleType,
applyMultiLevel(menuStyle: menu_styleType) : menu_styleType,
optionLine : menu_option_styleType,
optionLine() : menu_option_styleType,
popupAsOption : menu_styleType,
popupAsOption() : menu_styleType,
popupThumb : menu_styleType,
popupThumb() : menu_styleType,
toolbar : menu_styleType,
toolbar() : menu_styleType,
}
declare var menuStyle : menuStyle;,type menuSeparator = {
line : menu_separator_styleType,
line() : menu_separator_styleType,
}
declare var menuSeparator : menuSeparator;,type picklist = {
dynamicOptions : featureType,
dynamicOptions(recalcEm: dataType) : featureType,
onChange : featureType,
onChange(action: actionType) : featureType,
optionsByComma : picklist_optionsType,
optionsByComma(options: dataType, allowEmptyValue: booleanType) : picklist_optionsType,
optionsByComma(options: dataType) : picklist_optionsType,
options : picklist_optionsType,
options(options: dataType, allowEmptyValue: booleanType) : picklist_optionsType,
options(options: dataType) : picklist_optionsType,
codedOptions : picklist_optionsType,
codedOptions(profile: { options: dataType, code: dataType, text: dataType, allowEmptyValue: booleanType}) : picklist_optionsType,
codedOptions(options: dataType) : picklist_optionsType,
sortedOptions : picklist_optionsType,
sortedOptions(options: picklist_optionsType, 
/** e.g input:80,group:90. 0 mark means hidden. no mark means 50 */marks: dataType) : picklist_optionsType,
sortedOptions(options: picklist_optionsType) : picklist_optionsType,
promote : picklist_promoteType,
promote(groups: dataType, options: dataType) : picklist_promoteType,
promote(groups: dataType) : picklist_promoteType,
native : picklist_styleType,
native() : picklist_styleType,
nativeMdLook : picklist_styleType,
nativeMdLook() : picklist_styleType,
mdl : picklist_styleType,
mdl(noLabel: booleanType) : picklist_styleType,
selectionList : picklist_styleType,
selectionList(width: dataType) : picklist_styleType,
groups : picklist_styleType,
groups() : picklist_styleType,
}
declare var picklist : picklist;,type slider = {
init : featureType,
init() : featureType,
editAsTextPopup : featureType,
editAsTextPopup() : featureType,
}
declare var slider : slider;,type sliderText = {
handleArrowKeys : featureType,
handleArrowKeys() : featureType,
}
declare var sliderText : sliderText;,type button = {
href : button_styleType,
href() : button_styleType,
x : button_styleType,
x(size: dataType) : button_styleType,
mdlRaised : button_styleType,
mdlRaised() : button_styleType,
mdlFlatRipple : button_styleType,
mdlFlatRipple() : button_styleType,
mdlIcon : button_styleType | icon_with_action_styleType,
mdlIcon(icon: dataType) : button_styleType | icon_with_action_styleType,
mdlRoundIcon : button_styleType | icon_with_action_styleType,
mdlRoundIcon(icon: dataType) : button_styleType | icon_with_action_styleType,
mdlIcon12WithRipple : button_styleType | icon_with_action_styleType,
mdlIcon12WithRipple(icon: dataType) : button_styleType | icon_with_action_styleType,
mdlIcon12 : button_styleType | icon_with_action_styleType,
mdlIcon12(icon: dataType) : button_styleType | icon_with_action_styleType,
mdlCardFlat : button_styleType,
mdlCardFlat() : button_styleType,
}
declare var button : button;,type text = {
codemirror : text_styleType,
codemirror(profile: { cm_settings: dataType, enableFullScreen: booleanType, 
/** resizer id or true (id is used to keep size in session storage) */resizer: booleanType, height: dataType, mode: dataType, lineWrapping: booleanType}) : text_styleType,
codemirror(cm_settings: dataType) : text_styleType,
bindText : featureType,
bindText() : featureType,
multiLine : text_styleType,
multiLine(rows: dataType, cols: dataType) : text_styleType,
multiLine(rows: dataType) : text_styleType,
paragraph : text_styleType,
paragraph() : text_styleType,
}
declare var text : text;,type layout = {
vertical : group_styleType,
vertical(spacing: dataType) : group_styleType,
horizontal : group_styleType,
horizontal(spacing: dataType) : group_styleType,
horizontalFixedSplit : group_styleType,
horizontalFixedSplit(profile: { , leftWidth: dataType, rightWidth: dataType, spacing: dataType}) : group_styleType,
horizontalWrapped : group_styleType,
horizontalWrapped(, spacing: dataType) : group_styleType,
flex : group_styleType,
flex(profile: { align: dataType, direction: dataType, wrap: dataType}) : group_styleType,
flex(align: dataType) : group_styleType,
}
declare var layout : layout;,type flexLayoutContainer = {
alignMainAxis : featureType,
alignMainAxis(align: dataType) : featureType,
}
declare var flexLayoutContainer : flexLayoutContainer;,type flexItem = {
grow : featureType,
grow(factor: dataType) : featureType,
basis : featureType,
basis(factor: dataType) : featureType,
alignSelf : featureType,
alignSelf(align: dataType) : featureType,
}
declare var flexItem : flexItem;,type responsive = {
notForPhone : featureType,
notForPhone() : featureType,
}
declare var responsive : responsive;,type mdlStyle = {
initDynamic : featureType,
initDynamic(query: dataType) : featureType,
}
declare var mdlStyle : mdlStyle;,type mdl = {
rippleEffect : featureType,
rippleEffect() : featureType,
}
declare var mdl : mdl;,type propertySheet = {
titlesAbove : group_styleType,
titlesAbove(spacing: dataType) : group_styleType,
titlesAboveFloatLeft : group_styleType,
titlesAboveFloatLeft(spacing: dataType, fieldWidth: dataType) : group_styleType,
titlesAboveFloatLeft(spacing: dataType) : group_styleType,
titlesLeft : group_styleType,
titlesLeft(profile: { vSpacing: dataType, hSpacing: dataType, titleWidth: dataType}) : group_styleType,
titlesLeft(vSpacing: dataType) : group_styleType,
}
declare var propertySheet : propertySheet;,type table = {
withHeaders : table_styleType,
withHeaders() : table_styleType,
mdl : table_styleType,
mdl(classForTable: dataType, classForTd: dataType) : table_styleType,
mdl(classForTable: dataType) : table_styleType,
init : featureType,
init() : featureType,
initSort : featureType,
initSort() : featureType,
}
declare var table : table;,type tableButton = {
href : button_styleType,
href() : button_styleType,
}
declare var tableButton : tableButton;,type tabs = {
simple : group_styleType,
simple() : group_styleType,
}
declare var tabs : tabs;,type richText = {
html : rich_text_styleType,
html() : rich_text_styleType,
htmlInSection : rich_text_styleType,
htmlInSection() : rich_text_styleType,
}
declare var richText : richText;,type theme = {
materialDesign : themeType,
materialDesign() : themeType,
}
declare var theme : theme;,type tree = {
jsonReadOnly : tree_nodeModelType,
jsonReadOnly(object: dataType, rootPath: dataType) : tree_nodeModelType,
jsonReadOnly(object: dataType) : tree_nodeModelType,
json : tree_nodeModelType,
json(object: dataType, rootPath: dataType) : tree_nodeModelType,
json(object: dataType) : tree_nodeModelType,
ulLi : tree_styleType,
ulLi() : tree_styleType,
noHead : tree_styleType,
noHead() : tree_styleType,
selection : featureType,
selection(profile: { databind: dataType, autoSelectFirst: booleanType, onSelection: actionType, onRightClick: actionType}) : featureType,
selection(databind: dataType) : featureType,
keyboardSelection : featureType,
keyboardSelection(profile: { onKeyboardSelection: actionType, onEnter: actionType, onRightClickOfExpanded: actionType, autoFocus: booleanType, applyMenuShortcuts: menu_optionType}) : featureType,
keyboardSelection(onKeyboardSelection: actionType) : featureType,
regainFocus : actionType,
regainFocus() : actionType,
redraw : actionType,
redraw(strong: booleanType) : actionType,
dragAndDrop : featureType,
dragAndDrop() : featureType,
}
declare var tree : tree;,type urlHistory = {
mapUrlToResource : actionType,
mapUrlToResource(profile: { params: [dataType], resource: dataType, 
/** base string to add/ingnore in url */base: dataType, onUrlChange: actionType}) : actionType,
}
declare var urlHistory : urlHistory;