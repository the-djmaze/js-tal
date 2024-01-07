
export function observeDOMNode(node, onRemove) {
	const observer = new MutationObserver(mutations => {
		// https://developer.mozilla.org/en-US/docs/Web/API/MutationRecord
		mutations.forEach(mutation => {
			mutation.removedNodes && mutation.removedNodes.forEach(node => {
				console.log({removed:node});
				onRemove(node);
			});
		});
	});
	observer.observe(node, {
		// Monitor the target node (and, if subtree is true, its descendants) for the addition of new child nodes or removal of existing child nodes.
		childList: true
/*
		// Set to true to extend monitoring to the entire subtree of nodes rooted at target. All of the other MutationObserverInit properties are then extended to all of the nodes in the subtree instead of applying solely to the target node.
		subtree: false,
		// Set to true to watch for changes to the value of attributes on the node or nodes being monitored. The default value is true if either of attributeFilter or attributeOldValue is specified, otherwise the default value is false.
		attributes: false,
		// An array of specific attribute names to be monitored. If this property isn't included, changes to all attributes cause mutation notifications.
		attributeFilter
		// Set to true to record the previous value of any attribute that changes when monitoring the node or nodes for attribute changes; see Monitoring attribute values in MutationObserver for details on watching for attribute changes and value recording.
		attributeOldValue: false,
		// Set to true to monitor the specified target node (and, if subtree is true, its descendants) for changes to the character data contained within the node or nodes. The default value is true if characterDataOldValue is specified, otherwise the default value is false.
		characterData: false,
		// Set to true to record the previous value of a node's text whenever the text changes on nodes being monitored.
		characterDataOldValue: false
*/
	});
	return observer;
}
