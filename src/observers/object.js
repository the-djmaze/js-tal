import { isObject, isFunction, TalError } from 'common';
import {
	observablesMap, detectingObservables,
	OBSERVABLE, Observers, isContextProp, contextGetter
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
		if (!parent || !parent[OBSERVABLE]) {
			parent = null;
		}
		const observers = new Observers;
		proxy = new Proxy(obj, {
			get(target, prop, receiver) {
				let result = contextGetter(proxy, target, prop, observers, parent);
				if (undefined === result) {
					if (Reflect.has(target, prop)) {
						if (detectingObservables) {
							detectingObservables.push([proxy, prop]);
						}
						result = Reflect.get(target, prop, receiver);
						if (isFunction(result)) {
							result = result.bind(proxy);
						}
					}
					if (typeof prop !== 'symbol') {
						if (parent) {
							result = parent[prop];
						} else {
							console.error(`Undefined property '${prop}' in current scope`);
						}
					}
				}
				return result;
			},
			has(target, prop) {
				return isContextProp(prop) || Reflect.has(target, prop);
				// || (parent && prop in parent)
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
			},
			deleteProperty(target, prop) {
				Reflect.has(target, prop) && observers.delete(prop);
			}
		});
		observablesMap.set(obj, proxy);
	}
	return proxy;
}
