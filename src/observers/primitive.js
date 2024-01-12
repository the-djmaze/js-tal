import { isFunction, nullObject, TalError } from 'common';
import { OBSERVABLE } from 'observers';

export function observePrimitive(prim, parent/*, deep*/)
{
	if (prim[OBSERVABLE]) {
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

	if (!parent) {
		parent = null;
	} else if (!parent[OBSERVABLE]) {
		console.dir({parent});
		throw new TalError('parent is not observable');
	}

	const obj = nullObject();
	obj.value = prim;

	const proxy = new Proxy(obj, {
		get(target, prop) {
			switch (prop)
			{
				case OBSERVABLE: return 1;
				case "context":
					return context;
				case "parent":
					return parent;
				case "root":
					return parent ? parent[prop] : context;
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
				console.error(`Undefined property '${prop}' in current observePrimitive`, {target, parent});
			}

		}
	});

	return proxy;
}
