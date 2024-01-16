
class ObservablesMap extends WeakMap {
	get(obj) {
		return obj[OBSERVABLE] ? obj : super.get(obj);
	}
}

export class Observers extends Map {

	observe(property, callback, event) {
		if ("beforeChange" === event) {
			// To observe old value
			property = property + ".beforeChange";
		}
		this.has(property) || this.set(property, new Set);
		this.get(property).add(callback);
	}

	unobserve(property, callback, event) {
		if ("beforeChange" === event) {
			// To unobserve old value
			property = property + ".beforeChange";
		}
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
	OBSERVABLE = Symbol("observable"),

	isContextProp = prop => contextProps.includes(prop),

	isObservable = obj => obj && obj[OBSERVABLE],

	detectObservables = () => {
		detectingObservables || (detectingObservables = []);
	},

	getDetectedObservables = () => {
		let result = detectingObservables;
		detectingObservables = null;
		return result;
	},

	observablesMap = new ObservablesMap(),

	// Vue trigger
	dispatch = (callbacks, prop, value) => {
		callbacks && callbacks.forEach(cb => {
			try {
				cb(value, prop);
			} catch (e) {
				console.error(e, {
					prop: prop,
					value: value,
					callback:cb
				});
			}
		});
		return true;
	},

	contextGetter = (observable, target, prop, observers, parent) => {
		switch (prop)
		{
			case OBSERVABLE: return 1;
			// Vue watch(), Knockout subscribe()
			case "observe":
			case "unobserve":
				return observers[prop].bind(observers);
			case "clearObservers":
				return () => observers.clear();
			case "observers":
				return observers;
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
			case "context":
				return observable;
			case "parent":
				return parent;
			case "root":
				return parent ? parent[prop] : observable;
//				return (parent && parent[OBSERVABLE]) ? parent[prop] : observable;
		}
	};

const contextProps = [
		OBSERVABLE,
		"observe",
		"unobserve",
		"clearObservers",
		"observers",
		"refreshObservers",
		"defineComputed",
		// TAL
		"context",
		"parent",
		"root"
	];
