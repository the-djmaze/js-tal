import { isFunction, TalError } from 'common';
import { isObservable } from 'observers';
import { observeObject } from 'observers/object';

/**
 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#tales-overview
 */
export class Tales
{
	static resolve(expr, context, writer) {
		let match = expr.trim().match(/^([a-z]+):(.+)/);
		if (match && Tales[match[1]]) {
			return Tales[match[1]](match[2], context, writer);
		}
		return Tales.path(expr, context, writer) || Tales.string(expr);
	}

	/**
	 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#tales-string-expressions
	 */
	static string(expr) {
		expr = expr.trim().match(/^(?:'([^']*)'|"([^"]*)"|string:(.*))$/) || [];
		expr[0] = null;
		return expr.find(str => null != str);
	}

	/**
	 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#tales-not-expressions
	 */
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

	/**
	 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#tales-exists-expressions
	 */
	static exists(expr, context) {
		let match = expr.trim().match(/^(?:exists:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
		if (match) {
			if (!isObservable(context)) {
				throw new TalError(`context '${expr}' can't be observed`);
			}
			match = match[1].trim().split("/");
			let i = 0, l = match.length;
			for (; i < l; ++i) {
				if (!(match[i] in context)) {
					return false;
				}
				context = context[match[i]];
			}
			return !!context;
		}
		return false;
	}

	/**
	 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#tales-path-expressions
	 */
	static path(expr, context, writer) {
		let match = expr.trim().match(/^(?:path:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
		if (match) {
			if (!isObservable(context)) {
				throw new TalError(`context '${expr}' can't be observed`);
			}
			match = match[1].trim().split("/");
			let i = 0, l = match.length - 1;
			for (; i < l; ++i) {
				if (!(match[i] in context)) {
					console.error(`Path '${expr}' part ${i} not found`, context);
					return;
				}
				let newContext = context[match[i]];
				if (!isObservable(newContext)) {
					newContext = observeObject(newContext, context);
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

	/**
	 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#tales-nocall-expressions
	 */
	static nocall(expr) {
		let match = expr.trim().match(/^(?:nocall:)?([a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_]*)*)$/);
		if (match) {
			throw new TalError(`Tales nocall: is not supported`);
		}
	}

	static js(expr, context) {
		expr = expr.trim().match(/^js:(.*)$/);
		if (expr) try {
			let fn = new Function("$context", `with($context){return ${expr[1]}}`)
			return () => {
				try {
					return fn(context);
				} catch (e) {
					console.error(e, {expr, context});
				}
			};
		} catch (e) {
			console.error(e, {expr, context});
		}
	}
}
