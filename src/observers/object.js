import { isObject, isFunction, TalError } from 'common';
import {
	observablesMap, detectingObservables,
	IS_PROXY, Observers, isContextProp, contextGetter
} from 'observers';

export function observeObject(obj, parent/*, deep*/)
{
	if (!isObject(obj)) {
		return obj;
	}

	let proxy = observablesMap.get(obj);
	if (!proxy) {
/*
		// If deep doesn't evaluate to true, only a shallow proxy is created
		if (deep) {
			Object.entries(properties).forEach(([key,value]) => {
				if (isObject(value)) {
					if (Array.isArray(value)) {
						// Observe the array
					} else {
						// Observe the object
					}
				}
				this[key] = value
			});
	}
*/
		if (!parent || !parent[IS_PROXY]) {
			parent = null;
		}
		const observers = new Observers;
		proxy = new Proxy(obj, {
			get(target, prop, receiver) {
				if (isContextProp(prop)) {
					return contextGetter(proxy, target, prop, observers, parent);
				}
				if (Reflect.has(target, prop)) {
					if (detectingObservables) {
						detectingObservables.push([proxy, prop]);
					}
					let result = Reflect.get(target, prop, receiver);
					if (isFunction(result)) {
						result = result.bind(proxy);
					}
					return result;
				}
				if (typeof prop !== 'symbol') {
					if (parent) {
						return parent[prop];
					}
					console.error(`Undefined property '${prop}' in current scope`);
				}
			},
			set(target, prop, value, receiver) {
				let result = true;
				if (!detectingObservables) {
					if (isContextProp(prop)) {
						throw new TalError(`${prop} can't be initialized, it is internal`);
					}
					let oldValue = Reflect.get(target, prop, receiver);
					if (oldValue !== value) {
						result = Reflect.set(target, prop, value, receiver);
						value = Reflect.get(target, prop, receiver);
						if (result && oldValue !== value) {
							observers.dispatch(prop, value);
						}
					}
				}
				return result;
			}
		});
		observablesMap.set(obj, proxy);
	}
	return proxy;
}
