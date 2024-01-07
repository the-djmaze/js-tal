import { observeObject } from 'observers/object';
import { Tales } from 'tales';
import { Statements } from 'statements';

function popAttribute(el, name)
{
	const value = el.getAttribute(name);
	el.removeAttribute(name);
	return value;
}

// context = observeObject(obj)
// TalContext
export function parse(template, obj)
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
