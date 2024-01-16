export const
	isArray = val => Array.isArray(val),
	isDefined = val => undefined !== val,
	isFunction = val => typeof val === "function",
	isObject = val => typeof val === "object",
	nullObject = () => Object.create(null),

	popAttribute = (el, name) =>
	{
		const value = el.getAttribute(name);
		el.removeAttribute(name);
		value && ((el.TAL || (el.TAL = {})).name = value);
		return value;
	};

export class TalError extends Error {}
