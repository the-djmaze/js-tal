import { observeObject } from 'observers/object';
import { isFunction, isObserved, TalError } from 'common';

/**
 * This can be very complex, like:
 * <div tal:repeat="item context/cart">
 *     <div tal:repeat="prop item/props">
 *         <input tal:attributes="name 'item[${item/id}][${prop/id}]'"/>
 *     </div>
 * </div>
 */
export class Tales
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
			}
			result.context = context;
			result.prop = match[l];
			return result;
		}
	}

	static js(expr, context) {
		expr = expr.trim().match(/^js:(.*)$/);
		if (expr) {
			let fn = new Function("$context", `with($context){return ${expr[1]}}`)
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
