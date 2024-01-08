import { isObserved } from 'observers/object';
import { Statements } from 'statements';
import { popAttribute, TalError } from 'common';

// context = observeObject(obj)
// TalContext
export function parse(template, context)
{
	if (typeof template === "string") {
		template = document.getElementById(template);
	}
	if (!(template instanceof Element)) {
		throw new TalError("template not an instance of Element");
	}
	if (!isObserved(context)) {
		throw new TalError("context is not observed");
	}
//	context = observeObject(context);
	// elements is a static (not live) NodeList
	// template root node must be prepended as well
	let elements = [template, ...template.querySelectorAll(Statements.cssQuery)];
	let repeat, repeaters = [];
	elements.forEach(el => {
		if (repeat) {
			if (repeat.hasChild(el)) {
				// Skip this element as it is handled by Statements.repeat
				return;
			}
			repeat = repeaters.pop();
		}

		let value = popAttribute(el, "tal:define");
		if (null != value) {
			Statements.define(el, value, context);
		}

		// Same as KnockoutJS if:
		value = popAttribute(el, "tal:condition");
		if (null != value) {
			Statements.condition(el, value, context, parse);
		}

		// Same as KnockoutJS foreach:
		value = popAttribute(el, "tal:repeat");
		if (null != value) {
			repeat = Statements.repeat(el, value, context, parse);
			repeaters.push(repeat);
			return;
		}

		value = popAttribute(el, "tal:content");
		let skip = false;
		if (null != value) {
			Statements.content(el, value, context);
		} else if (null != (value = popAttribute(el, "tal:replace"))) {
			Statements.replace(el, value, context);
			skip = true;
		}
		if (!skip) {
			// Same as KnockoutJS attr:
			value = popAttribute(el, "tal:attributes");
			if (null != value) {
				Statements.attributes(el, value, context);
			}

			if (el.hasAttribute("tal:omit-tag")) {
				Statements["omit-tag"](el, popAttribute(el, "tal:omit-tag"), context);
			}

			// Our two-way bindings
			value = popAttribute(el, "tal:listen");
			if (null != value) {
				Statements.listen(el, value, context);
			}
		}

		el.getAttributeNames().forEach(name => name.startsWith("tal:") && el.removeAttribute(name));
	});

	return context;
}
