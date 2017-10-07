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
  return "SELECT T.`id`, "+columns.join(",")+", `AFROM`.`address` AS `from`, `ATO`.`address` AS `to` FROM Transaction AS T LEFT JOIN Address AS AFROM ON AFROM.id=T.`from` LEFT JOIN Address AS ATO ON ATO.id=T.`to`";
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

const lambdaArray = (resolve, reject) => {
  return (error, results, fields) => {
    if(error) {
      console.log(error);
      reject(error);
      return;
    }
    resolve(results);
  };
};

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

      resolve( results && results.length > 0 );
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
    connection.query(query, [input_hash, input, blockNumber, limit], lambdaArray(resolve, reject));
  });
}

EthereumTransactionMysqlModel.prototype.countForAddress = function(address) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      const query = "SELECT \"from\" AS `type`, COUNT(*) AS count FROM Transaction WHERE `from`=? UNION SELECT \"to\" AS `type`, COUNT(*) AS count FROM Transaction WHERE `to`=? UNION SELECT \"same\" AS `type`, COUNT(*) AS count FROM Transaction WHERE `from`=? AND `to`=?;";
      console.log(query);
      connection.query(query, [address, address, address, address],  (error, results, fields) => {
        if(error) {
          console.log(error);
          reject(error);
          return;
        }

        if(results && results.length === 3) {
          resolve(results[0].count + results[1].count - results[2].count);
        } else {
          resolve(0);
        }
      });
    });
  });
}

//since we now save block per block where tx are deterministically saved
//we can use where id < <given id> to improve pagination retrieval
EthereumTransactionMysqlModel.prototype.withAddressFromId = function(address, limit = 1000, from = Number.MAX_SAFE_INTEGER) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      //TODO look for improvement
      const query_look_from_to = "SELECT `id` FROM "
      + " ((SELECT `id` FROM Transaction WHERE `to`=? AND `id` < ? ORDER BY id DESC LIMIT ?)"
      + " UNION"
      + " (SELECT `id` FROM Transaction WHERE `from`=? AND `id` < ? ORDER BY id DESC LIMIT ?)) AS T"
      + " ORDER BY T.`id` DESC LIMIT ?";
      const query = selectColumnsJoin() + " INNER JOIN ("+query_look_from_to+") AS COMP ON COMP.`id` = T.`id`";
      console.log(query);
      connection.query(query, [address, from, limit, address, from, limit, limit], lambdaArray(resolve, reject));
    });
  });
}

EthereumTransactionMysqlModel.prototype.withAddress = function(address, blockNumber = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      const query = selectColumnsJoin() + " WHERE (T.`from` = ? OR T.`to` = ? ) AND blockNumber >= ? LIMIT ?";
      connection.query(query, [address, address, blockNumber, limit],  lambdaArray(resolve, reject));
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
