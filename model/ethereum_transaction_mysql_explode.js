const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
EthereumAddressMysqlModel = require("./ethereum_address_mysql"),
EthereumBlockMysqlModel = require("./ethereum_block_mysql"),
connection = require("../database/init"),
Base64 = require("../base64.js");

const ETHEREUM_ADDRESS_TX = "Transaction";
const TRANSACTION = "Transaction_";

const COLUMNS = ["blockNumber","from","gas","gasPrice", "hash", "input", "nonce", "to", "value", "input_hashcode"];
const COLUMNS_NO_FOREIGN = ["blockNumber","gas","gasPrice", "hash", "input", "nonce", "value", "input_hashcode"];


function tableFromAddress(address) {
  if(!address || address.length < 6) return TRANSACTION+"";

  address = address.toLowerCase();
  return TRANSACTION + address.substr((address.indexOf("0x") == 0) ? 2 : 0, connection.prefix_size).toUpperCase();
}

function createInsertRowsForTable(table) {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "INSERT IGNORE INTO "+table+" ("+columns.join(",")+") VALUES ? ";
}

function selectColumns(address) {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "SELECT `id`, "+columns.join(",")+" FROM "+tableFromAddress(address)+" AS T";
}

function selectColumnsJoin(address) {
  var columns = COLUMNS_NO_FOREIGN.map((col) => { return "`"+col+"`"; });
  return "SELECT T.`id`, "+columns.join(",")+", `AFROM`.`address` AS `from`, `ATO`.`address` AS `to` FROM "+tableFromAddress(address)+" AS T LEFT JOIN Address AS AFROM ON AFROM.id=T.`from` LEFT JOIN Address AS ATO ON ATO.id=T.`to`";
}

function selectJoinAddresses(address) {
  var columns = COLUMNS_NO_FOREIGN.map((col) => { return "`"+col+"`"; });
  return "SELECT `id`, "+columns.join(",")+", aTo AS to, aFrom as from FROM "+tableFromAddress(address)+" AS T LEFT JOIN Address as aFrom ON aFrom.id = from LEFT Address as aTo ON aTo.id = to";
}

const HASH_INDEX = 4;

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

function txToArrayForInsert(tx, from, to, light) {
  return [
    tx.blockNumber,
    from, //tx.from = address // from = id
    tx.gas,
    tx.gasPrice,
    tx.hash,
    light ? tx.input : Base64.from0x(tx.input),
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

EthereumTransactionMysqlModel.prototype.toJson = function(tx) {
  return new Promise((resolve, reject) => {
    resolve(txToJson(tx));
  });
}

EthereumTransactionMysqlModel.prototype.get = function(tx) {
  return new Promise((resolve, reject) => {
    connection.executeInPool(selectColumns()+" WHERE hash = ? ", [tx.hash])
    .then(results => resolve(results.length > 0 ? results[0] : undefined))
    .catch(error => reject(error));
  });
}

EthereumTransactionMysqlModel.prototype.withInput = function(input, blockNumber = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    const input_hash = murmurHash(input);
    const query = selectColumnsJoin() + " WHERE `input_hashcode` = ? AND `input` = ? AND blockNumber > ? LIMIT ?";
    connection.executeInPool(query, [input_hash, input, blockNumber, limit])
    .then(results => resolve(results))
    .catch(error => reject(error));
  });
}

EthereumTransactionMysqlModel.prototype.countForAddress = function(address) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      const query = "SELECT \"from\" AS `type`, COUNT(*) AS count FROM Transaction WHERE `from`=? UNION SELECT \"to\" AS `type`, COUNT(*) AS count FROM Transaction WHERE `to`=? UNION SELECT \"same\" AS `type`, COUNT(*) AS count FROM Transaction WHERE `from`=? AND `to`=?;";

      connection.executeInPool(query, [address, address, address, adress])
      .then(results => {
        resolve(results.length === 3 ? results[0].count + results[1].count - results[2].count : 0);
      })
      .catch(error => {
        console.log(error);
        reject(error);
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
      const id = json.id;
      //TODO look for improvement
      const query_look_from_to = "SELECT `id` FROM "
      + " ((SELECT `id` FROM "+tableFromAddress(address)+" WHERE `to`=? AND `id` < ? ORDER BY id DESC LIMIT ?)"
      + " UNION"
      + " (SELECT `id` FROM "+tableFromAddress(address)+" WHERE `from`=? AND `id` < ? ORDER BY id DESC LIMIT ?)) AS T"
      + " ORDER BY T.`id` DESC LIMIT ?";
      const query = selectColumnsJoin(address) + " INNER JOIN ("+query_look_from_to+") AS COMP ON COMP.`id` = T.`id`";
      console.log(query);
      return connection.executeInPool(query, [id, from, limit, id, from, limit, limit])
    })
    .then(results => resolve(results))
    .catch(error => reject(error));
  });
}

EthereumTransactionMysqlModel.prototype.withAddress = function(address, blockNumber = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      const id = json.id;
      const query = selectColumnsJoin(address) + " WHERE (T.`from` = ? OR T.`to` = ? ) AND blockNumber >= ? LIMIT ?";

      return connection.executeInPool(query, [id, id, blockNumber, limit])
    })
    .then(results => resolve(results))
    .catch(error => reject(error));
  });
}

EthereumTransactionMysqlModel.prototype.getMergeable = function(txs, block) {
  return new Promise((resolve, reject) => {
    const notifications = [];
    const array = [];
    const tables = [];
    const addresses = [];
    const standard = tableFromAddress(undefined);
    array[standard] = [];

    const suitables_transactions = txs.map(transaction => {
      if(transaction.from) transaction.from = transaction.from.toLowerCase();
      if(transaction.to) transaction.to = transaction.to.toLowerCase();
      return new Promise((resolve, reject) => {
        this.transformTransactionIfSuitable(transaction)
        .then(tx => resolve(tx ? {from: transaction.from, to: transaction.to, tx: tx} : undefined))
        .catch(err => reject(err));
      });
    })

    Promise.all(suitables_transactions)
    .then(objects => {
      objects = objects.filter(item => item != undefined);

      objects.forEach(object => {

        notifications.push({from: object.from, to: object.to, hash: object.tx[HASH_INDEX]});

        if(addresses.indexOf(object.from) < 0) addresses.push(object.from);
        if(addresses.indexOf(object.to) < 0) addresses.push(object.to);

        const table_from = tableFromAddress(object.from);
        const table_to = tableFromAddress(object.to);

        array[standard].push(object.tx);

        if(table_from) {
          if(!array[table_from]) {
            array[table_from] = [];
            tables.push(table_from);
          }
          array[table_from].push(object.tx);
        } else {
          throw "undefined table_from "+object.from+" "+object.to;
        }

        if(table_to) {
          if(object.from != object.to && table_to != table_from) {
            if(!array[table_to]) {
              array[table_to] = [];
              tables.push(table_to);
            }
            array[table_to].push(object.tx);
          }
        } else {
          throw "undefined table_to "+object.from+" "+object.to;
        }
      });

      return EthereumAddressMysqlModel.manageAddresses(addresses);
    })
    .then(saved => {
      return EthereumBlockMysqlModel.getOrSave(block);
    })
    .then(json => {
      resolve({
        tables: tables,
        array: array,
        notifications: notifications
      });
    })
    .catch(err => console.log(err));
  })
}

EthereumTransactionMysqlModel.prototype.saveMergeable = function(output) {
  //output = {
  //    tables: [ "Transaction", ... ]
  //    array: [array of table:tables]
  //  }
  return new Promise((resolve, reject) => {
    const tables = output.tables;
    const array = output.array;

    const table_promise = tables.map(table => this.saveMultipleForTable(table, array[table]));

    //saved block, no manage transactions
    Promise.all(table_promise)
    .then(results => {
      resolve(results);
    })
    .catch(err => {
      console.log(err);
    })
  });
}

EthereumTransactionMysqlModel.prototype.transformTransactionIfSuitable = function(transaction) {
  return new Promise((resolve, reject) => {
    var from_json = undefined;
    const from = transaction.from.toLowerCase();
    const to = transaction.to.toLowerCase();
    EthereumAddressMysqlModel.canSave(from, to)
    .then(can_save => {
      if(can_save) {
        EthereumAddressMysqlModel.getOrSave(from)
        .then(result => {
          from_json = result;
          return EthereumAddressMysqlModel.getOrSave(to)
        })
        .then(to_json => {
          const tx = txToArrayForInsert(transaction, from_json.id, to_json.id, this.isLight());
          resolve(tx);
        })
        .catch(err => {
          console.log(err);
        });
      } else {
        resolve(null);
      }
    });
  });
}

EthereumTransactionMysqlModel.prototype.saveMultipleForTable = function(table, txs/*, json*//*block*/) {
  return new Promise((resolve, reject) => {
    const inserts = txs ? txs.filter(result => undefined != result) : [];

    if(inserts.length == 0) {
      resolve(inserts);
    } else {
      connection.executeInPool(createInsertRowsForTable(table), [inserts])
      .then(results => {
        resolve(txs);
      })
      .catch(error => {
        if(error.code !== "ER_DUP_ENTRY") reject(error);
        else resolve(txs);
      });
    }
  });
}

EthereumTransactionMysqlModel.prototype.count = function(address) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      address = json.id;
      const query = "SELECT COUNT(*) as c FROM "+tableFromAddress(address)+" as T WHERE (T.`from` = ? OR T.`to` = ? )";
      connection.executeInPool(query, [address, address])
      .then(results => resolve(results.length > 0 ? results[0].c : 0))
      .catch(error => reject(error));
    });
  });
}

EthereumTransactionMysqlModel.prototype.countInTable = function(table) {
  return new Promise((resolve, reject) => {
    const query = "SELECT MAX(id) as c FROM "+table;

    connection.executeInPool(query)
    .then(results => resolve(results.length > 0 ? (results[0].c || 0) : 0))
    .catch(error => {
      console.log(error);
      reject(error);
    });
  });
}

EthereumTransactionMysqlModel.prototype.lastBlockNumber = function(table) {
  return EthereumBlockMysqlModel.lastBlockNumber();
}

EthereumTransactionMysqlModel.prototype.systemDataAsJson = function() {
  return new Promise((resolve, reject) => {
    EthereumBlockMysqlModel.lastBlockNumber()
    .then(block_number => {
      resolve({
        block: block_number,
        light: EthereumAddressMysqlModel.isLight()
      });
    })
    .catch(err => reject(err));
  });
}

EthereumTransactionMysqlModel.prototype.isLight = function() {
  return EthereumAddressMysqlModel.isLight();
}

module.exports = new EthereumTransactionMysqlModel();
