import { isObject, IS_PROXY, dispatch, Observers } from 'common';

const proxyMap = new WeakMap();
export function observeObject(obj/*, deep*/)
{
	if (!isObject(obj) || obj[IS_PROXY]) {
		return obj;
	}

	let proxy = proxyMap.get(obj);
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
//		Object.defineProperty(obj, 'isProxy', { get: function(){return this === obj;} });
		obj[IS_PROXY] = 1;
		const observers = new Observers;
		// Vue watch(), Knockout subscribe()
		obj.observe = (property, callback) => {
//			callback(obj[property], property);
			observers.add(property, callback);
		};
		obj.unobserve = (property, callback) => {
			observers.remove(property, callback);
		};
		obj.clearObservers = () => {
			observers.clear();
		};
		obj.refreshObservers = () => {
			observers.forEach((callbacks, prop) => dispatch(callbacks, prop, obj[prop]));
			// Refresh children, does not work
//			Object.values(obj).forEach(value => value && value.refreshObservers && value.refreshObservers());
		};
		// Vue computed(), Knockout computed()
		obj.defineComputed = function(name, fn, observe) {
			Object.defineProperty(this, name, { get: fn });
			observe && observe.forEach(n => this.observe(n, () => observers.dispatch(name, fn())));
		};

		proxy = new Proxy(obj, {
			set: (target, property, value, receiver) => {
				let oldValue = target[property],
					result = Reflect.set(target, property, value, receiver);
				if (result && oldValue !== target[property]) {
					observers.dispatch(property, target[property]);
				}
				return result;
			}
		});
		proxyMap.set(obj, proxy);
	}
	return proxy;
}
