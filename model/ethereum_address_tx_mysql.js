const mysql = require("mysql"),
Abstract = require("./abstract.js"),
models_utils = require("./models_utils"),
config = require("../configs/blocks.js");

var connection = mysql.createConnection({
  host     : config.mysql.host,
  user     : config.mysql.user,
  password : config.mysql.password,
  database : config.mysql.database
});

connection.connect();
connection.query("CREATE TABLE IF NOT EXISTS Transaction ("
  +"`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
  +"`blockHash` VARCHAR(255) NOT NULL,"
  +"`blockNumber` INTEGER NOT NULL,"
  +"`timestamp` INTEGER NOT NULL,"
  +"`from` VARCHAR(255) NULL,"
  +"`gas` VARCHAR(255) NULL,"
  +"`gasPrice` VARCHAR(255) NULL,"
  +"`hash` VARCHAR(255) NOT NULL,"
  +"`input` LONGTEXT NULL,"
  +"`nonce` VARCHAR(255) NULL,"
  +"`to` VARCHAR(255) NULL,"
  +"`value` VARCHAR(255) NULL,"
  +"UNIQUE KEY `hash` (`hash`)"
  +")ENGINE=MyISAM;", function(err, results, fields) {
    console.log(err);
    console.log(results);
    console.log(fields);
});

const ETHEREUM_ADDRESS_TX = "Transaction";

function createInsertRows() {
  var columns = ["blockHash","blockNumber","timestamp","from","gas","gasPrice", "hash", "input", "nonce", "to", "value"]
  columns = columns.map(function(col) {
    return "`"+col+"`";
  });
  return "INSERT INTO Transaction ("+columns.join(",")+") VALUES ? ";
}

const INSERT_ROWS = createInsertRows();

function txToJson(tx) {
  return {
    timestamp: tx.timestamp,
    blockHash: tx.blockHash.toLowerCase(),
    blockNumber: tx.blockNumber,
    from: tx.from ? tx.from.toLowerCase() : "",
    gas: tx.gas,
    gasPrice: tx.gasPrice,
    hash: tx.hash,
    input: tx.input,
    nonce: tx.nonce,
    to: tx.to ? tx.to.toLowerCase() : "",
    value: tx.value
  }
}

function txToArrayForInsert(tx) {
  return [
    tx.blockHash,
    tx.blockNumber,
    tx.timestamp,
    tx.from,
    tx.gas,
    tx.gasPrice,
    tx.hash,
    tx.input,
    tx.nonce,
    tx.to,
    tx.value
  ]
}

const EthereumAddressTxMysqlModel = function() {

}

Abstract.make_inherit(EthereumAddressTxMysqlModel);

EthereumAddressTxMysqlModel.prototype.getModelName = function() {
  return ETHEREUM_ADDRESS_TX;
}


EthereumAddressTxMysqlModel.prototype.exists = function(tx) {
  return new Promise((resolve, reject) => {
    connection.query("SELECT hash FROM Transaction WHERE hash = ? ", [tx.hash],  (error, results, fields) => {
      if(error) {
        reject(error);
        return;
      }

      if(results && results.length > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

EthereumAddressTxMysqlModel.prototype.filter = function(tx) {
  return new Promise((resolve, reject) => {
    this.exists(tx)
    .then(bool => {
      if(bool) resolve(undefined);
      else resolve(txToJson(tx));
    })
    .catch(err => {
      reject(err);
    })
  });
}

EthereumAddressTxMysqlModel.prototype.get = function(tx) {
  return new Promise((resolve, reject) => {
    connection.query("SELECT * FROM Transaction WHERE hash = ? ", [tx.hash],  (error, results, fields) => {
      if(error) {
        reject(error);
        return;
      }

      if(results && results.length > 0) {
        resolve(results[0]);
      } else {
        resolve(undefined);
      }
    });
  });
}

EthereumAddressTxMysqlModel.prototype.saveMultiple = function(txs, block) {
  return new Promise((resolve, reject) => {
    const array = [];

    txs.forEach(transaction => {
      transaction.timestamp = block.timestamp;
      array.push(txToArrayForInsert(transaction));
    });

    connection.query(INSERT_ROWS, [array], (error, results, fields) => {
      if(error && error.code !== "ER_DUP_ENTRY") {
        console.log(error);
        console.log(results);
        console.log(fields);
        reject(error);
      } else {
        resolve(txs);
      }
    });
  });
}

EthereumAddressTxMysqlModel.prototype.save = function(tx, block) {
  return new Promise((resolve, reject) => {
    tx.timestamp = block.timestamp;
    const transaction = txToJson(tx);
    connection.query("INSERT INTO Transaction SET ?", transaction, (error, results, fields) => {
      if(error && error.code !== "ER_DUP_ENTRY") {
        console.log(tx);
        console.log(error);
        console.log(results);
        console.log(fields);
        reject(error);
      } else {
        resolve(transaction);
      }
    });
  });
}

module.exports = new EthereumAddressTxMysqlModel();
