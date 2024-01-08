export const
	isFunction = val => typeof val === "function",
	isObject = val => typeof val === "object",
	IS_PROXY = Symbol("proxied"),
	nullObject = () => Object.create(null),

	// Vue trigger
	dispatch = (callbacks, prop, value) =>
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
	},

	popAttribute = (el, name) =>
	{
		const value = el.getAttribute(name);
		el.removeAttribute(name);
		return value;
	};

export class Observers extends Map {

	observe(property, callback) {
		this.has(property) || this.set(property, new Set);
		this.get(property).add(callback);
	}

	unobserve(property, callback) {
		this.has(property) && this.get(property).delete(callback);
	}

	dispatch(property, value) {
		return dispatch(this.get(property), property, value);
	}

	dispatchAll(obj) {
		this.forEach((callbacks, prop) => dispatch(callbacks, prop, obj[prop]));
		// Refresh children, does not work
//		Object.values(obj).forEach(value => value && value.refreshObservers && value.refreshObservers());
	}
}

export class TalError extends Error {}
