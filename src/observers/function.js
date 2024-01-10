import { isFunction, TalError } from 'common';
//import { observeDOMNode } from 'observers/dom';
import {
	observablesMap, detectingObservables,
	IS_PROXY, Observers, isContextProp, contextGetter
} from 'observers';

export function observeFunction(fn, parent)
{
	if (!isFunction(fn)) {
		throw new TalError("Not a Function");
	}
	let proxy = observablesMap.get(fn);
	if (!proxy) {
		if (!parent || !parent[IS_PROXY]) {
			parent = null;
		}
		const observers = new Observers;
		proxy = new Proxy(fn, {
			get(target, prop, receiver) {
				if (isContextProp(prop)) {
					return contextGetter(proxy, target, prop, observers, parent);
				}
				return Reflect.get(target, prop, receiver);
			},
			has(target, prop) {
				return isContextProp(prop) || Reflect.has(target, prop);
				// || (parent && prop in parent)
			},
			set(target, prop, value, receiver) {
				if (detectingObservables) {
					return true;
				}
				if (isContextProp(prop)) {
					throw new TalError(`${prop} can't be initialized, it is internal`);
				}
				let oldValue = Reflect.get(target, prop, receiver),
					result = Reflect.set(target, prop, value, receiver);
				value = Reflect.get(target, prop, receiver);
				if (result && oldValue !== value) {
					observers.dispatch(prop, value);
				}
				return result;
			},
			apply(target, thisArg, argumentsList) {
				return Reflect.apply(target, thisArg, argumentsList);
			}
		});
		observablesMap.set(fn, proxy);
	}
	return proxy;
/*
			// A trap for the new operator.
			construct() {
			},
			// A trap for Object.defineProperty.
			defineProperty() {
			},
			// A trap for the delete operator.
			deleteProperty() {
			},
			// A trap for Object.getOwnPropertyDescriptor.
			getOwnPropertyDescriptor() {
			},
			// A trap for Object.getPrototypeOf.
			getPrototypeOf() {
			},
			// A trap for the in operator.
			has() {
			},
			// A trap for Object.isExtensible.
			isExtensible() {
			},
			// A trap for Object.getOwnPropertyNames and Object.getOwnPropertySymbols.
			ownKeys() {
			},
			// A trap for Object.preventExtensions.
			preventExtensions() {
			},
			// A trap for Object.setPrototypeOf.
			setPrototypeOf() {
			},
*/
}
