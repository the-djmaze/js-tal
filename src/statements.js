import { isFunction } from 'common';
import { Tales } from 'tales';

export class Statements
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
