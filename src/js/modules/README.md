# Modules

Use the modules folder to write reusable functions. For example, we could make a `modules/utils.js` file with some handy functions.

```js
export hypotenus (a, b) => {
  return Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2))
}

export areaOfTriangle (base, height) => {
  return base * height * 0.5
}
```

You can then [import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) it in to your main.js like this

```js
import * as utils from './modules/utils'
console.log(utils.hypotenus(3, 4))
console.log(utils.areaOfTriangle(3, 4))

// or import specific functions only
import { hypotenus, areaOfTriangle } from './modules/utils'
console.log(hypotenus(3, 4))
console.log(areaOfTriangle(3, 4))
```
