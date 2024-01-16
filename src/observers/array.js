import { isArray, TalError } from 'common';
import { observablesMap, detectingObservables } from 'observers';
import { observeObject } from 'observers/object';

export function observeArray(obj, parent/*, deep*/)
{
//	if (!isArray(obj) && !(obj instanceof Set) && !(obj instanceof Map)) {
	if (!isArray(obj)) {
		throw new TalError("Not an Array");
	}
	let observable = observablesMap.get(obj);
	if (!observable) {
		obj = observeObject(obj, parent);
		const observers = obj.observers;
		observable = new Proxy(obj, {
			get(target, prop, receiver) {
				switch (prop)
				{
				// Set
				case "clear":
					return () => {
						observers.dispatch(prop);
						return target.clear();
					};
				case "add":
				case "delete":
					throw new TalError("Set.prototype."+prop+"() not supported");
				// Array mutator methods
				case "copyWithin":
				case "fill":
				case "reverse":
				case "sort":
					throw new TalError("Array.prototype."+prop+"() not supported");
				case "shift":
				case "pop":
					return () => {
						observers.dispatch(prop+".beforeChange");
						let value = target[prop]();
						observers.dispatch(prop, value);
						return value;
					};
				case "unshift":
				case "splice":
				case "push":
					return (...args) => {
						args = args.map(target => observeObject(target, observable));
						let result = target[prop](...args);
						observers.dispatch(prop, args);
						return result;
					};
				}
				return Reflect.get(target, prop, receiver);
			},
			set(target, prop, value, receiver) {
				let result = true;
				if (!detectingObservables) {
					if (isFinite(prop)) {
						value = observeObject(value, observable);
						let oldValue = Reflect.get(target, prop, receiver);
						if (oldValue !== value) {
							result = Reflect.set(target, prop, value, receiver);
							value = Reflect.get(target, prop, receiver);
							if (result && oldValue !== value) {
								observers.dispatch("set", {index:prop, value});
							}
						}
					} else {
						observers.dispatch(prop, value);
					}
				}
				return result;
			}
		});

		obj.forEach((item, index) => obj[index] = observeObject(item, observable));

		observablesMap.set(obj, observable);
	}
	return observable;
}
