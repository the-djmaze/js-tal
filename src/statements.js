import { isFunction, nullObject } from 'common';
import { Tales } from 'tales';
import { observeObject, observeArrayObject } from 'observers/object';

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
