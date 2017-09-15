const mongoose = require("mongoose"),
Schema = mongoose.Schema,
Abstract = require("./abstract.js"),
models_utils = require("./models_utils");

const ETHEREUM_ADDRESS_TX = "EthereumAddressTx";

var _model = undefined;


function etherscan_to_model_descriptor() {
  return {
    blockNumber: { type: Number, default: 0},
    timeStamp: { type: Number, default: 0},
    hash: { type: String, default: undefined},
    blockNumber: { type: Number, default: 0},
    from: { type: String, default: ""},
    to: { type: String, default: ""},
    value: { type: String, default: ""},
    gas: { type: String, default: ""},
    gasPrice: { type: String, default: ""},
    isError: { type: String, default: ""},
    input: { type: String, default: ""},
    gas: { type: String, default: ""},
    contractAddress: { type: String, default: ""},
    cumulativeGasUsed: { type: String, default: ""},
    gasUsed: { type: String, default: ""},
    confirmations: { type: String, default: ""}
  };
}

function txToJson(tx) {
  return {
    blockNumber: tx.blockNumber,
    timeStamp: tx.timeStamp,
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    from: tx.from ? tx.from.toLowerCase() : undefined,
    to: tx.to ? tx.to.toLowerCase() : undefined,
    value: tx.value,
    gas: tx.gas,
    gasPrice: tx.gasPrice,
    isError: tx.isError,
    input: tx.input,
    gas: tx.gas,
    contractAddress: tx.contractAddress,
    cumulativeGasUsed: tx.cumulativeGasUsed,
    gasUsed: tx.gasUsed,
    confirmations: tx.confirmations,
  }
}

const EthereumAddressTxModel = function() {
  this.getModel();
}

Abstract.make_inherit(EthereumAddressTxModel);

EthereumAddressTxModel.prototype.getModelName = function() {
  return ETHEREUM_ADDRESS_TX;
}

EthereumAddressTxModel.prototype.getModel = function() {
  if(_model == undefined) {
    const json_descriptor = etherscan_to_model_descriptor();
    _model = models_utils.generateModel(
      json_descriptor,
      ETHEREUM_ADDRESS_TX, [
        models_utils.to_json(function() {
          return txToJson(this);
        })
      ]
    );
  }
  if(this.model == undefined) this.model = _model;
  return this.model;
}

EthereumAddressTxModel.prototype.exists = function(tx) {
  return new Promise((resolve, reject) => {
    this.getModel()
    .findOne({hash: tx.hash}, (err, transaction) => {
      if(transaction != undefined) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

EthereumAddressTxModel.prototype.save = function(tx) {
  return new Promise((resolve, reject) => {
    this.exists(tx)
    .then(exists => {
      if(!exists) {
        const transaction = new this.model(txToJson(tx));

        transaction.save((err, transaction) => resolve(transaction));
      } else {
        console.log("already exists");
        resolve(undefined);
      }
    })
    .catch(e => {
      reject(e);
    });
  });
}

module.exports = new EthereumAddressTxModel();
