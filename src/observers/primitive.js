import { isFunction, nullObject, TalError } from 'common';
import { IS_PROXY } from 'observers';

export function observePrimitive(prim, parent/*, deep*/)
{
	if (prim[IS_PROXY]) {
		return prim;
	}

	if (!['string','number','boolean','bigint'].includes(typeof prim)
//	 	&& null !== prim
//	 	&& undefined !== prim
//	 	&& !(prim instanceof String)
//		&& !(prim instanceof Number)
//		&& !(prim instanceof Boolean)
//		&& !(prim instanceof BigInt)
	) {
		throw new TalError("Not a primitive");
	}

	if (!parent || !parent[IS_PROXY]) {
		parent = null;
	}

	const obj = nullObject();
	obj.value = prim;

	const proxy = new Proxy(obj, {
		get(target, prop) {
			switch (prop)
			{
				case IS_PROXY: return 1;
				/**
				* TAL built-in Names
				* https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#built-in-names
				*/
				case "root":
					return parent ? parent[prop] : proxy;
				case "context":
					return proxy;
			}
			const prim = Reflect.get(target, 'value');
			const value = prim[prop];
			if (null != value) {
				return isFunction(value) ? value.bind(prim) : value;
			}
			if (typeof prop !== 'symbol') {
				if (parent) {
					return parent[prop];
				}
				console.error(`Undefined property '${prop}' in current scope`);
			}

		}
	});

	return proxy;
}
