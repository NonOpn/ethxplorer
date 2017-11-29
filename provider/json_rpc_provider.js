const AbstractProvider = require("./abstract_provider.js"),
config = require("../configs/blocks.js"),
request = require("request");

function JSONRPCProvider() {

}

JSONRPCProvider.prototype.post = function(method, params = []) {
  return new Promise((resolve, reject) => {

    var options = {
      uri: config.json_rpc_endpoint,
      method: 'POST',
      json: {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id":1
      }
    };

    request(options, function (error, response, body) {
      if (!error && response.statusCode == 200 && body.result) {
        resolve(body.result);
      } else {
        reject(error);
      }
    });
  })
}

JSONRPCProvider.prototype.getState = function() {
  return new Promise((resolve, reject) => {
    request("http://127.0.0.1:8080/api/v1/state.json")
    .then(body => {
      resolve(JSON.parse(body));
    })
    .catch(err => reject(err));
  });
}

JSONRPCProvider.prototype.getBlockNumber = function() {
  return new Promise((resolve, reject) => {
    this.post("eth_blockNumber")
    .then(result => {
      resolve(Number(result));
    })
    .catch(err => reject(err));
  });
}

JSONRPCProvider.prototype.getBlock = function(block_number, include_tx) {
  const id = "0x" + Number(block_number).toString(16);

  return new Promise((resolve, reject) => {
    this.post("eth_getBlockByNumber", [ id, true ] )
    .then(block => {
      try {
        if(block) {
          if(block.number) block.number = Number(block.number);
          if(block.timestamp) block.timestamp = Number(block.timestamp);

          if(block.transactions) {
            block.transactions.forEach(tx => {
              tx.blockNumber = Number(tx.blockNumber);
            });
          }
          resolve(block);
        }
        else reject("Invalid response");
      }catch(err) {
        console.log(err);
      }
    })
    .catch(err => reject(err));
  });
}

AbstractProvider.make_inherit(JSONRPCProvider);

module.exports = JSONRPCProvider;
