import { TalError } from 'common';
import { observablesMap, detectingObservables } from 'observers';
import { observeObject } from 'observers/object';

export function observeArray(obj, parent/*, deep*/)
{
//	if (!Array.isArray(obj) && !(obj instanceof Set) && !(obj instanceof Map)) {
	if (!Array.isArray(obj)) {
		throw new TalError("Not an Array");
	}
	let proxy = observablesMap.get(obj);
	if (!proxy) {
		obj = observeObject(obj, parent);
		proxy = new Proxy(obj, {
			get(target, prop, receiver) {
				switch (prop)
				{
				// Set
				case "clear":
					return () => {
						target.getObservers().dispatch(prop);
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
//					case "pop":
					return () => {
						let value = target[prop]();
						target.getObservers().dispatch(prop, value);
						return value;
					};
				case "unshift":
				case "splice":
				case "push":
					return (...args) => {
						args = args.map(target => observeObject(target, proxy));
						let result = target[prop](...args);
						target.getObservers().dispatch(prop, args);
						return result;
					};
				}
				return Reflect.get(target, prop, receiver);
			},
			set(target, prop, value, receiver) {
				let result = true;
				if (!detectingObservables) {
					if (isFinite(prop)) {
						value = observeObject(value, proxy);
						let oldValue = Reflect.get(target, prop, receiver);
						if (oldValue !== value) {
							result = Reflect.set(target, prop, value, receiver);
							value = Reflect.get(target, prop, receiver);
							if (result && oldValue !== value) {
								target.getObservers().dispatch("set", {index:prop, value});
							}
						}
					} else {
						target.getObservers().dispatch(prop, value);
					}
				}
				return result;
			}
		});

		obj.forEach((item, index) => obj[index] = observeObject(item, proxy));

		observablesMap.set(obj, proxy);
	}
	return proxy;
}
