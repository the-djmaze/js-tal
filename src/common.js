export const
	isFunction = val => typeof val === "function",
	isObject = val => typeof val === "object",
	nullObject = () => Object.create(null),

	popAttribute = (el, name) =>
	{
		const value = el.getAttribute(name);
		el.removeAttribute(name);
		return value;
	};

export class TalError extends Error {}
