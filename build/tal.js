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
			return observeArrayObject(obj/*, deep*/);
		}
		if (!isObject(obj)) {
			return obj;
		}
		if (obj[IS_PROXY]) {
			return obj;
		}

		let proxy = proxyMap.get(obj);
		if (!proxy) {
	//		obj[IS_PROXY] = 2;
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
					if (parent) {
						parent[prop];
					} else {
						console.error(`Undefined property '${prop}' in current scope`);
					}
					return Reflect.get(target, prop, receiver);
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

	function observeArrayObject(obj/*, deep*/)
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
	//		obj[IS_PROXY] = 2;
			obj.forEach((item, index) => obj[index] = observeObject(item));

			const observers = new Observers;
			proxy = new Proxy(obj, {
				get(target, prop/*, receiver*/) {
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
					if (prop in target) {
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
								args = args.map(obj => observeObject(obj));
								let result = target[prop](...args);
								observers.dispatch(prop, args);
								return result;
							};
						}
						return target[prop];
	//					let value = Reflect.get(target, prop, receiver);
	//					return isFunction(value) ? value.bind(target) : value;
					}
				},
				set(target, prop, value) {
					if (target[prop] !== value) {
						target[prop] = value;
						if ("length" === prop) {
							observers.dispatch(prop, value);
						} else if (isFinite(prop)) {
							value = observeObject(value);
							observers.dispatch('set', {index:prop, value});
						}
						target[prop] = value;
					}
					return true;
				}
			});

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
			expr = expr.trim().match(/^(?:path:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
			if (expr) {
				if (!isObserved(context)) {
					throw new TalError(`context '${expr}' can't be observed`);
				}
				expr = expr[1].trim().split('/');
				let i = 0, l = expr.length - 1;
				for (; i < l; ++i) {
					if (!(expr[i] in context)) {
						return;
					}
					let newContext = context[expr[i]];
					if (!isObserved(newContext)) {
						newContext = observeObject(newContext);
						try {
							context[expr[i]] = newContext;
						} catch (e) {
							console.error(e,{context, prop:expr[i]});
						}
					}
					context = newContext;
				}
				return [context, expr[l]];
			}
		}
	}

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
						path[0].observe(path[1], value => {
							el.setAttribute(attr[1], value);
							el[attr[1]] = value;
						});
						text = path[0][path[1]];
					} else {
						console.error('Path not found', {value, context});
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
			value = value.trim().match(/^(?:(text|structure)\s+)?(.+)$/);
			let expression = value[2],
				text = Tales.string(expression),
				mode = "structure" === value[1] ? "innerHTML" : "textContent";
			if (null == text) {
				let path = Tales.path(context, expression);
				if (path) {
					path[0].observe(path[1], value => el[mode] = value);
					text = path[0][path[1]];
				} else {
					console.error('Path not found', {value, context});
				}
			}
			el[mode] = text;
		}

		/**
		 * tal:replace - replace the content of an element and remove the element leaving the content.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#replace-replace-an-element
		 */
		static replace(el, value, context) {
			value = value.trim().match(/^(?:(text|structure)\s+)?(.+)$/);
			let expression = value[2],
				text = Tales.string(expression);
			if (null != text) {
				if ("structure" === value[1]) {
					el.outerHTML = text;
				} else {
					el.replaceWith(text);
				}
			} else {
				let fn;
				if ("structure" === value[1]) {
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
				let path = Tales.path(context, expression);
				if (path) {
					fn(path[0][path[1]]);
					path[0].observe(path[1], fn);
				} else {
					console.error('Path not found', {value, context});
				}
			}
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
			let tree = el.cloneNode(true);
			let text = Tales.string(expression);
			let fn = value => {
				el.textContent = "";
				if (value) {
					let node = tree.cloneNode(true);
					parser(node, context);
					el.append(...node.childNodes);
				}
			};
			if (null == text) {
				let path = Tales.path(context, expression);
				if (path) {
					path[0].observe(path[1], fn);
					text = path[0][path[1]];
				} else {
					console.error('Path not found', {expression, context});
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
			value = value.trim().match(/^([^\s]+)\s+(.+)$/);
	//		console.dir({value});
	//		context = TalContext;
	//		context = observeObject(context[repeater.prop]);
	//		contextTree.push(context);
			const items = [],
				array = context[value[2]],
				target = el.ownerDocument.createTextNode(""),
				createItem = context => {
					let node = el.cloneNode(true);
					let subContext = observeObject(nullObject());
	/*
					try {
						context = observeObject(context);
					} catch (err) {
						console.error(err);
					}
	*/
					subContext.defineComputed(value[1], () => context);
					parser(node, subContext);
					return node;
				};
			items.name = value[1];
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

			let observable = observeArrayObject(array);
			observable.observe("clear", () => {
				items.forEach(item => item.remove());
				items.length = 0;
			});
			observable.observe("shift", () => {
				let item = items.shift();
				item && item.remove();
			});
			observable.observe("unshift", (args) => {
				let i = args.length;
				while (i--) items.add(args[i], 0);
	//			args.forEach((item, i) => items.add(item, i));
			});
			observable.observe("splice", (args) => {
				if (0 < args[1]) {
					let i = Math.min(items.length, args[0] + args[1]);
					while (args[0] < i--) items[i].remove();
					items.splice(args[0], args[1]);
				}
				for (let i = 2; i < args.length; ++i) {
					items.add(args[i], args[0]);
				}
			});
			observable.observe("push", (args) => {
				args.forEach(item => items.add(item));
			});
			observable.observe("length", length => {
				while (items.length > length) items.pop().remove();
			});
			observable.observe("set", item => {
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
				} else {
					expression = context[expression];
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
					console.error('Already observing ' + obj.constructor.name + '.' + prop);
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
						trigger(toRaw(this), "set", 'value');
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
			track(self, "get", 'value');
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
