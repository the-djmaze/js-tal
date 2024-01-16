import { isDefined, isFunction, TalError } from "common";
import { isContextProp, contextGetter,
	detectingObservables, OBSERVABLE, Observers } from "observers";

export function observePrimitive(prim, parent/*, deep*/)
{
	if (null != prim && prim[OBSERVABLE]) {
		return prim;
	}

	if (!["string","number","boolean","bigint"].includes(typeof prim)
	 	&& null !== prim
//	 	&& isDefined(prim)
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
		throw new TalError("parent is not observable");
	}

	let value = prim;
	const observers = new Observers;
	const primitive = () => {};
	const observable = new Proxy(primitive, {
		get(target, prop, receiver) {
			let primitiveGet = contextGetter(observable, target, prop, observers, parent);
			if (!isDefined(primitiveGet)) {
				primitiveGet = Reflect.has(target, prop) ? Reflect.get(target, prop, receiver) : value?.[prop];
				if (isFunction(primitiveGet) && !primitiveGet[OBSERVABLE]) {
					return (...args) => primitiveGet.apply(target, args);
				}
			}
			return primitiveGet;
		},
		has(target, prop) {
			return isContextProp(prop) || Reflect.has(target, prop) || Reflect.has(value, prop);
			// || (parent && prop in parent)
		},
		set(target, prop, value, receiver) {
			if (isContextProp(prop)) {
				throw new TalError(`${prop} can't be initialized, it is internal`);
			}
			return Reflect.set(target, prop, value, receiver);
		},
		apply(target, thisArg, args) {
			if (args.length) {
				if (!detectingObservables && value != args[0]) {
					observers.dispatch("value.beforeChange", value);
					value = args[0];
					observers.dispatch("value", value);
				}
				return observable;
			}
			detectingObservables?.push([observable, "value"]);
			return value;
		},
		deleteProperty(target, prop) {
			Reflect.has(target, prop) && observers.delete(prop);
		}
	});

	return observable;
}
