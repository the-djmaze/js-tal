import { isObject, IS_PROXY, Observers, TalError } from 'common';

const proxyMap = new WeakMap();
export function observeObject(obj, parent/*, deep*/)
{
	if (Array.isArray(obj)) {
		return observeArrayObject(obj/*, deep*/);
	}
	if (!isObject(obj)) {
		return obj;
	}
	if (obj[IS_PROXY]) {
		return obj;
	}

	let proxy = proxyMap.get(obj);
	if (!proxy) {
//		obj[IS_PROXY] = 2;
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
		const observers = new Observers;
		proxy = new Proxy(obj, {
			get(target, prop, receiver) {
				switch (prop)
				{
					case IS_PROXY: return 1;
					// Vue watch(), Knockout subscribe()
					case "observe":
//						callback(obj[property], property);
						// fallthrough
					case "unobserve":
//						return (property, callback) => observers[prop](property, callback);
						return observers[prop].bind(observers);
					case "clearObservers":
						return () => observers.clear();
					case "refreshObservers":
						return () => observers.dispatchAll(obj);
					// Vue computed(), Knockout computed()
					case "defineComputed":
						return (name, fn, observe) => {
							Object.defineProperty(obj, name, { get: fn });
							observe && observe.forEach(n => observers.observe(n, () => observers.dispatch(name, fn())));
						};
				}
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop, receiver);
				}
				if (parent) {
					parent[prop];
				} else {
					console.error(`Undefined property '${prop}' in current scope`);
				}
				return Reflect.get(target, prop, receiver);
			},
			set(target, prop, value, receiver) {
				switch (prop)
				{
					case "observe":
					case "unobserve":
					case "clearObservers":
					case "refreshObservers":
					case "defineComputed":
						throw new TalError(`${prop} can't be initialized, it is internal`);

				}
				let oldValue = target[prop],
					result = Reflect.set(target, prop, value, receiver);
				if (result && oldValue !== target[prop]) {
					observers.dispatch(prop, target[prop]);
				}
				return result;
			}
		});
		proxyMap.set(obj, proxy);
	}
	return proxy;
}

export function observeArrayObject(obj/*, deep*/)
{
//	if (!Array.isArray(obj) && !(obj instanceof Set) && !(obj instanceof Map)) {
	if (!Array.isArray(obj)) {
		throw new TalError("Not an Array");
	}
	if (obj[IS_PROXY]) {
		return obj;
	}
	let proxy = proxyMap.get(obj);
	if (!proxy) {
//		obj[IS_PROXY] = 2;
		obj.forEach((item, index) => obj[index] = observeObject(item));

		const observers = new Observers;
		proxy = new Proxy(obj, {
			get(target, prop/*, receiver*/) {
				switch (prop)
				{
				case IS_PROXY: return 1;
				// Vue watch(), Knockout subscribe()
				case "observe":
//					callback(obj[property], property);
					// fallthrough
				case "unobserve":
//					return (property, callback) => observers[prop](property, callback);
					return observers[prop].bind(observers);
				case "clearObservers":
					return () => observers.clear();
				case "refreshObservers":
					return () => observers.dispatchAll(obj);
				// Vue computed(), Knockout computed()
				case "defineComputed":
					return (name, fn, observe) => {
						Object.defineProperty(obj, name, { get: fn });
						observe && observe.forEach(n => observers.observe(n, () => observers.dispatch(name, fn())));
					};
				}
				if (prop in target) {
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
//					case "pop":
						return () => {
							let value = target[prop]();
							observers.dispatch(prop, value);
							return value;
						};
					case "unshift":
					case "splice":
					case "push":
						return (...args) => {
							args = args.map(obj => observeObject(obj));
							let result = target[prop](...args);
							observers.dispatch(prop, args);
							return result;
						};
					}
					return target[prop];
//					let value = Reflect.get(target, prop, receiver);
//					return isFunction(value) ? value.bind(target) : value;
				}
			},
			set(target, prop, value) {
				if (target[prop] !== value) {
					target[prop] = value;
					if ("length" === prop) {
						observers.dispatch(prop, value);
					} else if (isFinite(prop)) {
						value = observeObject(value);
						observers.dispatch('set', {index:prop, value});
					}
					target[prop] = value;
				}
				return true;
			}
		});

		proxyMap.set(obj, proxy);
	}
	return proxy;
}

export function isObserved(obj)
{
	return isObject(obj) && obj[IS_PROXY];
}
