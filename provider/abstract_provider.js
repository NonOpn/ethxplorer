const inherits = require("util").inherits;

var AbstractProvider = function() {

}

AbstractProvider.prototype.getBlockNumber = function() {
  throw "getBlockNumber not defined";
}

AbstractProvider.prototype.getBlock = function(id, include_tx) {
  throw "getBlock not defined";
}

AbstractProvider.make_inherit = function(Model) {
  inherits(Model, AbstractProvider);
}

module.exports = AbstractProvider
