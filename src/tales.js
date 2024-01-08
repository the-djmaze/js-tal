import { observeObject, isObserved } from 'observers/object';
import { TalError } from 'common';

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
