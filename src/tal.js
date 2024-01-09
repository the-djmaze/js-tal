import { parse } from 'parser';
import { observeObject, observeArray } from 'observers/object';
//import { observePrimitive } from 'observers/primitive';
//import { observeProperty } from 'observers/property';
import { TalError } from 'common';
import { Tales } from 'tales';

/*
 * When one of the properties inside the getter function is changed
 * This property must call dispatch(observers[property], property, target[property])
class computedProperty
{
	constructor(getterOrOptions) {
		if (isFunction(getterOrOptions)) {
			getterOrOptions = {
				get: getterOrOptions,
				set: () => {console.warn('computedProperty is readonly')}
			}
		}
		this._setter = getterOrOptions.set;
		this._dirty = true;
		this.__v_isRef = true;
		this.effect = effect(getterOrOptions.get, {
			lazy: true,
			scheduler: () => {
				if (!this._dirty) {
					this._dirty = true;
					trigger(toRaw(this), "set", "value");
				}
			}
		});
	}
	get value() {
		const self = toRaw(this);
		if (self._dirty) {
			self._value = this.effect();
			self._dirty = false;
		}
		track(self, "get", "value");
		return self._value;
	}
	set value(newValue) {
		this._setter(newValue);
	}
}

function defineComputedProperty(obj, prop, fn, observables)
{
	observeObject(obj).defineComputed(prop, fn, observables);
}
*/

window.TAL = {
	parse,
	observeObject,
	observeArray,
//	observePrimitive,
//	observeProperty,
	TalError,
	TALES: Tales
};
