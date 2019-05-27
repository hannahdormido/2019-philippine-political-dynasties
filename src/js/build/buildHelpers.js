// Local helpers that you intend to use in your server-side EJS templates
// Functions exported here will be automatically available in your EJS templates
// as helpers.exampleFn or h.exampleFn
// **Important Note**
// You need to use CommonJS exports/require as this is included via Gulp
// Also note that helpers should be pure functions (no side effects/mutation of data)

exports.exampleFn = () => {
  const x = 42;
  return x;
};
