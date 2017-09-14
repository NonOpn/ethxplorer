const inherits = require("util").inherits;

var Abstract = function() {

}

Abstract.prototype.make_model_output_json = function() {
  throw "to_json not defined";
}

Abstract.make_inherit = function(Model) {
  inherits(Model, Abstract);
}

module.exports = Abstract
