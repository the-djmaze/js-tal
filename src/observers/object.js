import { isDefined, isFunction, isObject, TalError } from 'common';
import {
	observablesMap, detectingObservables,
	OBSERVABLE, Observers, isContextProp, contextGetter
} from 'observers';

export function observeObject(obj, parent/*, deep*/)
{
	if (!isObject(obj)) {
		return obj;
	}

	let observable = observablesMap.get(obj);
	if (!observable) {
/*
		// If deep doesn't evaluate to true, only a shallow proxy is created
		if (deep) {
			Object.entries(properties).forEach(([key,value]) => {
				if (isObject(value)) {
					if (isArray(value)) {
						// Observe the array
					} else {
						// Observe the object
					}
				}
				this[key] = value
			});
	}
*/
		if (!parent) {
			parent = null;
		} else if (!parent[OBSERVABLE]) {
			console.dir({parent});
			throw new TalError('parent is not observable');
		}
		const observers = new Observers;
		observable = new Proxy(obj, {
			get(target, prop, receiver) {
				let result = contextGetter(observable, target, prop, observers, parent);
				if (!isDefined(result)) {
					if (Reflect.has(target, prop)) {
						result = Reflect.get(target, prop, receiver);
						if (isFunction(result) && !result[OBSERVABLE]) {
							return (...args) => result.apply(target, args);
//							return (...args) => result.apply(observable, args);
						}
						detectingObservables?.push([observable, prop]);
					} else if (typeof prop !== 'symbol') {
						if (parent) {
//							console.log(`Undefined property '${prop}' in current observeObject, lookup parent`, {target,parent});
							result = parent[prop];
						} else {
							console.error(`Undefined property '${prop}' in current observeObject`, {target,parent});
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
						observers.dispatch(prop + ".beforeChange", oldValue);
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
				return Reflect.deleteProperty(target, prop);
			}
		});
		observablesMap.set(obj, observable);
	}
	return observable;
}
