import { isFunction, nullObject } from 'common';
import { Tales } from 'tales';
import { isObserved, detectObservables, getDetectedObservables } from 'observers';
import { observeObject } from 'observers/object';
import { observeArray } from 'observers/array';
import { observeType } from 'observers/type';

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
