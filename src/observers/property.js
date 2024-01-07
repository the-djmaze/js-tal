import { Observers } from 'common';
//import { observeDOMNode } from 'observers/dom';

export function observeProperty(obj, prop, callback) {
	if (!obj.observeProperty) {
		const observers = new Observers;
		obj.observeProperty = (prop, callback) => {
			if (Object.getOwnPropertyDescriptor(obj, prop)) {
				console.error('Already observing ' + obj.constructor.name + '.' + prop);
			} else {
				const nativeDescriptor = Object.getOwnPropertyDescriptor(obj.constructor.prototype, prop);
				const setValue = val => {
						let oldVal = nativeDescriptor.get.call(obj);
//							result = Reflect.set(obj, prop, val);
						nativeDescriptor.set.call(obj, val);
						val = nativeDescriptor.get.call(obj);
						if (oldVal !== val) {
							observers.dispatch(prop, nativeDescriptor.get.call(obj));
						}
						return true;
					};
				Object.defineProperty(obj, prop, {
					enumerable: nativeDescriptor.enumerable,
					set: setValue,
					get: () => nativeDescriptor.get.call(obj)
				});
				if (obj instanceof Node) {
/*
					observeDOMNode(obj, ()=>{
						observers.remove(prop, callback);
					});
*/
				}
			}
			observers.add(prop, callback);
		};
	}

	obj.observeProperty(prop, callback);
}
