import { observablesMap } from 'observers';
import { observeObject } from 'observers/object';
import { observeArray } from 'observers/array';
//import { observePrimitive } from 'observers/primitive';
import { observeFunction } from 'observers/function';

export function observeType(item, parent/*, deep*/)
{
	let type = (null != item) ? typeof item : "null";
	switch (type)
	{
	// primitives
	case "undefined":
	case "null":
	case "bigint":
	case "boolean":
	case "number":
	case "string":
	case "symbol":
		return item;
//		return observePrimitive(item, parent/*, deep*/);
	}

	let observable = observablesMap.get(item);
	if (observable) {
		return observable;
	}

	if ("function" === type) {
		observable = observeFunction(item, parent/*, deep*/);
	} else if (Array.isArray(item)) {
		observable = observeArray(item, parent/*, deep*/);
	} else if ("object" === type) {
		observable = observeObject(item, parent/*, deep*/);
	}

	observablesMap.set(item, observable);

	return observable;
}
