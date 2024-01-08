import { isFunction, nullObject } from 'common';
import { Tales } from 'tales';
import { observeObject, observeArrayObject, detectObservables, getDetectedObservables } from 'observers/object';

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
	resolveTales = (expression, context) => {
		let fn = Tales.js(expression, context);
		if (!fn) {
			fn = Tales.path(expression, context);
			if (!fn) {
				console.error(`Path '${expression}' not found`, context);
			}
		}
		return fn;
	},
	processDetectedObservables = (el, fn) =>
		getDetectedObservables().forEach(([obj, prop]) =>
			observe(el, obj, prop, fn)
		);

export class Statements
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
				let getter = resolveTales(attr[2], context);
				if (getter) {
					detectObservables();
					text = getter(context);
					processDetectedObservables(el, value => {
						value = getter(context);
						el.setAttribute(attr[1], value);
						el[attr[1]] = value;
					});
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
			let getter = resolveTales(expression, context);
			if (getter) {
				detectObservables();
				text = getter(context);
				processDetectedObservables(el, () => el[mode] = getter(context));
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
			let getter = resolveTales(expression, context);
			if (getter) {
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
				detectObservables();
				text = getter(context);
				processDetectedObservables(el, () => fn(getter(context)));
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
			let text = Tales.string(def[3]);
			if (null == text) {
				let getter = resolveTales(expression, context);
				if (getter) {
					text = getter(context);
				}
			}
			if ("global" === def[1]) {
				// TODO: get root context
				context[def[2]] = text;
			} else {
				context[def[2]] = text;
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
			let getter = resolveTales(expression, context);
			if (getter) {
				detectObservables();
				text = getter(context);
				processDetectedObservables(el, () => fn(getter(context)));
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

		context[match[2]] = observable;

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
			let getter = resolveTales(expression, context);
			if (getter) {
//				detectObservables();
				expression = getter(context);
//				processDetectedObservables(el, () => fn(getter(context)));
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
					const setter = Tales.path(attr[2], context, true);
					if (setter) {
						if ("value" === attr[1] || "checked" === attr[1]) {
							el.addEventListener("change", () => setter(el[attr[1]]));
						}
						if ("input" === attr[1]) {
							el.addEventListener(attr[1], () => setter(el.value));
						}
						if ("toggle" === attr[1]) {
							el.addEventListener(attr[1], event => setter(event.newState));
						}
						if ("click" === attr[1]) {
							el.addEventListener(attr[1], setter);
						}
					}
				}
			}
		});
	}
}

Statements.methods = Object.getOwnPropertyNames(Statements).filter(n => isFunction(Statements[n]));
Statements.cssQuery = "[tal\\:" + Statements.methods.join("],[tal\\:") + "]";
//Statements.cssQuery = "[data-tal-" + Statements.methods.join("],[data-tal-") + "]";
