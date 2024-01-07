export const isFunction = val => typeof val === 'function';
export const isObject = val => typeof val === 'object';
export const IS_PROXY = Symbol('proxied');
export const nullObject = () => Object.create(null);

// Vue trigger
export function dispatch(callbacks, prop, value)
{
	try {
		callbacks && callbacks.forEach(cb => cb(value, prop));
		return true;
	} catch (e) {
console.dir({
	prop: prop,
	value: value,
	callbacks:callbacks
});
		console.error(e);
		return false;
	}
}

export class Observers extends Map {

	add(property, callback) {
		this.has(property) || this.set(property, new Set);
		this.get(property).add(callback);
	}

	remove(property, callback) {
		this.has(property) && this.get(property).delete(callback);
	}

	dispatch(property, value) {
		return dispatch(this.get(property), property, value);
	}
}
