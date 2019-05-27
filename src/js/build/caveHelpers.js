// caveHelpers is for formatting cave data before it is passed to EJS templates
// This function is only run once, after the cave data has been loaded, so it can
// be more efficient to manipulate it here ibce than re-running a helper function
// many times within a template.
//
// NOTE data within the cave **should not** be mutated by code within EJS
// all buildHelper should be pure functions (no side effects/mutation of data)

/* eslint-disable no-param-reassign */
module.exports = ({ cave, helpers }) => {
  cave.answerToLife = helpers.exampleFn()
  return cave
}
/* eslint-enable */
