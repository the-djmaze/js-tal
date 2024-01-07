(function () {
	'use strict';

	const isFunction = val => typeof val === 'function';
	const isObject = val => typeof val === 'object';
	const IS_PROXY = Symbol('proxied');

	// Vue trigger
	function dispatch(callbacks, prop, value)
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
	}

	class Observers extends Map {

		add(property, callback) {
			this.has(property) || this.set(property, new Set);
			this.get(property).add(callback);
		}

		remove(property, callback) {
			this.has(property) && this.get(property).delete(callback);
		}

		dispatch(property, value) {
			return dispatch(this.get(property), property, value);
		}
	}

	const proxyMap = new WeakMap();
	function observeObject(obj/*, deep*/)
	{
		if (!isObject(obj) || obj[IS_PROXY]) {
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
			obj[IS_PROXY] = 1;
			const observers = new Observers;
			// Vue watch(), Knockout subscribe()
			obj.observe = (property, callback) => {
	//			callback(obj[property], property);
				observers.add(property, callback);
			};
			obj.unobserve = (property, callback) => {
				observers.remove(property, callback);
			};
			obj.clearObservers = () => {
				observers.clear();
			};
			obj.refreshObservers = () => {
				observers.forEach((callbacks, prop) => dispatch(callbacks, prop, obj[prop]));
				// Refresh children, does not work
	//			Object.values(obj).forEach(value => value && value.refreshObservers && value.refreshObservers());
			};
			// Vue computed(), Knockout computed()
			obj.defineComputed = function(name, fn, observe) {
				Object.defineProperty(this, name, { get: fn });
				observe && observe.forEach(n => this.observe(n, () => observers.dispatch(name, fn())));
			};

			proxy = new Proxy(obj, {
				set: (target, property, value, receiver) => {
					let oldValue = target[property],
						result = Reflect.set(target, property, value, receiver);
					if (result && oldValue !== target[property]) {
						observers.dispatch(property, target[property]);
					}
					return result;
				}
			});
			proxyMap.set(obj, proxy);
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
			expr = expr.trim().match(/^(?:path:)?([a-zA-Z][a-zA-Z0-9_]*(\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
			if (expr) {
				expr = expr[1].trim().split('/');
				let i = 0, l = expr.length - 1;
				context = observeObject(context);
				for (; i < l; ++i) {
					if (!(expr[i] in context)) {
						return;
					}
					context[expr[i]] = observeObject(context[expr[i]]);
					context = context[expr[i]];
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
			value.split(';').forEach(attr => {
				attr = attr.trim().match(/^([^\s]+)\s+(.+)$/);
				let text = Tales.string(attr[2]);
				if (null != text) {
					el.setAttribute(attr[1], text);
				} else {
					// TODO: complex tales
					context.observe(attr[2], value => {
						el.setAttribute(attr[1], value);
						el[attr[1]] = value;
					});
					el.setAttribute(attr[1], context[attr[2]]);
				}
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
				mode = 'structure' === value[1] ? 'innerHTML' : 'textContent';
			if (null == text) {
				let path = Tales.path(context, expression);
				if (path) {
					path[0].observe(path[1], value => el[mode] = value);
					text = path[0][path[1]];
				} else {
					context.observe(value[2], value => el[mode] = value);
					text = context[value[2]];
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
			if ('structure' === value[1]) {
				if (null == text) {
					// Because the Element is replaced, it is gone
					// So we prepend an empty TextNode as reference
					let node = document.createTextNode(''), frag;
					el.replaceWith(node);
					// Now we can put/replace the HTML after the empty TextNode
					const setHTML = string => {
						frag && frag.forEach(el => el.remove());
						const template = document.createElement('template');
						template.innerHTML = string.trim();
						frag = Array.from(template.content.childNodes);
						node.after(template.content);
					};
					setHTML(context[value[2]]);
					context.observe(value[2], value => setHTML(value));
				} else {
					el.outerHTML = text;
				}
			} else if (null == text) {
				let node = document.createTextNode(context[value[2]]);
				el.replaceWith(node);
				context.observe(value[2], value => node.nodeValue = value);
			} else {
				el.replaceWith(text);
			}
		}

		/**
		 * tal:define - define variables.
		 */
		static define(/*el, value, context*/) {
		}

		/**
		 * tal:condition - test conditions.
		 */
		static condition(/*el, value, context*/) {
		}

		/**
		 * tal:repeat - repeat an element.
		 */
		static repeat(/*el, value, context*/) {
		}

		/**
		 * tal:omit-tag - remove an element, leaving the content of the element.
		 */
		static ['omit-tag'](/*el, value, context*/) {
		}

	/*
		tal:switch - define a switch condition
		tal:case - include element only if expression is equal to parent switch
		tal:on-error - handle errors.
	*/
	}

	Statements.methods = Object.getOwnPropertyNames(Statements).filter(n => isFunction(Statements[n]));
	Statements.cssQuery = '[tal\\:' + Statements.methods.join('],[tal\\:') + ']';

	function popAttribute(el, name)
	{
		const value = el.getAttribute(name);
		el.removeAttribute(name);
		return value;
	}

	// context = observeObject(obj)
	// TalContext
	function parse(template, obj)
	{
		if (typeof v === 'string') {
			template = document.getElementById(template);
		}
		if (!(template instanceof Element)) {
			throw new Error('template not an instance of Element');
		}
	/*
		TAL:
			'define'
			'condition'  // ko if:
			'repeat'     // ko foreach:
			'content'
			'replace'
			'attributes' // ko attr:
			'omit-tag'
					 // ko template
	*/
		let elements = template.querySelectorAll(Statements.cssQuery);
		if (elements.length) {
			let context = observeObject(obj),
				repeat, repeaters = [];
			elements.forEach(el => {
				if (repeat && !repeat.node.contains(el)) {
					repeat = repeaters.pop();
				}

				let value = popAttribute(el, 'tal:define');
				if (null != value) {
					value.split(';').forEach(def => {
						def = def.trim().match(/^(?:(local|global)\s+)?([^\s]+)\s+(.+)$/);
						def[3] = Tales.string(def[3]) || def[3];
						if ('global' === def[1]) {
							// TODO: get root context
							context[def[2]] = def[3];
						} else {
							context[def[2]] = def[3];
						}
					});
				}

				let expression = popAttribute(el, 'tal:condition');
				if (null != expression) {
					context.observe(expression, value => el.hidden = !value);
				}

				/**
				 * This is very complex as it creates a deeper context
				 * Especially when there's a repeat inside a repeat, like:
				 * <div tal:repeat="item context/cart">
				 *     <div tal:repeat="prop item/props">
				 *         <input tal:attributes="name 'item[${item/id}][${prop/id}]'"/>
				 *     </div>
				 * </div>
				 */
				value = popAttribute(el, 'tal:repeat');
				if (null != value) {
					if (null != el.getAttribute('tal:content')) {
						el.textContent = '';
					}
					value = value.trim().match(/^([^\s]+)\s+(.+)$/);
	//console.dir({value:value});
	//				context = TalContext;
	//				context = observeObject(context[repeater.prop]);
	//				contextTree.push(context);
					let items = [];
					items.name = value[1];
					items.prop = value[2];
					items.node = el.cloneNode(true);
					items.end = el;
					items.add = function(value, pos) {
						let item = this.node.cloneNode(true);
						let expression = popAttribute(item, 'tal:content');
						if (null != expression) {
							try {
								value = observeObject(value);
							} catch (err) {
								// TODO: observe scalar array item
								console.error(err);
							}
							Statements.content(item, expression, {[this.name]:value});
						}
	/*
						let tal = item.querySelectorAll('[tal\\:define],[tal\\:condition],[tal\\:repeat],[tal\\:content],[tal\\:replace],[tal\\:attributes],[tal\\:omit-tag]');
						if (tal.length) {
							tal.forEach(el => {
								expression = el.getAttribute('tal:content');
								if (null != expression) {
									el.textContent = value;
									el.removeAttribute('tal:content');
								}
							});
						}
	*/
						if (isFinite(pos) && pos < this.length) {
							if (0 == pos) {
								this[0].before(item);
								this.unshift(item);
							} else {
								this[pos].before(item);
								this.splice(pos, 0, item);
							}
						} else {
							this.end.before(item);
	//						this.length ? this[this.length-1].after(item) : this.parent.insertBefore(item, this.end);
							this.push(item);
						}
					};
					['content','replace','attributes','omit-tag'].forEach(a => el.removeAttribute('tal:'+a));

					// We can't remove element as we need a reference for insertBefore
	/*
					let tpl = document.createElement('template');
					el.before(tpl);
					el.remove();
					tpl.content.appendChild(el);
	*/
					el.hidden = true;
					el.style.display = "none";

					context[items.prop] = new Proxy(context[items.prop], {
						get: (target, prop/*, receiver*/) => {
							if (prop in target) {
								switch (prop)
								{
								// Set
								case 'clear':
									return () => {
										items.forEach(item => item.remove());
										items.length = 0;
										return target.clear();
									};
								case 'add':
								case 'delete':
									throw new Error('Set.prototype.'+prop+'() not supported');
								// Array mutator methods
								case 'copyWithin':
								case 'fill':
								case 'reverse':
								case 'sort':
									throw new Error('Array.prototype.'+prop+'() not supported');
								case 'shift':
	//							case 'pop':
									return () => {
										let item = items[prop]();
										item && item.remove();
										return target[prop]();
									};
								case 'unshift':
									return (...args) => {
										let i = args.length;
										while (i--) items.add(args[i], 0);
	//									args.forEach((item, i) => items.add(item, i));
										return target.unshift(...args);
									};
								case 'splice':
									return (...args) => {
										if (0 < args[1]) {
											let i = Math.min(items.length, args[0] + args[1]);
											while (args[0] < i--) items[i].remove();
											items.splice(args[0], args[1]);
										}
										for (let i = 2; i < args.length; ++i) {
											items.add(args[i], args[0]);
										}
										return target.splice(...args);
									};
	/*
								case 'push':
									return (...args) => {
										args.forEach(item => items.add(item));
										return target.push(...args);
									};
	*/
								}
								return target[prop];
	//							let value = Reflect.get(target, prop, receiver);
	//							return isFunction(value) ? value.bind(target) : value;
							}
						},
						set: (target, prop, value) => {
							if (target[prop] !== value) {
								target[prop] = value;
								if ('length' === prop) {
									while (items.length > value) {
										items.pop().remove();
									}
								} else if (isFinite(prop)) {
									if (prop in items) {
										items[prop].textContent = value;
									} else {
										items.add(value);
									}
								}
							}
							return true;
						}
					});

					repeat = items;
					repeaters.push(repeat);

					// Fill the list with current repeat values
					context[items.prop].forEach(value => items.add(value));
				}

				value = popAttribute(el, 'tal:content');
				if (null != value) {
					Statements.content(el, value, context);
				} else if (null != (value = popAttribute(el, 'tal:replace'))) {
					Statements.replace(el, value, context);
				}

				value = popAttribute(el, 'tal:attributes');
				if (null != value) {
					Statements.attributes(el, value, context);
				}

				/**
				 * Observe native elements
				 * like: HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLDetailsElement
				 */
				value = popAttribute(el, 'tal:listen');
				if (null != value) {
	//				value.matchAll(/([^\s;]+)\s+([^;]+)/);
					value.split(';').forEach(attr => {
						if (attr = attr.trim().match(/^([^\s]+)\s+(.+)$/)) {
							if (!Tales.string(attr[2]) && el instanceof HTMLElement) {
								const path = Tales.path(context, attr[2]),
									ctx = path ? path[0] : context,
									prop = path ? path[1] : attr[2];
								if ('value' === attr[1] || 'checked' === attr[1]) {
									el.addEventListener('change', () => ctx[prop] = el[attr[1]]);
								}
								if ('input' === attr[1]) {
									el.addEventListener(attr[1], () => ctx[prop] = el.value);
								}
								if ('toggle' === attr[1]) {
									el.addEventListener(attr[1], event => ctx[prop] = event.newState);
								}
							}
						}
					});
				}

				value = popAttribute(el, 'tal:omit-tag');
				if (value) {
					el.replaceWith(el.children);
				}
			});

			return context;
		}
		return obj;
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
		observeProperty
	};

})();
