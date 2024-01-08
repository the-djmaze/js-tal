import { nullObject, isFunction } from 'common';

export class CONTEXTS
{
	constructor(root)
	{
		// the system’s top-most object: the Zope root folder.
		this.root = root;
		// the repeat variables; see the tal:repeat documentation.
		this.repeat = nullObject(); // new Map;
/*
		this.nothing  = special value used by to represent a - non-value- (e.g. void, None, Nil, NULL).
		this.default  = special value used to specify that existing text should not be replaced. See the documentation for individual TAL statements for details on how they interpret - default- .
		this.attrs    = a dictionary containing the initial values of the attributes of the current statement tag.
		this.context  = the object to which the template is being applied.
		this.template = the <template> itself.
*/
	}
}

export class TalContext
{
	constructor(parent = null/*, scope = "root"*/)
	{
		let context = parent ? null : new CONTEXTS(this);
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				if ("CONTEXTS" === prop) {
					return context || parent.CONTEXTS;
				}
				if (prop in target) {
					let value = Reflect.get(target, prop, receiver);
					return isFunction(value) ? value.bind(target) : value;
//					return Reflect.get(target, prop, receiver);
//					return target[prop];
				}
				if (null === parent && prop in context) {
					return context[prop];
				}
				return parent[prop];
			},
			set: (target, prop, value) => {
				target[prop] = value;
				return true;
			}
//			,apply: (target, thisArg, argList) => {}
//			,ownKeys: target => Reflect.ownKeys(target)
//			,has: (target, key) => key[0] !== "_" && key in target
		});
	}
}

