const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
EthereumAddressMysqlModel = require("./ethereum_address_mysql"),
EthereumBlockMysqlModel = require("./ethereum_block_mysql"),
connection = require("../database/init");


const ETHEREUM_ADDRESS_TX = "Transaction";
const COLUMNS = ["blockNumber","from","gas","gasPrice", "hash", "input", "nonce", "to", "value", "input_hashcode"];
const COLUMNS_NO_FOREIGN = ["blockNumber","gas","gasPrice", "hash", "input", "nonce", "value", "input_hashcode"];

function createInsertRows() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "INSERT INTO Transaction ("+columns.join(",")+") VALUES ? ";
}

function selectColumns() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "SELECT `id`, "+columns.join(",")+" FROM Transaction AS T";
}

function selectColumnsJoin() {
  var columns = COLUMNS_NO_FOREIGN.map((col) => { return "`"+col+"`"; });
  return "SELECT "+columns.join(",")+", `AFROM`.`address` AS `from`, `ATO`.`address` AS `to` FROM Transaction AS T LEFT JOIN Address AS AFROM ON AFROM.id=T.`from` LEFT JOIN Address AS ATO ON ATO.id=T.`to`";
}

function selectJoinAddresses() {
  var columns = COLUMNS_NO_FOREIGN.map((col) => { return "`"+col+"`"; });
  return "SELECT `id`, "+columns.join(",")+", aTo AS to, aFrom as from FROM Transaction AS T LEFT JOIN Address as aFrom ON aFrom.id = from LEFT Address as aTo ON aTo.id = to";
}

const INSERT_ROWS = createInsertRows();

function txToJson(tx) {
  return {
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

function txToArrayForInsert(tx, from, to) {
  return [
    tx.blockNumber,
    from, //tx.from = address // from = id
    tx.gas,
    tx.gasPrice,
    tx.hash,
    tx.input,
    tx.nonce,
    to, //tx.to = address // to = id
    tx.value,
    murmurHash(tx.input.toLowerCase())
  ]
}

const EthereumTransactionMysqlModel = function() {

}

Abstract.make_inherit(EthereumTransactionMysqlModel);

EthereumTransactionMysqlModel.prototype.getModelName = function() {
  return ETHEREUM_ADDRESS_TX;
}


EthereumTransactionMysqlModel.prototype.exists = function(tx) {
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

EthereumTransactionMysqlModel.prototype.filter = function(tx) {
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

EthereumTransactionMysqlModel.prototype.get = function(tx) {
  return new Promise((resolve, reject) => {
    connection.query(selectColumns()+" WHERE hash = ? ", [tx.hash],  (error, results, fields) => {
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

EthereumTransactionMysqlModel.prototype.withInput = function(input, blockNumber = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    const input_hash = murmurHash(input);
    const query = selectColumnsJoin() + " WHERE `input_hashcode` = ? AND `input` = ? AND blockNumber > ? LIMIT ?";
    connection.query(query, [input_hash, input, blockNumber, limit],  (error, results, fields) => {
      if(error) {
        console.log(error);
        reject(error);
        return;
      }

      if(results && results.length > 0) {
        resolve(results);
      } else {
        resolve([]);
      }
    });
  });
}

EthereumTransactionMysqlModel.prototype.withAddress = function(address, blockNumber = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      const query = selectColumnsJoin() + " WHERE (T.`from` = ? OR T.`to` = ? ) AND blockNumber >= ? LIMIT ?";
      connection.query(query, [address, address, blockNumber, limit],  (error, results, fields) => {
        if(error) {
          console.log(error);
          reject(error);
          return;
        }

        if(results && results.length > 0) {
          resolve(results);
        } else {
          resolve([]);
        }
      });
    });
  });
}

EthereumTransactionMysqlModel.prototype.saveMultiple = function(txs, block) {
  return new Promise((resolve, reject) => {

    if(!txs || txs.length == 0) {
      resolve(txs);
      return;
    }

    EthereumBlockMysqlModel.getOrSave(block)
    .then(json => {
      const array = [];
      const promises = [];

      txs.forEach(transaction => {
        promises.push(new Promise((resolve, reject) => {
          EthereumAddressMysqlModel.getOrSave(transaction.from)
          .then(from_json => {
            if(transaction.from != from_json.address) console.log("ERROR "+transaction.from +" "+from_json.address, from_json);
            EthereumAddressMysqlModel.getOrSave(transaction.to)
            .then(to_json => {
              if(transaction.to != to_json.address) console.log("ERROR "+transaction.to +" "+to_json.address, to_json);
              const tx = txToArrayForInsert(transaction, from_json.id, to_json.id);
              resolve(tx);
            });
          })
        }));
      });

      Promise.all(promises)
      .then(results => {
        connection.query(INSERT_ROWS, [results], (error, results, fields) => {
          if(error && error.code !== "ER_DUP_ENTRY") {
            console.log(error);
            console.log(results);
            console.log(fields);
            reject(error);
          } else {
            resolve(txs);
          }
        });
      })
    })
    .catch(err => {
      console.log(err);
    })
  });
}

EthereumTransactionMysqlModel.prototype.count = function(address) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      const query = "SELECT COUNT(*) as c FROM Transaction as T WHERE (T.`from` = ? OR T.`to` = ? )";
      console.log(query);
      connection.query(query, [address, address],  (error, results, fields) => {
        if(error) {
          console.log(error);
          reject(error);
          return;
        }

        if(results && results.length > 0) {
          resolve(results[0].c);
        } else {
          console.log(results);
          resolve(0);
        }
      });
    });
  });
}

module.exports = new EthereumTransactionMysqlModel();
