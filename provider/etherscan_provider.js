const AbstractProvider = require("./abstract_provider.js");
const api = require('etherscan-api').init('YourApiKey');

function EtherscanProvider() {

}

EtherscanProvider.prototype.getBlockNumber = function() {
  return new Promise((resolve, reject) => {
    api.proxy.eth_blockNumber()
    .then(res => {
      if(res && res.result) {
        const convert = Number(res.result);
        if(!isNaN(convert)) {
          resolve(convert);
        } else {
          reject("invalid");
        }
      }
    })
    .catch(err => reject(err));
  });
}

EtherscanProvider.prototype.getBlock = function(id/*, include_tx*/) {
  //include_tx is always on
  id = "0x" + Number(id).toString(16);
  return new Promise((resolve, reject) => {
    api.proxy.eth_getBlockByNumber(id)
    .then(res => {
      if(res && res.result) {
        const block = res.result;
        if(block.number) block.number = Number(block.number);
        if(block.timestamp) block.timestamp = Number(block.timestamp);

        if(block.transactions) {
          block.transactions.forEach(tx => {
            tx.blockNumber = Number(tx.blockNumber);
          })
        }
        resolve(block);
      }
      else reject("Invalid response");
    })
    .catch(err => reject(err));
  });
}

AbstractProvider.make_inherit(EtherscanProvider);

module.exports = EtherscanProvider;
