
class ObservablesMap extends WeakMap {
    get(obj) {
		return obj[IS_PROXY] ? obj : super.get();
    }
}

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

export let detectingObservables;

export const
	IS_PROXY = Symbol("proxied"),

	isContextProp = prop => contextProps.includes(prop),

	isObserved = obj => obj[IS_PROXY],

	detectObservables = () => {
		detectingObservables || (detectingObservables = []);
	},

	getDetectedObservables = () => {
		let result = detectingObservables;
		detectingObservables = null;
		return result;
	},

	observablesMap = new ObservablesMap(),

	contextGetter = (context, target, prop, observers, parent) => {
		switch (prop)
		{
			case IS_PROXY: return 1;
			// Vue watch(), Knockout subscribe()
			case "observe":
//				callback(obj[property], property);
				// fallthrough
			case "unobserve":
//				return (property, callback) => observers[prop](property, callback);
				return observers[prop].bind(observers);
			case "clearObservers":
				return () => observers.clear();
			case "getObservers":
				return () => observers;
			case "refreshObservers":
				return () => observers.dispatchAll(target);
			// Vue computed(), Knockout computed()
			case "defineComputed":
				return (name, callable) => {
					detectObservables();
					callable();
					getDetectedObservables().forEach(([obj, prop]) => obj.observe(prop, callable));
					Object.defineProperty(target, name, { get: callable });
				};
			/**
			 * TAL built-in Names
			 * https://zope.readthedocs.io/en/latest/zopebook/AppendixC.html#built-in-names
			 */
			case "root":
				return parent ? parent[prop] : context;
//				return (parent && parent[IS_PROXY]) ? parent[prop] : context;
			case "context":
				return context;
		}
	};

const contextProps = [
		IS_PROXY,
		"observe",
		"unobserve",
		"clearObservers",
		"getObservers",
		"refreshObservers",
		"defineComputed",
		// TAL
		"root",
		"context"
	],
	// Vue trigger
	dispatch = (callbacks, prop, value) => {
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
	};
