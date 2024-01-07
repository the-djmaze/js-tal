
In the past we had Object.observe() and Array.observe()
Now we use Proxy

KnockoutJS
ko.computed: changes when an ko.observable changes
ko.subscribe: triggered when an ko.observable changes

Also see:
https://github.com/jhiver/template-tal
https://github.com/alpinejs/alpine
https://unpkg.com/alpinejs@3.2.2/dist/cdn.js
https://github.com/vuejs/vue-next/tree/master/packages/reactivity/src


Issue with path:
  For example we have an expression as `path:item/name`
  Then we need to watch `item` and `item/name` because both of them can be changed
  In case of `item` we need to rebuild the whole observe tree and unobserve the old tree
