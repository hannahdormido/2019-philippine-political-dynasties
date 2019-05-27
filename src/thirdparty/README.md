# Thirdparty Libraries

First check if we're already hosting the library you need at https://graphics-preview.bloomberg.com/graphics/soup/thirdparty/.

If so, you can include it in **index.html** like this:
```html
<script src="/graphics/soup/thirdparty/d3-4.11.0/d3.min.js">
```

If not, you should download it to **src/thirdparty**, then include it with a relative link in **index.html** like this:
```html
<script src="thirdparty/alpaca.min.js">
```
