const AbstractProvider = require("./abstract_provider.js"),
web3 = require("../web3/provider");

function Web3Provider() {

}

Web3Provider.prototype.getBlockNumber = function() {
  return web3.eth.getBlockNumber();
}

Web3Provider.prototype.getBlock = function(id, include_tx) {
  return web3.eth.getBlock(block_number, true);
}

AbstractProvider.make_inherit(Web3Provider);

module.exports = Web3Provider;
