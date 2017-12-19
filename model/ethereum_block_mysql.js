const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
connection = require("../database/init");

const COLUMNS = ["id", "blockHash", "timestamp"];

function createInsertRows() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "INSERT INTO Block ("+columns.join(",")+") VALUES ? ";
}

function selectColumns() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "SELECT "+columns.join(",")+" FROM Block";
}

const INSERT_ROWS = createInsertRows();

function rowToJson(row) {
  return {
    blockNumber: row.id,
    blockHash: row.blockHash,
    timestamp: row.timestamp
  }
}

const EthereumBlockMysqlModel = function() {

}

Abstract.make_inherit(EthereumBlockMysqlModel);

EthereumBlockMysqlModel.prototype.getModelName = function() {
  return "Block";
}


EthereumBlockMysqlModel.prototype.exists = function(blockNumber) {
  return new Promise((resolve, reject) => {
    connection.executeInPool("SELECT id FROM Block WHERE id = ? ", [blockNumber])
    .then(results => resolve(results && results.length > 0))
    .catch(error => reject(error));
  });
}

EthereumBlockMysqlModel.prototype.lastBlockNumber = function() {
  return new Promise((resolve, reject) => {
    connection.executeInPool("SELECT MAX(id) as c FROM Block")
    .then(results => resolve(results.length > 0 ? results[0].c : 0))
    .catch(error => reject(error));
  });
}

EthereumBlockMysqlModel.prototype.getOrSave = function(block) {
  return new Promise((resolve, reject) => {
    this.get(block.number)
    .then(json => {
      if(json) {
        resolve(json)
      } else {
        this.save(block)
        .then(json => resolve(json))
        .catch(err => reject(err));
      }
    })
    .catch(err => reject(err));
  });
}

EthereumBlockMysqlModel.prototype.get = function(blockNumber) {
  return new Promise((resolve, reject) => {
    connection.executeInPool(selectColumns()+" WHERE id = ? ", [blockNumber])
    .then(results => resolve(results.length > 0 ? rowToJson(results[0]) : undefined))
    .catch(error => reject(error));
  });
}

EthereumBlockMysqlModel.prototype.save = function(block) {
  return new Promise((resolve, reject) => {
    connection.executeInPool("INSERT INTO Block (`id`, `blockHash`, `timestamp`) VALUES (?, ?, ?)", [block.number, block.hash, block.timestamp])
    .then(results => {
      resolve({ blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp });
    })
    .catch(error => {
      if(error.code == "ER_DUP_ENTRY") {
        this.get(block.number)
        .then(json => resolve(json))
        .catch(err => reject(err));
      } else {
        reject(error);
      }
    })
  });
}

module.exports = new EthereumBlockMysqlModel();
