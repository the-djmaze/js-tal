import { observeObject } from 'observers/object';

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
