(function () {
	'use strict';

	const
		isFunction = val => typeof val === "function",
		isObject = val => typeof val === "object",
		nullObject = () => Object.create(null),

		popAttribute = (el, name) =>
		{
			const value = el.getAttribute(name);
			el.removeAttribute(name);
			return value;
		};

	class TalError extends Error {}

	class ObservablesMap extends WeakMap {
	    get(obj) {
			return obj[IS_PROXY] ? obj : super.get();
	    }
	}

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

	let detectingObservables;

	const
		IS_PROXY = Symbol("proxied"),

		isContextProp = prop => contextProps.includes(prop),

		isObserved = obj => obj[IS_PROXY],

		detectObservables = () => {
			detectingObservables || (detectingObservables = []);
		},

		getDetectedObservables = () => {
			let result = detectingObservables;
			detectingObservables = null;
			return result;
		},

		observablesMap = new ObservablesMap(),

		contextGetter = (context, target, prop, observers, parent) => {
			switch (prop)
			{
				case IS_PROXY: return 1;
				// Vue watch(), Knockout subscribe()
				case "observe":
	//				callback(obj[property], property);
					// fallthrough
				case "unobserve":
	//				return (property, callback) => observers[prop](property, callback);
					return observers[prop].bind(observers);
				case "clearObservers":
					return () => observers.clear();
				case "getObservers":
					return () => observers;
				case "refreshObservers":
					return () => observers.dispatchAll(target);
				// Vue computed(), Knockout computed()
				case "defineComputed":
					return (name, callable) => {
						detectObservables();
						callable();
						getDetectedObservables().forEach(([obj, prop]) => obj.observe(prop, callable));
						Object.defineProperty(target, name, { get: callable });
					};
				/**
				 * TAL built-in Names
				 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#built-in-names
				 */
				case "root":
					return parent ? parent[prop] : context;
	//				return (parent && parent[IS_PROXY]) ? parent[prop] : context;
				case "context":
					return context;
			}
		};

	const contextProps = [
			IS_PROXY,
			"observe",
			"unobserve",
			"clearObservers",
			"getObservers",
			"refreshObservers",
			"defineComputed",
			// TAL
			"root",
			"context"
		],
		// Vue trigger
		dispatch = (callbacks, prop, value) => {
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
		};

	function observeObject(obj, parent/*, deep*/)
	{
		if (!isObject(obj)) {
			return obj;
		}

		let proxy = observablesMap.get(obj);
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
			if (!parent || !parent[IS_PROXY]) {
				parent = null;
			}
			const observers = new Observers;
			proxy = new Proxy(obj, {
				get(target, prop, receiver) {
					if (isContextProp(prop)) {
						return contextGetter(proxy, target, prop, observers, parent);
					}
					if (Reflect.has(target, prop)) {
						if (detectingObservables) {
							detectingObservables.push([proxy, prop]);
						}
						let result = Reflect.get(target, prop, receiver);
						if (isFunction(result)) {
							result = result.bind(proxy);
						}
						return result;
					}
					if (typeof prop !== 'symbol') {
						if (parent) {
							return parent[prop];
						}
						console.error(`Undefined property '${prop}' in current scope`);
					}
				},
				set(target, prop, value, receiver) {
					let result = true;
					if (!detectingObservables) {
						if (isContextProp(prop)) {
							throw new TalError(`${prop} can't be initialized, it is internal`);
						}
						let oldValue = Reflect.get(target, prop, receiver);
						if (oldValue !== value) {
							result = Reflect.set(target, prop, value, receiver);
							value = Reflect.get(target, prop, receiver);
							if (result && oldValue !== value) {
								observers.dispatch(prop, value);
							}
						}
					}
					return result;
				}
			});
			observablesMap.set(obj, proxy);
		}
		return proxy;
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
		static resolve(expr, context, writer) {
			let match = expr.trim().match(/^([a-z]+):/);
			if (match && Tales[match[1]]) {
				return Tales[match[1]](expr, context, writer);
			}
			return Tales.path(expr, context, writer) || Tales.string(expr);
		}
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
			expr = expr.trim().match(/^(?:'([^']*)'|"([^"]*)"|string:(.*))$/) || [];
			expr[0] = null;
			return expr.find(str => null != str);
		}

		static not(expr, context) {
			let match = expr.trim().match(/^not:(.+)$/);
			if (match) {
				let fn = Tales.resolve(match[1], context);
				let result = () => !fn();
				result.context = fn.context;
				result.prop = fn.prop;
				return result;
			}
		}

		static path(expr, context, writer) {
			let match = expr.trim().match(/^(?:path:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
			if (match) {
				if (!isObserved(context)) {
					throw new TalError(`context '${expr}' can't be observed`);
				}
				match = match[1].trim().split("/");
				let i = 0, l = match.length - 1;
				for (; i < l; ++i) {
					if (!(match[i] in context)) {
						console.error(`Path '${expr}' part '${match[i]}' not found`, context);
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
				let fn = context[match[l]];
				if (!isFunction(fn)) {
					fn = (writer ? value => context[match[l]] = value : () => context[match[l]]);
				}
				fn = fn.bind(context);
				let result = value => {
					try {
						return fn(value);
					} catch (e) {
						console.error(e, {expr, context});
					}
				};
				result.context = context;
				result.prop = match[l];
				return result;
			}
		}

		static js(expr, context) {
			expr = expr.trim().match(/^js:(.*)$/);
			if (expr) {
				let fn = new Function("$context", `with($context){return ${expr[1]}}`);
				return () => {
					try {
						return fn(context);
					} catch (e) {
						console.error(e, {expr, context});
					}
				};
			}
		}
	}

	function observeArray(obj, parent/*, deep*/)
	{
	//	if (!Array.isArray(obj) && !(obj instanceof Set) && !(obj instanceof Map)) {
		if (!Array.isArray(obj)) {
			throw new TalError("Not an Array");
		}
		let proxy = observablesMap.get(obj);
		if (!proxy) {
			if (!parent || !parent[IS_PROXY]) {
				parent = null;
			}
			obj = observeObject(obj);
			proxy = new Proxy(obj, {
				get(target, prop, receiver) {
					switch (prop)
					{
					// Set
					case "clear":
						return () => {
							target.getObservers().dispatch(prop);
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
							target.getObservers().dispatch(prop, value);
							return value;
						};
					case "unshift":
					case "splice":
					case "push":
						return (...args) => {
							args = args.map(target => observeObject(target, proxy));
							let result = target[prop](...args);
							target.getObservers().dispatch(prop, args);
							return result;
						};
					}
					return Reflect.get(target, prop, receiver);
				},
				set(target, prop, value, receiver) {
					let result = true;
					if (!detectingObservables) {
						if (isFinite(prop)) {
							value = observeObject(value, proxy);
							let oldValue = Reflect.get(target, prop, receiver);
							if (oldValue !== value) {
								result = Reflect.set(target, prop, value, receiver);
								value = Reflect.get(target, prop, receiver);
								if (result && oldValue !== value) {
									target.getObservers().dispatch("set", {index:prop, value});
								}
							}
						} else {
							target.getObservers().dispatch(prop, value);
						}
					}
					return result;
				}
			});

			obj.forEach((item, index) => obj[index] = observeObject(item, proxy));

			observablesMap.set(obj, proxy);
		}
		return proxy;
	}

	function observePrimitive(prim, parent/*, deep*/)
	{
		if (prim[IS_PROXY]) {
			return prim;
		}

		if (!['string','number','boolean','bigint'].includes(typeof prim)
	//	 	&& null !== prim
	//	 	&& undefined !== prim
	//	 	&& !(prim instanceof String)
	//		&& !(prim instanceof Number)
	//		&& !(prim instanceof Boolean)
	//		&& !(prim instanceof BigInt)
		) {
			throw new TalError("Not a primitive");
		}

		if (!parent || !parent[IS_PROXY]) {
			parent = null;
		}

		const obj = nullObject();
		obj.value = prim;

		const proxy = new Proxy(obj, {
			get(target, prop) {
				switch (prop)
				{
					case IS_PROXY: return 1;
					/**
					* TAL built-in Names
					* https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#built-in-names
					*/
					case "root":
						return parent ? parent[prop] : proxy;
					case "context":
						return proxy;
				}
				const prim = Reflect.get(target, 'value');
				const value = prim[prop];
				if (null != value) {
					return isFunction(value) ? value.bind(prim) : value;
				}
				if (typeof prop !== 'symbol') {
					if (parent) {
						return parent[prop];
					}
					console.error(`Undefined property '${prop}' in current scope`);
				}

			}
		});

		return proxy;
	}

	function observeFunction(fn, parent)
	{
		if (!isFunction(fn)) {
			throw new TalError("Not a Function");
		}
		let proxy = observablesMap.get(fn);
		if (!proxy) {
			if (!parent || !parent[IS_PROXY]) {
				parent = null;
			}
			const observers = new Observers;
			proxy = new Proxy(fn, {
				get(target, prop, receiver) {
					if (isContextProp(prop)) {
						return contextGetter(proxy, target, prop, observers, parent);
					}
					return Reflect.get(target, prop, receiver);
				},
				has(target, prop) {
					return isContextProp(prop) || Reflect.has(target, prop);
					// || (parent && prop in parent)
				},
				set(target, prop, value, receiver) {
					if (detectingObservables) {
						return true;
					}
					if (isContextProp(prop)) {
						throw new TalError(`${prop} can't be initialized, it is internal`);
					}
					let oldValue = Reflect.get(target, prop, receiver),
						result = Reflect.set(target, prop, value, receiver);
					value = Reflect.get(target, prop, receiver);
					if (result && oldValue !== value) {
						observers.dispatch(prop, value);
					}
					return result;
				},
				apply(target, thisArg, argumentsList) {
					return Reflect.apply(target, thisArg, argumentsList);
				}
			});
			observablesMap.set(fn, proxy);
		}
		return proxy;
	/*
				// A trap for the new operator.
				construct() {
				},
				// A trap for Object.defineProperty.
				defineProperty() {
				},
				// A trap for the delete operator.
				deleteProperty() {
				},
				// A trap for Object.getOwnPropertyDescriptor.
				getOwnPropertyDescriptor() {
				},
				// A trap for Object.getPrototypeOf.
				getPrototypeOf() {
				},
				// A trap for the in operator.
				has() {
				},
				// A trap for Object.isExtensible.
				isExtensible() {
				},
				// A trap for Object.getOwnPropertyNames and Object.getOwnPropertySymbols.
				ownKeys() {
				},
				// A trap for Object.preventExtensions.
				preventExtensions() {
				},
				// A trap for Object.setPrototypeOf.
				setPrototypeOf() {
				},
	*/
	}

	function observeType(item, parent/*, deep*/)
	{
		let type = (null != item) ? typeof item : "null";
		switch (type)
		{
		// primitives
		case "undefined":
		case "null":
		case "bigint":
		case "boolean":
		case "number":
		case "string":
		case "symbol":
			return observePrimitive(item, parent/*, deep*/);
		}

		let observable = observablesMap.get(item);
		if (observable) {
			return observable;
		}

		if ("function" === type) {
			observable = observeFunction(item, parent/*, deep*/);
		} else if (Array.isArray(item)) {
			observable = observeArray(item, parent/*, deep*/);
		} else if ("object" === type) {
			observable = observeObject(item, parent/*, deep*/);
		}

		observablesMap.set(item, observable);

		return observable;
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
		},
		resolveTales = (expression, context) => Tales.resolve(expression, context),
		getterValue = getter => isFunction(getter) ? getter() : getter,
		processDetectedObservables = (el, fn) =>
			getDetectedObservables().forEach(([obj, prop]) =>
				observe(el, obj, prop, fn)
			);

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
				let text, getter = resolveTales(attr[2], context);
				if (getter) {
					detectObservables();
					text = getterValue(getter);
					processDetectedObservables(el, value => {
						value = getterValue(getter);
						if (false === value || null == value) {
							el.removeAttribute(attr[1], value);
						} else {
							el.setAttribute(attr[1], value);
						}
						el[attr[1]] = value;
					});
				}
				if (false === text || null == text) {
					el.removeAttribute(attr[1], text);
				} else {
					el.setAttribute(attr[1], text);
				}
			});
		}

		/**
		 * tal:content - replace the content of an element.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#content-replace-the-content-of-an-element
		 */
		static content(el, value, context) {
			let match = value.trim().match(/^(?:(text|structure)\s+)?(.+)$/),
				expression = match[2],
				text, getter = resolveTales(expression, context),
				mode = "structure" === match[1] ? "innerHTML" : "textContent";
			if (getter) {
				detectObservables();
				text = getterValue(getter);
				processDetectedObservables(el, () => el[mode] = getterValue(getter));
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
				text, getter = resolveTales(expression, context),
				fn;
			if (isFunction(getter)) {
				let node = el.ownerDocument.createTextNode("");
				el.replaceWith(node);
				if ("structure" === match[1]) {
					// Because the Element is replaced, it is gone
					// So we prepend an empty TextNode as reference
					let frag;
					// Now we can put/replace the HTML after the empty TextNode
					fn = string => {
						frag && frag.forEach(el => el.remove());
						const template = document.createElement("template");
						template.innerHTML = string.trim();
						frag = Array.from(template.content.childNodes);
						node.after(template.content);
					};
				} else {
					fn = string => node.nodeValue = string;
				}
				detectObservables();
				text = getterValue(getter);
				processDetectedObservables(el, () => fn(getterValue(getter)));
			} else if ("structure" === match[1]) {
				fn = string => el.outerHTML = string;
			} else {
				fn = string => el.replaceWith(string);
			}
			fn(text);
		}

		/**
		 * tal:define - define variables.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#define-define-variables
		 */
		static define(el, expression, context) {
			expression.split(";").forEach(def => {
				def = def.trim().match(/^(?:(local|global)\s+)?([^\s]+)\s+(.+)$/);
				let getter = resolveTales(def[3], context),
					text = getter ? getterValue(getter) : "",
					prop = getter.prop || def[2];
				context = getter.context || context;
				if ("global" === def[1]) {
					// TODO: get root context
					context[prop] = text;
				} else if (prop in context && isFunction(context[prop])) {
					context[prop](text, el);
				} else {
					context[prop] = text;
				}
			});
		}

		/**
		 * tal:condition - test conditions.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#condition-conditionally-insert-or-remove-an-element
		 */
		static condition(el, expression, context, parser) {
			let target = el.ownerDocument.createTextNode(""),
				text, getter = resolveTales(expression, context),
				node, fn = value => {
					node && removeNode(node);
					if (value) {
						node = el.cloneNode(true);
						parser(node, context);
						target.after(node);
					}
				};
			el.replaceWith(target);
			if (getter) {
				detectObservables();
				text = getterValue(getter);
				processDetectedObservables(el, () => fn(getterValue(getter)));
			}
			fn(text);
			return {
				hasChild: node => el.contains(node)
			}
		}

		/**
		 * tal:repeat - repeat an element.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#repeat-repeat-an-element
		 * This is very complex as it creates a deeper context
		 * Especially when there"s a repeat inside a repeat, like:
		 * <div tal:repeat="item context/cart">
		 *     <div tal:repeat="prop item/props">
		 *         <input tal:attributes="name "item[${item/id}][${prop/id}]""/>
		 *     </div>
		 * </div>
		 */
		static repeat(el, expression, context, parser) {
			const match = expression.trim().match(/^([^\s]+)\s+(.+)$/),
				items = [],
				target = el.ownerDocument.createTextNode(""),
				createItem = value => {
					let node = el.cloneNode(true), subContext;
					try {
						value = observeType(value);
					} catch (e) {
						console.error(e);
					}
					if ('context' == match[1] && isObserved(value)) {
						subContext = value;
					} else {
						subContext = observeObject(nullObject(), context);
						subContext[match[1]] = value;
					}
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

			let getter = Tales.path(match[2], context);
			let array = getter ? getterValue(getter) : null;
			if (array) {
				if (!isObserved(array)) {
					array = observeArray(array, context);
					getter.context[getter.prop] = array;
				}
				observe(el, array, "clear", () => {
					items.forEach(removeNode);
					items.length = 0;
				});
				observe(el, array, "shift", () => removeNode(items.shift()));
				observe(el, array, "unshift", (args) => {
					let i = args.length;
					while (i--) items.add(args[i], 0);
		//			args.forEach((item, i) => items.add(item, i));
				});
				observe(el, array, "splice", (args) => {
					if (0 < args[1]) {
						let i = Math.min(items.length, args[0] + args[1]);
						while (args[0] < i--) removeNode(items[i]);
						items.splice(args[0], args[1]);
					}
					for (let i = 2; i < args.length; ++i) {
						items.add(args[i], args[0]);
					}
				});
				observe(el, array, "push", (args) => {
					args.forEach(item => items.add(item));
				});
				observe(el, array, "length", length => {
					while (items.length > length) removeNode(items.pop());
				});
				observe(el, array, "set", item => {
					if (item.index in items) {
						let node = createItem(item.value);
						items[item.index].replaceWith(node);
						items[item.index] = node;
					} else {
						items.add(item.value, item.index);
					}
				});

				// Fill the list with current repeat values
				array.forEach((value, pos) => items.add(value, pos));
			} else {
				console.error(`Path '${match[2]}' for repeat not found`, context);
			}

			return items;
		}

		/**
		 * tal:omit-tag - remove an element, leaving the content of the element.
		 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#omit-tag-remove-an-element-leaving-its-contents
		 */
		static ["omit-tag"](el, expression, context) {
			if (expression) {
				let getter = resolveTales(expression, context);
				if (getter) {
	//				detectObservables();
					expression = getterValue(getter);
	//				processDetectedObservables(el, () => fn(getterValue(getter)));
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

		static ["on-error"](el, expression, context) {
			Statements.content(el, expression, context);
		}
	*/

		/**
		 * tal:listen - Observe native elements using addEventListener for two-way bindings
		 * like: HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLDetailsElement
		 */
		static listen(el, value, context) {
			if (el.addEventListener) {
	//			value.matchAll(/([^\s;]+)\s+([^;]+)/);
				value.split(";").forEach(attr => {
					if (attr = attr.trim().match(/^([^\s]+)\s+(.+)$/)) {
						const setter = Tales.path(attr[2], context, true);
						if (setter) {
							if ("value" === attr[1] || "checked" === attr[1]) {
								el.addEventListener("change", () => setter(el[attr[1]]));
							} else if ("input" === attr[1]) {
								el.addEventListener(attr[1], () => setter(el.value));
							} else if ("toggle" === attr[1]) {
								el.addEventListener(attr[1], event => setter(event.newState));
							} else {
								el.addEventListener(attr[1], setter);
							}
						}
					}
				});
			}
		}

		static with(el, expression, context, parser) {
			let target = el.ownerDocument.createTextNode(""),
				text, getter = resolveTales(expression, context),
				node, fn = value => {
					node && removeNode(node);
					if (value) {
						node = el.cloneNode(true);
						parser(node, value);
						target.after(node);
					}
				};
			el.replaceWith(target);
			if (getter) {
				detectObservables();
				getterValue(getter);
				processDetectedObservables(el, () => fn(getterValue(getter)));
			}
			fn(text);
			return {
				hasChild: node => el.contains(node)
			}
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

		parse.converters.forEach(fn => fn(template, context));

		let skippers = [];
		// querySelectorAll result is a static (not live) NodeList
		// Using a live list we should use template.children
		(template instanceof HTMLTemplateElement
			? template.content.querySelectorAll(Statements.cssQuery)
			// template root node must be prepended as well
			: [template, ...template.querySelectorAll(Statements.cssQuery)]
		).forEach(el => {
			if (skippers.some(parent => parent.hasChild(el))) {
				// Skip this element as it is handled by Statements.repeat or Statements.condition
				return;
			}

			let value = popAttribute(el, "tal:define");
			if (null != value) {
				Statements.define(el, value, context);
			}

	/*
			let value = popAttribute(el, "tal:switch");
			if (null != value) {
				Statements.switch(el, value, context);
			}
	*/

			value = popAttribute(el, "tal:with");
			if (null != value) {
				skippers.push(Statements.with(el, value, context, parse));
			} else if (null != (value = popAttribute(el, "tal:condition"))) {
				skippers.push(Statements.condition(el, value, context, parse));
			}

			value = popAttribute(el, "tal:repeat");
			if (null != value) {
				skippers.push(Statements.repeat(el, value, context, parse));
				return;
			}

	/*
			let value = popAttribute(el, "tal:case");
			if (null != value) {
				Statements.case(el, value, context);
			}
	*/

			value = popAttribute(el, "tal:content");
			let skip = false;
			if (null != value) {
				Statements.content(el, value, context);
			} else if (null != (value = popAttribute(el, "tal:replace"))) {
				Statements.replace(el, value, context);
				skip = true;
			}

			if (!skip) {
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

	/*
			https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#on-error-handle-errors
			let value = popAttribute(el, "tal:on-error");
			if (null != value) {
				Statements["on-error"](el, value, context);
			}
	*/

			el.getAttributeNames().forEach(name => name.startsWith("tal:") && el.removeAttribute(name));
		});
		return context;
	}

	parse.converters = [
		// Convert KnockoutJS data-bind
	// 	koConvertBindings
	];

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
		observe: observeType,
		observeObject,
		observeArray,
	//	observePrimitive,
	//	observeProperty,
		TalError,
		TALES: Tales
	};

})();
