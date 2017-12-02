const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
EthereumAddressMysqlModel = require("./ethereum_address_mysql"),
EthereumBlockMysqlModel = require("./ethereum_block_mysql"),
connection = require("../database/init"),
Base64 = require("../base64.js");


const pool = connection.pool;


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
    Base64.from0x(tx.input),
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

EthereumTransactionMysqlModel.prototype.toJson = function(tx) {
  return new Promise((resolve, reject) => {
    resolve(txToJson(tx));
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
      const id = json.id;
      //TODO look for improvement
      const query_look_from_to = "SELECT `id` FROM "
      + " ((SELECT `id` FROM "+tableFromAddress(address)+" WHERE `to`=? AND `id` < ? ORDER BY id DESC LIMIT ?)"
      + " UNION"
      + " (SELECT `id` FROM "+tableFromAddress(address)+" WHERE `from`=? AND `id` < ? ORDER BY id DESC LIMIT ?)) AS T"
      + " ORDER BY T.`id` DESC LIMIT ?";
      const query = selectColumnsJoin(address) + " INNER JOIN ("+query_look_from_to+") AS COMP ON COMP.`id` = T.`id`";
      console.log(query);
      connection.query(query, [id, from, limit, id, from, limit, limit], lambdaArray(resolve, reject));
    });
  });
}

EthereumTransactionMysqlModel.prototype.withAddress = function(address, blockNumber = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    EthereumAddressMysqlModel.getOrSave(address)
    .then(json => {
      const id = json.id;
      const query = selectColumnsJoin(address) + " WHERE (T.`from` = ? OR T.`to` = ? ) AND blockNumber >= ? LIMIT ?";
      connection.query(query, [id, id, blockNumber, limit],  lambdaArray(resolve, reject));
    });
  });
}

EthereumTransactionMysqlModel.prototype.getMergeable = function(txs, block) {
  return new Promise((resolve, reject) => {
    const array = [];
    const tables = [];
    const addresses = [];

    txs.forEach(tx => {
      if(tx.from) tx.from = tx.from.toLowerCase();
      if(tx.to) tx.to = tx.to.toLowerCase();
      if(addresses.indexOf(tx.from) < 0) addresses.push(tx.from);
      if(addresses.indexOf(tx.to) < 0) addresses.push(tx.to);

      const standard = tableFromAddress(undefined);
      const table_from = tableFromAddress(tx.from);
      const table_to = tableFromAddress(tx.to);

      if(!array[standard]) {
        array[standard] = [];
        tables.push(standard);
      }
      array[standard].push(tx);

      if(table_from) {
        if(!array[table_from]) {
          array[table_from] = [];
          tables.push(table_from);
        }
        array[table_from].push(tx);
      } else {
        throw "undefined table_from "+tx.hash;
      }

      if(table_to) {
        //for instance we have 0xABER sending to 0xABER
        //or
        //for instance we have 0xEB..C.. sending to 0xEB..A..
        //we avoid saving it in the same table
        if(tx.from != tx.to && table_to != table_from) {
          if(!array[table_to]) {
            array[table_to] = [];
            tables.push(table_to);
          }
          array[table_to].push(tx);
        }
      } else {
        throw "undefined table_to "+tx.hash;
      }
    });

    EthereumAddressMysqlModel.manageAddresses(addresses)
    .then(saved => {
      return EthereumBlockMysqlModel.getOrSave(block);
    })
    .then(json => {
      resolve({
        tables: tables,
        array: array
      });
    })
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

    const table_promise = [];
    tables.forEach(table => {
      table_promise.push(this.saveMultipleForTable(table, array[table]));
    });

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


EthereumTransactionMysqlModel.prototype.saveMultiple = function(txs, block) {
  return new Promise((resolve, reject) => {
    const array = [];
    const tables = [];
    const addresses = [];

    txs.forEach(tx => {
      if(tx.from) tx.from = tx.from.toLowerCase();
      if(tx.to) tx.to = tx.to.toLowerCase();
      if(addresses.indexOf(tx.from) < 0) addresses.push(tx.from);
      if(addresses.indexOf(tx.to) < 0) addresses.push(tx.to);

      const standard = tableFromAddress(undefined);
      const table_from = tableFromAddress(tx.from);
      const table_to = tableFromAddress(tx.to);

      if(!array[standard]) {
        array[standard] = [];
        tables.push(standard);
      }
      array[standard].push(tx);

      if(table_from) {
        if(!array[table_from]) {
          array[table_from] = [];
          tables.push(table_from);
        }
        array[table_from].push(tx);
      } else {
        throw "undefined table_from "+tx.hash;
      }

      if(table_to) {
        //for instance we have 0xABER sending to 0xABER
        //or
        //for instance we have 0xEB..C.. sending to 0xEB..A..
        //we avoid saving it in the same table
        if(tx.from != tx.to && table_to != table_from) {
          if(!array[table_to]) {
            array[table_to] = [];
            tables.push(table_to);
          }
          array[table_to].push(tx);
        }
      } else {
        throw "undefined table_to "+tx.hash;
      }
    });

    EthereumAddressMysqlModel.manageAddresses(addresses)
    .then(saved => {
      return EthereumBlockMysqlModel.getOrSave(block);
    })
    .then(json => {
      const table_promise = [];
      tables.forEach(table => {
        table_promise.push(this.saveMultipleForTable(table, array[table], json/*block*/));
      });

      //saved block, no manage transactions
      Promise.all(table_promise)
      .then(results => {
        resolve(results);
      })
      .catch(err => {
        console.log(err);
      })
    })
  })
}

EthereumTransactionMysqlModel.prototype.saveMultipleForTable = function(table, txs/*, json*//*block*/) {
  return new Promise((resolve, reject) => {

    if(!txs || txs.length == 0) {
      resolve(txs);
      return;
    }

    const array = [];
    const promises = [];

    txs.forEach(transaction => {
      promises.push(new Promise((resolve, reject) => {
        EthereumAddressMysqlModel.manageAddress(transaction.from)
        .then(from_json => {
          EthereumAddressMysqlModel.manageAddress(transaction.to)
          .then(to_json => {
            if(EthereumAddressMysqlModel.canSave(from_json, to_json)) {
              //if both nulls > light mode! so no management for this tx

              console.log(table +" "+transaction.from+" "+transaction.to);
              const tx = txToArrayForInsert(transaction, from_json.id, to_json.id);
              resolve(tx);
            } else {
              resolve(null);
            }
          })
          .catch(err => {
            console.log(err);
          });
        })
      }));
    });

    Promise.all(promises)
    .then(results => {
      const inserts = results.filter(result => { return undefined != result; });

      pool.getConnection((err, connection) => {
        if(err) console.log(err);

        if(inserts.length == 0) {
          connection.release();
          resolve(txs);
        } else {
          connection.query(createInsertRowsForTable(table), [inserts], (error, results, fields) => {
            connection.release();
            if(error && error.code !== "ER_DUP_ENTRY") {
              console.log(error);
              console.log(results);
              console.log(fields);
              reject(error);
            } else {
              resolve(txs);
            }
          });
        }
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
      const query = "SELECT COUNT(*) as c FROM "+tableFromAddress(address)+" as T WHERE (T.`from` = ? OR T.`to` = ? )";
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

EthereumTransactionMysqlModel.prototype.countInTable = function(table) {
  return new Promise((resolve, reject) => {
    const query = "SELECT MAX(id) as c FROM "+table;
    console.log("countInTable", query);
    pool.getConnection((err, connection) => {
      connection.query(query,  (error, results, fields) => {
        connection.release();
        if(error) {
          console.log(error);
          reject(error);
          return;
        }

        if(results && results.length > 0) {
          resolve(results[0].c || 0);
        } else {
          console.log(results);
          resolve(0);
        }
      });
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
