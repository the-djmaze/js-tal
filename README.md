
In the past we had Object.observe() and Array.observe().
Now we use Proxy and this library uses it.

This JavaScript code is like the [Template Attribute Language](https://en.wikipedia.org/wiki/Template_Attribute_Language) of Zope/Python

Issue with path:
  For example we have an expression as `path:item/name`
  Then we need to watch `item` and `item/name` because both of them can be changed
  In case of `item` we need to rebuild the whole observe tree and unobserve the old tree
