const Tales = window.TAL.TALES

/*
	autoCompleteSource: emailsSource
	command: $root.saveCommand
	command: testContactsCommand
	dragmessages: 1
	dropmessages: $data
	emailsTags: bcc
	hasfocus: emailFocused
	i18nUpdate: accounts
	initDom: background.uploaderButton
	initDom: keyDom
	moment: message().dateTimestamp()
	onEnter: selectLanguage
	onSpace: selectLanguage
	options: $root.actionTypeOptions
	options: ['ECC', 'RSA']
	optionsText: 'name'
	optionsValue: 'id'
	registerBootstrapDropdown: true
	saveTrigger: attachmentLimitTrigger
	sortableItem: { list: $parent.filters }
	sortableItem: { list: $root.identities, afterMove: $root.accountsAndIdentitiesAfterMove }
	template: { name: 'AdminSettingsPackagesTable', data: {f: packagesAvailable} }
	template: { name: 'AdminSettingsPluginProperty' }
	template: { name: 'MailFolderListItem', foreach: folderListVisible }
	template: { name: actionTemplate()}
	template: { name: template(), data: $data}
	tooltipErrorTip: sendErrorDesc
	with: message
*/

const koParseObjectLiteral = (() => {
    var
		// The following regular expressions will be used to split an object-literal string into tokens
        specials = ',"\'`{}()/:[\\]',    // These characters have special meaning to the parser and must not appear in the middle of a token, except as part of a string.
        // Create the actual regular expression by or-ing the following regex strings. The order is important.
        bindingToken = RegExp([
            // These match strings, either with double quotes, single quotes, or backticks
            '"(?:\\\\.|[^"])*"',
            "'(?:\\\\.|[^'])*'",
            "`(?:\\\\.|[^`])*`",
            // Match C style comments
            "/\\*(?:[^*]|\\*+[^*/])*\\*+/",
            // Match C++ style comments
            "//.*\n",
            // Match a regular expression (text enclosed by slashes), but will also match sets of divisions
            // as a regular expression (this is handled by the parsing loop below).
            '/(?:\\\\.|[^/])+/w*',
            // Match text (at least two characters) that does not contain any of the above special characters,
            // although some of the special characters are allowed to start it (all but the colon and comma).
            // The text can contain spaces, but leading or trailing spaces are skipped.
            '[^\\s:,/][^' + specials + ']*[^\\s' + specials + ']',
            // Match any non-space character not matched already. This will match colons and commas, since they're
            // not matched by "everyThingElse", but will also match any other single character that wasn't already
            // matched (for example: in "a: 1, b: 2", each of the non-space characters will be matched by oneNotSpace).
            '[^\\s]'
        ].join("|"), "g"),

        // Match end of previous token to determine whether a slash is a division or regex.
        divisionLookBehind = /[\])"'A-Za-z0-9_$]+$/,
        keywordRegexLookBehind = {"in":1,"return":1,"typeof":1};

	return objectLiteralString => {
		// Trim leading and trailing spaces from the string
		var str = objectLiteralString.trim();

		// Trim braces "{" surrounding the whole object literal
		if (str.charCodeAt(0) === 123) str = str.slice(1, -1);

		// Add a newline to correctly match a C++ style comment at the end of the string and
		// add a comma so that we don't need a separate code block to deal with the last item
		str += "\n,";

		// Split into tokens
		var result = {}, toks = str.match(bindingToken), key, values = [], depth = 0;

		if (toks.length > 1) {
			var i = 0, tok;
			while ((tok = toks[i++])) {
				var c = tok.charCodeAt(0);
				// A comma signals the end of a key/value pair if depth is zero
				if (c === 44) { // ","
					if (depth <= 0) {
						result[key] = values.join("");
						key = depth = 0;
						values = [];
						continue;
					}
				// Simply skip the colon that separates the name and value
				} else if (c === 58) { // ":"
					if (!depth && !key && values.length === 1) {
						key = values.pop();
						continue;
					}
				// Comments: skip them
				} else if (c === 47 && tok.length > 1 && (tok.charCodeAt(1) === 47 || tok.charCodeAt(1) === 42)) {  // "//" or "/*"
					continue;
				// A set of slashes is initially matched as a regular expression, but could be division
				} else if (c === 47 && i && tok.length > 1) {  // "/"
					// Look at the end of the previous token to determine if the slash is actually division
					var match = toks[i-1].match(divisionLookBehind);
					if (match && !keywordRegexLookBehind[match[0]]) {
						// The slash is actually a division punctuator; re-parse the remainder of the string (not including the slash)
						str = str.slice(str.indexOf(tok) + 1);
						toks = str.match(bindingToken);
						i = -1;
						// Continue with just the slash
						tok = "/";
					}
				// Increment depth for parentheses, braces, and brackets so that interior commas are ignored
				} else if (c === 40 || c === 123 || c === 91) { // "(", "{", "["
					++depth;
				} else if (c === 41 || c === 125 || c === 93) { // ")", "}", "]"
					--depth;
				// The key will be the first token; if it's a string, trim the quotes
				} else if (!key && !values.length && (c === 34 || c === 39)) { // '"', "'"
					tok = tok.slice(1, -1);
				}
				values.push(tok);
			}
			if (depth > 0) {
				throw Error("Unbalanced parentheses, braces, or brackets");
			}
		}
		return result;
	};

})();

// Converts KnockoutJS data-bind="" to tal:*=""
const koConvertElement = (el, context) => {
	let value = el.getAttribute("data-bind");
	el.removeAttribute("data-bind");
	if (value) {
		value = koParseObjectLiteral(value);
		// eslint-disable-next-line max-len
		const regex = /^((?:'([^']*)'|"([^"]*)"|string:(.*))|((?:path:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)))$/,
			toTales = value => {
				value = value.replace(/(\$(root|parent)\.)/g, "");
				value = value.replace(/\$data/g, "context");
				return regex.test(value) ? value : "js:" + value;
			};

		if (value.attr) {
			value.attr = Object.entries(koParseObjectLiteral(value.attr)).map(([key, value]) =>
				key + " " + toTales(value)
			);
		} else {
			value.attr = [];
		}

		if (value.event) {
			value.event = Object.entries(koParseObjectLiteral(value.event)).map(([key, value]) =>
				key + " " + toTales(value)
			);
		} else {
			value.event = [];
		}

		if (value.if) {
			el.setAttribute("tal:condition", toTales(value.if));
			delete value.if;
		}

		if (value.foreach) {
			el.setAttribute("tal:repeat", "context " + toTales(value.foreach));
			delete value.foreach;
		}

		if (value.css) {
			let css = koParseObjectLiteral(value.css);
			if (css) {
				Object.entries(css).map(([key, value]) => {
					value = toTales(value);
					if (Tales.string(value)) {
						el.classList.toggle(key, !!value);
					} else {
						value = Tales.string(value) || Tales.path(value, context) || Tales.js(value, context);
						el.classList.toggle(key, value());
					}
				});
			} else {
				value.attr.push("class " + toTales(value.css));
			}
			delete value.css;
		}

		if (value.text) {
			el.setAttribute("tal:content", toTales(value.text));
			delete value.text;
		} else if (value.html) {
			el.setAttribute("tal:content", "structure " + toTales(value.html));
			delete value.html;
		}

		if (value.checked) {
			value.attr.push("checked " + toTales(value.checked));
			value.event.push("change " + toTales(value.checked));
			delete value.checked;
		} else if (value.value) {
			value.attr.push("value " + toTales(value.value));
			value.event.push((value.valueUpdate || "value") + " " + toTales(value.value));
			delete value.value;
		} else if (value.textInput) {
			value.attr.push("value " + toTales(value.textInput));
			value.event.push("input " + toTales(value.textInput));
			delete value.textInput;
		}
		if (value.hidden) {
			value.attr.push("hidden " + toTales(value.hidden));
			delete value.hidden;
		} else if (value.visible) {
//			element.style.display == "none"
			value.attr.push("hidden " + toTales("!(" + value.visible + ")"));
			delete value.visible;
		}
		if (value.disable) {
			value.attr.push("disabled " + toTales(value.disable));
			delete value.disable;
		} else if (value.enable) {
			value.attr.push("disabled " + toTales("!(" + value.enable + ")"));
			delete value.enable;
		}

		if (value.attr?.length) {
			el.setAttribute("tal:attributes", value.attr.join(", "));
		}
		delete value.attr;

		if (value.click) {
			value.event.push("click " + toTales(value.click));
			delete value.click;
		}
		if (value.submit) {
			value.event.push("submit " + toTales(value.submit));
			delete value.submit;
		}
		if (value.event?.length) {
			el.setAttribute("tal:listen", value.event.join(", "));
		}
		delete value.event;

		Object.keys(value).length && console.dir({["data-bind"]:value});
	}
};

const koConvertBindings = (template, context) => {
	// elements is a static (not live) NodeList
	// template root node must be prepended as well
	let elements = [template, ...template.querySelectorAll("[data-bind]")];
	elements.forEach(el => koConvertElement(el, context));
}

window.TAL.parse.converters.push(koConvertBindings);
