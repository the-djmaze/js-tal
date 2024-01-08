(function () {
	'use strict';

	const
		isFunction = val => typeof val === "function",
		isObject = val => typeof val === "object",
		IS_PROXY = Symbol("proxied"),
		nullObject = () => Object.create(null),

		// Vue trigger
		dispatch = (callbacks, prop, value) =>
		{
			try {
				callbacks && callbacks.forEach(cb => cb(value, prop));
				return true;
			} catch (e) {
				console.dir({
					prop: prop,
					value: value,
					callbacks:callbacks
				});
				console.error(e);
				return false;
			}
		},

		popAttribute = (el, name) =>
		{
			const value = el.getAttribute(name);
			el.removeAttribute(name);
			return value;
		};

	class Observers extends Map {

		observe(property, callback) {
			this.has(property) || this.set(property, new Set);
			this.get(property).add(callback);
		}

		unobserve(property, callback) {
			this.has(property) && this.get(property).delete(callback);
		}

		dispatch(property, value) {
			return dispatch(this.get(property), property, value);
		}

		dispatchAll(obj) {
			this.forEach((callbacks, prop) => dispatch(callbacks, prop, obj[prop]));
			// Refresh children, does not work
	//		Object.values(obj).forEach(value => value && value.refreshObservers && value.refreshObservers());
		}
	}

	class TalError extends Error {}

	const proxyMap = new WeakMap();
	function observeObject(obj, parent/*, deep*/)
	{
		if (Array.isArray(obj)) {
			return observeArrayObject(obj, parent/*, deep*/);
		}
		if (!isObject(obj)) {
			return obj;
		}
		if (obj[IS_PROXY]) {
			return obj;
		}

		let proxy = proxyMap.get(obj);
		if (!proxy) {
	/*
			// If deep doesn't evaluate to true, only a shallow proxy is created
			if (deep) {
				Object.entries(properties).forEach(([key,value]) => {
					if (isObject(value)) {
						if (Array.isArray(value)) {
							// Observe the array
						} else {
							// Observe the object
						}
					}
					this[key] = value
				});
		}
	*/
	//		Object.defineProperty(obj, 'isProxy', { get: function(){return this === obj;} });
			if (!parent || !parent[IS_PROXY]) {
				parent = undefined;
			}
			const observers = new Observers;
			proxy = new Proxy(obj, {
				get(target, prop, receiver) {
					switch (prop)
					{
						case IS_PROXY: return 1;
						// Vue watch(), Knockout subscribe()
						case "observe":
	//						callback(obj[property], property);
							// fallthrough
						case "unobserve":
	//						return (property, callback) => observers[prop](property, callback);
							return observers[prop].bind(observers);
						case "clearObservers":
							return () => observers.clear();
						case "refreshObservers":
							return () => observers.dispatchAll(obj);
						// Vue computed(), Knockout computed()
						case "defineComputed":
							return (name, fn, observe) => {
								Object.defineProperty(obj, name, { get: fn });
								observe && observe.forEach(n => observers.observe(n, () => observers.dispatch(name, fn())));
							};
					}
					if (Reflect.has(target, prop)) {
						return Reflect.get(target, prop, receiver);
					}
					if (typeof prop !== 'symbol') {
						if (parent) {
							return parent[prop];
						} else {
							console.error(`Undefined property '${prop}' in current scope`);
						}
					}
				},
				set(target, prop, value, receiver) {
					switch (prop)
					{
						case "observe":
						case "unobserve":
						case "clearObservers":
						case "refreshObservers":
						case "defineComputed":
							throw new TalError(`${prop} can't be initialized, it is internal`);

					}
					let oldValue = target[prop],
						result = Reflect.set(target, prop, value, receiver);
					if (result && oldValue !== target[prop]) {
						observers.dispatch(prop, target[prop]);
					}
					return result;
				}
			});
			proxyMap.set(obj, proxy);
		}
		return proxy;
	}

	function observeArrayObject(obj, parent/*, deep*/)
	{
	//	if (!Array.isArray(obj) && !(obj instanceof Set) && !(obj instanceof Map)) {
		if (!Array.isArray(obj)) {
			throw new TalError("Not an Array");
		}
		if (obj[IS_PROXY]) {
			return obj;
		}
		let proxy = proxyMap.get(obj);
		if (!proxy) {
			if (!parent || !parent[IS_PROXY]) {
				parent = undefined;
			}
			const observers = new Observers;
			proxy = new Proxy(obj, {
				get(target, prop, receiver) {
					switch (prop)
					{
					case IS_PROXY: return 1;
					// Vue watch(), Knockout subscribe()
					case "observe":
	//					callback(obj[property], property);
						// fallthrough
					case "unobserve":
	//					return (property, callback) => observers[prop](property, callback);
						return observers[prop].bind(observers);
					case "clearObservers":
						return () => observers.clear();
					case "refreshObservers":
						return () => observers.dispatchAll(obj);
					// Vue computed(), Knockout computed()
					case "defineComputed":
						return (name, fn, observe) => {
							Object.defineProperty(obj, name, { get: fn });
							observe && observe.forEach(n => observers.observe(n, () => observers.dispatch(name, fn())));
						};
					}
					if (Reflect.has(target, prop)) {
						switch (prop)
						{
						// Set
						case "clear":
							return () => {
								observers.dispatch(prop);
								return target.clear();
							};
						case "add":
						case "delete":
							throw new TalError("Set.prototype."+prop+"() not supported");
						// Array mutator methods
						case "copyWithin":
						case "fill":
						case "reverse":
						case "sort":
							throw new TalError("Array.prototype."+prop+"() not supported");
						case "shift":
	//					case "pop":
							return () => {
								let value = target[prop]();
								observers.dispatch(prop, value);
								return value;
							};
						case "unshift":
						case "splice":
						case "push":
							return (...args) => {
								args = args.map(obj => observeObject(obj, proxy));
								let result = target[prop](...args);
								observers.dispatch(prop, args);
								return result;
							};
						}
						return Reflect.get(target, prop, receiver);
	//					let value = Reflect.get(target, prop, receiver);
	//					return isFunction(value) ? value.bind(target) : value;
					}
					if (typeof prop !== 'symbol') {
						if (parent) {
							return parent[prop];
						} else {
							console.error(`Undefined property '${prop}' in current scope`);
						}
					}
				},
				set(target, prop, value) {
					if (target[prop] !== value) {
						target[prop] = value;
						if ("length" === prop) {
							observers.dispatch(prop, value);
						} else if (isFinite(prop)) {
							value = observeObject(value, proxy);
							observers.dispatch("set", {index:prop, value});
						}
						target[prop] = value;
					}
					return true;
				}
			});

			obj.forEach((item, index) => obj[index] = observeObject(item, proxy));

			proxyMap.set(obj, proxy);
		}
		return proxy;
	}

	function isObserved(obj)
	{
		return isObject(obj) && obj[IS_PROXY];
	}

	/**
	 * This can be very complex, like:
	 * <div tal:repeat="item context/cart">
	 *     <div tal:repeat="prop item/props">
	 *         <input tal:attributes="name 'item[${item/id}][${prop/id}]'"/>
	 *     </div>
	 * </div>
	 */
	class Tales
	{
	/**
		TALES:
			'exists:'
			'not:'
			'nocall:'
			'path:'
			'string:'
			'js:'
	*/
		static string(expr) {
			expr = expr.trim().match(/^(?:'([^']*)'|"([^"]*)"|string:(.*))$/);
			return expr
				? (null != expr[3]) ? expr[3] : ((null != expr[2]) ? expr[2] : expr[1])
				: null;
		}

		static path(context, expr) {
			let match = expr.trim().match(/^(?:path:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
			if (match) {
				if (!isObserved(context)) {
					throw new TalError(`context '${expr}' can't be observed`);
				}
				match = match[1].trim().split("/");
				let i = 0, l = match.length - 1;
				for (; i < l; ++i) {
					if (!(match[i] in context)) {
						return;
					}
					let newContext = context[match[i]];
					if (!isObserved(newContext)) {
						newContext = observeObject(newContext, context[match[i]]);
						try {
							context[match[i]] = newContext;
						} catch (e) {
							console.error(e,{context, prop:match[i]});
						}
					}
					context = newContext;
				}
				return [context, match[l]];
			}
		}

		static js(context, expr) {
			expr = expr.trim().match(/^(?:js:)(.*)$/);
			if (expr) {
				console.log(`with($context){return ${expr[1]}}`);
				return new Function("$context", `with($context){return ${expr[1]}}`);
			}
		}
	}

	/**
	 * Used for garbage collection as Mutation Observers are not reliable
	 */
	const
		observables = Symbol("observables"),
		observe = (el, obj, prop, cb) =>
		{
			obj.observe(prop, cb);
			el[observables] || (el[observables] = new Set);
			el[observables].add(()=>obj.unobserve(prop, cb));
		},
		removeNode = node => {
			if (node) {
				node[observables]?.forEach?.(cb => cb());
				delete node[observables];
				[...node.childNodes].forEach(removeNode);
				node.remove();
			}
		};

	class Statements
	{
		/**
		 * tal:attributes - dynamically change element attributes.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#attributes-replace-element-attributes
		 */
		static attributes(el, value, context) {
	//		value.matchAll(/([^\s;]+)\s+([^;]+)/);
			value.split(";").forEach(attr => {
				attr = attr.trim().match(/^([^\s]+)\s+(.+)$/);
				let text = Tales.string(attr[2]);
				if (null == text) {
					let path = Tales.path(context, attr[2]);
					if (path) {
						text = path[0][path[1]];
						if (isFunction(text)) {
							text = text();
						} else {
							observe(el, path[0], path[1], value => {
								el.setAttribute(attr[1], value);
								el[attr[1]] = value;
							});
						}
					} else {
						console.error(`Path '${value}' not found`, context);
					}
				}
				el.setAttribute(attr[1], text);
			});
		}

		/**
		 * tal:content - replace the content of an element.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#content-replace-the-content-of-an-element
		 */
		static content(el, value, context) {
			let match = value.trim().match(/^(?:(text|structure)\s+)?(.+)$/),
				expression = match[2],
				text = Tales.string(expression),
				mode = "structure" === match[1] ? "innerHTML" : "textContent";
			if (null == text) {
				let js = Tales.js(context, expression);
				if (js) {
					console.dir(js);
					text = js(context);
				} else {
					let path = Tales.path(context, expression);
					if (path) {
						text = path[0][path[1]];
						if (isFunction(text)) {
							text = text();
						} else {
							observe(el, path[0], path[1], value => el[mode] = value);
						}
					} else {
						console.error(`Path '${value}' not found`, context);
					}
				}
			}
			el[mode] = text;
		}

		/**
		 * tal:replace - replace the content of an element and remove the element leaving the content.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#replace-replace-an-element
		 */
		static replace(el, value, context) {
			let match = value.trim().match(/^(?:(text|structure)\s+)?(.+)$/),
				expression = match[2],
				text = Tales.string(expression),
				fn;
			if ("structure" === match[1]) {
				fn = string => el.outerHTML = string;
			} else {
				fn = string => el.replaceWith(string);
			}
			if (null == text) {
				let path = Tales.path(context, expression);
				if (path) {
					text = path[0][path[1]];
					if (isFunction(text)) {
						text = text();
					} else {
						if ("structure" === match[1]) {
							// Because the Element is replaced, it is gone
							// So we prepend an empty TextNode as reference
							let node = document.createTextNode(""), frag;
							el.replaceWith(node);
							// Now we can put/replace the HTML after the empty TextNode
							fn = string => {
								frag && frag.forEach(el => el.remove());
								const template = document.createElement("template");
								template.innerHTML = string.trim();
								frag = Array.from(template.content.childNodes);
								node.after(template.content);
							};
						} else {
							let node = document.createTextNode("");
							el.replaceWith(node);
							fn = string => node.nodeValue = string;
						}
						observe(el, path[0], path[1], fn);
					}
				} else {
					console.error(`Path '${value}' not found`, context);
				}
			}
			fn(text);
		}

		/**
		 * tal:define - define variables.
		 */
		static define(el, expression, context) {
			expression.split(";").forEach(def => {
				def = def.trim().match(/^(?:(local|global)\s+)?([^\s]+)\s+(.+)$/);
				def[3] = Tales.string(def[3]) || def[3];
				if ("global" === def[1]) {
					// TODO: get root context
					context[def[2]] = def[3];
				} else {
					context[def[2]] = def[3];
				}
			});
		}

		/**
		 * tal:condition - test conditions.
		 */
		static condition(el, expression, context, parser) {
			let tree = el.cloneNode(true),
				text = Tales.string(expression),
				fn = value => {
					[...el.childNodes].forEach(removeNode);
	//				el.textContent = "";
					if (value) {
						let node = tree.cloneNode(true);
						parser(node, context);
						el.append(...node.childNodes);
					}
				};
			if (null == text) {
				let path = Tales.path(context, expression);
				if (path) {
					text = path[0][path[1]];
					if (isFunction(text)) {
						text = text();
					} else {
						observe(el, path[0], path[1], fn);
					}
				} else {
					console.error(`Path '${expression}' not found`, context);
				}
			}
			fn(text);
		}

		/**
		 * tal:repeat - repeat an element.
		 * This is very complex as it creates a deeper context
		 * Especially when there"s a repeat inside a repeat, like:
		 * <div tal:repeat="item context/cart">
		 *     <div tal:repeat="prop item/props">
		 *         <input tal:attributes="name "item[${item/id}][${prop/id}]""/>
		 *     </div>
		 * </div>
		 */
		static repeat(el, value, context, parser) {
			const match = value.trim().match(/^([^\s]+)\s+(.+)$/);
	//		console.dir({match});
	//		context = TalContext;
	//		context = observeObject(context[repeater.prop]);
	//		contextTree.push(context);
			const items = [],
				array = context[match[2]],
				target = el.ownerDocument.createTextNode(""),
				createItem = value => {
					let node = el.cloneNode(true);
					let subContext = observeObject(nullObject(), context);
					subContext.defineComputed(match[1], () => value);
					parser(node, subContext);
					return node;
				};
			items.name = match[1];
			items.hasChild = node => el.contains(node);
			items.add = (value, pos) => {
				let node = createItem(value);
				if (isFinite(pos) && pos < items.length) {
					if (0 == pos) {
						items[0].before(node);
						items.unshift(node);
					} else {
						items[pos].before(node);
						items.splice(pos, 0, node);
					}
				} else {
					target.before(node);
	//				items.length ? items[items.length-1].after(node) : items.parent.insertBefore(node, target);
					items.push(node);
				}
			};

			el.replaceWith(target);

			let observable = observeArrayObject(array, context);
			observe(el, observable, "clear", () => {
				items.forEach(removeNode);
				items.length = 0;
			});
			observe(el, observable, "shift", () => removeNode(items.shift()));
			observe(el, observable, "unshift", (args) => {
				let i = args.length;
				while (i--) items.add(args[i], 0);
	//			args.forEach((item, i) => items.add(item, i));
			});
			observe(el, observable, "splice", (args) => {
				if (0 < args[1]) {
					let i = Math.min(items.length, args[0] + args[1]);
					while (args[0] < i--) removeNode(items[i]);
					items.splice(args[0], args[1]);
				}
				for (let i = 2; i < args.length; ++i) {
					items.add(args[i], args[0]);
				}
			});
			observe(el, observable, "push", (args) => {
				args.forEach(item => items.add(item));
			});
			observe(el, observable, "length", length => {
				while (items.length > length) removeNode(items.pop());
			});
			observe(el, observable, "set", item => {
				if (item.index in items) {
					let node = createItem(item.value);
					items[item.index].replaceWith(node);
					items[item.index] = node;
				} else {
					items.add(item.value, item.index);
				}
			});

			context[value[2]] = observable;

			// Fill the list with current repeat values
			array.forEach((value, pos) => items.add(value, pos));

			return items;
		}

		/**
		 * tal:omit-tag - remove an element, leaving the content of the element.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#omit-tag-remove-an-element-leaving-its-contents
		 */
		static ["omit-tag"](el, expression, context) {
			if (expression) {
				let path = Tales.path(context, expression);
				if (path) {
					expression = path[0][path[1]];
					if (isFunction(expression)) {
						expression = expression();
					}
				} else {
					console.error(`Path '${expression}' not found`, context);
				}
			} else {
				expression = true;
			}
			if (expression) {
				el.replaceWith(...el.childNodes);
			}
		}

	/*
		tal:switch - define a switch condition
		tal:case - include element only if expression is equal to parent switch
		tal:on-error - handle errors.
	*/

		/**
		 * tal:listen - Observe native elements using addEventListener for two-way bindings
		 * like: HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLDetailsElement
		 */
		static listen(el, value, context) {
	//		value.matchAll(/([^\s;]+)\s+([^;]+)/);
			value.split(";").forEach(attr => {
				if (attr = attr.trim().match(/^([^\s]+)\s+(.+)$/)) {
					if (!Tales.string(attr[2]) && el instanceof HTMLElement) {
						const path = Tales.path(context, attr[2]),
							ctx = path ? path[0] : context,
							prop = path ? path[1] : attr[2];
						if ("value" === attr[1] || "checked" === attr[1]) {
							el.addEventListener("change", () => ctx[prop] = el[attr[1]]);
						}
						if ("input" === attr[1]) {
							el.addEventListener(attr[1], () => ctx[prop] = el.value);
						}
						if ("toggle" === attr[1]) {
							el.addEventListener(attr[1], event => ctx[prop] = event.newState);
						}
						if ("click" === attr[1]) {
							el.addEventListener(attr[1], event => ctx[prop](event));
						}
					}
				}
			});
		}
	}

	Statements.methods = Object.getOwnPropertyNames(Statements).filter(n => isFunction(Statements[n]));
	Statements.cssQuery = "[tal\\:" + Statements.methods.join("],[tal\\:") + "]";
	//Statements.cssQuery = "[data-tal-" + Statements.methods.join("],[data-tal-") + "]";

	// context = observeObject(obj)
	// TalContext
	function parse(template, context)
	{
		if (typeof template === "string") {
			template = document.getElementById(template);
		}
		if (!(template instanceof Element)) {
			throw new TalError("template not an instance of Element");
		}
		if (!isObserved(context)) {
			throw new TalError("context is not observed");
		}
	//	context = observeObject(context);
		// elements is a static (not live) NodeList
		// template root node must be prepended as well
		let elements = [template, ...template.querySelectorAll(Statements.cssQuery)];
		let repeat, repeaters = [];
		elements.forEach(el => {
			if (repeat) {
				if (repeat.hasChild(el)) {
					// Skip this element as it is handled by Statements.repeat
					return;
				}
				repeat = repeaters.pop();
			}

			let value = popAttribute(el, "tal:define");
			if (null != value) {
				Statements.define(el, value, context);
			}

			// Same as KnockoutJS if:
			value = popAttribute(el, "tal:condition");
			if (null != value) {
				Statements.condition(el, value, context, parse);
			}

			// Same as KnockoutJS foreach:
			value = popAttribute(el, "tal:repeat");
			if (null != value) {
				repeat = Statements.repeat(el, value, context, parse);
				repeaters.push(repeat);
				return;
			}

			value = popAttribute(el, "tal:content");
			let skip = false;
			if (null != value) {
				Statements.content(el, value, context);
			} else if (null != (value = popAttribute(el, "tal:replace"))) {
				Statements.replace(el, value, context);
				skip = true;
			}
			if (!skip) {
				// Same as KnockoutJS attr:
				value = popAttribute(el, "tal:attributes");
				if (null != value) {
					Statements.attributes(el, value, context);
				}

				if (el.hasAttribute("tal:omit-tag")) {
					Statements["omit-tag"](el, popAttribute(el, "tal:omit-tag"), context);
				}

				// Our two-way bindings
				value = popAttribute(el, "tal:listen");
				if (null != value) {
					Statements.listen(el, value, context);
				}
			}

			el.getAttributeNames().forEach(name => name.startsWith("tal:") && el.removeAttribute(name));
		});

		return context;
	}

	//import { observeDOMNode } from 'observers/dom';

	function observeProperty(obj, prop, callback) {
		if (!obj.observeProperty) {
			const observers = new Observers;
			obj.observeProperty = (prop, callback) => {
				if (Object.getOwnPropertyDescriptor(obj, prop)) {
					console.error(`Already observing ${obj.constructor.name}.${prop}`);
				} else {
					const nativeDescriptor = Object.getOwnPropertyDescriptor(obj.constructor.prototype, prop);
					const setValue = val => {
							let oldVal = nativeDescriptor.get.call(obj);
	//							result = Reflect.set(obj, prop, val);
							nativeDescriptor.set.call(obj, val);
							val = nativeDescriptor.get.call(obj);
							if (oldVal !== val) {
								observers.dispatch(prop, nativeDescriptor.get.call(obj));
							}
							return true;
						};
					Object.defineProperty(obj, prop, {
						enumerable: nativeDescriptor.enumerable,
						set: setValue,
						get: () => nativeDescriptor.get.call(obj)
					});
				}
				observers.add(prop, callback);
			};
		}

		obj.observeProperty(prop, callback);
	}

	/*
	 * When one of the properties inside the getter function is changed
	 * This property must call dispatch(observers[property], property, target[property])
	class computedProperty
	{
		constructor(getterOrOptions) {
			if (isFunction(getterOrOptions)) {
				getterOrOptions = {
					get: getterOrOptions,
					set: () => {console.warn('computedProperty is readonly')}
				}
			}
			this._setter = getterOrOptions.set;
			this._dirty = true;
			this.__v_isRef = true;
			this.effect = effect(getterOrOptions.get, {
				lazy: true,
				scheduler: () => {
					if (!this._dirty) {
						this._dirty = true;
						trigger(toRaw(this), "set", "value");
					}
				}
			});
		}
		get value() {
			const self = toRaw(this);
			if (self._dirty) {
				self._value = this.effect();
				self._dirty = false;
			}
			track(self, "get", "value");
			return self._value;
		}
		set value(newValue) {
			this._setter(newValue);
		}
	}

	function defineComputedProperty(obj, prop, fn, observables)
	{
		observeObject(obj).defineComputed(prop, fn, observables);
	}
	*/

	window.TAL = {
		parse,
		observeObject,
		observeProperty,
		TalError
	};

})();
